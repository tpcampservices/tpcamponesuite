import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  createInvitation,
  resendInvitation,
  cancelInvitation,
  previewInvitation,
  acceptInvitation,
  listInvitations,
} from "@/lib/invitations.server";
import { ensureUserWorkspaceId, getSeatAccounting, resolveWorkspaceAccess } from "@/lib/workspace.server";

const out: string[] = [];
const log = (name: string, pass: boolean, extra = "") =>
  out.push(`${pass ? "PASS" : "FAIL"}  ${name}${extra ? " — " + extra : ""}`);

async function mkUser(email: string, meta: Record<string, string> = {}) {
  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password: "TestPass!2345",
    email_confirm: true,
    user_metadata: meta,
  });
  if (error) throw new Error(`${email}: ${error.message}`);
  return data.user!.id;
}

const stamp = Date.now();
const ownerEmail = `t-owner-${stamp}@example.com`;
const adminEmail = `t-admin-${stamp}@example.com`;
const staffEmail = `t-staff-${stamp}@example.com`;
const guestEmail = `t-guest-${stamp}@example.com`;
const extraEmail = `t-extra-${stamp}@example.com`;

const owner = await mkUser(ownerEmail, { organisation: "Test Label Co" });
const admin = await mkUser(adminEmail);
const staff = await mkUser(staffEmail);
const guest = await mkUser(guestEmail);
const extra = await mkUser(extraEmail);

try {
  // ---------- provisioning ----------
  await new Promise((r) => setTimeout(r, 800));
  const { data: wss } = await supabaseAdmin.from("workspaces").select("id, name").eq("owner_user_id", owner);
  log("signup auto-creates exactly one workspace", wss?.length === 1, wss?.[0]?.name ?? "none");
  log("workspace named from organisation", wss?.[0]?.name === "Test Label Co");
  const ws = wss![0]!.id;

  const { data: mems } = await supabaseAdmin
    .from("workspace_memberships")
    .select("id, status, workspace_roles(role_key)")
    .eq("workspace_id", ws);
  log(
    "exactly one active Owner membership",
    mems?.length === 1 && mems[0]!.status === "active" &&
      (mems[0]!.workspace_roles as any).role_key === "owner",
  );
  const { count: appCount } = await supabaseAdmin
    .from("workspace_member_app_access")
    .select("id", { count: "exact", head: true })
    .eq("membership_id", mems![0]!.id);
  log("owner gets manage access to all 5 apps", appCount === 5, String(appCount));

  // idempotency
  await ensureUserWorkspaceId(owner);
  await ensureUserWorkspaceId(owner);
  const { count: wsAgain } = await supabaseAdmin
    .from("workspaces").select("id", { count: "exact", head: true }).eq("owner_user_id", owner);
  const { count: memAgain } = await supabaseAdmin
    .from("workspace_memberships").select("id", { count: "exact", head: true }).eq("workspace_id", ws);
  log("provisioning idempotent", wsAgain === 1 && memAgain === 1);

  // ---------- entitlement (Growth: 3 seats) ----------
  await supabaseAdmin.from("access_entitlements").upsert(
    {
      user_id: owner, workspace_id: ws, plan_id: "growth", billing_period: "yearly",
      currency: "USD", addons: [] as never, seats_extra: 0, status: "active",
      access_status: "active", subscription_source: "manual", payment_status: "complimentary",
      access_start_date: new Date().toISOString(),
      access_expiry_date: new Date(Date.now() + 3e10).toISOString(),
    },
    { onConflict: "user_id" },
  );
  let seats = await getSeatAccounting(ws);
  log("seat accounting reads plan seats", seats.totalSeats === 3 && seats.usedSeats === 1 && seats.availableSeats === 2,
    JSON.stringify(seats));

  // ---------- owner invites ----------
  const inv1 = await createInvitation({ actorUserId: owner, workspaceId: ws, email: adminEmail, roleKey: "administrator" });
  log("owner can invite", Boolean(inv1.token));
  seats = await getSeatAccounting(ws);
  log("pending invitation reserves a seat", seats.pendingInvitations === 1 && seats.availableSeats === 1);

  // token security
  const { data: stored } = await supabaseAdmin
    .from("workspace_invitations").select("token_hash").eq("id", inv1.invitationId).maybeSingle();
  log("raw token never stored", stored!.token_hash !== inv1.token && stored!.token_hash.length === 64);

  // duplicate
  let dup = "";
  try { await createInvitation({ actorUserId: owner, workspaceId: ws, email: adminEmail.toUpperCase(), roleKey: "staff" }); }
  catch (e) { dup = (e as Error).message; }
  log("duplicate pending invitation rejected (normalized email)", /already a pending invitation/.test(dup), dup);

  // owner role can never be invited
  let ownerTry = "";
  try { await createInvitation({ actorUserId: owner, workspaceId: ws, email: extraEmail, roleKey: "owner" }); }
  catch (e) { ownerTry = (e as Error).message; }
  log("cannot invite into Owner role", /Ownership cannot be granted/.test(ownerTry), ownerTry);

  // ---------- acceptance ----------
  const preview = await previewInvitation(inv1.token);
  log("preview returns safe display info only",
    preview.valid === true && preview.workspaceName === "Test Label Co" &&
      !JSON.stringify(preview).includes(ws) && !JSON.stringify(preview).includes(owner),
    JSON.stringify(preview));

  const wrong = await acceptInvitation({ rawToken: inv1.token, userId: guest, email: guestEmail });
  log("wrong signed-in email cannot accept", wrong.ok === false && (wrong as any).reason === "email_mismatch");

  const accepted = await acceptInvitation({ rawToken: inv1.token, userId: admin, email: adminEmail });
  log("invited user accepts", accepted.ok === true);
  const { data: adminMem } = await supabaseAdmin
    .from("workspace_memberships")
    .select("id, status, workspace_roles(role_key), workspace_member_app_access(app_key, access_level)")
    .eq("workspace_id", ws).eq("user_id", admin);
  log("acceptance creates exactly one membership with the invited role",
    adminMem?.length === 1 && (adminMem[0]!.workspace_roles as any).role_key === "administrator");
  const access = (adminMem![0] as any).workspace_member_app_access as any[];
  log("administrator preset grants manage on entitled apps only",
    access.length === 5 && access.every((a) => a.access_level === "manage"), String(access.length));

  seats = await getSeatAccounting(ws);
  log("accepted seat counted once (no double count)",
    seats.usedSeats === 2 && seats.pendingInvitations === 0 && seats.availableSeats === 1,
    JSON.stringify(seats));

  const twice = await acceptInvitation({ rawToken: inv1.token, userId: admin, email: adminEmail });
  log("accepted token cannot be reused", twice.ok === false && (twice as any).reason === "already_accepted");

  // ---------- administrator may invite ----------
  const inv2 = await createInvitation({ actorUserId: admin, workspaceId: ws, email: staffEmail, roleKey: "staff" });
  log("administrator with team permission can invite", Boolean(inv2.token));

  // seat exhaustion
  let full = "";
  try { await createInvitation({ actorUserId: owner, workspaceId: ws, email: extraEmail, roleKey: "viewer" }); }
  catch (e) { full = (e as Error).message; }
  log("cannot exceed 3 reserved seats on Growth", /All seats/.test(full), full);

  // resend rotates token
  const resent = await resendInvitation({ actorUserId: owner, workspaceId: ws, invitationId: inv2.invitationId });
  const oldToken = await previewInvitation(inv2.token);
  log("resend invalidates the old link", oldToken.valid === false && resent.token !== inv2.token);
  log("resent link works", (await previewInvitation(resent.token)).valid === true);

  // staff accepts
  const staffAccept = await acceptInvitation({ rawToken: resent.token, userId: staff, email: staffEmail });
  log("staff invitation accepted", staffAccept.ok === true);
  const { data: staffAccessRows } = await supabaseAdmin
    .from("workspace_member_app_access").select("access_level")
    .eq("membership_id",
      (await supabaseAdmin.from("workspace_memberships").select("id").eq("workspace_id", ws).eq("user_id", staff).single()).data!.id);
  log("staff preset grants edit", staffAccessRows!.every((r) => r.access_level === "edit"));

  // staff cannot invite
  let staffInvite = "";
  try { await createInvitation({ actorUserId: staff, workspaceId: ws, email: extraEmail, roleKey: "viewer" }); }
  catch (e) { staffInvite = (e as Error).message; }
  log("staff cannot invite", /do not have permission/.test(staffInvite), staffInvite);

  // staff cannot probe another workspace / promote self
  const staffAccess = await resolveWorkspaceAccess(staff, ws);
  log("staff resolves without owner authority",
    staffAccess.isOwner === false && !staffAccess.permissions.includes("workspace.team.invite"));

  // cross-workspace probing
  const guestWs = await ensureUserWorkspaceId(guest);
  let cross = "";
  try { await createInvitation({ actorUserId: staff, workspaceId: guestWs!, email: extraEmail, roleKey: "viewer" }); }
  catch (e) { cross = (e as Error).message; }
  log("cross-workspace invitation denied", /not an active member/.test(cross), cross);

  // ---------- cancel releases seat ----------
  seats = await getSeatAccounting(ws);
  const before = seats.availableSeats;
  await supabaseAdmin.from("access_entitlements").update({ seats_extra: 1 }).eq("user_id", owner);
  const inv3 = await createInvitation({ actorUserId: owner, workspaceId: ws, email: extraEmail, roleKey: "viewer" });
  log("Team Add extra seat allows another invitation", Boolean(inv3.token), `available before=${before}`);
  await cancelInvitation({ actorUserId: owner, workspaceId: ws, invitationId: inv3.invitationId });
  const cancelledPreview = await previewInvitation(inv3.token);
  seats = await getSeatAccounting(ws);
  log("cancelled invitation cannot be accepted", cancelledPreview.valid === false && cancelledPreview.reason === "cancelled");
  log("cancellation releases the reserved seat", seats.pendingInvitations === 0 && seats.availableSeats === 1,
    JSON.stringify(seats));

  // ---------- expiry releases seat ----------
  const inv4 = await createInvitation({ actorUserId: owner, workspaceId: ws, email: extraEmail, roleKey: "viewer" });
  await supabaseAdmin.from("workspace_invitations")
    .update({ expires_at: new Date(Date.now() - 60_000).toISOString() }).eq("id", inv4.invitationId);
  const expiredPreview = await previewInvitation(inv4.token);
  seats = await getSeatAccounting(ws);
  log("expired token cannot accept", expiredPreview.valid === false && expiredPreview.reason === "expired");
  log("expiry releases the reserved seat", seats.pendingInvitations === 0, JSON.stringify(seats));
  const expiredAccept = await acceptInvitation({ rawToken: inv4.token, userId: extra, email: extraEmail });
  log("expired invitation refused at acceptance", expiredAccept.ok === false);

  // invalid token
  log("unknown token invalid", (await previewInvitation("not-a-real-token")).valid === false);

  // concurrency: two simultaneous invitations for one remaining seat
  await supabaseAdmin.from("workspace_invitations").update({ status: "cancelled" })
    .eq("workspace_id", ws).eq("status", "pending");
  seats = await getSeatAccounting(ws);
  const results = await Promise.allSettled([
    createInvitation({ actorUserId: owner, workspaceId: ws, email: `race1-${stamp}@example.com`, roleKey: "viewer" }),
    createInvitation({ actorUserId: owner, workspaceId: ws, email: `race2-${stamp}@example.com`, roleKey: "viewer" }),
  ]);
  const ok = results.filter((r) => r.status === "fulfilled").length;
  log("concurrent final-seat invitations: exactly one succeeds", ok === 1,
    `available=${seats.availableSeats} fulfilled=${ok}`);

  // listing never exposes hashes
  const list = await listInvitations(owner, ws);
  log("invitation listing excludes token hashes", !JSON.stringify(list).includes("token_hash"));

  // audit trail
  const { data: audit } = await supabaseAdmin.from("team_audit_log").select("action").eq("workspace_id", ws);
  const actions = new Set((audit ?? []).map((a) => a.action));
  log("audit log records the invitation lifecycle",
    ["invitation_created", "invitation_resent", "invitation_cancelled", "invitation_accepted", "membership_created"]
      .every((a) => actions.has(a)), [...actions].join(","));

  // anonymous / browser role cannot read or write
  const { createClient } = await import("@supabase/supabase-js");
  const anon = createClient(process.env["SUPABASE_URL"]!, process.env["SUPABASE_PUBLISHABLE_KEY"] ?? process.env["SUPABASE_ANON_KEY"]!);
  const anonRead = await anon.from("workspace_invitations").select("id").limit(1);
  log("anonymous cannot read invitations", (anonRead.data?.length ?? 0) === 0);
  const anonWrite = await anon.from("workspace_invitations").insert({
    workspace_id: ws, email: "x@example.com", role_id: mems![0]!.id, token_hash: "x",
    expires_at: new Date().toISOString(),
  } as never);
  log("anonymous cannot write invitations", Boolean(anonWrite.error));
} catch (err) {
  out.push("CRASH — " + (err as Error).message);
} finally {
  for (const id of [owner, admin, staff, guest, extra]) {
    await supabaseAdmin.auth.admin.deleteUser(id).catch(() => {});
  }
}

console.log(out.join("\n"));
console.log(`\n${out.filter((l) => l.startsWith("PASS")).length}/${out.length} passed`);
