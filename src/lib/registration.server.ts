import { createHash } from "crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { resolveAppAuthorization } from "./workspace.server";
import { buildUrp, canonicalJson, isStale, validateUrp, type SourceSnapshot } from "./registration-core";

export type RegistrationPermission =
  | "splits.registration.prepare"
  | "splits.registration.approve"
  | "splits.registration.submit"
  | "splits.registration.admin";

const READ_PERMS: RegistrationPermission[] = [
  "splits.registration.prepare",
  "splits.registration.approve",
  "splits.registration.submit",
  "splits.registration.admin",
];

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

/** Server-resolved workspace + registration permissions. Never trusts the browser. */
export async function registrationContext(userId: string) {
  const auth = await resolveAppAuthorization(userId, "splits");
  const perms = auth.permissions.filter((p) => p.startsWith("splits.registration."));
  return {
    authorized: auth.authorized && !!auth.workspaceId,
    workspaceId: auth.workspaceId,
    permissions: perms as RegistrationPermission[],
    canRead: auth.authorized && perms.some((p) => READ_PERMS.includes(p as RegistrationPermission)),
    reason: auth.reason,
  };
}

export async function requireRegistrationPermission(userId: string, perm: RegistrationPermission) {
  const ctx = await registrationContext(userId);
  if (!ctx.authorized || !ctx.workspaceId || !ctx.permissions.includes(perm)) {
    throw new Error("You don't have permission to do this in the Registration Hub.");
  }
  return { ...ctx, workspaceId: ctx.workspaceId };
}

/** Store an immutable source snapshot (idempotent by checksum). */
export async function ingestSourceSnapshot(input: {
  workspaceId: string;
  sourceApp: "catalog" | "splits";
  entityType: string;
  entityId: string;
  workUid: string;
  sourceRevision: string | null;
  ownershipRevision: string | null;
  eventId: string | null;
  payload: Record<string, unknown>;
}) {
  const checksum = sha256(canonicalJson(input.payload));
  const { data: existing } = await supabaseAdmin
    .from("registration_source_snapshots")
    .select("id")
    .eq("workspace_id", input.workspaceId)
    .eq("source_app", input.sourceApp)
    .eq("entity_type", input.entityType)
    .eq("source_entity_id", input.entityId)
    .eq("checksum", checksum)
    .maybeSingle();
  if (existing) return { snapshotId: existing.id, duplicate: true };

  const { data: snap, error } = await supabaseAdmin
    .from("registration_source_snapshots")
    .insert({
      workspace_id: input.workspaceId,
      source_app: input.sourceApp,
      entity_type: input.entityType,
      source_entity_id: input.entityId,
      work_uid: input.workUid,
      source_revision: input.sourceRevision,
      ownership_revision: input.ownershipRevision,
      source_event_id: input.eventId,
      payload: input.payload as never,
      checksum,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  const work = await ensureWork(input.workspaceId, input.workUid, {
    ...(input.sourceApp === "catalog" ? { catalog_work_id: input.entityId } : { split_sheet_id: input.entityId }),
  });
  await supabaseAdmin.from("registration_status_history").insert({
    workspace_id: input.workspaceId,
    registration_work_id: work.id,
    state: "source_received",
    details: { source_app: input.sourceApp, snapshot_id: snap.id, source_revision: input.sourceRevision } as never,
  });
  return { snapshotId: snap.id, duplicate: false };
}

async function ensureWork(workspaceId: string, workUid: string, links: { catalog_work_id?: string; split_sheet_id?: string }) {
  const { data: found } = await supabaseAdmin
    .from("registration_works")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("work_uid", workUid)
    .maybeSingle();
  if (found) {
    if (Object.keys(links).length) await supabaseAdmin.from("registration_works").update(links).eq("id", found.id);
    return found;
  }
  const { data, error } = await supabaseAdmin
    .from("registration_works")
    .insert({ workspace_id: workspaceId, work_uid: workUid, ...links })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

async function latestSnapshot(workspaceId: string, workUid: string, app: "catalog" | "splits") {
  const { data } = await supabaseAdmin
    .from("registration_source_snapshots")
    .select("id, source_app, source_revision, ownership_revision, payload, received_at")
    .eq("workspace_id", workspaceId)
    .eq("work_uid", workUid)
    .eq("source_app", app)
    .order("received_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as SourceSnapshot | null) ?? null;
}

/** Build (or reuse, if unchanged) an immutable profile and record its validation. */
export async function buildProfile(workspaceId: string, workId: string, actor: string) {
  const { data: work } = await supabaseAdmin
    .from("registration_works")
    .select("id, work_uid")
    .eq("id", workId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (!work) throw new Error("Work not found in this workspace.");

  const [cat, spl] = await Promise.all([
    latestSnapshot(workspaceId, work.work_uid, "catalog"),
    latestSnapshot(workspaceId, work.work_uid, "splits"),
  ]);
  const urp = buildUrp(work.work_uid, cat, spl);
  const fingerprint = sha256(canonicalJson(urp));

  const { data: same } = await supabaseAdmin
    .from("registration_profiles")
    .select("id, profile_revision")
    .eq("registration_work_id", work.id)
    .eq("fingerprint", fingerprint)
    .maybeSingle();
  if (same) return { profileId: same.id, revision: same.profile_revision, reused: true };

  const { data: last } = await supabaseAdmin
    .from("registration_profiles")
    .select("profile_revision")
    .eq("registration_work_id", work.id)
    .order("profile_revision", { ascending: false })
    .limit(1)
    .maybeSingle();
  const revision = (last?.profile_revision ?? 0) + 1;

  const { data: profile, error } = await supabaseAdmin
    .from("registration_profiles")
    .insert({
      workspace_id: workspaceId,
      registration_work_id: work.id,
      profile_revision: revision,
      catalog_snapshot_id: cat?.id ?? null,
      splits_snapshot_id: spl?.id ?? null,
      catalog_revision: cat?.source_revision ?? null,
      ownership_revision: spl?.ownership_revision ?? null,
      urp: urp as never,
      fingerprint,
      created_by: actor,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  const issues = validateUrp(urp);
  const passed = !issues.some((i) => i.severity === "blocking");
  await supabaseAdmin.from("registration_validations").insert({
    workspace_id: workspaceId,
    profile_id: profile.id,
    passed,
    issues: issues as never,
  });
  await supabaseAdmin.from("registration_status_history").insert([
    { workspace_id: workspaceId, registration_work_id: work.id, state: "profile_built", profile_id: profile.id, actor_user_id: actor, details: { revision } as never },
    { workspace_id: workspaceId, registration_work_id: work.id, state: passed ? "validated" : "validation_failed", profile_id: profile.id, actor_user_id: actor },
  ]);
  await supabaseAdmin
    .from("registration_works")
    .update({ status: passed ? "ready" : cat && spl ? "draft" : "needs_source" })
    .eq("id", work.id);
  return { profileId: profile.id, revision, reused: false };
}

export async function listWorks(workspaceId: string) {
  const { data: works } = await supabaseAdmin
    .from("registration_works")
    .select("id, work_uid, status, updated_at")
    .eq("workspace_id", workspaceId)
    .order("updated_at", { ascending: false })
    .limit(200);
  const out = [];
  for (const w of works ?? []) {
    const [cat, spl, prof] = await Promise.all([
      latestSnapshot(workspaceId, w.work_uid, "catalog"),
      latestSnapshot(workspaceId, w.work_uid, "splits"),
      supabaseAdmin
        .from("registration_profiles")
        .select("id, profile_revision, catalog_snapshot_id, splits_snapshot_id, urp, created_at, registration_validations(passed, issues)")
        .eq("registration_work_id", w.id)
        .order("profile_revision", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    const p = prof.data as
      | { id: string; profile_revision: number; catalog_snapshot_id: string | null; splits_snapshot_id: string | null; urp: { work?: { title?: string } }; created_at: string; registration_validations: { passed: boolean; issues: unknown }[] }
      | null;
    const v = p?.registration_validations?.[0];
    out.push({
      id: w.id,
      workUid: w.work_uid,
      status: w.status,
      title: p?.urp?.work?.title ?? (cat?.payload?.title as string | undefined) ?? null,
      catalogRevision: cat?.source_revision ?? null,
      ownershipRevision: spl?.ownership_revision ?? null,
      catalogReceivedAt: cat?.received_at ?? null,
      splitsReceivedAt: spl?.received_at ?? null,
      profileRevision: p?.profile_revision ?? null,
      stale: isStale(p, { catalog: cat?.id ?? null, splits: spl?.id ?? null }),
      validationPassed: v?.passed ?? null,
      issues: (v?.issues as { severity: string; message: string }[] | undefined) ?? [],
    });
  }
  return out;
}
