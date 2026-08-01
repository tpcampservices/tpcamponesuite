import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { SiteHeader, SiteFooter } from "@/components/site-header";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Reset your TP-CAMP password" },
      {
        name: "description",
        content:
          "Choose a new password for your TP-CAMP account and get back to your catalogue, invoicing, campaign and finance apps.",
      },
      { property: "og:title", content: "Reset your TP-CAMP password" },
      {
        property: "og:description",
        content: "Set a new password for your TP-CAMP portal account.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const hash = window.location.hash;
    const isRecovery = hash.includes("type=recovery");
    supabase.auth.getSession().then(({ data }) => {
      setReady(isRecovery || Boolean(data.session));
    });
  }, []);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const password = String(formData.get("password") ?? "");
    const confirm = String(formData.get("confirm") ?? "");
    if (password.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    if (password !== confirm) {
      toast.error("Passwords do not match");
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Password updated.");
    navigate({ to: "/dashboard", replace: true });
  }

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-md px-5 pt-16 pb-20">
        <p className="eyebrow">Account security</p>
        <h1 className="mt-4 text-3xl font-semibold">Set a new password</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          {ready
            ? "Choose a new password for your TP-CAMP account."
            : "Open this page from the reset link we emailed you, or request a new link."}
        </p>

        <div className="panel mt-8 p-7">
          <form onSubmit={handleSubmit} className="space-y-4">
            <label className="block text-sm">
              <span className="text-muted-foreground">New password</span>
              <input
                name="password"
                type="password"
                required
                maxLength={72}
                className="mt-1.5 w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm outline-none focus:border-accent"
              />
            </label>
            <label className="block text-sm">
              <span className="text-muted-foreground">Confirm new password</span>
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
              {busy ? "Updating…" : "Update password"}
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          Remembered it?{" "}
          <Link to="/auth" className="text-accent">
            Back to sign in
          </Link>
        </p>
      </main>
      <SiteFooter />
    </div>
  );
}
