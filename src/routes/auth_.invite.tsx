import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { SiteHeader, SiteFooter } from "@/components/site-header";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth/invite")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Accept your TP-CAMP OneSuite invitation" },
      {
        name: "description",
        content:
          "Accept your invitation to TP-CAMP OneSuite, set your password and open your workspace.",
      },
      { property: "og:title", content: "Accept your TP-CAMP OneSuite invitation" },
      {
        property: "og:description",
        content: "Set a password and finish joining the TP-CAMP OneSuite workspace.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: InvitePage,
});

type State = "checking" | "ready" | "invalid" | "used";

/**
 * Invite acceptance. The invitation token is consumed once, here, and never
 * shown in the interface. The existing profile/role trigger has already created
 * the records for an invited account, so once the password is set the person
 * goes straight into OneSuite.
 */
function InvitePage() {
  const navigate = useNavigate();
  const [state, setState] = useState<State>("checking");
  const [email, setEmail] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const run = async () => {
      const params = new URLSearchParams(window.location.search);
      const tokenHash = params.get("token_hash");
      const type = params.get("type");
      const errorCode = params.get("error_code") ?? params.get("error");

      if (errorCode) {
        setState("invalid");
        return;
      }

      if (tokenHash) {
        const { data, error } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type: (type === "signup" ? "signup" : "invite") as "invite" | "signup",
        });
        // Clear the token from the address bar immediately.
        window.history.replaceState({}, "", window.location.pathname);
        if (error || !data.session) {
          setState(/expired|invalid/i.test(error?.message ?? "") ? "invalid" : "used");
          return;
        }
        setEmail(data.session.user.email ?? null);
        setState("ready");
        return;
      }

      const { data } = await supabase.auth.getSession();
      if (data.session) {
        setEmail(data.session.user.email ?? null);
        setState("ready");
        return;
      }
      setState("invalid");
    };
    void run();
  }, []);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const password = String(formData.get("password") ?? "");
    const confirm = String(formData.get("confirm") ?? "");
    const fullName = String(formData.get("full_name") ?? "").slice(0, 100);

    if (password.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    if (password !== confirm) {
      toast.error("Passwords do not match");
      return;
    }

    setBusy(true);
    const { error } = await supabase.auth.updateUser({
      password,
      ...(fullName ? { data: { full_name: fullName } } : {}),
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Welcome to TP-CAMP OneSuite.");
    navigate({ to: "/dashboard", replace: true });
  }

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-md px-5 pt-16 pb-20">
        <p className="eyebrow">Invitation</p>
        <h1 className="mt-4 text-3xl font-semibold">
          {state === "ready"
            ? "Set your password"
            : state === "checking"
              ? "Checking your invitation…"
              : state === "used"
                ? "This invitation has already been used"
                : "This invitation link is no longer valid"}
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          {state === "ready"
            ? `You're accepting the invitation for ${email ?? "your account"}. Choose a password to finish.`
            : state === "checking"
              ? "One moment."
              : state === "used"
                ? "Your account already exists — sign in with your password, or reset it from the sign-in page."
                : "Invitation links expire for security. Ask your TP-CAMP administrator to send a new one."}
        </p>

        {state === "ready" && (
          <div className="panel mt-8 p-7">
            <form onSubmit={handleSubmit} className="space-y-4">
              <label className="block text-sm">
                <span className="text-muted-foreground">Full name</span>
                <input
                  name="full_name"
                  maxLength={100}
                  className="mt-1.5 w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm outline-none focus:border-accent"
                />
              </label>
              <label className="block text-sm">
                <span className="text-muted-foreground">Password</span>
                <input
                  name="password"
                  type="password"
                  required
                  maxLength={72}
                  className="mt-1.5 w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm outline-none focus:border-accent"
                />
              </label>
              <label className="block text-sm">
                <span className="text-muted-foreground">Confirm password</span>
                <input
                  name="confirm"
                  type="password"
                  required
                  maxLength={72}
                  className="mt-1.5 w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm outline-none focus:border-accent"
                />
              </label>
              <button
                type="submit"
                disabled={busy}
                className="w-full rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                {busy ? "Please wait…" : "Finish and enter OneSuite"}
              </button>
            </form>
          </div>
        )}

        {(state === "invalid" || state === "used") && (
          <Link
            to="/auth"
            className="mt-8 inline-block rounded-lg bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground"
          >
            Go to sign in
          </Link>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
