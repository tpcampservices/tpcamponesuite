/**
 * Workspace authorization vocabulary — pure and browser-safe.
 *
 * Workspace roles here are DISTINCT from the platform staff roles in
 * `public.user_roles` / `app_role` (super_admin, admin, member), which continue
 * to govern TP-CAMP staff only.
 *
 * The permission keys below mirror `public.workspace_permissions` exactly.
 * Nothing in this phase is exposed to end users.
 */

import { APP_KEYS, type AppSlug } from "./apps";

export const SYSTEM_ROLE_KEYS = [
  "owner",
  "administrator",
  "manager",
  "staff",
  "viewer",
  "auditor",
] as const;
export type SystemRoleKey = (typeof SYSTEM_ROLE_KEYS)[number];

export const ROLE_LABELS: Record<SystemRoleKey, string> = {
  owner: "Owner",
  administrator: "Administrator",
  manager: "Manager",
  staff: "Staff",
  viewer: "Viewer",
  auditor: "Auditor",
};

/** The Owner role can never be deleted or reassigned away from the workspace. */
export const PROTECTED_ROLE_KEYS: SystemRoleKey[] = ["owner"];

export const MEMBERSHIP_STATUSES = ["active", "suspended", "removed"] as const;
export type MembershipStatus = (typeof MEMBERSHIP_STATUSES)[number];

/** Only active memberships consume a seat. */
export const SEAT_CONSUMING_STATUSES: MembershipStatus[] = ["active"];

export const APP_ACCESS_LEVELS = ["no_access", "view", "edit", "manage"] as const;
export type AppAccessLevel = (typeof APP_ACCESS_LEVELS)[number];

export const APP_ACCESS_LABELS: Record<AppAccessLevel, string> = {
  no_access: "No access",
  view: "View",
  edit: "Edit",
  manage: "Manage",
};

const APP_ACTIONS: Record<AppSlug, string[]> = {
  catalog: ["access", "view", "create", "edit", "delete", "export", "manage"],
  splits: [
    "access",
    "view",
    "create",
    "edit",
    "edit_shares",
    "approve",
    "export",
    "delete",
    "manage",
  ],
  operations: [
    "access",
    "view",
    "create",
    "edit",
    "delete",
    "assign",
    "approve",
    "export",
    "manage",
  ],
  finance: [
    "access",
    "view",
    "create",
    "edit",
    "post",
    "approve",
    "delete",
    "export",
    "manage",
  ],
  invoice: [
    "access",
    "view",
    "create",
    "edit",
    "send",
    "void",
    "delete",
    "export",
    "manage",
  ],
};

export type PermissionKey = string;

/**
 * Workspace administration permissions. Deliberately NOT app-specific: team and
 * role administration is a workspace concern, never a Catalog/Finance concern.
 */
export const WORKSPACE_ADMIN_ACTIONS = [
  "team.view",
  "team.invite",
  "team.manage",
  "roles.assign",
] as const;

/** The full catalogue, in the same order as the database seed. */
export const PERMISSIONS: { key: PermissionKey; app: string; action: string }[] = [
  ...(APP_KEYS as AppSlug[]).flatMap((app) =>
    (APP_ACTIONS[app] ?? []).map((action) => ({ key: `${app}.${action}`, app: app as string, action })),
  ),
  ...WORKSPACE_ADMIN_ACTIONS.map((action) => ({
    key: `workspace.${action}`,
    app: "workspace",
    action,
  })),
];

export const PERMISSION_KEYS = PERMISSIONS.map((p) => p.key);

/** Default action sets per system role — mirrors the database mapping seed. */
export const ROLE_ACTION_DEFAULTS: Record<SystemRoleKey, "all" | string[]> = {
  owner: "all",
  administrator: "all",
  manager: [
    "access",
    "view",
    "create",
    "edit",
    "edit_shares",
    "export",
    "assign",
    "approve",
    "post",
    "send",
    "manage",
  ],
  staff: ["access", "view", "create", "edit"],
  viewer: ["access", "view"],
  auditor: ["access", "view", "export"],
};

export function permissionsForRole(roleKey: string): PermissionKey[] {
  const defaults = ROLE_ACTION_DEFAULTS[roleKey as SystemRoleKey];
  if (!defaults) return [];
  if (defaults === "all") return [...PERMISSION_KEYS];
  return PERMISSIONS.filter((p) => defaults.includes(p.action)).map((p) => p.key);
}

/** Every permission key belonging to one application. */
export function appPermissionKeys(app: AppSlug): PermissionKey[] {
  return (APP_ACTIONS[app] ?? []).map((action) => `${app}.${action}`);
}

/**
 * The minimum member access level each action requires.
 *
 * `view` covers reads and (role-permitting) export. `edit` covers ordinary
 * create/edit workflow. Destructive and administrative actions require `manage`.
 * This is a CAP, never a grant: a role that does not hold a permission never
 * gains it by having a higher access level.
 */
const VIEW_ACTIONS = ["access", "view", "export"];
const MANAGE_ACTIONS = ["delete", "manage", "void", "approve"];

export function actionMinimumLevel(action: string): AppAccessLevel {
  if (VIEW_ACTIONS.includes(action)) return "view";
  if (MANAGE_ACTIONS.includes(action)) return "manage";
  return "edit";
}

const LEVEL_RANK: Record<AppAccessLevel, number> = {
  no_access: 0,
  view: 1,
  edit: 2,
  manage: 3,
};

export function levelAtLeast(level: AppAccessLevel, required: AppAccessLevel) {
  return LEVEL_RANK[level] >= LEVEL_RANK[required];
}

/**
 * Effective app permissions = role permissions ∩ what the member's access level
 * allows. Both inputs are resolved server-side; nothing is taken from a request.
 */
export function filterPermissionsByLevel(
  app: AppSlug,
  level: AppAccessLevel,
  rolePermissions: PermissionKey[],
): PermissionKey[] {
  if (level === "no_access") return [];
  const prefix = `${app}.`;
  return rolePermissions
    .filter((key) => key.startsWith(prefix))
    .filter((key) => levelAtLeast(level, actionMinimumLevel(key.slice(prefix.length))))
    .sort();
}

export function isPermissionKey(value: unknown): value is PermissionKey {
  return PERMISSION_KEYS.includes(String(value));
}

export function isAppAccessLevel(value: unknown): value is AppAccessLevel {
  return (APP_ACCESS_LEVELS as readonly string[]).includes(String(value));
}

export function isMembershipStatus(value: unknown): value is MembershipStatus {
  return (MEMBERSHIP_STATUSES as readonly string[]).includes(String(value));
}
