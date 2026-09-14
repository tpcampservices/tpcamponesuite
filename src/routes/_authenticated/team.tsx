import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { SiteHeader, SiteFooter } from "@/components/site-header";
import {
  cancelWorkspaceInvitation,
  getMyTeam,
  inviteWorkspaceMember,
  resendWorkspaceInvitation,
} from "@/lib/invitations.functions";

export const Route = createFileRoute("/_authenticated/team")({
  head: () => ({
    meta: [
      { title: "Team seats and invitations — TP-CAMP OneSuite" },
      {
        name: "description",
        content:
          "Invite your team to your TP-CAMP OneSuite workspace, track seat usage and manage pending invitations.",
      },
      { property: "og:title", content: "Team seats and invitations — TP-CAMP OneSuite" },
      {
        property: "og:description",
        content: "Invite team members and manage the seats included in your OneSuite plan.",
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

function TeamPage() {
  const loadTeam = useServerFn(getMyTeam);
  const invite = useServerFn(inviteWorkspaceMember);
  const resend = useServerFn(resendWorkspaceInvitation);
  const cancel = useServerFn(cancelWorkspaceInvitation);
  const queryClient = useQueryClient();
  const [lastLink, setLastLink] = useState<string | null>(null);

  const { data, isLoading } = useQuery({ queryKey: ["team"], queryFn: () => loadTeam() });

  const refresh = () => void queryClient.invalidateQueries({ queryKey: ["team"] });

  const inviteMutation = useMutation({
    mutationFn: (input: { email: string; roleKey: string; displayName: string }) =>
      invite({ data: { ...input, origin: window.location.origin } }),
    onSuccess: (result) => {
      setLastLink(result.link);
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
    mutationFn: (invitationId: string) =>
      resend({ data: { invitationId, origin: window.location.origin } }),
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

  const seats = data?.seats ?? null;
  const mayInvite =
    data?.access?.isOwner || data?.access?.permissions.includes("workspace.team.invite");

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-5 pt-14 pb-20">
        <p className="eyebrow">Workspace</p>
        <h1 className="mt-4 text-3xl font-semibold">
          {data?.workspace?.name ?? "Your team"}
        </h1>

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

        {mayInvite && (
          <form
            className="panel mt-8 space-y-4 p-6"
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              inviteMutation.mutate({
                email: String(form.get("email") ?? ""),
                roleKey: String(form.get("roleKey") ?? "staff"),
                displayName: String(form.get("displayName") ?? ""),
              });
            }}
          >
            <h2 className="text-lg font-semibold">Invite a team member</h2>
            <div className="grid gap-4 sm:grid-cols-3">
              <label className="block text-sm sm:col-span-2">
                <span className="text-muted-foreground">Email address</span>
                <input
                  name="email"
                  type="email"
                  required
                  className="mt-1.5 w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm outline-none focus:border-accent"
                />
              </label>
              <label className="block text-sm">
                <span className="text-muted-foreground">Role</span>
                <select
                  name="roleKey"
                  defaultValue="staff"
                  className="mt-1.5 w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm outline-none focus:border-accent"
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
              <input
                name="displayName"
                maxLength={120}
                className="mt-1.5 w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm outline-none focus:border-accent"
              />
            </label>
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

        {Boolean(data?.invitations?.length) && (
          <div className="panel mt-8 p-6">
            <h2 className="text-lg font-semibold">Invitations</h2>
            <ul className="mt-4 space-y-3 text-sm">
              {data!.invitations.map((inv) => (
                <li
                  key={inv.id}
                  className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3 last:border-0 last:pb-0"
                >
                  <div>
                    <p className="font-medium">{inv.email}</p>
                    <p className="text-muted-foreground">
                      {inv.roleName} · {inv.status}
                      {inv.status === "pending" &&
                        ` · expires ${new Date(inv.expiresAt).toLocaleDateString()}`}
                    </p>
                  </div>
                  {mayInvite && inv.status === "pending" && (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => resendMutation.mutate(inv.id)}
                        className="rounded-lg border border-border px-3 py-2 text-xs"
                      >
                        Resend
                      </button>
                      <button
                        type="button"
                        onClick={() => cancelMutation.mutate(inv.id)}
                        className="rounded-lg border border-border px-3 py-2 text-xs"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
