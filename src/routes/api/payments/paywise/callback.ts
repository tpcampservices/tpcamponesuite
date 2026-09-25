import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/payments/paywise/callback")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { handlePaywiseRequest } = await import("@/lib/paywise-events.server");
        return handlePaywiseRequest("callback", request);
      },
    },
  },
});
