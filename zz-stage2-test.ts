import { createClient } from "@supabase/supabase-js";
import { resolveAppAuthorization, resolveWorkspaceAccess, hasWorkspacePermission } from "./src/lib/workspace.server";
import { applyMemberOverrides } from "./src/lib/permissions";

const url = process.env.VITE_SUPABASE_URL!;
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra = "") => {
  if (cond) { pass++; console.log(`PASS ${name}`); }
  else { fail++; console.log(`FAIL ${name} ${extra}`); }
};
const same = (a: readonly string[], b: readonly string[]) =>
  JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());

// ---------------- pure helper ----------------
{
  const baseline = ["splits.access", "splits.view"];
  const frozen = [...baseline];
  const out = applyMemberOverrides(baseline, [{ key: "splits.edit_shares", effect: "allow" }]);
  ok("helper: allow adds", same(out, ["splits.access", "splits.view", "splits.edit_shares"]));
  ok("helper: no input mutation", same(baseline, frozen));
  ok("helper: deny removes", same(applyMemberOverrides(baseline, [{ key: "splits.view", effect: "deny" }]), ["splits.access"]));
  ok("helper: deny wins over allow", same(
    applyMemberOverrides(baseline, [{ key: "splits.edit", effect: "allow" }, { key: "splits.edit", effect: "deny" }]),
    ["splits.access", "splits.view"]));
  ok("helper: duplicates deduped", applyMemberOverrides(["splits.view", "splits.view"], []).length === 1);
  ok("helper: malformed effect ignored", same(
    applyMemberOverrides(baseline, [{ key: "splits.edit", effect: "maybe" as never }]), baseline));
  ok("helper: unknown key ignored", same(
    applyMemberOverrides(baseline, [{ key: "not.a.permission", effect: "allow" }]), baseline));
  ok("helper: deterministic", JSON.stringify(applyMemberOverrides(baseline, [{ key: "splits.edit", effect: "allow" }])) ===
    JSON.stringify(applyMemberOverrides([...baseline].reverse(), [{ key: "splits.edit", effect: "allow" }])));
  ok("helper: empty overrides = baseline", same(applyMemberOverrides(baseline, []), baseline));
}

// ---------------- fixtures ----------------
const pw = `Zz!${crypto.randomUUID()}`;
const users: string[] = [];
const mkUser = async (label: string) => {
  const { data, error } = await admin.auth.admin.createUser({
    email: `zz2-${label}-${Date.now()}@example.com`, password: pw, email_confirm: true,
  });
  if (error) throw error;
  users.push(data.user.id);
  return data.user.id;
};
const roleId = async (key: string) => {
  const { data } = await admin.from("workspace_roles").select("id").is("workspace_id", null).eq("role_key", key).single();
  return data!.id;
};
const permId = async (key: string) => {
  const { data } = await admin.from("workspace_permissions").select("id").eq("permission_key", key).single();
  return data!.id;
};

const ownerUser = await mkUser("owner");
const memberA = await mkUser("a");
const memberB = await mkUser("b");
const otherUser = await mkUser("other");

const mkWorkspace = async (name: string, owner: string) => {
  const { data } = await admin.from("workspaces").insert({ name, owner_user_id: owner, status: "active" }).select("id").single();
  return data!.id;
};
const mkMembership = async (ws: string, user: string, role: string) => {
  const { data } = await admin.from("workspace_memberships")
    .insert({ workspace_id: ws, user_id: user, role_id: await roleId(role), status: "active", joined_at: new Date().toISOString() })
    .select("id").single();
  return data!.id;
};
const setAppAccess = async (membership: string, app: string, level: string) => {
  await admin.from("workspace_member_app_access")
    .upsert({ membership_id: membership, app_key: app, access_level: level }, { onConflict: "membership_id,app_key" });
};
const grantEntitlement = async (ws: string, user: string, apps: string[], status = "active", expiry?: string) => {
  await admin.from("access_entitlements").upsert({
    user_id: user, workspace_id: ws, plan_id: "growth", billing_period: "yearly", currency: "USD",
    addons: [], seats_extra: 0, status, access_status: status, subscription_source: "manual_admin",
    payment_status: "not_required", access_start_date: new Date(Date.now() - 86400000).toISOString(),
    access_expiry_date: expiry ?? new Date(Date.now() + 30 * 86400000).toISOString(),
    allowed_apps: apps, admin_notes: "ZZ stage2 fixture",
  }, { onConflict: "user_id" });
};
const setOverride = async (ws: string, membership: string, key: string, effect: "allow" | "deny") => {
  const { data, error } = await admin.from("workspace_member_permission_overrides")
    .upsert({ workspace_id: ws, membership_id: membership, permission_id: await permId(key), effect },
      { onConflict: "membership_id,permission_id" }).select("id").single();
  if (error) throw error;
  return data!.id;
};

const wsMain = await mkWorkspace("ZZ2 Main", ownerUser);
const wsOther = await mkWorkspace("ZZ2 Other", otherUser);
const mOwner = await mkMembership(wsMain, ownerUser, "owner");
const mA = await mkMembership(wsMain, memberA, "staff");
const mB = await mkMembership(wsMain, memberB, "staff");
const mOther = await mkMembership(wsOther, otherUser, "owner");
for (const app of ["catalog", "splits"]) {
  await setAppAccess(mA, app, "edit");
  await setAppAccess(mB, app, "edit");
}
await grantEntitlement(wsMain, ownerUser, ["catalog", "splits"]);
await grantEntitlement(wsOther, otherUser, ["catalog", "splits"]);

const STAFF_BASE = ["splits.access", "splits.view", "splits.create", "splits.edit"];

// ---------------- no override = unchanged ----------------
{
  const a = await resolveAppAuthorization(memberA, "splits");
  ok("no override → baseline Staff permissions", a.authorized && a.accessLevel === "edit" && same(a.permissions, STAFF_BASE), JSON.stringify(a.permissions));
}

// ---------------- ALLOW within cap ----------------
const ovrEditShares = await setOverride(wsMain, mA, "splits.edit_shares", "allow");
{
  const a = await resolveAppAuthorization(memberA, "splits");
  ok("ALLOW splits.edit_shares effective at Edit", same(a.permissions, [...STAFF_BASE, "splits.edit_shares"]), JSON.stringify(a.permissions));
  ok("role unchanged (staff)", a.roleKey === "staff");
  ok("app access unchanged (edit)", a.accessLevel === "edit");
  ok("authorization_version path unchanged (authorized)", a.authorized === true);
}
// cross-member isolation
{
  const b = await resolveAppAuthorization(memberB, "splits");
  ok("cross-member isolation: B has no edit_shares", same(b.permissions, STAFF_BASE), JSON.stringify(b.permissions));
}
// cross-app isolation
{
  const cat = await resolveAppAuthorization(memberA, "catalog");
  ok("cross-app isolation: catalog unaffected",
    same(cat.permissions, ["catalog.access", "catalog.view", "catalog.create", "catalog.edit"]), JSON.stringify(cat.permissions));
}
// cross-workspace isolation
{
  const other = await resolveAppAuthorization(otherUser, "splits");
  ok("cross-workspace isolation: other workspace unaffected", other.workspaceId === wsOther && other.isOwner, JSON.stringify(other.workspaceId));
}

// ---------------- ALLOW cannot bypass Manage minimum ----------------
const ovrApprove = await setOverride(wsMain, mA, "splits.approve", "allow");
{
  const a = await resolveAppAuthorization(memberA, "splits");
  ok("ALLOW splits.approve capped out at Edit", !a.permissions.includes("splits.approve"), JSON.stringify(a.permissions));
  ok("edit_shares still effective alongside", a.permissions.includes("splits.edit_shares"));
}

// ---------------- app-access transitions ----------------
await setAppAccess(mA, "splits", "view");
{
  const a = await resolveAppAuthorization(memberA, "splits");
  ok("View cap removes edit_shares", a.authorized && a.accessLevel === "view" && !a.permissions.includes("splits.edit_shares"), JSON.stringify(a.permissions));
  ok("View keeps access+view only", same(a.permissions, ["splits.access", "splits.view"]), JSON.stringify(a.permissions));
}
await setAppAccess(mA, "splits", "no_access");
{
  const a = await resolveAppAuthorization(memberA, "splits");
  ok("No Access → unauthorized with no permissions", !a.authorized && a.permissions.length === 0 && a.reason === "no_access", JSON.stringify(a));
}
await setAppAccess(mA, "splits", "edit");
{
  const a = await resolveAppAuthorization(memberA, "splits");
  ok("Edit restored → stored ALLOW effective again", a.permissions.includes("splits.edit_shares"), JSON.stringify(a.permissions));
  const { data: still } = await admin.from("workspace_member_permission_overrides").select("id").eq("id", ovrEditShares).maybeSingle();
  ok("override rows survived cap changes", !!still);
}

// ---------------- role change recalculates baseline ----------------
await admin.from("workspace_memberships").update({ role_id: await roleId("manager") }).eq("id", mA);
await setAppAccess(mA, "splits", "manage");
{
  const a = await resolveAppAuthorization(memberA, "splits");
  ok("role change recalculated against new baseline (manager)",
    a.roleKey === "manager" && a.permissions.includes("splits.approve") && a.permissions.includes("splits.export")
      && !a.permissions.includes("splits.delete") && !a.permissions.includes("splits.manage"), JSON.stringify(a.permissions));
  ok("redundant ALLOW harmless after role change", a.permissions.includes("splits.edit_shares"));
}
// DENY removes an inherited role permission
await admin.from("workspace_member_permission_overrides").delete().in("id", [ovrEditShares, ovrApprove]);
const ovrDenyApprove = await setOverride(wsMain, mA, "splits.approve", "deny");
{
  const a = await resolveAppAuthorization(memberA, "splits");
  ok("DENY removes inherited Manager splits.approve", !a.permissions.includes("splits.approve"), JSON.stringify(a.permissions));
  ok("DENY leaves unrelated Manager permissions", ["splits.access", "splits.view", "splits.create", "splits.edit", "splits.edit_shares", "splits.export"].every((k) => a.permissions.includes(k)), JSON.stringify(a.permissions));
  ok("DENY keeps role and access level", a.roleKey === "manager" && a.accessLevel === "manage" && a.authorized);
}
// DENY the entry gate
await admin.from("workspace_member_permission_overrides").delete().eq("id", ovrDenyApprove);
const ovrDenyAccess = await setOverride(wsMain, mA, "splits.access", "deny");
{
  const a = await resolveAppAuthorization(memberA, "splits");
  ok("DENY <app>.access → normal unauthorized entry-gate denial",
    !a.authorized && a.reason === "no_access" && a.permissions.length === 0, JSON.stringify(a));
  const cat = await resolveAppAuthorization(memberA, "catalog");
  ok("entry-gate deny does not affect other app", cat.authorized, JSON.stringify(cat.reason));
}
await admin.from("workspace_member_permission_overrides").delete().eq("id", ovrDenyAccess);
// restore staff role for later checks
await admin.from("workspace_memberships").update({ role_id: await roleId("staff") }).eq("id", mA);
await setAppAccess(mA, "splits", "edit");

// ---------------- Owner immunity ----------------
{
  const before = await resolveAppAuthorization(ownerUser, "splits");
  const beforeTeam = await hasWorkspacePermission(ownerUser, wsMain, "workspace.team.manage");
  await setOverride(wsMain, mOwner, "splits.edit", "deny");
  await setOverride(wsMain, mOwner, "workspace.team.manage", "deny");
  const after = await resolveAppAuthorization(ownerUser, "splits");
  const afterTeam = await hasWorkspacePermission(ownerUser, wsMain, "workspace.team.manage");
  ok("Owner immune to DENY splits.edit", same(after.permissions, before.permissions) && after.permissions.includes("splits.edit"), JSON.stringify(after.permissions));
  ok("Owner immune to DENY workspace.team.manage", beforeTeam === true && afterTeam === true);
  const wsAccess = await resolveWorkspaceAccess(ownerUser, wsMain);
  ok("Owner resolver permissions still contain denied keys", wsAccess.permissions.includes("splits.edit"));
  const { data: rows } = await admin.from("workspace_member_permission_overrides").select("id").eq("membership_id", mOwner);
  ok("Owner override rows still present (ignored, not deleted)", (rows ?? []).length === 2);
  await admin.from("workspace_member_permission_overrides").delete().eq("membership_id", mOwner);
}

// ---------------- super-admin immunity ----------------
{
  await admin.from("user_roles").insert({ user_id: memberB, role: "super_admin" });
  const before = await resolveAppAuthorization(memberB, "splits");
  await setOverride(wsMain, mB, "splits.view", "deny");
  const after = await resolveAppAuthorization(memberB, "splits");
  ok("super-admin unaffected by DENY", same(after.permissions, before.permissions) && after.permissions.includes("splits.view"), JSON.stringify(after.permissions));
  ok("super-admin remains platform attribute", after.isPlatformSuperAdmin && after.roleKey === "staff");
  await admin.from("workspace_member_permission_overrides").delete().eq("membership_id", mB);
  await admin.from("user_roles").delete().eq("user_id", memberB);
}

// ---------------- gates cannot be bypassed by ALLOW ----------------
const gateOvr = await setOverride(wsMain, mA, "splits.manage", "allow");
await setOverride(wsMain, mA, "splits.access", "allow");
{
  await admin.from("workspace_memberships").update({ status: "suspended" }).eq("id", mA);
  const s = await resolveAppAuthorization(memberA, "splits");
  ok("suspended member cannot use ALLOW", !s.authorized && s.permissions.length === 0 && s.reason === "membership_suspended", JSON.stringify(s.reason));
  await admin.from("workspace_memberships").update({ status: "removed" }).eq("id", mA);
  const r = await resolveAppAuthorization(memberA, "splits");
  ok("removed member cannot use ALLOW", !r.authorized && r.permissions.length === 0, JSON.stringify(r.reason));
  await admin.from("workspace_memberships").update({ status: "active" }).eq("id", mA);

  await admin.from("workspaces").update({ status: "suspended" }).eq("id", wsMain);
  const w = await resolveAppAuthorization(memberA, "splits");
  ok("inactive workspace cannot be bypassed", !w.authorized && w.permissions.length === 0 && w.reason === "workspace_inactive", JSON.stringify(w.reason));
  await admin.from("workspaces").update({ status: "active" }).eq("id", wsMain);

  await grantEntitlement(wsMain, ownerUser, ["catalog", "splits"], "expired", new Date(Date.now() - 86400000).toISOString());
  const e = await resolveAppAuthorization(memberA, "splits");
  ok("expired entitlement cannot be bypassed", !e.authorized && e.permissions.length === 0 && e.reason === "no_entitlement", JSON.stringify(e.reason));
  await grantEntitlement(wsMain, ownerUser, ["catalog"]);
  const p = await resolveAppAuthorization(memberA, "splits");
  ok("app not in plan cannot be bypassed", !p.authorized && p.permissions.length === 0 && p.reason === "app_not_in_plan", JSON.stringify(p.reason));
  await grantEntitlement(wsMain, ownerUser, ["catalog", "splits"]);
  await setAppAccess(mA, "splits", "no_access");
  const n = await resolveAppAuthorization(memberA, "splits");
  ok("No Access cannot be bypassed by ALLOW", !n.authorized && n.permissions.length === 0, JSON.stringify(n.reason));
  await setAppAccess(mA, "splits", "edit");
  await admin.from("workspace_member_permission_overrides").delete().eq("membership_id", mA);
  void gateOvr;
}

// ---------------- override removal restores baseline ----------------
{
  const id = await setOverride(wsMain, mA, "splits.edit_shares", "allow");
  const withOvr = await resolveAppAuthorization(memberA, "splits");
  ok("removal test: ALLOW present", withOvr.permissions.includes("splits.edit_shares"));
  await admin.from("workspace_member_permission_overrides").delete().eq("id", id);
  const without = await resolveAppAuthorization(memberA, "splits");
  ok("removal test: capability revoked", !without.permissions.includes("splits.edit_shares"));
  ok("removal test: baseline intact", same(without.permissions, STAFF_BASE), JSON.stringify(without.permissions));
}

// ---------------- workspace.* / Team authorization preserved ----------------
{
  const adminMembership = await mkMembership(wsMain, otherUser, "administrator");
  await setAppAccess(adminMembership, "catalog", "manage");
  ok("administrator holds workspace.team.manage", await hasWorkspacePermission(otherUser, wsMain, "workspace.team.manage"));
  ok("administrator holds workspace.permissions.manage", await hasWorkspacePermission(otherUser, wsMain, "workspace.permissions.manage"));
  ok("staff lacks workspace.team.manage", !(await hasWorkspacePermission(memberA, wsMain, "workspace.team.manage")));
  await setOverride(wsMain, adminMembership, "workspace.team.manage", "deny");
  ok("DENY workspace.team.manage removes it for administrator", !(await hasWorkspacePermission(otherUser, wsMain, "workspace.team.manage")));
  ok("other workspace admin permissions unaffected", await hasWorkspacePermission(otherUser, wsMain, "workspace.roles.assign"));
  await setOverride(wsMain, adminMembership, "workspace.permissions.manage", "deny");
  ok("DENY workspace.permissions.manage removes it", !(await hasWorkspacePermission(otherUser, wsMain, "workspace.permissions.manage")));
  const stillApp = await resolveAppAuthorization(otherUser, "catalog");
  ok("workspace.* deny does not disturb child-app authorization", stillApp.authorized, JSON.stringify(stillApp.reason));
  await admin.from("workspace_member_permission_overrides").delete().eq("membership_id", adminMembership);
  await admin.from("workspace_memberships").delete().eq("id", adminMembership);
}

// ---------------- freshness: no new cache ----------------
{
  const first = await resolveAppAuthorization(memberA, "splits");
  const id = await setOverride(wsMain, mA, "splits.edit_shares", "allow");
  const second = await resolveAppAuthorization(memberA, "splits");
  await admin.from("workspace_member_permission_overrides").delete().eq("id", id);
  const third = await resolveAppAuthorization(memberA, "splits");
  ok("each request re-reads the database (no cache)",
    !first.permissions.includes("splits.edit_shares") &&
    second.permissions.includes("splits.edit_shares") &&
    !third.permissions.includes("splits.edit_shares"));
  ok("evaluatedAt advances per request", first.evaluatedAt !== second.evaluatedAt);
}

// ---------------- production pilot regression ----------------
{
  const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  const staff = list.users.find((u) => u.email === "jabarimuzik@gmail.com");
  const owner = list.users.find((u) => u.email === "tpcampservices@gmail.com");
  if (staff) {
    const cat = await resolveAppAuthorization(staff.id, "catalog");
    ok("pilot Staff catalog regression", cat.authorized && cat.accessLevel === "edit" &&
      same(cat.permissions, ["catalog.access", "catalog.view", "catalog.create", "catalog.edit"]), JSON.stringify(cat.permissions));
    const sp = await resolveAppAuthorization(staff.id, "splits");
    ok("pilot Staff splits regression (no_access)", !sp.authorized && sp.permissions.length === 0, JSON.stringify(sp.reason));
  }
  if (owner) {
    const sp = await resolveAppAuthorization(owner.id, "splits");
    ok("pilot Owner splits regression", sp.authorized && sp.accessLevel === "manage" && sp.permissions.length === 9, JSON.stringify(sp.permissions));
    const cat = await resolveAppAuthorization(owner.id, "catalog");
    ok("pilot Owner catalog regression", cat.authorized && cat.permissions.length === 7, JSON.stringify(cat.permissions));
  }
}

// ---------------- cleanup ----------------
await admin.from("access_entitlements").delete().in("user_id", users);
for (const ws of [wsMain, wsOther]) {
  await admin.from("workspace_memberships").delete().eq("workspace_id", ws);
  await admin.from("workspaces").delete().eq("id", ws);
}
for (const u of users) await admin.auth.admin.deleteUser(u);
void mOther;

{
  const { data: overrides } = await admin.from("workspace_member_permission_overrides").select("id");
  ok("no override rows remain anywhere", (overrides ?? []).length === 0, JSON.stringify(overrides));
  const { data: ws } = await admin.from("workspaces").select("name").ilike("name", "ZZ2%");
  ok("no fixture workspaces remain", (ws ?? []).length === 0, JSON.stringify(ws));
  const { data: ents } = await admin.from("access_entitlements").select("user_id, workspace_id, plan_id, allowed_apps, access_status");
  ok("only the pilot entitlement remains", (ents ?? []).length === 1, JSON.stringify(ents));
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
