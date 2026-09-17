import { createClient } from "@supabase/supabase-js";
import { resolveAppAuthorization, hasWorkspacePermission } from "./src/lib/workspace.server";
import { setMemberPermissionOverride, clearMemberPermissionOverride } from "./src/lib/members.server";

const url = process.env.VITE_SUPABASE_URL!;
const anonKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY!;
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra = "") => {
  if (cond) { pass++; console.log(`PASS ${name}`); }
  else { fail++; console.log(`FAIL ${name} ${extra}`); }
};
const same = (a: readonly string[], b: readonly string[]) =>
  JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
const rejects = async (name: string, fn: () => Promise<unknown>) => {
  try { await fn(); ok(name, false, "no error thrown"); }
  catch { ok(name, true); }
};

// ---------------- fixtures ----------------
const pw = `Zz!${crypto.randomUUID()}`;
const users: string[] = [];
const mkUser = async (label: string) => {
  const email = `zz3-${label}-${Date.now()}@example.com`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: pw, email_confirm: true });
  if (error) throw error;
  users.push(data.user.id);
  return { id: data.user.id, email };
};
const roleId = async (key: string) => {
  const { data } = await admin.from("workspace_roles").select("id").is("workspace_id", null).eq("role_key", key).single();
  return data!.id;
};
const mkWorkspace = async (name: string, owner: string) => {
  const { data } = await admin.from("workspaces").insert({ name, owner_user_id: owner, status: "active" }).select("id").single();
  return data!.id;
};
const mkMembership = async (ws: string, user: string, role: string) => {
  const { data, error } = await admin.from("workspace_memberships")
    .insert({ workspace_id: ws, user_id: user, role_id: await roleId(role), status: "active", joined_at: new Date().toISOString() })
    .select("id").single();
  if (error) throw error;
  return data!.id;
};
const setAppAccess = async (membership: string, app: string, level: string) => {
  await admin.from("workspace_member_app_access")
    .upsert({ membership_id: membership, app_key: app, access_level: level }, { onConflict: "membership_id,app_key" });
};
const grantEntitlement = async (ws: string, user: string, apps: string[]) => {
  await admin.from("access_entitlements").upsert({
    user_id: user, workspace_id: ws, plan_id: "growth", billing_period: "yearly", currency: "USD",
    addons: [], seats_extra: 0, status: "active", access_status: "active", subscription_source: "manual_admin",
    payment_status: "not_required", access_start_date: new Date(Date.now() - 86400000).toISOString(),
    access_expiry_date: new Date(Date.now() + 30 * 86400000).toISOString(),
    allowed_apps: apps, admin_notes: "ZZ stage3 fixture",
  }, { onConflict: "user_id" });
};
const overrideRows = async (membership: string) => {
  const { data } = await admin.from("workspace_member_permission_overrides")
    .select("effect, workspace_permissions(permission_key)").eq("membership_id", membership);
  return (data ?? []).map((r: any) => `${r.workspace_permissions?.permission_key}:${r.effect}`).sort();
};
const auditRows = async (ws: string, action: string) => {
  const { data } = await admin.from("team_audit_log").select("action, details").eq("workspace_id", ws).eq("action", action);
  return data ?? [];
};

const owner = await mkUser("owner");
const adminUser = await mkUser("admin");
const manager = await mkUser("manager");
const staff = await mkUser("staff");
const viewer = await mkUser("viewer");
const auditor = await mkUser("auditor");
const superUser = await mkUser("super");
const foreign = await mkUser("foreign");

const wsA = await mkWorkspace("ZZ3 Alpha", owner.id);
const wsB = await mkWorkspace("ZZ3 Beta", foreign.id);
await grantEntitlement(wsA, owner.id, ["catalog", "splits"]);
await grantEntitlement(wsB, foreign.id, ["catalog", "splits"]);

const mOwner = await mkMembership(wsA, owner.id, "owner");
const mAdmin = await mkMembership(wsA, adminUser.id, "administrator");
const mManager = await mkMembership(wsA, manager.id, "manager");
const mStaff = await mkMembership(wsA, staff.id, "staff");
const mViewer = await mkMembership(wsA, viewer.id, "viewer");
const mAuditor = await mkMembership(wsA, auditor.id, "auditor");
const mSuper = await mkMembership(wsA, superUser.id, "staff");
const mForeign = await mkMembership(wsB, foreign.id, "owner");
const mForeignStaff = await mkMembership(wsB, staff.id, "staff");
await admin.from("user_roles").insert({ user_id: superUser.id, role: "super_admin" });

for (const m of [mAdmin, mManager, mStaff, mViewer, mAuditor, mSuper]) {
  for (const app of ["catalog", "splits"]) await setAppAccess(m, app, "edit");
}
await setAppAccess(mManager, "splits", "manage");
await setAppAccess(mForeignStaff, "splits", "edit");

const call = (actor: string, ws: string, membership: string, permissionKey: string, effect: string) =>
  setMemberPermissionOverride({ actorUserId: actor, workspaceId: ws, membershipId: membership, permissionKey, effect });
const clear = (actor: string, ws: string, membership: string, permissionKey: string) =>
  clearMemberPermissionOverride({ actorUserId: actor, workspaceId: ws, membershipId: membership, permissionKey });

const STAFF_BASE = ["splits.access", "splits.view", "splits.create", "splits.edit"];

// ---------------- authority matrix ----------------
{
  const r = await call(owner.id, wsA, mStaff, "splits.edit_shares", "allow");
  ok("Owner can Allow a non-Owner member", r.ok && r.changed && r.previousEffect === "inherited" && r.effect === "allow", JSON.stringify(r));
  const a = await resolveAppAuthorization(staff.id, "splits");
  ok("live: Allow effective on next authorization", same(a.permissions, [...STAFF_BASE, "splits.edit_shares"]), JSON.stringify(a.permissions));
}
{
  const r = await call(owner.id, wsA, mStaff, "splits.edit_shares", "allow");
  ok("repeating same state is idempotent", r.ok && r.changed === false && (await overrideRows(mStaff)).length === 1);
}
{
  const r = await call(owner.id, wsA, mStaff, "splits.edit_shares", "deny");
  ok("Allow → Deny transition", r.changed && r.previousEffect === "allow" && r.effect === "deny", JSON.stringify(r));
  ok("no duplicate row after transition", (await overrideRows(mStaff)).length === 1);
  const r2 = await call(owner.id, wsA, mStaff, "splits.edit_shares", "allow");
  ok("Deny → Allow transition", r2.changed && r2.previousEffect === "deny" && r2.effect === "allow", JSON.stringify(r2));
}
{
  const r = await clear(owner.id, wsA, mStaff, "splits.edit_shares");
  ok("Owner can Clear", r.ok && r.changed && r.previousEffect === "allow" && r.effect === "inherited", JSON.stringify(r));
  const a = await resolveAppAuthorization(staff.id, "splits");
  ok("live: Clear restores role baseline", same(a.permissions, STAFF_BASE), JSON.stringify(a.permissions));
  const again = await clear(owner.id, wsA, mStaff, "splits.edit_shares");
  ok("clearing a nonexistent override is idempotent", again.ok && again.changed === false);
}
{
  const r = await call(adminUser.id, wsA, mStaff, "splits.edit_shares", "allow");
  ok("Administrator with effective permission can manage", r.ok && r.changed);
  await clear(adminUser.id, wsA, mStaff, "splits.edit_shares");
}
await rejects("Manager cannot manage overrides", () => call(manager.id, wsA, mStaff, "splits.edit_shares", "allow"));
await rejects("Staff cannot manage overrides", () => call(staff.id, wsA, mViewer, "splits.view", "deny"));
await rejects("Viewer cannot manage overrides", () => call(viewer.id, wsA, mStaff, "splits.edit_shares", "allow"));
await rejects("Auditor cannot manage overrides", () => call(auditor.id, wsA, mStaff, "splits.edit_shares", "allow"));
ok("no rows created by unauthorized attempts", (await overrideRows(mStaff)).length === 0 && (await overrideRows(mViewer)).length === 0);

// ---------------- self-target ----------------
await rejects("self-Allow rejected", () => call(adminUser.id, wsA, mAdmin, "splits.approve", "allow"));
await rejects("self-Deny rejected", () => call(adminUser.id, wsA, mAdmin, "splits.approve", "deny"));
await rejects("self-Clear rejected", () => clear(adminUser.id, wsA, mAdmin, "splits.approve"));
ok("no self-target rows created", (await overrideRows(mAdmin)).length === 0);

// ---------------- protected targets ----------------
await rejects("Owner target rejected (allow)", () => call(adminUser.id, wsA, mOwner, "splits.edit", "deny"));
await rejects("Owner target rejected (clear)", () => clear(owner.id, wsA, mOwner, "splits.edit"));
await rejects("super-admin target rejected", () => call(owner.id, wsA, mSuper, "splits.edit_shares", "allow"));
ok("no rows on protected targets", (await overrideRows(mOwner)).length === 0 && (await overrideRows(mSuper)).length === 0);

// ---------------- cross-workspace ----------------
{
  const before = await resolveAppAuthorization(staff.id, "splits");
  await rejects("cross-workspace membership rejected", () => call(adminUser.id, wsA, mForeignStaff, "splits.edit_shares", "allow"));
  ok("no cross-workspace row created", (await overrideRows(mForeignStaff)).length === 0);
  const after = await resolveAppAuthorization(staff.id, "splits");
  ok("cross-workspace attempt changed no authorization", same(before.permissions, after.permissions));
  await rejects("foreign Owner cannot target workspace A member", () => call(foreign.id, wsB, mStaff, "splits.edit_shares", "allow"));
  void mForeign;
}

// ---------------- validation ----------------
await rejects("unknown permission rejected", () => call(owner.id, wsA, mStaff, "splits.not_a_real_action", "allow"));
await rejects("arbitrary permission string rejected", () => call(owner.id, wsA, mStaff, "* ; drop", "allow"));
await rejects("invalid effect rejected", () => call(owner.id, wsA, mStaff, "splits.edit_shares", "maybe"));
await rejects("Allow for non-entitled app rejected", () => call(owner.id, wsA, mStaff, "finance.manage", "allow"));
{
  const r = await call(owner.id, wsA, mStaff, "finance.manage", "deny");
  ok("Deny for non-entitled app stored (restrictive, safe)", r.ok && r.changed && r.effect === "deny");
  const fin = await resolveAppAuthorization(staff.id, "finance");
  ok("non-entitled app still unauthorized", !fin.authorized, JSON.stringify(fin.reason));
  await clear(owner.id, wsA, mStaff, "finance.manage");
}

// ---------------- cap-aware storage ----------------
{
  await setAppAccess(mStaff, "splits", "view");
  const r = await call(owner.id, wsA, mStaff, "splits.edit_shares", "allow");
  ok("capped-out Allow is still stored", r.ok && r.changed);
  const capped = await resolveAppAuthorization(staff.id, "splits");
  ok("capped-out Allow is ineffective at View", !capped.permissions.includes("splits.edit_shares"), JSON.stringify(capped.permissions));
  await setAppAccess(mStaff, "splits", "edit");
  const raised = await resolveAppAuthorization(staff.id, "splits");
  ok("raising access makes stored Allow effective", raised.permissions.includes("splits.edit_shares"));
  await clear(owner.id, wsA, mStaff, "splits.edit_shares");
}

// ---------------- Deny live effect on Manager ----------------
{
  const before = await resolveAppAuthorization(manager.id, "splits");
  ok("Manager baseline includes splits.approve", before.permissions.includes("splits.approve"), JSON.stringify(before.permissions));
  await call(owner.id, wsA, mManager, "splits.approve", "deny");
  const denied = await resolveAppAuthorization(manager.id, "splits");
  ok("live: DENY removes splits.approve", !denied.permissions.includes("splits.approve"));
  ok("live: unrelated Manager permissions intact",
    ["splits.access", "splits.view", "splits.create", "splits.edit", "splits.edit_shares", "splits.export"].every((k) => denied.permissions.includes(k)),
    JSON.stringify(denied.permissions));
  await clear(owner.id, wsA, mManager, "splits.approve");
  const restored = await resolveAppAuthorization(manager.id, "splits");
  ok("live: Clear restores splits.approve from baseline", restored.permissions.includes("splits.approve"));
}

// ---------------- Administrator authority revocation ----------------
{
  ok("Administrator holds workspace.permissions.manage", await hasWorkspacePermission(adminUser.id, wsA, "workspace.permissions.manage"));
  await call(owner.id, wsA, mAdmin, "workspace.permissions.manage", "deny");
  ok("Administrator lost effective authority", !(await hasWorkspacePermission(adminUser.id, wsA, "workspace.permissions.manage")));
  await rejects("denied Administrator cannot call the action directly", () => call(adminUser.id, wsA, mStaff, "splits.edit_shares", "allow"));
  await rejects("denied Administrator cannot clear either", () => clear(adminUser.id, wsA, mManager, "splits.approve"));
  ok("no row created by denied Administrator", (await overrideRows(mStaff)).length === 0);
  await clear(owner.id, wsA, mAdmin, "workspace.permissions.manage");
  ok("Administrator regains authority after Clear", await hasWorkspacePermission(adminUser.id, wsA, "workspace.permissions.manage"));
  const r = await call(adminUser.id, wsA, mStaff, "splits.edit_shares", "allow");
  ok("Administrator can act again", r.ok && r.changed);
  await clear(adminUser.id, wsA, mStaff, "splits.edit_shares");
}

// ---------------- concurrency ----------------
{
  const results = await Promise.allSettled([
    call(owner.id, wsA, mStaff, "splits.edit_shares", "allow"),
    call(owner.id, wsA, mStaff, "splits.edit_shares", "deny"),
    call(owner.id, wsA, mStaff, "splits.edit_shares", "allow"),
    call(owner.id, wsA, mStaff, "splits.edit_shares", "deny"),
  ]);
  const rows = await overrideRows(mStaff);
  ok("concurrent writes produce exactly one row", rows.length === 1, JSON.stringify(rows));
  ok("final state is a valid single effect", rows[0] === "splits.edit_shares:allow" || rows[0] === "splits.edit_shares:deny", JSON.stringify(rows));
  ok("no concurrent write crashed unrecoverably", results.every((r) => r.status === "fulfilled"), JSON.stringify(results.map((r) => r.status)));
  await clear(owner.id, wsA, mStaff, "splits.edit_shares");
}

// ---------------- audit ----------------
{
  await call(owner.id, wsA, mStaff, "splits.edit_shares", "allow");
  await call(owner.id, wsA, mStaff, "splits.edit_shares", "deny");
  await clear(owner.id, wsA, mStaff, "splits.edit_shares");
  const allowed = await auditRows(wsA, "member_permission_allowed");
  const denied = await auditRows(wsA, "member_permission_denied");
  const { data: removedOrdered } = await admin.from("team_audit_log").select("details")
    .eq("workspace_id", wsA).eq("action", "member_permission_override_removed")
    .order("created_at", { ascending: true });
  const removed = removedOrdered ?? [];
  ok("audit entry for Allow", allowed.length > 0);
  ok("audit entry for Deny", denied.length > 0);
  ok("audit entry for Clear", removed.length > 0);
  const last = removed[removed.length - 1] as any;
  ok("audit details carry membership/permission/effects",
    last.details?.membership_id === mStaff && last.details?.permission_key === "splits.edit_shares" &&
    last.details?.previous_effect === "deny" && last.details?.new_effect === "inherited" && last.details?.app_key === "splits",
    JSON.stringify(last.details));
  const { data: full } = await admin.from("team_audit_log").select("actor_user_id, target_user_id, target_email, role_key, created_at")
    .eq("workspace_id", wsA).eq("action", "member_permission_allowed").limit(1).single();
  ok("audit records actor, target, email, role and timestamp",
    full!.actor_user_id === owner.id && full!.target_user_id === staff.id &&
    full!.target_email === staff.email && full!.role_key === "staff" && Boolean(full!.created_at),
    JSON.stringify(full));
  const workspaceScoped = await call(owner.id, wsA, mManager, "workspace.roles.assign", "deny");
  void workspaceScoped;
  const { data: wsAudit } = await admin.from("team_audit_log").select("details").eq("workspace_id", wsA)
    .eq("action", "member_permission_denied").order("created_at", { ascending: false }).limit(1).single();
  ok("workspace-level permission audit has no app key", (wsAudit!.details as any)?.app_key === null, JSON.stringify(wsAudit!.details));
  await clear(owner.id, wsA, mManager, "workspace.roles.assign");
}

// ---------------- atomicity ----------------
{
  const { data: before } = await admin.from("team_audit_log").select("id").eq("workspace_id", wsA);
  await call(owner.id, wsA, mStaff, "splits.edit_shares", "allow");
  const { data: after } = await admin.from("team_audit_log").select("id").eq("workspace_id", wsA);
  ok("each successful change writes exactly one audit row",
    (after ?? []).length === (before ?? []).length + 1, `${(before ?? []).length} → ${(after ?? []).length}`);
  await clear(owner.id, wsA, mStaff, "splits.edit_shares");
}

// ---------------- direct browser attack regression ----------------
{
  const id = (await admin.from("workspace_member_permission_overrides")
    .insert({
      workspace_id: wsA, membership_id: mStaff,
      permission_id: (await admin.from("workspace_permissions").select("id").eq("permission_key", "splits.edit_shares").single()).data!.id,
      effect: "allow",
    }).select("id").single()).data!.id;

  const browser = createClient(url, anonKey, { auth: { persistSession: false } });
  const { error: signIn } = await browser.auth.signInWithPassword({ email: staff.email, password: pw });
  ok("test member can sign in", !signIn, signIn?.message);

  const { error: insErr } = await browser.from("workspace_member_permission_overrides")
    .insert({ workspace_id: wsA, membership_id: mStaff, permission_id: id, effect: "allow" });
  ok("browser INSERT denied", Boolean(insErr));
  const { data: updData, error: updErr } = await browser.from("workspace_member_permission_overrides")
    .update({ effect: "deny" }).eq("id", id).select("id");
  ok("browser UPDATE denied", Boolean(updErr) || (updData ?? []).length === 0);
  const { data: delData, error: delErr } = await browser.from("workspace_member_permission_overrides")
    .delete().eq("id", id).select("id");
  ok("browser DELETE denied", Boolean(delErr) || (delData ?? []).length === 0);
  const { data: rpc, error: rpcErr } = await browser.rpc("write_member_permission_override" as never, {} as never);
  ok("browser cannot call the write routine", Boolean(rpcErr) && !rpc, JSON.stringify(rpcErr?.message));
  const { data: stillThere } = await admin.from("workspace_member_permission_overrides").select("effect").eq("id", id).single();
  ok("row unchanged after browser attack", stillThere!.effect === "allow");
  await browser.auth.signOut();
  await admin.from("workspace_member_permission_overrides").delete().eq("id", id);
}

// ---------------- gates remain intact ----------------
{
  // viewer belongs to workspace A only, so gate behaviour is unambiguous
  await call(owner.id, wsA, mViewer, "splits.manage", "allow");
  await admin.from("workspace_memberships").update({ status: "suspended" }).eq("id", mViewer);
  const s = await resolveAppAuthorization(viewer.id, "splits");
  ok("suspended member gate intact", !s.authorized && s.permissions.length === 0, JSON.stringify([s.reason, s.permissions]));
  await admin.from("workspace_memberships").update({ status: "active" }).eq("id", mViewer);
  await setAppAccess(mViewer, "splits", "no_access");
  const n = await resolveAppAuthorization(viewer.id, "splits");
  ok("No Access gate intact", !n.authorized && n.permissions.length === 0, JSON.stringify([n.reason, n.permissions]));
  await setAppAccess(mViewer, "splits", "edit");
  await admin.from("workspaces").update({ status: "suspended" }).eq("id", wsA);
  const w = await resolveAppAuthorization(viewer.id, "splits");
  ok("inactive workspace gate intact", !w.authorized && w.reason === "workspace_inactive", JSON.stringify([w.reason, w.authorized]));
  await admin.from("workspaces").update({ status: "active" }).eq("id", wsA);
  await clear(owner.id, wsA, mViewer, "splits.manage");
}

// ---------------- Owner / super-admin resolver regression ----------------
{
  const o = await resolveAppAuthorization(owner.id, "splits");
  ok("Owner regression: full splits set", o.authorized && o.permissions.length === 9, JSON.stringify(o.permissions));
  const su = await resolveAppAuthorization(superUser.id, "splits");
  ok("super-admin regression unchanged", su.authorized && su.isPlatformSuperAdmin);
}

// ---------------- production pilot regression ----------------
{
  const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  const pilotStaff = list.users.find((u) => u.email === "jabarimuzik@gmail.com");
  const pilotOwner = list.users.find((u) => u.email === "tpcampservices@gmail.com");
  if (pilotStaff) {
    const cat = await resolveAppAuthorization(pilotStaff.id, "catalog");
    ok("pilot Staff catalog regression", cat.authorized && cat.accessLevel === "edit" &&
      same(cat.permissions, ["catalog.access", "catalog.view", "catalog.create", "catalog.edit"]), JSON.stringify(cat.permissions));
    const sp = await resolveAppAuthorization(pilotStaff.id, "splits");
    ok("pilot Staff splits regression", !sp.authorized && sp.permissions.length === 0);
  }
  if (pilotOwner) {
    const sp = await resolveAppAuthorization(pilotOwner.id, "splits");
    ok("pilot Owner splits regression", sp.authorized && sp.permissions.length === 9);
    const cat = await resolveAppAuthorization(pilotOwner.id, "catalog");
    ok("pilot Owner catalog regression", cat.authorized && cat.permissions.length === 7);
  }
}

// ---------------- cleanup ----------------
for (const u of users) {
  const { data: owned } = await admin.from("workspaces").select("id").eq("owner_user_id", u);
  await admin.from("access_entitlements").delete().eq("user_id", u);
  await admin.from("user_roles").delete().eq("user_id", u);
  await admin.from("workspace_memberships").delete().eq("user_id", u);
  for (const w of owned ?? []) {
    await admin.from("workspace_member_permission_overrides").delete().eq("workspace_id", w.id);
    await admin.from("team_audit_log").delete().eq("workspace_id", w.id);
    await admin.from("workspace_invitations").delete().eq("workspace_id", w.id);
    await admin.from("workspace_memberships").delete().eq("workspace_id", w.id);
    await admin.from("workspaces").delete().eq("id", w.id);
  }
  await admin.auth.admin.deleteUser(u);
}
{
  const { data: overrides } = await admin.from("workspace_member_permission_overrides").select("id");
  ok("no override rows remain anywhere", (overrides ?? []).length === 0, JSON.stringify(overrides));
  const { data: ws } = await admin.from("workspaces").select("name").ilike("name", "ZZ3%");
  ok("no fixture workspaces remain", (ws ?? []).length === 0, JSON.stringify(ws));
  const { data: ents } = await admin.from("access_entitlements").select("user_id, allowed_apps, access_status");
  ok("only the pilot entitlement remains", (ents ?? []).length === 1, JSON.stringify(ents));
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
