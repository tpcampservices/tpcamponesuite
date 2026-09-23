/**
 * Server-only HubSpot CRM queue processor (Phase 3).
 *
 * Jobs are enqueued by database triggers after TP-CAMP transactions commit
 * (signup, profile, entitlement, membership, app access) — only when the
 * `hubspot_auto_sync_enabled` flag is on. This module claims due jobs, rebuilds
 * the current payload, re-checks the canonical workspace, and upserts HubSpot.
 * It writes only crm_contacts / crm_sync_queue / audit rows — never access.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { ambiguityMessage, buildCrmPayload, readCrmState, writeCrm } from "./crm.server";

export const MAX_AUTO_ATTEMPTS = 5;
/** Backoff after attempt N (minutes). The hourly backstop rounds these up. */
const BACKOFF_MIN = [15, 60, 240, 720, 1440];
const SETTINGS = {
  flag: "hubspot_auto_sync_enabled",
  lastRun: "crm_processor_last_run",
  lastAutoOk: "crm_last_auto_success",
} as const;

async function setSetting(key: string, value: string) {
  await supabaseAdmin.from("integration_settings").upsert({ key, value }, { onConflict: "key" });
}
export async function getSetting(key: string) {
  const { data } = await supabaseAdmin.from("integration_settings").select("value").eq("key", key).maybeSingle();
  return data?.value ?? null;
}
export const autoSyncEnabled = async () => (await getSetting(SETTINGS.flag)) === "true";
export const setAutoSync = (on: boolean) => setSetting(SETTINGS.flag, on ? "true" : "false");

async function audit(userId: string | null, action: string, details: Record<string, unknown>) {
  await supabaseAdmin.from("admin_access_audit").insert({
    actor_user_id: null,
    actor_email: "system:crm-queue",
    target_user_id: userId,
    action,
    reason: "CRM (HubSpot) — automated",
    details: details as never,
  });
}

async function finish(id: string, patch: Record<string, unknown>) {
  await supabaseAdmin.from("crm_sync_queue").update(patch as never).eq("id", id);
}

type Job = { id: string; user_id: string; event_type: string; attempt_count: number };
type Classified = { kind: "retry" | "permanent" | "auth" | "rate"; message: string };

function classify(err: unknown, HubSpotError: any): Classified {
  if (err instanceof HubSpotError) {
    const e = err as { status: number; category: string; message: string };
    const msg = `HubSpot ${e.status || ""} ${e.category}: ${e.message}`.trim().slice(0, 500);
    if (e.status === 401 || e.status === 403 || e.status === 0) return { kind: "auth", message: msg };
    if (e.status === 429) return { kind: "rate", message: msg };
    if (e.status >= 500) return { kind: "retry", message: msg };
    return { kind: "permanent", message: msg }; // 400/404/409 validation or property errors
  }
  return { kind: "retry", message: (e instanceof Error ? e.message : "Unknown error").slice(0, 500) };
}

async function processJob(job: Job): Promise<"ok" | "skipped" | "stop"> {
  const hubspot = await import("./hubspot.server");
  const before = await readCrmState(job.user_id);
  let built;
  try {
    built = await buildCrmPayload(job.user_id);
  } catch (e) {
    await finish(job.id, { status: "dead_letter", last_error: e instanceof Error ? e.message : "Payload failed", processed_at: new Date().toISOString() });
    return "skipped";
  }
  const { payload, hash, workspaceId, workspace } = built;

  if (workspace.kind === "ambiguous") {
    const msg = ambiguityMessage(workspace);
    if (before.status !== "blocked" || before.lastError !== msg) {
      await writeCrm(job.user_id, { sync_status: "blocked", last_error: msg, workspace_id: null });
      await audit(job.user_id, "crm_sync_blocked_ambiguous", { conflicts: workspace.conflicts });
    }
    await finish(job.id, { status: "completed", note: "blocked_ambiguous", payload_hash: hash, processed_at: new Date().toISOString() });
    return "skipped";
  }
  if (workspace.kind === "none") {
    // Not yet subscribed: leave Not Synced; a later access event re-queues.
    await finish(job.id, { status: "completed", note: "no_active_workspace", payload_hash: hash, processed_at: new Date().toISOString() });
    return "skipped";
  }
  const email = payload.email ? String(payload.email) : null;
  if (!email) {
    await writeCrm(job.user_id, { sync_status: "failed", last_error: "No email address to match in HubSpot" });
    await finish(job.id, { status: "dead_letter", last_error: "missing_email", processed_at: new Date().toISOString() });
    return "skipped";
  }
  if (before.externalContactId && before.payloadHash === hash && ["synced", "needs_update"].includes(before.status)) {
    await writeCrm(job.user_id, { sync_status: "synced" });
    await finish(job.id, { status: "completed", note: "unchanged", payload_hash: hash, processed_at: new Date().toISOString() });
    return "skipped"; // no HubSpot request when nothing changed
  }

  const attemptAt = new Date().toISOString();
  await writeCrm(job.user_id, { sync_status: "pending", workspace_id: workspaceId, normalized_email: email, last_attempted_at: attemptAt });
  try {
    const { properties } = hubspot.toHubSpotProperties(payload);
    const res = await hubspot.upsertContact({ storedId: before.externalContactId, email, properties });
    await writeCrm(job.user_id, {
      sync_status: "synced",
      external_contact_id: res.id,
      last_payload_hash: hash,
      last_error: null,
      last_synced_at: new Date().toISOString(),
      sync_attempts: before.attempts + 1,
    });
    await finish(job.id, { status: "completed", note: res.outcome, payload_hash: hash, last_error: null, processed_at: new Date().toISOString() });
    await audit(job.user_id, "crm_sync_success", { event: job.event_type, outcome: res.outcome, external_contact_id: res.id, automated: true });
    if (before.externalContactId !== res.id) {
      await audit(job.user_id, "crm_contact_linked", { external_contact_id: res.id, previous_contact_id: before.externalContactId });
    }
    await setSetting(SETTINGS.lastAutoOk, new Date().toISOString());
    return "ok";
  } catch (e) {
    const c = classify(e, hubspot.HubSpotError);
    const dead = c.kind === "permanent" || job.attempt_count >= MAX_AUTO_ATTEMPTS;
    const delay = c.kind === "auth" ? 360 : BACKOFF_MIN[Math.min(job.attempt_count - 1, BACKOFF_MIN.length - 1)];
    await writeCrm(job.user_id, { sync_status: "failed", last_error: c.message, sync_attempts: before.attempts + 1 });
    await finish(job.id, dead
      ? { status: "dead_letter", last_error: c.message, processed_at: new Date().toISOString() }
      : { status: "failed", last_error: c.message, next_attempt_at: new Date(Date.now() + delay * 60_000).toISOString() });
    await audit(job.user_id, dead ? "crm_sync_dead_letter" : "crm_sync_failed", { event: job.event_type, error: c.message, attempt: job.attempt_count });
    // Auth / rate-limit problems: stop the batch rather than hammering HubSpot.
    return c.kind === "auth" || c.kind === "rate" ? "stop" : "skipped";
  }
}

/** Claims and processes a small batch. Safe to call concurrently (SKIP LOCKED). */
export async function processCrmQueue(limit = 10) {
  await supabaseAdmin.rpc("crm_enqueue_expired" as never);
  const { data: jobs, error } = await supabaseAdmin.rpc("crm_claim_jobs" as never, { _limit: limit } as never);
  if (error) throw new Error(error.message);
  const list = (jobs ?? []) as Job[];
  const summary = { claimed: list.length, synced: 0, skipped: 0, stopped: false };
  if (list.length) await audit(null, "crm_auto_sync_started", { jobs: list.length });
  for (let i = 0; i < list.length; i++) {
    const r = await processJob(list[i]);
    if (r === "ok") summary.synced++;
    else summary.skipped++;
    if (r === "stop") {
      // Release the rest untouched (one attempt refunded) for a later run.
      const rest = list.slice(i + 1);
      for (const j of rest) {
        await finish(j.id, { status: "failed", attempt_count: Math.max(0, j.attempt_count - 1), next_attempt_at: new Date(Date.now() + 60 * 60_000).toISOString() });
      }
      summary.stopped = true;
      break;
    }
  }
  await setSetting(SETTINGS.lastRun, new Date().toISOString());
  return summary;
}

/** Manual retry of a dead-letter job: re-opens the user's queue entry. */
export async function requeueUser(userId: string, event: string) {
  await supabaseAdmin.rpc("crm_enqueue" as never, { _user_id: userId, _event: event, _force: true } as never);
}

export async function crmOverview() {
  const [{ data: contacts }, { data: queue }, { data: users }] = await Promise.all([
    supabaseAdmin.from("crm_contacts").select("sync_status"),
    supabaseAdmin.from("crm_sync_queue").select("status"),
    supabaseAdmin.from("profiles").select("id"),
  ]);
  const counts: Record<string, number> = { synced: 0, pending: 0, needs_update: 0, failed: 0, blocked: 0, not_synced: 0 };
  for (const c of contacts ?? []) counts[c.sync_status] = (counts[c.sync_status] ?? 0) + 1;
  counts.not_synced += Math.max(0, (users?.length ?? 0) - (contacts?.length ?? 0));
  const q: Record<string, number> = { pending: 0, processing: 0, failed: 0, dead_letter: 0 };
  for (const j of queue ?? []) if (j.status in q) q[j.status]++;
  return {
    counts,
    queue: q,
    autoSyncEnabled: await autoSyncEnabled(),
    lastRun: await getSetting(SETTINGS.lastRun),
    lastAutoSuccess: await getSetting(SETTINGS.lastAutoOk),
  };
}

/** Backfill eligibility report. Read-only. */
export async function backfillPreview() {
  const { data: profiles } = await supabaseAdmin.from("profiles").select("id, email");
  const { listCrmStates } = await import("./crm.server");
  const states = await listCrmStates();
  const r = { total: 0, eligible: 0, alreadySynced: 0, notSynced: 0, ambiguous: 0, missingEmail: 0, failed: 0, ineligible: 0 };
  const eligibleIds: string[] = [];
  for (const p of profiles ?? []) {
    r.total++;
    const st = states.get(p.id);
    if (st?.status === "failed") r.failed++;
    if (st?.status === "synced") { r.alreadySynced++; continue; }
    r.notSynced++;
    try {
      const { payload, workspace } = await buildCrmPayload(p.id);
      if (!payload.email) { r.missingEmail++; continue; }
      if (workspace.kind === "ambiguous") { r.ambiguous++; continue; }
      if (workspace.kind === "none") { r.ineligible++; continue; }
      r.eligible++;
      eligibleIds.push(p.id);
    } catch {
      r.ineligible++;
    }
  }
  return { ...r, eligibleIds };
}
