import { createFileRoute, Link, useNavigate, useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { SiteHeader, SiteFooter } from "@/components/site-header";
import { supabase } from "@/integrations/supabase/client";
import {
  acceptWorkspaceInvitation,
  previewWorkspaceInvitation,
} from "@/lib/invitations.functions";

export const Route = createFileRoute("/invite/$token")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Join a team workspace on TP-CAMP OneSuite" },
      {
        name: "description",
        content:
          "Accept your team invitation to a TP-CAMP OneSuite workspace and start working with your label or artist team.",
      },
      { property: "og:title", content: "Join a team workspace on TP-CAMP OneSuite" },
      {
        property: "og:description",
        content: "Accept your TP-CAMP OneSuite team invitation and join your workspace.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: TeamInvitePage,
});

type Preview = Awaited<ReturnType<typeof previewWorkspaceInvitation>>;

const REASONS: Record<string, string> = {
  invalid: "This invitation link is not valid.",
  expired: "This invitation has expired. Ask for a new one.",
  cancelled: "This invitation was cancelled.",
  accepted: "This invitation has already been used.",
  email_mismatch: "This invitation was sent to a different email address. Sign in with that address.",
  no_seat_available: "This workspace has no seats available right now.",
  workspace_unavailable: "That workspace is no longer available.",
  invalid_role: "That invitation role is no longer valid.",
  already_accepted: "This invitation has already been used.",
};

function TeamInvitePage() {
  const { token } = useParams({ from: "/invite/$token" });
  const navigate = useNavigate();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [signedInEmail, setSignedInEmail] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    const run = async () => {
      const [{ data: session }, result] = await Promise.all([
        supabase.auth.getSession(),
        previewWorkspaceInvitation({ data: { token } }),
      ]);
      setSignedInEmail(session.session?.user.email ?? null);
      setPreview(result);
    };
    void run();
  }, [token]);

  async function accept() {
    setBusy(true);
    setFailure(null);
    try {
      const result = await acceptWorkspaceInvitation({ data: { token } });
      if (!result.ok) {
        setFailure(REASONS[result.reason] ?? "This invitation could not be accepted.");
        return;
      }
      toast.success(
        result.alreadyMember
          ? "You are already a member of this workspace."
          : `You have joined ${result.workspaceName}.`,
      );
      navigate({ to: "/dashboard", replace: true });
    } catch (error) {
      setFailure(error instanceof Error ? error.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  const invalid = preview && !preview.valid;

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-md px-5 pt-16 pb-20">
        <p className="eyebrow">Team invitation</p>
        <h1 className="mt-4 text-3xl font-semibold">
          {!preview
            ? "Checking your invitation…"
            : invalid
              ? "This invitation can't be used"
              : `Join ${preview.workspaceName}`}
        </h1>

        {preview && invalid && (
          <>
            <p className="mt-3 text-sm text-muted-foreground">
              {REASONS[preview.reason ?? "invalid"]}
            </p>
            <Link
              to="/"
              className="mt-8 inline-block rounded-lg bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground"
            >
              Back to TP-CAMP OneSuite
            </Link>
          </>
        )}

        {preview?.valid && (
          <div className="panel mt-8 space-y-4 p-7 text-sm">
            <p className="text-muted-foreground">
              {preview.invitedBy ? `${preview.invitedBy} invited ` : "You were invited to "}
              <span className="text-foreground">{preview.email}</span> to join{" "}
              <span className="text-foreground">{preview.workspaceName}</span> as{" "}
              <span className="text-foreground">{preview.roleName}</span>.
            </p>

            {!signedInEmail && (
              <>
                <p className="text-muted-foreground">
                  Sign in with {preview.email} to accept. If you don't have an account yet, create one
                  with that email address and open this link again.
                </p>
                <Link
                  to="/auth"
                  className="inline-block rounded-lg bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground"
                >
                  Sign in or create your account
                </Link>
              </>
            )}

            {signedInEmail &&
              signedInEmail.toLowerCase() !== (preview.email ?? "").toLowerCase() && (
                <p className="text-muted-foreground">
                  You are signed in as {signedInEmail}. This invitation was sent to {preview.email}.
                  Sign out and sign in with that address to accept it.
                </p>
              )}

            {signedInEmail &&
              signedInEmail.toLowerCase() === (preview.email ?? "").toLowerCase() && (
                <button
                  type="button"
                  onClick={accept}
                  disabled={busy}
                  className="w-full rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
                >
                  {busy ? "Joining…" : "Accept invitation"}
                </button>
              )}

            {failure && <p className="text-sm text-destructive">{failure}</p>}
          </div>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
