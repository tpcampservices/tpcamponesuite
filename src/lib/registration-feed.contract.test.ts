/**
 * Reusable contract tests. Source apps can copy this file together with
 * registration-feed.contract.ts, the two *.schema.json files and examples.ts,
 * and replace the examples with events produced by their own builder.
 */
import { describe, expect, it } from "vitest";
import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import catalogSchema from "../../docs/registration-feed/catalog.work.snapshot.v1.schema.json";
import splitsSchema from "../../docs/registration-feed/splits.composition.snapshot.v1.schema.json";
import { exampleCatalogEvent, exampleSplitsEvent } from "../../docs/registration-feed/examples";
import { CatalogFeedEventSchema, SplitsFeedEventSchema, FEED_RESPONSES, catalogRelationshipIssues } from "./registration-feed.contract";

const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
const vCatalog = ajv.compile(catalogSchema);
const vSplits = ajv.compile(splitsSchema);

const clone = <T>(v: T): any => JSON.parse(JSON.stringify(v));
const both = (json: (d: unknown) => boolean, zod: { safeParse: (d: unknown) => { success: boolean } }, d: unknown) => {
  const a = json(d);
  const b = zod.safeParse(d).success;
  expect(a).toBe(b); // JSON Schema and TypeScript contract must agree
  return a;
};

describe("Catalog feed contract v1.0", () => {
  it("accepts the example", () => expect(both(vCatalog, CatalogFeedEventSchema, exampleCatalogEvent)).toBe(true));
  it("accepts an event where every optional value is empty (null)", () => {
    const e = clone(exampleCatalogEvent);
    for (const k of Object.keys(e.payload)) if (!["title", "alternate_titles", "recordings", "releases"].includes(k)) e.payload[k] = null;
    e.payload.alternate_titles = [];
    e.payload.recordings = [];
    e.payload.releases = [];
    expect(both(vCatalog, CatalogFeedEventSchema, e)).toBe(true);
  });
  for (const f of ["event_id", "workspace_id", "work_uid", "source_record_id", "source_revision", "schema_version"]) {
    it(`rejects missing ${f}`, () => {
      const e = clone(exampleCatalogEvent);
      delete e[f];
      expect(both(vCatalog, CatalogFeedEventSchema, e)).toBe(false);
    });
  }
  // A stored field must always be sent (null when empty), so "empty" and "not supported" never look the same.
  for (const f of ["genre", "iswc", "creation_date", "copyright_owner", "work_code", "publisher_reference", "territory"]) {
    it(`rejects an event that omits work.${f} instead of sending null`, () => {
      const e = clone(exampleCatalogEvent);
      delete e.payload[f];
      expect(both(vCatalog, CatalogFeedEventSchema, e)).toBe(false);
    });
  }
  for (const f of ["studio", "recording_date", "label", "genre", "explicit"]) {
    it(`rejects a recording that omits ${f}`, () => {
      const e = clone(exampleCatalogEvent);
      delete e.payload.recordings[0][f];
      expect(both(vCatalog, CatalogFeedEventSchema, e)).toBe(false);
    });
  }
  for (const f of ["catalog_number", "upc", "cline"]) {
    it(`rejects a release that omits ${f}`, () => {
      const e = clone(exampleCatalogEvent);
      delete e.payload.releases[0][f];
      expect(both(vCatalog, CatalogFeedEventSchema, e)).toBe(false);
    });
  }
  it("carries genre, copyright and release position", () => {
    const p = CatalogFeedEventSchema.parse(exampleCatalogEvent).payload;
    expect(p.genre).toBe("Soca");
    expect(p.copyright_owner).toBe("Sample Music Publishing");
    expect(p.releases[0].catalog_number).toBe("SR-001");
    expect(p.recordings[0].release_links[0]).toEqual({ release_id: "cat-rel-3333", track_number: 1, disc_number: 1 });
  });
  it("rejects a wrong event type", () => {
    const e = clone(exampleCatalogEvent);
    e.event_type = "splits.composition.snapshot";
    expect(both(vCatalog, CatalogFeedEventSchema, e)).toBe(false);
  });
  it("rejects unknown fields (no silent extras)", () => {
    const e = clone(exampleCatalogEvent);
    e.payload.writers = [];
    expect(both(vCatalog, CatalogFeedEventSchema, e)).toBe(false);
  });
  it("rejects ownership or rights sent from Catalog", () => {
    for (const [where, key] of [["work", "ownership"], ["work", "performing_share"], ["rec", "mechanical_share"], ["rel", "sync_share"]]) {
      const e = clone(exampleCatalogEvent);
      const target = where === "work" ? e.payload : where === "rec" ? e.payload.recordings[0] : e.payload.releases[0];
      target[key] = 50;
      expect(both(vCatalog, CatalogFeedEventSchema, e)).toBe(false);
    }
  });
  it("rejects an alternate-title type Catalog cannot supply", () => {
    const e = clone(exampleCatalogEvent);
    e.payload.alternate_titles[0].type = "AT";
    expect(both(vCatalog, CatalogFeedEventSchema, e)).toBe(false);
  });
  it("keeps a malformed identifier as a string for the Hub to flag, but rejects bad dates and a non-uuid workspace", () => {
    const e = clone(exampleCatalogEvent);
    e.payload.recordings[0].isrc = "ZZ-X00-00-00001";
    expect(both(vCatalog, CatalogFeedEventSchema, e)).toBe(true);
    const c = clone(exampleCatalogEvent);
    for (const bad of ["15/01/2026", "2026-02-31", "2026-1-5", ""]) {
      c.payload.copyright_date = bad;
      expect(both(vCatalog, CatalogFeedEventSchema, c)).toBe(false);
    }
    const w = clone(exampleCatalogEvent);
    w.workspace_id = "my-workspace";
    expect(both(vCatalog, CatalogFeedEventSchema, w)).toBe(false);
  });
  it("rejects empty strings where null is required", () => {
    for (const [obj, key] of [["w", "genre"], ["w", "iswc"], ["w", "work_code"], ["r", "isrc"], ["r", "studio"], ["l", "upc"]] as const) {
      const e = clone(exampleCatalogEvent);
      const target = obj === "w" ? e.payload : obj === "r" ? e.payload.recordings[0] : e.payload.releases[0];
      target[key] = key === "isrc" || key === "upc" ? "  " : "";
      expect(both(vCatalog, CatalogFeedEventSchema, e)).toBe(false);
    }
  });
  it("keeps types: string ids, integer seconds, boolean explicit, integer positions", () => {
    const cases: [(e: any) => void][] = [
      [(e) => (e.payload.duration_seconds = "214")],
      [(e) => (e.payload.duration_seconds = 3.5)],
      [(e) => (e.payload.recordings[0].explicit = "false")],
      [(e) => (e.payload.recordings[0].explicit = null)],
      [(e) => (e.payload.recordings[0].release_links[0].track_number = "1")],
      [(e) => (e.payload.recordings[0].release_links[0].track_number = 0)],
      [(e) => (e.payload.releases[0].upc = 1)],
      [(e) => (e.payload.recordings[0].recording_id = 2222)],
      [(e) => (e.payload.alternate_titles = "Example Bay Sunrise")],
    ];
    for (const [mut] of cases) {
      const e = clone(exampleCatalogEvent);
      mut(e);
      expect(both(vCatalog, CatalogFeedEventSchema, e)).toBe(false);
    }
  });
  it("keeps leading zeros in identifiers", () => {
    expect(CatalogFeedEventSchema.parse(exampleCatalogEvent).payload.releases[0].upc).toBe("000000000001");
  });
  it("checks relationships: duplicates, unknown release links and orphan releases", () => {
    expect(catalogRelationshipIssues(CatalogFeedEventSchema.parse(exampleCatalogEvent).payload)).toEqual([]);
    const a = clone(exampleCatalogEvent);
    a.payload.recordings[0].release_links[0].release_id = "nope";
    expect(catalogRelationshipIssues(CatalogFeedEventSchema.parse(a).payload).map((i: any) => i.message).join()).toMatch(/not in payload.releases/);
    const b = clone(exampleCatalogEvent);
    b.payload.recordings.push(clone(b.payload.recordings[0]));
    b.payload.releases.push(clone(b.payload.releases[0]));
    const msgs = catalogRelationshipIssues(CatalogFeedEventSchema.parse(b).payload).map((i: any) => i.message);
    expect(msgs).toEqual(expect.arrayContaining(["Recording listed twice.", "Release listed twice."]));
    const c = clone(exampleCatalogEvent);
    c.payload.recordings[0].release_links = [];
    expect(catalogRelationshipIssues(CatalogFeedEventSchema.parse(c).payload)[0].message).toMatch(/not linked/);
  });
  it("shares one release across many recordings with different track positions", () => {
    const e = clone(exampleCatalogEvent);
    e.payload.recordings = Array.from({ length: 12 }, (_, i) => ({ ...e.payload.recordings[0], recording_id: `r${i}`, release_links: [{ release_id: "cat-rel-3333", track_number: i + 1, disc_number: 1 }] }));
    const p = CatalogFeedEventSchema.parse(e).payload;
    expect(catalogRelationshipIssues(p)).toEqual([]);
    expect(p.releases).toHaveLength(1);
  });
  it("rejects more recordings than the limit instead of truncating", () => {
    const e = clone(exampleCatalogEvent);
    e.payload.recordings = Array.from({ length: 501 }, (_, i) => ({ ...e.payload.recordings[0], recording_id: `r${i}` }));
    expect(both(vCatalog, CatalogFeedEventSchema, e)).toBe(false);
  });
  it("fits a 500-recording, 1000-release work inside the body limit", () => {
    const e = clone(exampleCatalogEvent);
    e.payload.releases = Array.from({ length: 1000 }, (_, i) => ({ ...e.payload.releases[0], release_id: `rel${i}` }));
    e.payload.recordings = Array.from({ length: 500 }, (_, i) => ({ ...e.payload.recordings[0], recording_id: `r${i}`, release_links: [{ release_id: `rel${i * 2}`, track_number: 1, disc_number: 1 }, { release_id: `rel${i * 2 + 1}`, track_number: 1, disc_number: 1 }] }));
    expect(both(vCatalog, CatalogFeedEventSchema, e)).toBe(true);
    expect(catalogRelationshipIssues(CatalogFeedEventSchema.parse(e).payload)).toEqual([]);
    expect(new TextEncoder().encode(JSON.stringify(e)).length).toBeLessThan(5_000_000);
  });
  it("carries every linked recording without truncation", () => {
    const e = clone(exampleCatalogEvent);
    e.payload.recordings = Array.from({ length: 120 }, (_, i) => ({ ...e.payload.recordings[0], recording_id: `r${i}` }));
    expect(both(vCatalog, CatalogFeedEventSchema, e)).toBe(true);
    expect(CatalogFeedEventSchema.parse(e).payload.recordings).toHaveLength(120);
  });
});

describe("Split Sheets feed contract v1.0", () => {
  it("accepts the example", () => expect(both(vSplits, SplitsFeedEventSchema, exampleSplitsEvent)).toBe(true));
  it("requires ownership_revision", () => {
    const e = clone(exampleSplitsEvent);
    delete e.ownership_revision;
    expect(both(vSplits, SplitsFeedEventSchema, e)).toBe(false);
  });
  it("requires ownership_validated_at to be present (null allowed)", () => {
    const e = clone(exampleSplitsEvent);
    e.payload.ownership_validated_at = null;
    expect(both(vSplits, SplitsFeedEventSchema, e)).toBe(true);
    delete e.payload.ownership_validated_at;
    expect(both(vSplits, SplitsFeedEventSchema, e)).toBe(false);
  });
  it("rejects shares outside 0–100 and writers without a name or id", () => {
    for (const patch of [{ sharePercent: 120 }, { legalName: "" }, { id: "" }]) {
      const e = clone(exampleSplitsEvent);
      Object.assign(e.payload.writers[0], patch);
      expect(both(vSplits, SplitsFeedEventSchema, e)).toBe(false);
    }
  });
  it("rejects performing/mechanical shares smuggled into the sheet", () => {
    const e = clone(exampleSplitsEvent);
    e.payload.writers[0].performingShare = 60;
    expect(both(vSplits, SplitsFeedEventSchema, e)).toBe(false);
  });
  it("carries a large writer list without truncation", () => {
    const e = clone(exampleSplitsEvent);
    e.payload.writers = Array.from({ length: 250 }, (_, i) => ({ id: `w${i}`, legalName: `Writer ${i}`, sharePercent: 0.4 }));
    expect(both(vSplits, SplitsFeedEventSchema, e)).toBe(true);
    expect(SplitsFeedEventSchema.parse(e).payload.writers).toHaveLength(250);
  });
});

describe("response table", () => {
  it("only server-side failures are retryable", () => {
    const retryable = Object.entries(FEED_RESPONSES).filter(([, v]) => v.retry).map(([k]) => k).sort();
    expect(retryable).toEqual(["server_error", "sso_key_not_configured"]);
  });
});
