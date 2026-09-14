import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { SiteHeader, SiteFooter } from "@/components/site-header";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth/callback")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Confirming your TP-CAMP account" },
      {
        name: "description",
        content:
          "Finishing sign-in for your TP-CAMP OneSuite account after email confirmation or Google sign-in.",
      },
      { property: "og:title", content: "Confirming your TP-CAMP account" },
      { property: "og:description", content: "One moment while we finish signing you in." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthCallbackPage,
});

/**
 * Landing page for every email confirmation and OAuth return. Public and
 * SSR-free so the Supabase client can settle the session from the URL, then we
 * send the person into the authenticated app instead of the marketing home page.
 */
function AuthCallbackPage() {
  const navigate = useNavigate();
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    let done = false;

    const finish = () => {
      if (done) return;
      done = true;
      navigate({ to: "/dashboard", replace: true });
    };

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) finish();
    });

    const run = async () => {
      const params = new URLSearchParams(window.location.search);
      const tokenHash = params.get("token_hash");
      const type = params.get("type");
      const errorDescription = params.get("error_description");

      if (errorDescription) {
        setFailed(errorDescription);
        return;
      }

      if (tokenHash && type) {
        const { error } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type: type as "signup" | "email" | "magiclink" | "recovery" | "email_change",
        });
        if (error) {
          setFailed(error.message);
          return;
        }
        finish();
        return;
      }

      const { data } = await supabase.auth.getSession();
      if (data.session) {
        finish();
        return;
      }
      // Give the client a moment to consume an implicit-flow hash.
      setTimeout(async () => {
        const { data: retry } = await supabase.auth.getSession();
        if (retry.session) finish();
        else setFailed("This confirmation link has expired or has already been used.");
      }, 2500);
    };

    void run();
    return () => sub.subscription.unsubscribe();
  }, [navigate]);

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-md px-5 pt-24 pb-24 text-center">
        <p className="eyebrow">Account</p>
        <h1 className="mt-4 text-3xl font-semibold">
          {failed ? "We couldn't confirm that link" : "Confirming your account…"}
        </h1>
        <p className="mt-4 text-sm text-muted-foreground">
          {failed
            ? failed
            : "One moment — we're finishing your sign-in and opening your dashboard."}
        </p>
        {failed && (
          <Link
            to="/auth"
            className="mt-8 inline-block rounded-lg bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground"
          >
            Back to sign in
          </Link>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
