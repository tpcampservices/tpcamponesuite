/**
 * Retention of the invitation send ledger.
 *
 * The 30-day deletion runs inside public.reserve_invitation_send, in the same
 * transaction that counts and reserves, so it cannot be lost when a serverless
 * request ends. These tests use fictional workspace/actor ids and never send an
 * email; every row they create is removed again afterwards.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHash } from "crypto";
import { readFileSync } from "fs";

const TEST_WORKSPACE = "ea78ed53-5622-42ad-adcd-61bfd535d22e";
const ACTOR = "00000000-0000-4000-8000-00000000d001";
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

const OLD = sha256("retention-old@test.invalid");
const RECENT = sha256("retention-recent@test.invalid");
const RESERVED = sha256("retention-reserved@test.invalid");

const live = !!process.env["SUPABASE_URL"] && !!process.env["SUPABASE_SERVICE_ROLE_KEY"];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;

async function wipe() {
  await db.from("invitation_send_ledger").delete().eq("actor_user_id", ACTOR);
}

describe.skipIf(!live)("invitation ledger 30-day retention", () => {
  beforeAll(async () => {
    ({ supabaseAdmin: db } = await import("@/integrations/supabase/client.server"));
    await wipe();
  });
  afterAll(async () => {
    if (db) await wipe();
  });

  it("removes rows older than 30 days and keeps newer rows during a reservation", async () => {
    const seed = await db
      .from("invitation_send_ledger")
      .insert([
        {
          workspace_id: TEST_WORKSPACE,
          actor_user_id: ACTOR,
          email_hash: OLD,
          kind: "initial",
          status: "sent",
          created_at: new Date(Date.now() - 31 * 864e5).toISOString(),
        },
        {
          workspace_id: TEST_WORKSPACE,
          actor_user_id: ACTOR,
          email_hash: RECENT,
          kind: "initial",
          status: "sent",
          created_at: new Date(Date.now() - 10 * 864e5).toISOString(),
        },
      ])
      .select("id");
    expect(seed.error).toBeNull();
    expect(seed.data).toHaveLength(2);

    const reservation = await db.rpc("reserve_invitation_send", {
      _workspace_id: TEST_WORKSPACE,
      _actor_user_id: ACTOR,
      _email_hash: RESERVED,
      _kind: "initial",
      _invitation_id: null,
    });
    expect(reservation.error).toBeNull();
    expect(typeof reservation.data).toBe("string");

    const after = await db
      .from("invitation_send_ledger")
      .select("email_hash")
      .in("email_hash", [OLD, RECENT, RESERVED]);
    const hashes = (after.data ?? []).map((r: { email_hash: string }) => r.email_hash);

    expect(hashes).not.toContain(OLD); // older than 30 days: deleted
    expect(hashes).toContain(RECENT); // inside the window: retained
    expect(hashes).toContain(RESERVED); // the reservation itself was recorded
  });

  it("keeps a row that is just inside the 30-day window", async () => {
    await wipe();
    const edge = sha256("retention-edge@test.invalid");
    await db.from("invitation_send_ledger").insert({
      workspace_id: TEST_WORKSPACE,
      actor_user_id: ACTOR,
      email_hash: edge,
      kind: "initial",
      status: "sent",
      created_at: new Date(Date.now() - 29 * 864e5).toISOString(),
    });
    const r = await db.rpc("reserve_invitation_send", {
      _workspace_id: TEST_WORKSPACE,
      _actor_user_id: ACTOR,
      _email_hash: sha256("retention-edge-trigger@test.invalid"),
      _kind: "initial",
      _invitation_id: null,
    });
    expect(r.error).toBeNull();
    const after = await db.from("invitation_send_ledger").select("email_hash").eq("email_hash", edge);
    expect(after.data).toHaveLength(1);
  });
});

describe("retention is not left to an unawaited background call", () => {
  it("the send path does not fire purge_invitation_send_ledger without awaiting it", () => {
    const src = readFileSync("src/lib/invitation-deps.server.ts", "utf8");
    expect(src).not.toMatch(/void\s+supabaseAdmin\.rpc\(\s*"purge_invitation_send_ledger"/);
    expect(src).not.toMatch(/purge_invitation_send_ledger/);
  });
});
