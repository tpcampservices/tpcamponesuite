import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createAppTicket } from "@/lib/sso.functions";
import { supabase } from "@/integrations/supabase/client";
import {
  clearHandoffAttempts,
  loopErrorReference,
  recordHandoffAttempt,
} from "@/lib/sso-loop-guard";

const searchSchema = z.object({
  app: z.string().optional(),
  return_to: z.string().optional(),
});

export const Route = createFileRoute("/_authenticated/sso/handoff")({
  validateSearch: searchSchema,
  component: HandoffPage,
});

type State =
  | { kind: "working"; message: string }
  | { kind: "denied"; message: string }
  | { kind: "loop"; reference: string };

function HandoffPage() {
  const { app, return_to: returnTo } = Route.useSearch();
  const mint = useServerFn(createAppTicket);
  const navigate = useNavigate();
  const [state, setState] = useState<State>({
    kind: "working",
    message: "Verifying your OneSuite access…",
  });

  useEffect(() => {
    let cancelled = false;
    const slug = app ?? "";

    // Loop protection: repeated handoffs for the same app inside a short window
    // mean the child app is bouncing us back instead of establishing its session.
    const { looping, count } = recordHandoffAttempt(slug);
    if (looping) {
      const reference = loopErrorReference(slug || "unknown");
      console.warn("[sso] handoff loop detected", {
        app: slug,
        attempts: count,
        url: window.location.pathname + window.location.search,
        reference,
      });
      setState({ kind: "loop", reference });
      return;
    }

    (async () => {
      try {
        const result = await mint({ data: { app: slug, returnTo: returnTo ?? "" } });
        if (cancelled) return;
        if (result.ok) {
          window.location.replace(result.url);
          return;
        }
        if (result.reason === "not_entitled") {
          setState({
            kind: "working",
            message: "Your OneSuite subscription isn’t active. Redirecting to pricing…",
          });
          navigate({ to: "/pricing", replace: true });
          return;
        }
        setState({ kind: "denied", message: "That application link is not recognised." });
      } catch {
        if (!cancelled) {
          setState({
            kind: "denied",
            message: "We couldn’t verify your access. Please try again.",
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [app, returnTo, mint, navigate]);

  if (state.kind === "loop") {
    return (
      <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-5">
        <p className="eyebrow">Secure handoff</p>
        <h1 className="mt-4 text-2xl font-semibold">Unable to complete sign-in</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          OneSuite successfully authenticated your account, but{" "}
          <span className="font-medium">{app ?? "this application"}</span> could not establish its
          local session, so it sent you straight back here.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <button
            onClick={() => {
              clearHandoffAttempts(app);
              window.location.reload();
            }}
            className="rounded-lg bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground"
          >
            Retry authentication
          </button>
          <Link
            to="/dashboard"
            onClick={() => clearHandoffAttempts()}
            className="rounded-lg border border-border px-5 py-3 text-sm font-medium"
          >
            Return to OneSuite
          </Link>
          <button
            onClick={async () => {
              clearHandoffAttempts();
              await supabase.auth.signOut();
              window.location.replace("/auth");
            }}
            className="rounded-lg border border-border px-5 py-3 text-sm font-medium"
          >
            Sign out
          </button>
        </div>
        <p className="mt-6 font-mono text-xs break-all text-muted-foreground">
          Reference: {state.reference}
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-5 text-center">
      <p className="eyebrow">Secure handoff</p>
      <p className="mt-4 text-sm text-muted-foreground">{state.message}</p>
      {state.kind === "denied" && (
        <Link to="/dashboard" className="mt-5 text-sm text-accent">
          Back to dashboard
        </Link>
      )}
    </main>
  );
}
