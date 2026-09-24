import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "fs";
import {
  coreInvite,
  coreResend,
  emailHash,
  INVITE_PLAN_REFUSED,
  INVITE_RATE_LIMITED,
  INVITE_EMAIL_FAILED,
  maskEmail,
  normalizeInviteEmail,
  type InviteDeps,
} from "./invitations.core";
import { DEFAULT_INVITE_ORIGIN, trustedInviteOrigin } from "./invitation-links";

const WS = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TOKEN = "tok_fictional_ABC";

function deps(over: Partial<InviteDeps> = {}) {
  const calls = { emails: [] as { to: string; link: string }[], audits: [] as any[], logs: [] as string[], reserves: [] as any[], finals: [] as any[], created: [] as any[] };
  const d: InviteDeps = {
    actorUserId: "u1",
    requestOrigin: null,
    resolveWorkspaceId: async () => WS,
    assertMayInvite: async () => {},
    planActive: async () => true,
    accountExists: async () => false,
    reserveSend: async (a) => { calls.reserves.push(a); return "r1"; },
    finalizeSend: async (id, ok) => { calls.finals.push([id, ok]); },
    createInvitation: async (a) => { calls.created.push(a); return { invitationId: "i1", token: TOKEN, expiresAt: "x", seats: {} as any }; },
    resendInvitation: async () => ({ token: TOKEN, expiresAt: "x" }),
    sendEmail: async (to, link) => { calls.emails.push({ to, link }); return true; },
    audit: async (r) => { calls.audits.push(r); },
    log: (c) => calls.logs.push(c),
    ...over,
  };
  return { d, calls };
}
const input = { email: "  Jane@Example.COM ", roleKey: "staff", displayName: null, appAccess: null };

describe("normalization", () => {
  it("case and surrounding whitespace collapse to one canonical form and hash", async () => {
    expect(normalizeInviteEmail("  Jane@Example.COM ")).toBe("jane@example.com");
    expect(await emailHash(normalizeInviteEmail(" JANE@example.com"))).toBe(await emailHash("jane@example.com"));
  });
  it("reservation and invitation use the normalized address", async () => {
    const { d, calls } = deps();
    await coreInvite(d, input);
    expect(calls.created[0].email).toBe("jane@example.com");
    expect(calls.reserves[0].emailHash).toBe(await emailHash("jane@example.com"));
    expect(calls.emails[0].to).toBe("jane@example.com");
  });
  it("masks addresses", () => expect(maskEmail("jane@example.com")).toBe("j***@example.com"));
});

describe("trusted origins", () => {
  it.each([
    "https://evil.example",
    "https://tpcamponesuite.app.evil.example",
    "https://evil.tpcamponesuite.app",
    "http://tpcamponesuite.app",
    "https://tpcamponesuite.app/",
    "https://id-preview--other.lovable.app",
    "",
  ])("rejects %s", (o) => expect(trustedInviteOrigin(o)).toBe(DEFAULT_INVITE_ORIGIN));
  it("accepts the exact preview origin", () => {
    const p = "https://id-preview--78e0852d-a4cf-409c-9124-a9a045dc4411.lovable.app";
    expect(trustedInviteOrigin(p)).toBe(p);
  });
  it("a malicious request origin never reaches the email or returned link", async () => {
    const { d, calls } = deps({ requestOrigin: "https://tpcamponesuite.app.evil.example" });
    const r = await coreInvite(d, { ...input, origin: "https://evil.example" } as any);
    expect(r.link).toBe(`${DEFAULT_INVITE_ORIGIN}/invite/${TOKEN}`);
    expect(calls.emails[0].link).toBe(r.link);
  });
  it("action source reads only the Origin header, never Host/Forwarded/X-Forwarded-Host", () => {
    const src = readFileSync("src/lib/invitations.functions.ts", "utf8");
    expect(src).toMatch(/getRequestHeader\("origin"\)/);
    expect(src).not.toMatch(/x-forwarded-host|"forwarded"|"host"/i);
    expect(src).not.toMatch(/data\.origin/);
  });
});

describe("authorization and plan", () => {
  it("unauthorized inviter: refused, nothing reserved, created or emailed", async () => {
    const { d, calls } = deps({ assertMayInvite: async () => { throw new Error("You do not have permission to invite team members"); } });
    await expect(coreInvite(d, input)).rejects.toThrow("permission");
    expect(calls.reserves.length + calls.created.length + calls.emails.length).toBe(0);
  });
  it("inactive plan refused before any reservation; audited with masked email only", async () => {
    const { d, calls } = deps({ planActive: async () => false });
    await expect(coreInvite(d, input)).rejects.toThrow(INVITE_PLAN_REFUSED);
    expect(calls.reserves).toHaveLength(0);
    expect(calls.audits[0]).toEqual({ workspaceId: WS, action: "invitation_refused_plan", maskedEmail: "j***@example.com", limit: null });
  });
  it("the workspace comes from the session, never from input", async () => {
    const { d, calls } = deps();
    await coreInvite(d, { ...input, workspaceId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" } as any);
    expect(calls.created[0].workspaceId).toBe(WS);
  });
});

describe("send accounting", () => {
  it("legit invite: one reservation, one email, finalized as sent", async () => {
    const { d, calls } = deps();
    const r = await coreInvite(d, input);
    expect(r.emailSent).toBe(true);
    expect(calls.emails).toHaveLength(1);
    expect(calls.finals).toEqual([["r1", true]]);
  });
  it("existing account: no email, no reservation", async () => {
    const { d, calls } = deps({ accountExists: async () => true });
    const r = await coreInvite(d, input);
    expect(r.emailSent).toBe(false);
    expect(calls.reserves.length + calls.emails.length).toBe(0);
  });
  it("rate-limited: plain message, audit has limit + masked email, no hash/token", async () => {
    const { d, calls } = deps({ reserveSend: async () => { throw new Error("invite_limit:sender_hourly"); } });
    await expect(coreInvite(d, input)).rejects.toThrow(INVITE_RATE_LIMITED);
    expect(calls.created.length + calls.emails.length).toBe(0);
    const a = JSON.stringify(calls.audits);
    expect(calls.audits[0]).toMatchObject({ action: "invitation_refused_rate_limited", limit: "sender_hourly", maskedEmail: "j***@example.com" });
    expect(a).not.toContain(await emailHash("jane@example.com"));
    expect(a).not.toContain("jane@example.com");
    expect(a).not.toContain(TOKEN);
  });
  it("delivery failure: finalized as failed, plain message, no raw error", async () => {
    const { d, calls } = deps({ sendEmail: async () => { throw new Error("SMTP secret-detail 550"); } });
    const r = await coreInvite(d, input);
    expect(calls.finals).toEqual([["r1", false]]);
    expect(r.emailError).toBe(INVITE_EMAIL_FAILED);
    expect(JSON.stringify(r)).not.toContain("secret-detail");
  });
  it("invitation creation failure releases the reservation", async () => {
    const { d, calls } = deps({ createInvitation: async () => { throw new Error("There is already a pending invitation for that email address"); } });
    await expect(coreInvite(d, input)).rejects.toThrow("pending");
    expect(calls.finals).toEqual([["r1", false]]);
    expect(calls.emails).toHaveLength(0);
  });
  it("concurrent invites never exceed what the ledger grants", async () => {
    let granted = 0;
    const { d, calls } = deps({
      reserveSend: async () => { if (granted >= 20) throw new Error("invite_limit:sender_hourly"); granted++; return `r${granted}`; },
    });
    const results = await Promise.allSettled(Array.from({ length: 30 }, () => coreInvite(d, input)));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(20);
    expect(calls.emails).toHaveLength(20);
  });
});

describe("resend", () => {
  it("concurrent resends send no email and reserve nothing; links are trusted", async () => {
    const { d, calls } = deps({ requestOrigin: "https://evil.example" });
    const rs = await Promise.all(Array.from({ length: 5 }, () => coreResend(d, { invitationId: "i1" })));
    expect(calls.emails.length + calls.reserves.length).toBe(0);
    for (const r of rs) expect(r.link.startsWith(`${DEFAULT_INVITE_ORIGIN}/invite/`)).toBe(true);
  });
  it("unauthorized caller cannot obtain a resend link or rotate a token", async () => {
    const rotate = vi.fn(async () => ({ token: TOKEN, expiresAt: "x" }));
    const { d } = deps({ assertMayInvite: async () => { throw new Error("You do not have permission to invite team members"); }, resendInvitation: rotate });
    await expect(coreResend(d, { invitationId: "someone-elses" })).rejects.toThrow("permission");
    expect(rotate).not.toHaveBeenCalled();
  });
  it("another workspace's invitation is refused and no link returned", async () => {
    const { d } = deps({ resendInvitation: async () => { throw new Error("That invitation was not found"); } });
    await expect(coreResend(d, { invitationId: "other-ws" })).rejects.toThrow("not found");
  });
});

describe("static guard", () => {
  it("invite and resend actions delegate to the core", () => {
    const src = readFileSync("src/lib/invitations.functions.ts", "utf8");
    expect(src).toMatch(/coreInvite\(await inviteDeps\(context\.userId\), data\)/);
    expect(src).toMatch(/coreResend\(await inviteDeps\(context\.userId\), data\)/);
    expect(src).not.toMatch(/inviteUserByEmail/);
  });
});
