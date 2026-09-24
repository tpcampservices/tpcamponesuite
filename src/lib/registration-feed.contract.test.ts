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
  it("accepts a minimal event", () => {
    const e = clone(exampleCatalogEvent);
    e.payload = { title: "Only Title" };
    expect(both(vCatalog, CatalogFeedEventSchema, e)).toBe(true);
  });
  for (const f of ["event_id", "workspace_id", "work_uid", "source_record_id", "source_revision", "schema_version"]) {
    it(`rejects missing ${f}`, () => {
      const e = clone(exampleCatalogEvent);
      delete e[f];
      expect(both(vCatalog, CatalogFeedEventSchema, e)).toBe(false);
    });
  }
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
  it("rejects a malformed ISRC and non-uuid workspace", () => {
    const e = clone(exampleCatalogEvent);
    e.payload.recordings[0].isrc = "ZZ-X00-00-00001";
    expect(both(vCatalog, CatalogFeedEventSchema, e)).toBe(false);
    const w = clone(exampleCatalogEvent);
    w.workspace_id = "my-workspace";
    expect(both(vCatalog, CatalogFeedEventSchema, w)).toBe(false);
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
