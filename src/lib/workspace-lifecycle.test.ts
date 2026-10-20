import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import {
  assertWorkspaceActiveForAdmin,
  paymentLifecycleOutcome,
  WORKSPACE_INACTIVE_MESSAGE,
  workspaceAllowsAdminMutation,
} from "./workspace-lifecycle.core";

const members = readFileSync("src/lib/members.server.ts", "utf8");
const invites = readFileSync("src/lib/invitations.server.ts", "utf8");
const access = readFileSync("src/lib/access.server.ts", "utf8");
const wsServer = readFileSync("src/lib/workspace.server.ts", "utf8");
const fnBody = (src: string, name: string) => {
  const start = src.indexOf(`export async function ${name}`);
  const next = src.indexOf("\nexport ", start + 10);
  return src.slice(start, next === -1 ? undefined : next);
};

describe("workspace status gate", () => {
  it("active permits admin mutations", () => {
    expect(workspaceAllowsAdminMutation("active")).toBe(true);
    expect(() => assertWorkspaceActiveForAdmin({ status: "active" })).not.toThrow();
  });
  it.each(["suspended", "archived", "unknown", null, undefined])("%s is denied", (s) => {
    expect(workspaceAllowsAdminMutation(s as string)).toBe(false);
    expect(() => assertWorkspaceActiveForAdmin(s ? { status: s as string } : null)).toThrow(WORKSPACE_INACTIVE_MESSAGE);
  });
  it("message exposes no internal details", () => {
    expect(WORKSPACE_INACTIVE_MESSAGE).not.toMatch(/sql|uuid|rpc|supabase|error:/i);
  });
});

describe("team administration enforces workspace status", () => {
  const mayManage = members.slice(members.indexOf("async function assertMayManage"), members.indexOf("async function loadTarget"));
  it("assertMayManage checks membership then workspace status", () => {
    expect(mayManage).toContain("assertWorkspaceActiveForAdmin(access.workspace)");
    expect(mayManage.indexOf('membershipStatus !== "active"')).toBeLessThan(mayManage.indexOf("assertWorkspaceActiveForAdmin"));
  });
  it.each(["changeMemberRole", "setMemberAppAccess", "setMemberStatus"])("%s goes through assertMayManage", (n) => {
    expect(fnBody(members, n)).toMatch(/assertMayManage\(/);
  });
  it("permission overrides reject inactive workspaces", () => {
    const g = members.slice(members.indexOf("async function authorizeOverrideMutation"));
    expect(g).toMatch(/workspaceAllowsAdminMutation\(access\.workspace\?\.status\)[\s\S]{0,80}workspace_inactive/);
    expect(fnBody(members, "setMemberPermissionOverride")).toContain("authorizeOverrideMutation");
    expect(fnBody(members, "clearMemberPermissionOverride")).toContain("authorizeOverrideMutation");
  });
  it("create and resend invitation require an active workspace", () => {
    expect(fnBody(invites, "createInvitation")).toMatch(/assertMayInvite\(args\.actorUserId, args\.workspaceId\);/);
    expect(fnBody(invites, "resendInvitation")).toMatch(/assertMayInvite\(args\.actorUserId, args\.workspaceId\);/);
    expect(fnBody(invites, "assertMayInvite")).toContain("if (!opts.allowInactiveWorkspace) assertWorkspaceActiveForAdmin");
  });
  it("recovery paths (list, cancel) stay available on inactive workspaces", () => {
    expect(fnBody(invites, "cancelInvitation")).toContain("allowInactiveWorkspace: true");
    expect(fnBody(invites, "listInvitations")).toContain("allowInactiveWorkspace: true");
  });
  it("unauthorized users remain denied before any status logic", () => {
    const f = fnBody(invites, "assertMayInvite");
    expect(f.indexOf("do not have permission")).toBeLessThan(f.indexOf("assertWorkspaceActiveForAdmin"));
    expect(mayManage).toContain("do not have permission to manage team members");
  });
});

describe("payment activation is lifecycle-aware", () => {
  it("active workspace: recorded and accessible", () => {
    expect(paymentLifecycleOutcome("active")).toMatchObject({ recordPayment: true, reactivateWorkspace: false, workspaceAccessible: true, note: null });
  });
  it.each(["suspended", "archived"])("%s: recorded, never reactivated, stays inaccessible", (s) => {
    expect(paymentLifecycleOutcome(s)).toMatchObject({ recordPayment: true, reactivateWorkspace: false, workspaceAccessible: false, note: "paid_while_workspace_inactive" });
  });
  it("applyPaidOrder never writes workspace status", () => {
    const f = fnBody(access, "applyPaidOrder");
    expect(f).not.toMatch(/from\("workspaces"\)\.update|from\("workspaces"\)\.upsert/);
    expect(f).toContain("paymentLifecycleOutcome");
  });
  it("duplicate callbacks short-circuit before any write", () => {
    const f = fnBody(access, "applyPaidOrder");
    expect(f.indexOf('payment_status === "paid"')).toBeLessThan(f.indexOf("planPaidOrderWrites("));
  });
});

describe("SSO safeguards preserved", () => {
  it("inactive workspaces fail closed with workspace_inactive", () => {
    expect(wsServer).toMatch(/!== "active"\) \{\s*return \{ \.\.\.detailed, accessLevel: "no_access", reason: "workspace_inactive" \}/);
  });
  it("secondary workspaces stay out of untargeted legacy SSO", () => {
    expect(wsServer).toContain("return record.ssoEligible === true;");
    expect(wsServer).toContain("if (!isLegacySsoCandidate(record)) continue;");
  });
});
