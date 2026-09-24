import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { SiteHeader, SiteFooter } from "@/components/site-header";
import {
  cancelWorkspaceInvitation,
  getMyTeam,
  inviteWorkspaceMember,
  resendWorkspaceInvitation,
  updateMemberAppAccess,
  updateMemberPermissionOverride,
  updateMemberRole,
  updateMemberStatus,
  removeMemberPermissionOverride,
} from "@/lib/invitations.functions";
import type { PermissionGroup, TeamMember } from "@/lib/members.server";
import { APPS } from "@/lib/apps";
import { APP_ACCESS_LABELS, APP_ACCESS_LEVELS } from "@/lib/permissions";

export const Route = createFileRoute("/_authenticated/team")({
  head: () => ({
    meta: [
      { title: "Team & access — TP-CAMP OneSuite" },
      {
        name: "description",
        content:
          "Manage your TP-CAMP OneSuite workspace team: roles, per-application access, seats and invitations.",
      },
      { property: "og:title", content: "Team & access — TP-CAMP OneSuite" },
      {
        property: "og:description",
        content: "Roles, per-application access and invitations for your OneSuite workspace.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: TeamPage,
});

const ROLES = [
  { key: "administrator", label: "Administrator" },
  { key: "manager", label: "Manager" },
  { key: "staff", label: "Staff" },
  { key: "viewer", label: "Viewer" },
  { key: "auditor", label: "Auditor" },
];

const appName = (key: string) => APPS.find((a) => a.key === key)?.name ?? key;

const field =
  "mt-1.5 w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm outline-none focus:border-accent";
const ghostButton =
  "rounded-lg border border-border px-3 py-2 text-xs transition-colors hover:border-accent/60 disabled:opacity-50";

function AccessBadge({ level }: { level: string }) {
  const tone =
    level === "manage"
      ? "border-accent/50 text-accent"
      : level === "no_access"
        ? "border-border text-muted-foreground"
        : "border-border";
  return (
    <span className={`rounded-full border px-2.5 py-1 text-xs ${tone}`}>
      {APP_ACCESS_LABELS[level as keyof typeof APP_ACCESS_LABELS] ?? level}
    </span>
  );
}

/** Three-state control plus the plain-language state of one permission. */
function PermissionRow({
  entry,
  editable,
  busy,
  onChange,
}: {
  entry: PermissionGroup["permissions"][number];
  editable: boolean;
  busy: boolean;
  onChange: (state: string) => void;
}) {
  const locked = !entry.deniable;
  const status = !entry.effective
    ? entry.state === "allow"
      ? entry.cappedOut
        ? `Allowed — needs ${APP_ACCESS_LABELS[entry.requiredLevel ?? "edit"]} access`
        : "Allowed — not currently active"
      : entry.state === "deny"
        ? "Denied for this member"
        : entry.inheritedByRole
          ? "From role — not currently active"
          : "Not granted by their role"
    : entry.state === "allow"
      ? entry.inheritedByRole
        ? "Allowed (their role already grants this)"
        : "Allowed for this member"
      : "Granted by their role";

  const tone = entry.effective
    ? "text-accent"
    : entry.state === "deny"
      ? "text-destructive"
      : "text-muted-foreground";

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-surface px-3 py-2">
      <div className="min-w-0">
        <p className="text-sm">{entry.label}</p>
        <p className={`text-xs ${tone}`}>{status}</p>
      </div>
      {editable && !locked ? (
        <select
          value={entry.state}
          disabled={busy}
          onChange={(event) => onChange(event.target.value)}
          className="rounded-lg border border-border bg-surface px-2 py-1.5 text-xs outline-none focus:border-accent"
        >
          <option value="inherited">Inherited</option>
          <option value="allow" disabled={!entry.allowable}>
            Allow
          </option>
          <option value="deny">Deny</option>
        </select>
      ) : (
        <span className="rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground">
          {locked ? "Protected" : entry.state === "inherited" ? "Inherited" : entry.state === "allow" ? "Allowed" : "Denied"}
        </span>
      )}
    </div>
  );
}

function AdvancedPermissions({
  member,
  editable,
  busy,
  onChange,
}: {
  member: TeamMember;
  editable: boolean;
  busy: boolean;
  onChange: (permissionKey: string, state: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="text-xs text-muted-foreground underline decoration-dotted hover:text-accent"
      >
        {open ? "Hide advanced permissions" : "Advanced permissions"}
      </button>
      {open && (
        <div className="mt-3 space-y-4">
          {!editable && (
            <p className="text-xs text-muted-foreground">
              Read-only — you cannot change this member's advanced permissions.
            </p>
          )}
          {member.permissionGroups.map((group) => (
            <div key={group.appKey}>
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-medium">{group.label}</p>
                {group.accessLevel && <AccessBadge level={group.accessLevel} />}
                {!group.entitled && (
                  <span className="rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground">
                    Not in your plan
                  </span>
                )}
              </div>
              {group.accessLevel === "no_access" && (
                <p className="mt-1 text-xs text-destructive">
                  This member has no access to this application — nothing below is active.
                </p>
              )}
              {!group.entitled && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Your plan does not include this application, so nothing here can be allowed.
                </p>
              )}
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {group.permissions.map((entry) => (
                  <PermissionRow
                    key={entry.key}
                    entry={entry}
                    editable={editable}
                    busy={busy}
                    onChange={(state) => onChange(entry.key, state)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TeamPage() {
  const loadTeam = useServerFn(getMyTeam);
  const invite = useServerFn(inviteWorkspaceMember);
  const resend = useServerFn(resendWorkspaceInvitation);
  const cancel = useServerFn(cancelWorkspaceInvitation);
  const setRole = useServerFn(updateMemberRole);
  const setAppAccess = useServerFn(updateMemberAppAccess);
  const setStatus = useServerFn(updateMemberStatus);
  const setOverride = useServerFn(updateMemberPermissionOverride);
  const clearOverride = useServerFn(removeMemberPermissionOverride);
  const queryClient = useQueryClient();

  const [lastLink, setLastLink] = useState<string | null>(null);
  const [roleKey, setRoleKey] = useState("staff");
  const [appAccessDraft, setAppAccessDraft] = useState<Record<string, string>>({});

  const { data, isLoading } = useQuery({ queryKey: ["team"], queryFn: () => loadTeam() });
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ["team"] });

  const entitled = useMemo(() => data?.entitledApps ?? [], [data]);
  const presets = data?.rolePresets ?? {};

  // The invite form starts from the selected role's existing preset; the inviter
  // can then customise each application before sending.
  useEffect(() => {
    const preset = presets[roleKey] ?? "view";
    setAppAccessDraft(Object.fromEntries(entitled.map((app) => [app, preset])));
  }, [roleKey, entitled, data?.workspace?.id]);

  const inviteMutation = useMutation({
    mutationFn: (input: { email: string; roleKey: string; displayName: string }) =>
      invite({
        data: { ...input, appAccess: appAccessDraft },
      }),
    onSuccess: (result) => {
      setLastLink(result.link);
      if (result.emailError) toast.error(result.emailError);
      else
        toast.success(
          result.emailSent
            ? "Invitation sent by email."
            : "Invitation created. Share the link below with your team member.",
        );
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const resendMutation = useMutation({
    mutationFn: (invitationId: string) => resend({ data: { invitationId } }),
    onSuccess: (result) => {
      setLastLink(result.link);
      toast.success("A new invitation link was created. The previous one no longer works.");
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const cancelMutation = useMutation({
    mutationFn: (invitationId: string) => cancel({ data: { invitationId } }),
    onSuccess: () => {
      toast.success("Invitation cancelled and the seat released.");
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const roleMutation = useMutation({
    mutationFn: (input: { membershipId: string; roleKey: string }) => setRole({ data: input }),
    onSuccess: () => {
      toast.success("Role updated.");
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const accessMutation = useMutation({
    mutationFn: (input: { membershipId: string; appKey: string; level: string }) =>
      setAppAccess({ data: input }),
    onSuccess: () => {
      toast.success("Application access updated.");
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const statusMutation = useMutation({
    mutationFn: (input: { membershipId: string; status: string }) => setStatus({ data: input }),
    onSuccess: () => {
      toast.success("Membership updated.");
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const overrideMutation = useMutation({
    mutationFn: (input: { membershipId: string; permissionKey: string; state: string }) =>
      input.state === "inherited"
        ? clearOverride({
            data: { membershipId: input.membershipId, permissionKey: input.permissionKey },
          })
        : setOverride({
            data: {
              membershipId: input.membershipId,
              permissionKey: input.permissionKey,
              effect: input.state,
            },
          }),
    onSuccess: () => {
      toast.success("Permission updated.");
      // Always re-read the server's own answer; never assume the change applied.
      refresh();
    },
    onError: (error: Error) => {
      toast.error(error.message);
      refresh();
    },
  });

  const access = data?.access ?? null;
  const seats = data?.seats ?? null;
  const members = data?.members ?? [];
  const invitations = data?.invitations ?? [];

  const mayInvite = Boolean(
    access?.isOwner || access?.permissions.includes("workspace.team.invite"),
  );
  const mayManage = Boolean(
    access?.isOwner || access?.permissions.includes("workspace.team.manage"),
  );
  const mayAssignRoles = Boolean(
    access?.isOwner || access?.permissions.includes("workspace.roles.assign"),
  );
  // Effective permission resolved server-side — never a role name.
  const mayManagePermissions = Boolean(
    access?.isOwner || access?.permissions.includes("workspace.permissions.manage"),
  );

  const pending = invitations.filter((i) => i.status === "pending");
  const past = invitations.filter((i) => i.status !== "pending");

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-5 pt-14 pb-20">
        <p className="eyebrow">Workspace</p>
        <h1 className="mt-4 text-3xl font-semibold">{data?.workspace?.name ?? "Your team"}</h1>
        <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
          A member can only reach an application when your plan includes it, their role allows it and
          you have given them access to it.
        </p>

        {isLoading && <p className="mt-6 text-sm text-muted-foreground">Loading your team…</p>}

        {seats && (
          <div className="panel mt-8 grid grid-cols-2 gap-4 p-6 text-sm sm:grid-cols-4">
            <div>
              <p className="text-muted-foreground">Seats on plan</p>
              <p className="mt-1 text-2xl font-semibold">{seats.totalSeats}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Members</p>
              <p className="mt-1 text-2xl font-semibold">{seats.usedSeats}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Pending invitations</p>
              <p className="mt-1 text-2xl font-semibold">{seats.pendingInvitations}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Available</p>
              <p className="mt-1 text-2xl font-semibold">{seats.availableSeats}</p>
            </div>
          </div>
        )}

        {/* ------------------------------------------------------- members */}
        <section className="panel mt-8 p-6">
          <h2 className="text-lg font-semibold">Team members</h2>
          {members.length === 0 && !isLoading && (
            <p className="mt-3 text-sm text-muted-foreground">No team members yet.</p>
          )}
          <ul className="mt-4 space-y-5">
            {members.map((m) => (
              <li key={m.membershipId} className="border-b border-border pb-5 last:border-0 last:pb-0">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{m.fullName ?? m.email ?? "Team member"}</p>
                    <p className="text-sm text-muted-foreground">{m.email}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {m.roleName || m.roleKey} ·{" "}
                      <span className={m.status === "active" ? "text-accent" : "text-destructive"}>
                        {m.status}
                      </span>
                      {m.joinedAt && ` · joined ${new Date(m.joinedAt).toLocaleDateString()}`}
                    </p>
                  </div>

                  {mayManage && !m.isOwner && (
                    <div className="flex flex-wrap gap-2">
                      {mayAssignRoles && (
                        <select
                          value={m.roleKey}
                          onChange={(e) =>
                            roleMutation.mutate({
                              membershipId: m.membershipId,
                              roleKey: e.target.value,
                            })
                          }
                          className="rounded-lg border border-border bg-surface px-3 py-2 text-xs outline-none focus:border-accent"
                        >
                          {ROLES.map((r) => (
                            <option key={r.key} value={r.key}>
                              {r.label}
                            </option>
                          ))}
                        </select>
                      )}
                      {m.status === "active" ? (
                        <button
                          type="button"
                          className={ghostButton}
                          disabled={statusMutation.isPending}
                          onClick={() =>
                            statusMutation.mutate({
                              membershipId: m.membershipId,
                              status: "suspended",
                            })
                          }
                        >
                          Suspend
                        </button>
                      ) : (
                        <button
                          type="button"
                          className={ghostButton}
                          disabled={statusMutation.isPending}
                          onClick={() =>
                            statusMutation.mutate({
                              membershipId: m.membershipId,
                              status: "active",
                            })
                          }
                        >
                          Reactivate
                        </button>
                      )}
                      <button
                        type="button"
                        className={ghostButton}
                        disabled={statusMutation.isPending}
                        onClick={() => {
                          if (
                            window.confirm(
                              `Remove ${m.email ?? "this member"} from the workspace? Their history is kept.`,
                            )
                          ) {
                            statusMutation.mutate({
                              membershipId: m.membershipId,
                              status: "removed",
                            });
                          }
                        }}
                      >
                        Remove
                      </button>
                    </div>
                  )}
                </div>

                <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {entitled.map((app) => (
                    <div
                      key={app}
                      className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface px-3 py-2.5"
                    >
                      <span className="text-sm">{appName(app)}</span>
                      {mayManage && !m.isOwner ? (
                        <select
                          value={m.appAccess[app] ?? "no_access"}
                          disabled={accessMutation.isPending}
                          onChange={(e) =>
                            accessMutation.mutate({
                              membershipId: m.membershipId,
                              appKey: app,
                              level: e.target.value,
                            })
                          }
                          className="rounded-lg border border-border bg-surface px-2 py-1.5 text-xs outline-none focus:border-accent"
                        >
                          {APP_ACCESS_LEVELS.map((level) => (
                            <option key={level} value={level}>
                              {APP_ACCESS_LABELS[level]}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <AccessBadge level={m.appAccess[app] ?? "no_access"} />
                      )}
                    </div>
                  ))}
                </div>

                {m.isOwner ? (
                  <p className="mt-3 text-xs text-muted-foreground">
                    Owner — full workspace permissions. These cannot be overridden.
                  </p>
                ) : (
                  <AdvancedPermissions
                    member={m}
                    editable={
                      mayManagePermissions && m.userId !== access?.membership?.userId && m.status === "active"
                    }
                    busy={overrideMutation.isPending}
                    onChange={(permissionKey, state) =>
                      overrideMutation.mutate({ membershipId: m.membershipId, permissionKey, state })
                    }
                  />
                )}
              </li>
            ))}
          </ul>
        </section>

        {/* ---------------------------------------------------- invite form */}
        {mayInvite && (
          <form
            className="panel mt-8 space-y-4 p-6"
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              inviteMutation.mutate({
                email: String(form.get("email") ?? ""),
                roleKey,
                displayName: String(form.get("displayName") ?? ""),
              });
            }}
          >
            <h2 className="text-lg font-semibold">Invite a team member</h2>
            <div className="grid gap-4 sm:grid-cols-3">
              <label className="block text-sm sm:col-span-2">
                <span className="text-muted-foreground">Email address</span>
                <input name="email" type="email" required className={field} />
              </label>
              <label className="block text-sm">
                <span className="text-muted-foreground">Role</span>
                <select
                  value={roleKey}
                  onChange={(e) => setRoleKey(e.target.value)}
                  className={field}
                >
                  {ROLES.map((r) => (
                    <option key={r.key} value={r.key}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="block text-sm">
              <span className="text-muted-foreground">Name (optional)</span>
              <input name="displayName" maxLength={120} className={field} />
            </label>

            <div>
              <p className="text-sm text-muted-foreground">
                Application access — starts from the role, change any application you like. Only the
                applications your plan includes appear here.
              </p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {entitled.map((app) => (
                  <div
                    key={app}
                    className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface px-3 py-2.5"
                  >
                    <span className="text-sm">{appName(app)}</span>
                    <select
                      value={appAccessDraft[app] ?? "view"}
                      onChange={(e) =>
                        setAppAccessDraft((prev) => ({ ...prev, [app]: e.target.value }))
                      }
                      className="rounded-lg border border-border bg-surface px-2 py-1.5 text-xs outline-none focus:border-accent"
                    >
                      {APP_ACCESS_LEVELS.map((level) => (
                        <option key={level} value={level}>
                          {APP_ACCESS_LABELS[level]}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>

            <button
              type="submit"
              disabled={inviteMutation.isPending}
              className="rounded-lg bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-60"
            >
              {inviteMutation.isPending ? "Sending…" : "Send invitation"}
            </button>
            {lastLink && (
              <p className="break-all rounded-lg border border-border bg-surface p-3 text-xs text-muted-foreground">
                Invitation link: {lastLink}
              </p>
            )}
          </form>
        )}

        {!mayInvite && !isLoading && (
          <p className="mt-8 text-sm text-muted-foreground">
            Only the workspace owner and administrators can invite team members.
          </p>
        )}

        {/* ----------------------------------------------------- invitations */}
        {pending.length > 0 && (
          <section className="panel mt-8 p-6">
            <h2 className="text-lg font-semibold">Pending invitations</h2>
            <ul className="mt-4 space-y-5">
              {pending.map((inv) => (
                <li key={inv.id} className="border-b border-border pb-5 last:border-0 last:pb-0">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-medium">{inv.email}</p>
                      <p className="text-xs text-muted-foreground">
                        {inv.roleName || inv.roleKey}
                        {inv.invitedByName && ` · invited by ${inv.invitedByName}`} · sent{" "}
                        {new Date(inv.createdAt).toLocaleDateString()} · expires{" "}
                        {new Date(inv.expiresAt).toLocaleDateString()}
                      </p>
                    </div>
                    {mayInvite && (
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => resendMutation.mutate(inv.id)}
                          className={ghostButton}
                        >
                          Resend
                        </button>
                        <button
                          type="button"
                          onClick={() => cancelMutation.mutate(inv.id)}
                          className={ghostButton}
                        >
                          Cancel
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {Object.entries(inv.appAccess).map(([app, level]) => (
                      <span
                        key={app}
                        className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 text-xs"
                      >
                        {appName(app)}
                        <span className="text-muted-foreground">
                          {APP_ACCESS_LABELS[level as keyof typeof APP_ACCESS_LABELS] ?? level}
                        </span>
                      </span>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {past.length > 0 && (
          <section className="panel mt-8 p-6">
            <h2 className="text-lg font-semibold">Invitation history</h2>
            <ul className="mt-4 space-y-3 text-sm">
              {past.map((inv) => (
                <li
                  key={inv.id}
                  className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3 last:border-0 last:pb-0"
                >
                  <span>{inv.email}</span>
                  <span className="text-xs text-muted-foreground">
                    {inv.roleName || inv.roleKey} · {inv.status}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
