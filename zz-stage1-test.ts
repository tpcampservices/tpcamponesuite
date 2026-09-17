import { createClient } from "@supabase/supabase-js";
import { resolveAppAuthorization } from "./src/lib/workspace.server";
import { PERMISSION_KEYS } from "./src/lib/permissions";

const url = process.env.VITE_SUPABASE_URL!;
const srk = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const pub = process.env.VITE_SUPABASE_PUBLISHABLE_KEY!;
const admin = createClient(url, srk, { auth: { persistSession: false } });

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra = "") => {
  if (cond) { pass++; console.log(`PASS ${name}`); }
  else { fail++; console.log(`FAIL ${name} ${extra}`); }
};

const cleanup: (() => Promise<unknown>)[] = [];

// ---------- catalogue alignment ----------
{
  const { data } = await admin.from("workspace_permissions").select("permission_key");
  const dbKeys = (data ?? []).map((r: any) => r.permission_key).sort();
  const codeKeys = [...PERMISSION_KEYS].sort();
  ok("db/code catalogue aligned", JSON.stringify(dbKeys) === JSON.stringify(codeKeys),
    `\n db-only: ${dbKeys.filter(k => !codeKeys.includes(k))}\n code-only: ${codeKeys.filter(k => !dbKeys.includes(k))}`);
  ok("workspace.permissions.manage exists once",
    dbKeys.filter((k) => k === "workspace.permissions.manage").length === 1);
  ok("code catalogue has workspace.permissions.manage", codeKeys.includes("workspace.permissions.manage"));
}
{
  const { data: perm } = await admin.from("workspace_permissions").select("id")
    .eq("permission_key", "workspace.permissions.manage").single();
  const { data: maps } = await admin.from("workspace_role_permissions")
    .select("workspace_roles(role_key)").eq("permission_id", perm!.id);
  const roles = (maps ?? []).map((m: any) => m.workspace_roles.role_key).sort();
  ok("owner mapped", roles.includes("owner"));
  ok("administrator mapped", roles.includes("administrator"));
  for (const r of ["manager", "staff", "viewer", "auditor"]) ok(`${r} not mapped`, !roles.includes(r));
}

// ---------- browser-client RLS ----------
const pw = `Zz!${crypto.randomUUID()}`;
const mkUser = async (email: string) => {
  const { data, error } = await admin.auth.admin.createUser({ email, password: pw, email_confirm: true });
  if (error) throw error;
  cleanup.push(() => admin.auth.admin.deleteUser(data.user.id));
  return data.user.id;
};
const memberEmail = `zz-m-${Date.now()}@example.com`;
const outsiderEmail = `zz-o-${Date.now()}@example.com`;
const memberId = await mkUser(memberEmail);
const outsiderId = await mkUser(outsiderEmail);

const { data: staffRole } = await admin.from("workspace_roles").select("id")
  .is("workspace_id", null).eq("role_key", "staff").single();
const { data: ws } = await admin.from("workspaces")
  .insert({ name: "ZZ Stage1 WS", owner_user_id: memberId, status: "active" }).select("id").single();
cleanup.push(() => admin.from("workspaces").delete().eq("id", ws!.id));
const { data: membership } = await admin.from("workspace_memberships")
  .insert({ workspace_id: ws!.id, user_id: memberId, role_id: staffRole!.id, status: "active", joined_at: new Date().toISOString() })
  .select("id").single();
const { data: permRow } = await admin.from("workspace_permissions").select("id")
  .eq("permission_key", "splits.edit_shares").single();
const { data: ovr, error: ovrErr } = await admin.from("workspace_member_permission_overrides")
  .insert({ workspace_id: ws!.id, membership_id: membership!.id, permission_id: permRow!.id, effect: "allow" })
  .select("id").single();
ok("service-role insert allowed", !ovrErr && !!ovr, String(ovrErr?.message));

const signIn = async (email: string) => {
  const c = createClient(url, pub, { auth: { persistSession: false } });
  const { error } = await c.auth.signInWithPassword({ email, password: pw });
  if (error) throw error;
  return c;
};
const memberClient = await signIn(memberEmail);
const outsiderClient = await signIn(outsiderEmail);

{
  const { data } = await memberClient.from("workspace_member_permission_overrides").select("id");
  ok("member SELECT sees own workspace rows", (data ?? []).some((r: any) => r.id === ovr!.id));
}
{
  const { data } = await outsiderClient.from("workspace_member_permission_overrides").select("id");
  ok("cross-workspace SELECT blocked", !(data ?? []).some((r: any) => r.id === ovr!.id));
}
{
  const { error } = await memberClient.from("workspace_member_permission_overrides")
    .insert({ workspace_id: ws!.id, membership_id: membership!.id, permission_id: permRow!.id, effect: "deny" });
  ok("browser INSERT blocked", !!error, "");
}
{
  const { data, error } = await memberClient.from("workspace_member_permission_overrides")
    .update({ effect: "deny" }).eq("id", ovr!.id).select("id");
  ok("browser UPDATE blocked", !!error || (data ?? []).length === 0);
  const { data: after } = await admin.from("workspace_member_permission_overrides").select("effect").eq("id", ovr!.id).single();
  ok("row unchanged after browser UPDATE", after?.effect === "allow");
}
{
  const { data, error } = await memberClient.from("workspace_member_permission_overrides")
    .delete().eq("id", ovr!.id).select("id");
  ok("browser DELETE blocked", !!error || (data ?? []).length === 0);
  const { data: still } = await admin.from("workspace_member_permission_overrides").select("id").eq("id", ovr!.id).maybeSingle();
  ok("row still present after browser DELETE", !!still);
}

// ---------- Authorization v2 must ignore overrides ----------
const STAFF_EMAIL = "jabarimuzik@gmail.com";
const { data: users } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
const staff = users.users.find((u) => u.email === STAFF_EMAIL);
const owner = users.users.find((u) => u.email === "tpcampservices@gmail.com");

let staffOverrideId: string | null = null;
if (staff) {
  const { data: catPerm } = await admin.from("workspace_permissions").select("id")
    .eq("permission_key", "catalog.export").single();
  const beforeCat = await resolveAppAuthorization(staff.id, "catalog");
  const beforeSplits = await resolveAppAuthorization(staff.id, "splits");
  console.log(`  staff live state: catalog=${beforeCat.accessLevel} splits=${beforeSplits.accessLevel}`);
  ok("staff catalog permissions capped by role+level",
    !beforeCat.permissions.includes("catalog.export") && !beforeCat.permissions.includes("catalog.manage"),
    JSON.stringify(beforeCat.permissions));

  const { data: sm } = await admin.from("workspace_memberships").select("id, workspace_id")
    .eq("user_id", staff.id).eq("status", "active").limit(1).single();
  const { data: ins } = await admin.from("workspace_member_permission_overrides")
    .insert({ workspace_id: sm!.workspace_id, membership_id: sm!.id, permission_id: catPerm!.id, effect: "allow" })
    .select("id").single();
  staffOverrideId = ins!.id;

  const afterCat = await resolveAppAuthorization(staff.id, "catalog");
  ok("ALLOW catalog.export override ignored by Authorization v2",
    JSON.stringify([...afterCat.permissions].sort()) === JSON.stringify([...beforeCat.permissions].sort()),
    JSON.stringify(afterCat.permissions));
  ok("override does not change access level / authorized",
    afterCat.accessLevel === beforeCat.accessLevel && afterCat.authorized === beforeCat.authorized);

  // DENY override on a permission the member holds must also be ignored in Stage 1
  const { data: catView } = await admin.from("workspace_permissions").select("id")
    .eq("permission_key", "catalog.view").single();
  const { data: ins2 } = await admin.from("workspace_member_permission_overrides")
    .insert({ workspace_id: sm!.workspace_id, membership_id: sm!.id, permission_id: catView!.id, effect: "deny" })
    .select("id").single();
  const afterDeny = await resolveAppAuthorization(staff.id, "catalog");
  ok("DENY override ignored by Authorization v2",
    JSON.stringify([...afterDeny.permissions].sort()) === JSON.stringify([...beforeCat.permissions].sort()),
    JSON.stringify(afterDeny.permissions));
  await admin.from("workspace_member_permission_overrides").delete().in("id", [staffOverrideId, ins2!.id]);

  const restored = await resolveAppAuthorization(staff.id, "catalog");
  ok("staff unchanged after override removal",
    JSON.stringify([...restored.permissions].sort()) === JSON.stringify([...beforeCat.permissions].sort()));

  const noAccessApp = beforeSplits.accessLevel === "no_access" ? beforeSplits : await resolveAppAuthorization(staff.id, "operations");
  ok("no_access unchanged (no permissions, unauthorized)",
    !noAccessApp.authorized && noAccessApp.permissions.length === 0, JSON.stringify(noAccessApp));
  const fin = await resolveAppAuthorization(staff.id, "finance");
  ok("entitlement gating unchanged (finance not in plan)", !fin.authorized, String(fin.reason));

  // suspended membership behaviour, restored immediately
  await admin.from("workspace_memberships").update({ status: "suspended" }).eq("id", sm!.id);
  const susp = await resolveAppAuthorization(staff.id, "catalog");
  await admin.from("workspace_memberships").update({ status: "active" }).eq("id", sm!.id);
  ok("suspended membership fails closed", !susp.authorized && susp.permissions.length === 0, JSON.stringify(susp.reason));
  const back = await resolveAppAuthorization(staff.id, "catalog");
  ok("membership restored to active", back.authorized === beforeCat.authorized && back.accessLevel === beforeCat.accessLevel);
} else {
  console.log("SKIP staff tests: account not found");
}

if (owner) {
  const o = await resolveAppAuthorization(owner.id, "splits");
  ok("owner splits authorized manage", o.authorized && o.accessLevel === "manage", JSON.stringify(o.reason));
  ok("owner splits full permission set", o.permissions.length === 9, JSON.stringify(o.permissions));
  const oc = await resolveAppAuthorization(owner.id, "catalog");
  ok("owner catalog regression", oc.authorized && oc.accessLevel === "manage", JSON.stringify(oc.reason));
  ok("owner catalog permissions intact", oc.permissions.length === 7, JSON.stringify(oc.permissions));
  ok("super-admin still a platform attribute", oc.isPlatformSuperAdmin === true && oc.roleKey === "owner");
}

for (const fn of cleanup.reverse()) await fn();
const { data: leftovers } = await admin.from("workspace_member_permission_overrides").select("id");
ok("no override rows remain", (leftovers ?? []).length === 0, JSON.stringify(leftovers));
const { data: wsLeft } = await admin.from("workspaces").select("name").ilike("name", "ZZ%");
ok("no test workspaces remain", (wsLeft ?? []).length === 0, JSON.stringify(wsLeft));

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
