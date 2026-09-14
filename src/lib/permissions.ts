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
  splits: ["access", "view", "create", "edit", "edit_shares", "approve", "export", "manage"],
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

export function isPermissionKey(value: unknown): value is PermissionKey {
  return PERMISSION_KEYS.includes(String(value));
}

export function isAppAccessLevel(value: unknown): value is AppAccessLevel {
  return (APP_ACCESS_LEVELS as readonly string[]).includes(String(value));
}

export function isMembershipStatus(value: unknown): value is MembershipStatus {
  return (MEMBERSHIP_STATUSES as readonly string[]).includes(String(value));
}
