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
import { CatalogFeedEventSchema, SplitsFeedEventSchema, FEED_RESPONSES } from "./registration-feed.contract";

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
    for (const k of Object.keys(e.payload)) if (!["title", "alternate_titles", "recordings"].includes(k)) e.payload[k] = null;
    e.payload.alternate_titles = [];
    e.payload.recordings = [];
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
  for (const f of ["catalog_number", "track_number", "disc_number", "upc"]) {
    it(`rejects a release that omits ${f}`, () => {
      const e = clone(exampleCatalogEvent);
      delete e.payload.recordings[0].releases[0][f];
      expect(both(vCatalog, CatalogFeedEventSchema, e)).toBe(false);
    });
  }
  it("carries genre, copyright and release position", () => {
    const p = CatalogFeedEventSchema.parse(exampleCatalogEvent).payload;
    expect(p.genre).toBe("Soca");
    expect(p.copyright_owner).toBe("Sample Music Publishing");
    expect(p.recordings[0].releases[0]).toMatchObject({ catalog_number: "SR-001", track_number: 1, disc_number: 1 });
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
      const target = where === "work" ? e.payload : where === "rec" ? e.payload.recordings[0] : e.payload.recordings[0].releases[0];
      target[key] = 50;
      expect(both(vCatalog, CatalogFeedEventSchema, e)).toBe(false);
    }
  });
  it("rejects an alternate-title type Catalog cannot supply", () => {
    const e = clone(exampleCatalogEvent);
    e.payload.alternate_titles[0].type = "AT";
    expect(both(vCatalog, CatalogFeedEventSchema, e)).toBe(false);
  });
  it("rejects a malformed ISRC, bad date and non-uuid workspace", () => {
    const e = clone(exampleCatalogEvent);
    e.payload.recordings[0].isrc = "ZZ-X00-00-00001";
    expect(both(vCatalog, CatalogFeedEventSchema, e)).toBe(false);
    const c = clone(exampleCatalogEvent);
    c.payload.copyright_date = "15/01/2026";
    expect(both(vCatalog, CatalogFeedEventSchema, c)).toBe(false);
    const w = clone(exampleCatalogEvent);
    w.workspace_id = "my-workspace";
    expect(both(vCatalog, CatalogFeedEventSchema, w)).toBe(false);
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
