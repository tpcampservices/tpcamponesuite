import { describe, expect, it } from "vitest";
import { buildUrp, isStale, validateUrp, type RegistrationIdentityRow, type SourceSnapshot } from "./registration-core";
import { IDENTITY_DENIED, readIdentity, writeIdentity, type IdentityCtx, type IdentityInputParsed } from "./registration-identity.core";

// Fictional test data only.
const WS_A = "aaaaaaaa-0000-4000-8000-000000000001";
const WS_B = "bbbbbbbb-0000-4000-8000-000000000002";

const catalog: SourceSnapshot = {
  id: "cat-1", source_app: "catalog", source_revision: "4", ownership_revision: null, received_at: "2026-01-01T00:00:00Z",
  source_entity_id: "cat_x",
  payload: { title: "Catalog Title", iswc: null, recordings: [], releases: [] },
};
const splits = (writer: Record<string, unknown>): SourceSnapshot => ({
  id: "spl-9", source_app: "splits", source_revision: null, ownership_revision: "9", received_at: "2026-01-02T00:00:00Z",
  payload: { ownership_validated_at: "2026-01-02T00:00:00Z", writers: [writer] },
});
const writer = { id: "w1", legalName: "Mike Smith", role: "CA", ipiNumber: "00012345678", sharePercent: 100, publisher: "Pub Co", publisherIpi: "00087654321" };
const identity = (over: Partial<RegistrationIdentityRow> = {}): RegistrationIdentityRow => ({
  legal_name: "Fictional Rights Ltd", trading_name: null, contact_name: "Ann Admin", contact_email: "ann@example.test",
  contact_phone: null, address_street: "1 Test St", address_city: "Port of Spain", address_country: "TT", address_postal_code: null,
  signatory_name: "Ann Admin", signatory_title: "Director", updated_at: "2026-02-01T00:00:00.000Z", ...over,
});

describe("URP: publisher IPI and submitting party", () => {
  it("A. publisher_ipi maps from Split Sheets writer.publisherIpi", () => {
    expect(buildUrp("work_1", catalog, splits(writer)).writers[0].publisher_ipi).toBe("00087654321");
  });
  it("B. missing publisher_ipi is null", () => {
    const { publisherIpi: _, ...w } = writer;
    expect(buildUrp("work_1", catalog, splits(w)).writers[0].publisher_ipi).toBeNull();
  });
  it("C. submitting_party enters the URP with onesuite_admin provenance", () => {
    const urp = buildUrp("work_1", catalog, splits(writer), identity());
    expect(urp.submitting_party).toEqual({
      legal_name: "Fictional Rights Ltd", trading_name: null, contact_name: "Ann Admin", contact_email: "ann@example.test", contact_phone: null,
      address: { street: "1 Test St", city: "Port of Spain", country: "TT", postal_code: null },
      signatory: { name: "Ann Admin", title: "Director" }, identity_updated_at: "2026-02-01T00:00:00.000Z",
    });
    expect(urp.provenance).toContainEqual({ path: "submitting_party", source_app: "onesuite_admin", snapshot_id: null });
  });
  it("D. identity cannot overwrite Catalog fields", () => {
    const hostile = { ...identity(), title: "Hijack", work: { title: "Hijack" }, recordings: [{ x: 1 }], releases: [{ y: 1 }] } as unknown as RegistrationIdentityRow;
    const a = buildUrp("work_1", catalog, splits(writer));
    const b = buildUrp("work_1", catalog, splits(writer), hostile);
    expect(b.work).toEqual(a.work);
    expect(b.recordings).toEqual(a.recordings);
    expect(b.releases).toEqual(a.releases);
    expect(b.work.title).toBe("Catalog Title");
  });
  it("E. identity cannot overwrite Split ownership fields", () => {
    const hostile = { ...identity(), writers: [], ownership_revision: "99", ownership_validated_at: null } as unknown as RegistrationIdentityRow;
    const a = buildUrp("work_1", catalog, splits(writer));
    const b = buildUrp("work_1", catalog, splits(writer), hostile);
    expect(b.writers).toEqual(a.writers);
    expect(b.source_refs).toEqual(a.source_refs);
    expect(b.source_refs.ownership_revision).toBe("9");
  });
  it("F. missing or incomplete identity blocks with missing_registration_identity", () => {
    const code = (id: RegistrationIdentityRow | null) =>
      validateUrp(buildUrp("work_1", catalog, splits(writer), id)).find((i) => i.code === "missing_registration_identity");
    expect(code(null)?.severity).toBe("blocking");
    expect(code(identity({ signatory_title: "  " }))?.severity).toBe("blocking");
    expect(code(identity())).toBeUndefined();
  });
  it("G. identity change makes an existing profile stale; unchanged does not", () => {
    const urp = buildUrp("work_1", catalog, splits(writer), identity());
    const profile = { catalog_snapshot_id: "cat-1", splits_snapshot_id: "spl-9", urp };
    const latest = { catalog: "cat-1", splits: "spl-9" };
    expect(isStale(profile, { ...latest, identityUpdatedAt: "2026-02-01T00:00:00+00:00" })).toBe(false);
    expect(isStale(profile, { ...latest, identityUpdatedAt: "2026-03-01T00:00:00Z" })).toBe(true);
    const noId = { ...profile, urp: buildUrp("work_1", catalog, splits(writer)) };
    expect(isStale(noId, { ...latest, identityUpdatedAt: "2026-02-01T00:00:00Z" })).toBe(true);
  });
  it("L. the built (persisted) URP carries the identity as an immutable copy", () => {
    const row = identity();
    const urp = buildUrp("work_1", catalog, splits(writer), row);
    const persisted = JSON.parse(JSON.stringify(urp));
    row.legal_name = "Changed Later";
    expect(persisted.submitting_party.legal_name).toBe("Fictional Rights Ltd");
    expect(urp.submitting_party?.legal_name).toBe("Fictional Rights Ltd");
  });
});

/** In-memory identity store keyed by workspace. */
function store() {
  const rows = new Map<string, IdentityInputParsed & { workspace_id: string }>();
  rows.set(WS_B, { workspace_id: WS_B, legal_name: "B Secret Ltd", trading_name: null, contact_name: "B", contact_email: "b@example.test", contact_phone: null, address_street: null, address_city: null, address_country: "US", address_postal_code: null, signatory_name: "B", signatory_title: "CEO" });
  return {
    rows,
    deps: {
      load: async (ws: string) => rows.get(ws) ?? null,
      save: async (ws: string, input: IdentityInputParsed) => { const r = { ...input, workspace_id: ws }; rows.set(ws, r); return r; },
    },
  };
}
const admin: IdentityCtx = { authorized: true, workspaceId: WS_A, canRead: true, canManageIdentity: true };
const staff: IdentityCtx = { ...admin, canManageIdentity: false };
const valid = { legal_name: " Fictional Rights Ltd ", contact_name: "Ann", contact_email: "ANN@Example.Test", address_country: "tt", signatory_name: "Ann", signatory_title: "Director" };

describe("Registration Identity: tenant isolation and authorization", () => {
  it("H. workspace A cannot read workspace B identity", async () => {
    const s = store();
    const r = await readIdentity(admin, s.deps);
    expect(r.identity).toBeNull();
    expect(await readIdentity({ ...admin, workspaceId: null }, s.deps)).toMatchObject({ allowed: false, identity: null });
  });
  it("I. workspace A cannot modify workspace B identity, even by supplying B's id", async () => {
    const s = store();
    await writeIdentity(admin, { ...valid, workspace_id: WS_B }, s.deps);
    expect(s.rows.get(WS_B)?.legal_name).toBe("B Secret Ltd");
    expect(s.rows.get(WS_A)?.workspace_id).toBe(WS_A);
  });
  it("J. unauthorized members cannot modify identity", async () => {
    const s = store();
    await expect(writeIdentity(staff, valid, s.deps)).rejects.toThrow(IDENTITY_DENIED);
    await expect(writeIdentity({ ...admin, authorized: false }, valid, s.deps)).rejects.toThrow(IDENTITY_DENIED);
    expect(s.rows.has(WS_A)).toBe(false);
    expect((await readIdentity(staff, s.deps)).canEdit).toBe(false);
  });
  it("K. an authorized administrator can create then update identity (normalized)", async () => {
    const s = store();
    await writeIdentity(admin, valid, s.deps);
    expect(s.rows.get(WS_A)).toMatchObject({ legal_name: "Fictional Rights Ltd", contact_email: "ann@example.test", address_country: "TT", trading_name: null });
    await writeIdentity(admin, { ...valid, signatory_title: "CEO" }, s.deps);
    expect(s.rows.get(WS_A)?.signatory_title).toBe("CEO");
    await expect(writeIdentity(admin, { ...valid, contact_email: "nope" }, s.deps)).rejects.toThrow();
  });
});
