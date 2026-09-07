import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createAppTicket } from "@/lib/sso.functions";

const searchSchema = z.object({ app: z.string().optional() });

export const Route = createFileRoute("/_authenticated/sso/handoff")({
  validateSearch: searchSchema,
  component: HandoffPage,
});

function HandoffPage() {
  const { app } = Route.useSearch();
  const mint = useServerFn(createAppTicket);
  const navigate = useNavigate();
  const [message, setMessage] = useState("Verifying your OneSuite access…");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const result = await mint({ data: { app: app ?? "" } });
        if (cancelled) return;
        if (result.ok) {
          window.location.replace(result.url);
          return;
        }
        if (result.reason === "not_entitled") {
          setMessage("Your OneSuite subscription isn’t active. Redirecting to pricing…");
          navigate({ to: "/pricing", replace: true });
          return;
        }
        setMessage("That application link is not recognised.");
      } catch {
        if (!cancelled) setMessage("We couldn’t verify your access. Please try again.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [app, mint, navigate]);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-5 text-center">
      <p className="eyebrow">Secure handoff</p>
      <p className="mt-4 text-sm text-muted-foreground">{message}</p>
    </main>
  );
}
