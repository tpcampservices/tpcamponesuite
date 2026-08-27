import { createFileRoute } from "@tanstack/react-router";

/**
 * Central entitlement check.
 *   GET/POST /api/public/entitlement
 *   Header:  Authorization: Bearer <TP-CAMP OneSuite Supabase access token>
 * Returns the minimum information a child app needs. Fails closed.
 */
export const Route = createFileRoute("/api/public/entitlement")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) => {
        const { corsHeaders } = await import("@/lib/entitlement.server");
        return new Response(null, { status: 204, headers: corsHeaders(request.headers.get("origin")) });
      },
      GET: async ({ request }) => handle(request),
      POST: async ({ request }) => handle(request),
    },
  },
});

async function handle(request: Request) {
  const { corsHeaders, computeEntitlement, userFromBearer, DENIED } = await import(
    "@/lib/entitlement.server"
  );
  const headers = {
    ...corsHeaders(request.headers.get("origin")),
    "Content-Type": "application/json",
  };

  try {
    const user = await userFromBearer(request.headers.get("authorization"));
    if (!user) {
      return new Response(JSON.stringify(DENIED), { status: 401, headers });
    }
    const entitlement = await computeEntitlement(user.id, user.email ?? null);
    return new Response(JSON.stringify(entitlement), { status: 200, headers });
  } catch (err) {
    console.error("Entitlement endpoint failed:", err);
    return new Response(JSON.stringify(DENIED), { status: 500, headers });
  }
}
