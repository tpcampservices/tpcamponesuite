import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getRegistrationHub = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { registrationContext, listWorks } = await import("./registration.server");
    const ctx = await registrationContext(context.userId);
    if (!ctx.canRead || !ctx.workspaceId) {
      return { allowed: false as const, permissions: [] as string[], works: [] };
    }
    return { allowed: true as const, permissions: ctx.permissions as string[], works: await listWorks(ctx.workspaceId) };
  });

export const buildRegistrationProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ workId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { requireRegistrationPermission, buildProfile } = await import("./registration.server");
    const ctx = await requireRegistrationPermission(context.userId, "splits.registration.prepare");
    return buildProfile(ctx.workspaceId, data.workId, context.userId);
  });

export const getRegistrationIdentity = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { registrationContext, loadIdentity, saveIdentity } = await import("./registration.server");
    const { readIdentity } = await import("./registration-identity.core");
    const ctx = await registrationContext(context.userId);
    return readIdentity(ctx, { load: loadIdentity, save: saveIdentity });
  });

export const saveRegistrationIdentity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.record(z.string(), z.unknown()).parse(d))
  .handler(async ({ context, data }) => {
    const { registrationContext, loadIdentity, saveIdentity } = await import("./registration.server");
    const { writeIdentity } = await import("./registration-identity.core");
    const ctx = await registrationContext(context.userId);
    await writeIdentity(ctx, data, { load: loadIdentity, save: saveIdentity });
    return { ok: true };
  });
