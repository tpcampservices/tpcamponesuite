import { createClient } from "@supabase/supabase-js";
import { resolveAppAuthorization, hasWorkspacePermission, getSeatAccounting } from "./src/lib/workspace.server";
import {
  listMembers,
  setMemberPermissionOverride,
  clearMemberPermissionOverride,
  changeMemberRole,
  setMemberAppAccess,
  setMemberStatus,
  type PermissionGroup,
} from "./src/lib/members.server";

const url = process.env.VITE_SUPABASE_URL!;
const anonKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY!;
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra = "") => {
  if (cond) { pass++; console.log(`PASS ${name}`); }
  else { fail++; console.log(`FAIL ${name} ${extra}`); }
};
const rejects = async (name: string, fn: () => Promise<unknown>) => {
  try { await fn(); ok(name, false, "no error thrown"); } catch { ok(name, true); }
};
const same = (a: readonly string[], b: readonly string[]) =>
  JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());

const pw = `Zz!${crypto.randomUUID()}`;
const users: string[] = [];
const mkUser = async (label: string) => {
  const email = `zz4-${label}-${Date.now()}@example.com`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: pw, email_confirm: true });
  if (error) throw error;
  users.push(data.user.id);
  return { id: data.user.id, email };
};
const roleId = async (key: string) => (await admin.from("workspace_roles").select("id").is("workspace_id", null).eq("role_key", key).single()).data!.id;
const mkWorkspace = async (name: string, owner: string) =>
  (await admin.from("workspaces").insert({ name, owner_user_id: owner, status: "active" }).select("id").single()).data!.id;
const mkMembership = async (ws: string, user: string, role: string) =>
  (await admin.from("workspace_memberships").insert({
    workspace_id: ws, user_id: user, role_id: await roleId(role), status: "active", joined_at: new Date().toISOString(),
  }).select("id").single()).data!.id;
const setAppAccess = async (membership: string, app: string, level: string) => {
  await admin.from("workspace_member_app_access")
    .upsert({ membership_id: membership, app_key: app, access_level: level }, { onConflict: "membership_id,app_key" });
};
const grantEntitlement = async (ws: string, user: string, apps: string[]) => {
  await admin.from("access_entitlements").upsert({
    user_id: user, workspace_id: ws, plan_id: "growth", billing_period: "yearly", currency: "USD",
    addons: [], seats_extra: 5, status: "active", access_status: "active", subscription_source: "manual_admin",
    payment_status: "not_required", access_start_date: new Date(Date.now() - 86400000).toISOString(),
    access_expiry_date: new Date(Date.now() + 30 * 86400000).toISOString(),
    allowed_apps: apps, admin_notes: "ZZ stage4 fixture",
  }, { onConflict: "user_id" });
};

const owner = await mkUser("owner");
const adminUser = await mkUser("admin");
const manager = await mkUser("manager");
const staff = await mkUser("staff");
const superUser = await mkUser("super");
const outsider = await mkUser("outsider");

const wsA = await mkWorkspace("ZZ4 Alpha", owner.id);
const wsB = await mkWorkspace("ZZ4 Beta", outsider.id);
await grantEntitlement(wsA, owner.id, ["catalog", "splits"]);
await grantEntitlement(wsB, outsider.id, ["catalog", "splits"]);

const mOwner = await mkMembership(wsA, owner.id, "owner");
const mAdmin = await mkMembership(wsA, adminUser.id, "administrator");
const mManager = await mkMembership(wsA, manager.id, "manager");
const mStaff = await mkMembership(wsA, staff.id, "staff");
const mSuper = await mkMembership(wsA, superUser.id, "staff");
const mOutsider = await mkMembership(wsB, outsider.id, "owner");
await admin.from("user_roles").insert({ user_id: superUser.id, role: "super_admin" });
for (const m of [mAdmin, mManager, mStaff, mSuper]) {
  await setAppAccess(m, "catalog", "edit");
  await setAppAccess(m, "splits", "edit");
}
await setAppAccess(mManager, "splits", "manage");

const view = async (actor: string, membershipId: string) => {
  const members = await listMembers(actor, wsA);
  const member = members.find((m) => m.membershipId === membershipId)!;
  return member;
};
const group = (m: { permissionGroups: PermissionGroup[] }, appKey: string) =>
  m.permissionGroups.find((g) => g.appKey === appKey)!;
const entry = (m: { permissionGroups: PermissionGroup[] }, key: string) => {
  const appKey = key.split(".")[0]!;
  return group(m, appKey).permissions.find((p) => p.key === key)!;
};

// ---------------- 22. read model: Staff + Splits Edit baseline ----------------
{
  const m = await view(owner.id, mStaff);
  const g = group(m, "splits");
  ok("groups are organised by application", m.permissionGroups.some((x) => x.appKey === "catalog") && Boolean(g));
  ok("workspace administration group present", m.permissionGroups.some((x) => x.appKey === "workspace"));
  ok("group shows current app access level", g.accessLevel === "edit");
  ok("no raw keys needed: labels present", entry(m, "splits.edit_shares").label === "Edit ownership shares");
  ok("label: approve", entry(m, "splits.approve").label === "Validate / approve");
  ok("label: export", entry(m, "splits.export").label === "Export");
  ok("label: delete", entry(m, "splits.delete").label === "Delete");
  ok("label: manage", entry(m, "splits.manage").label === "Manage application");

  const granted = ["splits.access", "splits.view", "splits.create", "splits.edit"];
  ok("baseline granted rows are inherited+effective",
    granted.every((k) => entry(m, k).inheritedByRole && entry(m, k).effective && entry(m, k).state === "inherited"));
  const notGranted = ["splits.edit_shares", "splits.approve", "splits.export", "splits.delete", "splits.manage"];
  ok("baseline non-granted rows are inherited+not granted",
    notGranted.every((k) => !entry(m, k).inheritedByRole && !entry(m, k).effective && entry(m, k).state === "inherited"));
  ok("approve is flagged as Manage-level", entry(m, "splits.approve").requiredLevel === "manage");
  ok("edit_shares is flagged as Edit-level", entry(m, "splits.edit_shares").requiredLevel === "edit");
  ok("entitled app is allowable", entry(m, "splits.edit_shares").allowable);
}

// ---------------- 22. Allow through the UI action path ----------------
{
  await setMemberPermissionOverride({
    actorUserId: owner.id, workspaceId: wsA, membershipId: mStaff,
    permissionKey: "splits.edit_shares", effect: "allow",
  });
  const m = await view(owner.id, mStaff);
  const e = entry(m, "splits.edit_shares");
  ok("UI shows explicit Allow", e.state === "allow" && e.effective && !e.cappedOut);
  ok("role unchanged after Allow", m.roleKey === "staff");
  ok("app access unchanged after Allow", group(m, "splits").accessLevel === "edit");
  const { data: row } = await admin.from("workspace_member_permission_overrides").select("effect").eq("membership_id", mStaff);
  ok("override row exists", (row ?? []).length === 1 && row![0]!.effect === "allow");
  const authz = await resolveAppAuthorization(staff.id, "splits");
  ok("effective permissions contain splits.edit_shares", authz.permissions.includes("splits.edit_shares"));
  const { data: audit } = await admin.from("team_audit_log").select("details").eq("workspace_id", wsA).eq("action", "member_permission_allowed");
  ok("audit written by the server action", (audit ?? []).length === 1 && (audit![0]!.details as any).permission_key === "splits.edit_shares");
}

// ---------------- 23. cap ----------------
{
  await setMemberAppAccess({ actorUserId: owner.id, workspaceId: wsA, membershipId: mStaff, appKey: "splits", level: "view" });
  const m = await view(owner.id, mStaff);
  const e = entry(m, "splits.edit_shares");
  ok("stored Allow survives a downgrade to View", e.state === "allow");
  ok("capped-out Allow is flagged, not effective", e.cappedOut && !e.effective);
  ok("cap message names the required level", e.requiredLevel === "edit");
  const authz = await resolveAppAuthorization(staff.id, "splits");
  ok("resolver agrees it is not effective at View", !authz.permissions.includes("splits.edit_shares"));

  await setMemberAppAccess({ actorUserId: owner.id, workspaceId: wsA, membershipId: mStaff, appKey: "splits", level: "edit" });
  const m2 = await view(owner.id, mStaff);
  ok("raising access reactivates the same stored Allow without another mutation",
    entry(m2, "splits.edit_shares").effective && !entry(m2, "splits.edit_shares").cappedOut);
  const { data: rows } = await admin.from("workspace_member_permission_overrides").select("id").eq("membership_id", mStaff);
  ok("no extra override rows created by the access changes", (rows ?? []).length === 1);
}

// ---------------- 10. No Access presentation ----------------
{
  await setMemberAppAccess({ actorUserId: owner.id, workspaceId: wsA, membershipId: mStaff, appKey: "splits", level: "no_access" });
  const m = await view(owner.id, mStaff);
  const g = group(m, "splits");
  ok("No Access is shown on the group", g.accessLevel === "no_access");
  ok("nothing is effective at No Access", g.permissions.every((p) => !p.effective));
  ok("stored override still visible at No Access", entry(m, "splits.edit_shares").state === "allow");
  await setMemberAppAccess({ actorUserId: owner.id, workspaceId: wsA, membershipId: mStaff, appKey: "splits", level: "edit" });
}

// ---------------- 13/24. Clear restores baseline ----------------
{
  await clearMemberPermissionOverride({
    actorUserId: owner.id, workspaceId: wsA, membershipId: mStaff, permissionKey: "splits.edit_shares",
  });
  const m = await view(owner.id, mStaff);
  const e = entry(m, "splits.edit_shares");
  ok("Clear returns the row to Inherited", e.state === "inherited" && !e.effective && !e.inheritedByRole);
  const authz = await resolveAppAuthorization(staff.id, "splits");
  ok("baseline restored in effective permissions", same(authz.permissions, ["splits.access", "splits.view", "splits.create", "splits.edit"]), JSON.stringify(authz.permissions));
  const { data: removed } = await admin.from("team_audit_log").select("id").eq("workspace_id", wsA).eq("action", "member_permission_override_removed");
  ok("Clear audited", (removed ?? []).length === 1);
}

// ---------------- 24. Deny on an inherited permission ----------------
{
  const before = await view(owner.id, mManager);
  ok("Manager inherits approve", entry(before, "splits.approve").inheritedByRole && entry(before, "splits.approve").effective);
  await setMemberPermissionOverride({
    actorUserId: owner.id, workspaceId: wsA, membershipId: mManager, permissionKey: "splits.approve", effect: "deny",
  });
  const denied = await view(owner.id, mManager);
  const e = entry(denied, "splits.approve");
  ok("UI shows explicit Deny over an inherited permission", e.state === "deny" && e.inheritedByRole && !e.effective);
  const authz = await resolveAppAuthorization(manager.id, "splits");
  ok("Deny removes it from effective permissions", !authz.permissions.includes("splits.approve"));
  const { data: audit } = await admin.from("team_audit_log").select("id").eq("workspace_id", wsA).eq("action", "member_permission_denied");
  ok("Deny audited", (audit ?? []).length === 1);

  await clearMemberPermissionOverride({
    actorUserId: owner.id, workspaceId: wsA, membershipId: mManager, permissionKey: "splits.approve",
  });
  const restored = await resolveAppAuthorization(manager.id, "splits");
  ok("Inherited restores it from the role baseline", restored.permissions.includes("splits.approve"));
}

// ---------------- 17. role change re-baselines, override kept ----------------
{
  await setMemberPermissionOverride({
    actorUserId: owner.id, workspaceId: wsA, membershipId: mStaff, permissionKey: "splits.edit_shares", effect: "allow",
  });
  await changeMemberRole({ actorUserId: owner.id, workspaceId: wsA, membershipId: mStaff, roleKey: "manager" });
  const m = await view(owner.id, mStaff);
  const e = entry(m, "splits.edit_shares");
  ok("role change is reflected in the baseline", m.roleKey === "manager" && e.inheritedByRole);
  ok("stored Allow kept, shown as explicit but now redundant", e.state === "allow" && e.effective);
  await changeMemberRole({ actorUserId: owner.id, workspaceId: wsA, membershipId: mStaff, roleKey: "staff" });
  const back = await view(owner.id, mStaff);
  ok("returning to Staff re-baselines again", !entry(back, "splits.edit_shares").inheritedByRole && entry(back, "splits.edit_shares").state === "allow");
  await clearMemberPermissionOverride({ actorUserId: owner.id, workspaceId: wsA, membershipId: mStaff, permissionKey: "splits.edit_shares" });
}

// ---------------- 11/12. entitlement + workspace administration presentation ----------------
{
  const m = await view(owner.id, mStaff);
  ok("non-entitled app is not offered as a group", !m.permissionGroups.some((g) => g.appKey === "finance"));
  await rejects("Allow for a non-entitled app is refused by the server", () =>
    setMemberPermissionOverride({ actorUserId: owner.id, workspaceId: wsA, membershipId: mStaff, permissionKey: "finance.manage", effect: "allow" }));

  await setMemberPermissionOverride({
    actorUserId: owner.id, workspaceId: wsA, membershipId: mStaff, permissionKey: "finance.manage", effect: "deny",
  });
  const withDeny = await view(owner.id, mStaff);
  const fin = withDeny.permissionGroups.find((g) => g.appKey === "finance");
  ok("existing Deny for an unavailable app stays visible", Boolean(fin) && fin!.entitled === false);
  ok("unavailable app rows are not allowable", fin!.permissions.every((p) => !p.allowable));
  await clearMemberPermissionOverride({ actorUserId: owner.id, workspaceId: wsA, membershipId: mStaff, permissionKey: "finance.manage" });

  const ws = group(await view(owner.id, mStaff), "workspace");
  ok("workspace administration group has no access cap", ws.accessLevel === null && ws.permissions.every((p) => !p.cappedOut));
  ok("non-deniable permission rendered as protected", ws.permissions.find((p) => p.key === "workspace.team.view")!.deniable === false);
  ok("other workspace permissions are deniable", ws.permissions.find((p) => p.key === "workspace.permissions.manage")!.deniable === true);
  await rejects("server refuses a Deny on a protected permission", () =>
    setMemberPermissionOverride({ actorUserId: owner.id, workspaceId: wsA, membershipId: mAdmin, permissionKey: "workspace.team.view", effect: "deny" }));
}

// ---------------- 25. administrator authority revocation ----------------
{
  const adminMembers = await listMembers(adminUser.id, wsA);
  ok("Administrator can read the team", adminMembers.length > 0);
  ok("Administrator effectively holds permissions.manage", await hasWorkspacePermission(adminUser.id, wsA, "workspace.permissions.manage"));
  const r = await setMemberPermissionOverride({
    actorUserId: adminUser.id, workspaceId: wsA, membershipId: mStaff, permissionKey: "splits.edit_shares", effect: "allow",
  });
  ok("Administrator can manage another eligible member", r.ok);
  await clearMemberPermissionOverride({ actorUserId: adminUser.id, workspaceId: wsA, membershipId: mStaff, permissionKey: "splits.edit_shares" });

  await setMemberPermissionOverride({
    actorUserId: owner.id, workspaceId: wsA, membershipId: mAdmin, permissionKey: "workspace.permissions.manage", effect: "deny",
  });
  ok("denied Administrator loses the effective permission the UI gates on",
    !(await hasWorkspacePermission(adminUser.id, wsA, "workspace.permissions.manage")));
  await rejects("forged direct request from denied Administrator still rejected", () =>
    setMemberPermissionOverride({ actorUserId: adminUser.id, workspaceId: wsA, membershipId: mStaff, permissionKey: "splits.edit_shares", effect: "allow" }));
  const shown = (await listMembers(adminUser.id, wsA)).find((m) => m.membershipId === mAdmin)!;
  ok("the Deny is visible on the Administrator's own row",
    shown.permissionGroups.find((g) => g.appKey === "workspace")!.permissions.find((p) => p.key === "workspace.permissions.manage")!.state === "deny");

  await clearMemberPermissionOverride({ actorUserId: owner.id, workspaceId: wsA, membershipId: mAdmin, permissionKey: "workspace.permissions.manage" });
  ok("Administrator regains authority after Clear", await hasWorkspacePermission(adminUser.id, wsA, "workspace.permissions.manage"));
}

// ---------------- 26. protected targets ----------------
{
  const ownerRow = await view(owner.id, mOwner);
  ok("Owner row is marked as owner (no editable controls rendered)", ownerRow.isOwner);
  await rejects("Owner target refused", () =>
    setMemberPermissionOverride({ actorUserId: adminUser.id, workspaceId: wsA, membershipId: mOwner, permissionKey: "splits.edit", effect: "deny" }));
  await rejects("self target refused", () =>
    setMemberPermissionOverride({ actorUserId: adminUser.id, workspaceId: wsA, membershipId: mAdmin, permissionKey: "splits.export", effect: "allow" }));
  await rejects("platform super-admin target refused", () =>
    setMemberPermissionOverride({ actorUserId: owner.id, workspaceId: wsA, membershipId: mSuper, permissionKey: "splits.edit_shares", effect: "allow" }));
  await rejects("cross-workspace membership refused", () =>
    setMemberPermissionOverride({ actorUserId: owner.id, workspaceId: wsA, membershipId: mOutsider, permissionKey: "splits.edit_shares", effect: "allow" }));
  const visible = await listMembers(owner.id, wsA);
  ok("cross-workspace membership never appears in the team list", !visible.some((m) => m.membershipId === mOutsider));
  ok("outsider cannot read this workspace's team", (await listMembers(outsider.id, wsA)).length === 0);
  await rejects("unknown permission refused", () =>
    setMemberPermissionOverride({ actorUserId: owner.id, workspaceId: wsA, membershipId: mStaff, permissionKey: "splits.fabricated", effect: "allow" }));
  const { data: rows } = await admin.from("workspace_member_permission_overrides").select("id");
  ok("no rows created by any refused attempt", (rows ?? []).length === 0, JSON.stringify(rows));
}

// ---------------- 15. read model never leaks other workspaces / secrets ----------------
{
  const m = await view(owner.id, mStaff);
  const serialized = JSON.stringify(m);
  ok("read model carries no secrets or tokens",
    !/service_role|SUPABASE_SERVICE|TPCAMP_SSO|token_hash|secret/i.test(serialized));
  ok("read model carries no other workspace id", !serialized.includes(wsB));
}

// ---------------- 27. team + authorization regression ----------------
{
  const seatsBefore = await getSeatAccounting(wsA);
  await changeMemberRole({ actorUserId: owner.id, workspaceId: wsA, membershipId: mStaff, roleKey: "viewer" });
  ok("role assignment still works", (await view(owner.id, mStaff)).roleKey === "viewer");
  await changeMemberRole({ actorUserId: owner.id, workspaceId: wsA, membershipId: mStaff, roleKey: "staff" });
  await setMemberAppAccess({ actorUserId: owner.id, workspaceId: wsA, membershipId: mStaff, appKey: "catalog", level: "view" });
  ok("app access assignment still works", (await view(owner.id, mStaff)).appAccess["catalog"] === "view");
  await setMemberAppAccess({ actorUserId: owner.id, workspaceId: wsA, membershipId: mStaff, appKey: "catalog", level: "edit" });

  await setMemberStatus({ actorUserId: owner.id, workspaceId: wsA, membershipId: mStaff, status: "suspended" });
  const suspended = await resolveAppAuthorization(staff.id, "splits");
  ok("suspended member gate unchanged", !suspended.authorized && suspended.permissions.length === 0);
  const suspendedRow = await view(owner.id, mStaff);
  ok("suspended member shows nothing effective", suspendedRow.permissionGroups.every((g) => g.permissions.every((p) => !p.effective)));
  await setMemberStatus({ actorUserId: owner.id, workspaceId: wsA, membershipId: mStaff, status: "active" });
  const seatsAfter = await getSeatAccounting(wsA);
  ok("seat accounting unchanged", JSON.stringify(seatsBefore) === JSON.stringify(seatsAfter), JSON.stringify([seatsBefore, seatsAfter]));

  const o = await resolveAppAuthorization(owner.id, "splits");
  ok("Owner authorization unchanged", o.authorized && o.permissions.length === 9);
  const su = await resolveAppAuthorization(superUser.id, "splits");
  ok("super-admin authorization unchanged", su.authorized && su.isPlatformSuperAdmin);
  const cat = await resolveAppAuthorization(staff.id, "catalog");
  ok("Catalog authorization regression", cat.authorized && same(cat.permissions, ["catalog.access", "catalog.view", "catalog.create", "catalog.edit"]), JSON.stringify(cat.permissions));
  const fin = await resolveAppAuthorization(staff.id, "finance");
  ok("entitlement gating unchanged", !fin.authorized && fin.reason === "app_not_in_plan", JSON.stringify(fin.reason));
}

// ---------------- 21. direct browser write regression ----------------
{
  const permId = (await admin.from("workspace_permissions").select("id").eq("permission_key", "splits.edit_shares").single()).data!.id;
  const rowId = (await admin.from("workspace_member_permission_overrides")
    .insert({ workspace_id: wsA, membership_id: mStaff, permission_id: permId, effect: "allow" })
    .select("id").single()).data!.id;
  const browser = createClient(url, anonKey, { auth: { persistSession: false } });
  const { error: signIn } = await browser.auth.signInWithPassword({ email: staff.email, password: pw });
  ok("fixture member can sign in", !signIn, signIn?.message);
  const { error: insErr } = await browser.from("workspace_member_permission_overrides")
    .insert({ workspace_id: wsA, membership_id: mStaff, permission_id: permId, effect: "deny" });
  ok("browser INSERT still denied", Boolean(insErr));
  const { data: upd, error: updErr } = await browser.from("workspace_member_permission_overrides").update({ effect: "deny" }).eq("id", rowId).select("id");
  ok("browser UPDATE still denied", Boolean(updErr) || (upd ?? []).length === 0);
  const { data: del, error: delErr } = await browser.from("workspace_member_permission_overrides").delete().eq("id", rowId).select("id");
  ok("browser DELETE still denied", Boolean(delErr) || (del ?? []).length === 0);
  const { data: still } = await admin.from("workspace_member_permission_overrides").select("effect").eq("id", rowId).single();
  ok("row unchanged after browser attempts", still!.effect === "allow");
  await browser.auth.signOut();
  await admin.from("workspace_member_permission_overrides").delete().eq("id", rowId);
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
    const team = await listMembers(pilotOwner.id, (await admin.from("workspaces").select("id").eq("name", "CMMG RECORDS").single()).data!.id);
    ok("pilot team page read model builds", team.length >= 2 && team.every((m) => m.permissionGroups.length >= 2));
    ok("pilot Owner row is protected", team.find((m) => m.isOwner)!.isOwner);
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
  const { data: ws } = await admin.from("workspaces").select("name").ilike("name", "ZZ4%");
  ok("no fixture workspaces remain", (ws ?? []).length === 0, JSON.stringify(ws));
  const { data: ents } = await admin.from("access_entitlements").select("user_id, allowed_apps, seats_extra, plan_id");
  ok("only the pilot entitlement remains, unchanged",
    (ents ?? []).length === 1 && (ents![0] as any).seats_extra === 0 && (ents![0] as any).plan_id === "growth",
    JSON.stringify(ents));
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
