import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { SiteHeader, SiteFooter } from "@/components/site-header";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { useSession } from "@/hooks/use-session";
import { safeTpcampRedirect, childAppSlugFromUrl } from "@/lib/sso-redirect";

export const Route = createFileRoute("/auth")({
  validateSearch: z.object({ redirect: z.string().optional() }),
  head: () => ({
    meta: [
      { title: "Sign in or create your TP-CAMP account" },
      {
        name: "description",
        content:
          "Log in to the TP-CAMP portal to manage your OneSuite subscription and open every application in the suite.",
      },
      { property: "og:title", content: "TP-CAMP Login Portal" },
      {
        property: "og:description",
        content: "Access the TP-CAMP OneSuite apps: catalogue, split sheets, contracts, invoicing, campaigns and finance.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

const credentials = z.object({
  email: z.string().trim().email("Enter a valid email").max(255),
  password: z.string().min(8, "Password must be at least 8 characters").max(72),
});

function AuthPage() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const { user, loading } = useSession();
  const { redirect: redirectParam } = Route.useSearch();
  const returnTo = safeTpcampRedirect(redirectParam);
  const returnApp = childAppSlugFromUrl(returnTo);

  function goAfterAuth() {
    // Child apps are always re-entered through the server-verified SSO handoff,
    // never by dropping the user back on an unauthenticated child URL.
    if (returnApp) {
      window.location.replace(`/sso/handoff?app=${returnApp}`);
      return;
    }
    if (returnTo) {
      window.location.replace(returnTo);
      return;
    }
    navigate({ to: "/dashboard", replace: true });
  }

  useEffect(() => {
    if (!loading && user) goAfterAuth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, user, returnTo, returnApp]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const parsed = credentials.safeParse({
      email: formData.get("email"),
      password: formData.get("password"),
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }

    setBusy(true);
    if (mode === "signup") {
      const { error } = await supabase.auth.signUp({
        email: parsed.data.email,
        password: parsed.data.password,
        options: {
          emailRedirectTo: window.location.origin,
          data: {
            full_name: String(formData.get("full_name") ?? "").slice(0, 100),
            organisation: String(formData.get("organisation") ?? "").slice(0, 100),
            country: String(formData.get("country") ?? "").slice(0, 100),
          },
        },
      });
      setBusy(false);
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success("Account created. Check your inbox if confirmation is required.");
      goAfterAuth();
      return;
    }

    const { error } = await supabase.auth.signInWithPassword(parsed.data);
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    goAfterAuth();
  }

  async function handleGoogle() {
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: returnTo
        ? `${window.location.origin}/auth?redirect=${encodeURIComponent(returnTo)}`
        : window.location.origin,
    });
    if (result.error) {
      toast.error("Google sign-in failed. Please try again.");
      return;
    }
    if (result.redirected) return;
    goAfterAuth();
  }

  async function handleForgotPassword() {
    const email = window.prompt("Enter the email address on your TP-CAMP account");
    if (!email) return;
    const parsed = z.string().trim().email().max(255).safeParse(email);
    if (!parsed.success) {
      toast.error("Enter a valid email");
      return;
    }
    const { error } = await supabase.auth.resetPasswordForEmail(parsed.data, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Password reset link sent. Check your inbox.");
  }


  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-md px-5 pt-16 pb-20">
        <p className="eyebrow">Login portal</p>
        <h1 className="mt-4 text-3xl font-semibold">
          {mode === "signin" ? "Sign in to TP-CAMP" : "Create your TP-CAMP account"}
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Your apps unlock here once your subscription is active.
        </p>

        <div className="panel mt-8 p-7">
          <button
            onClick={handleGoogle}
            className="w-full rounded-lg border border-border bg-secondary px-4 py-3 text-sm font-semibold text-secondary-foreground transition-colors hover:bg-secondary/80"
          >
            Continue with Google
          </button>

          <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            or use email
            <span className="h-px flex-1 bg-border" />
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === "signup" && (
              <>
                <Field name="full_name" label="Full name" required />
                <Field name="organisation" label="Artist / label name" />
                <Field name="country" label="Country" defaultValue="Trinidad and Tobago" />
              </>
            )}
            <Field name="email" label="Email" type="email" required />
            <Field name="password" label="Password" type="password" required />
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
            </button>
          </form>

          {mode === "signin" && (
            <p className="mt-4 text-center text-sm">
              <button onClick={handleForgotPassword} className="text-muted-foreground underline">
                Forgot your password?
              </button>
            </p>
          )}


          <p className="mt-5 text-center text-sm text-muted-foreground">
            {mode === "signin" ? "New to TP-CAMP?" : "Already have an account?"}{" "}
            <button
              onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
              className="font-semibold text-accent"
            >
              {mode === "signin" ? "Create an account" : "Sign in"}
            </button>
          </p>
        </div>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          Not ready yet?{" "}
          <Link to="/pricing" className="text-accent">
            See what's included
          </Link>
        </p>
      </main>
      <SiteFooter />
    </div>
  );
}

function Field({
  name,
  label,
  type = "text",
  required,
  defaultValue,
}: {
  name: string;
  label: string;
  type?: string;
  required?: boolean;
  defaultValue?: string;
}) {
  return (
    <label className="block text-sm">
      <span className="text-muted-foreground">{label}</span>
      <input
        name={name}
        type={type}
        required={required}
        defaultValue={defaultValue}
        maxLength={255}
        className="mt-1.5 w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm outline-none focus:border-accent"
      />
    </label>
  );
}
