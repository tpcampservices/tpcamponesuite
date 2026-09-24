import { describe, expect, it } from "vitest";
import { buildUrp, canonicalJson, isStale, validateUrp, type SourceSnapshot } from "./registration-core";

const cat: SourceSnapshot = { id: "c1", source_app: "catalog", source_revision: "7", ownership_revision: null, received_at: "", payload: { title: "Song", iswc: "T-1", title_extra: 1 } };
const spl = (writers: unknown[], validated = "2026-09-01"): SourceSnapshot => ({
  id: "s1", source_app: "splits", source_revision: "3", ownership_revision: "4", received_at: "",
  payload: { writers, ownership_validated_at: validated },
});

describe("registration core", () => {
  it("fingerprints identically regardless of key order", () => {
    expect(canonicalJson({ a: 1, b: { d: 2, c: 3 } })).toBe(canonicalJson({ b: { c: 3, d: 2 }, a: 1 }));
  });
  it("takes metadata from Catalog and ownership from Splits", () => {
    const u = buildUrp("W1", cat, spl([{ legalName: "A", sharePercent: 100, title: "ignored" }]));
    expect(u.work.title).toBe("Song");
    expect(u.writers[0].ownership_share).toBe("100.0000");
    expect(u.source_refs.ownership_revision).toBe("4");
  });
  it("keeps every contributor (no truncation)", () => {
    const ws = Array.from({ length: 40 }, (_, i) => ({ legalName: `W${i}`, sharePercent: 2.5 }));
    expect(buildUrp("W", cat, spl(ws)).writers).toHaveLength(40);
  });
  it("blocks when shares do not total 100", () => {
    const issues = validateUrp(buildUrp("W", cat, spl([{ legalName: "A", sharePercent: 60 }])));
    expect(issues.some((i) => i.code === "share_total" && i.severity === "blocking")).toBe(true);
  });
  it("blocks unvalidated ownership and missing sources", () => {
    expect(validateUrp(buildUrp("W", cat, spl([{ legalName: "A", sharePercent: 100 }], ""))).some((i) => i.code === "ownership_not_validated")).toBe(true);
    expect(validateUrp(buildUrp("W", null, null)).map((i) => i.code)).toEqual(expect.arrayContaining(["no_catalog_source", "no_splits_source"]));
  });
  it("never infers performing/mechanical rights from ownership", () => {
    const u = buildUrp("W", cat, spl([{ legalName: "A", sharePercent: 100 }]));
    expect(JSON.stringify(u)).not.toMatch(/pr_ownership|mr_ownership/);
    expect(validateUrp(u).some((i) => i.code === "rights_not_declared")).toBe(true);
  });
  it("detects stale profiles", () => {
    expect(isStale({ catalog_snapshot_id: "c1", splits_snapshot_id: "s1" }, { catalog: "c2", splits: "s1" })).toBe(true);
    expect(isStale({ catalog_snapshot_id: "c1", splits_snapshot_id: "s1" }, { catalog: "c1", splits: "s1" })).toBe(false);
  });
});
