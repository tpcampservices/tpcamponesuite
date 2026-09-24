import {
  CATALOG_RECORDING_FIELDS,
  CATALOG_RELEASE_FIELDS,
  CATALOG_UNSUPPORTED_FIELDS,
  CATALOG_WORK_FIELDS,
} from "./registration-feed.contract";

/**
 * Rights Registration Hub — pure, deterministic core (no I/O).
 *
 * Source precedence: Catalog snapshot supplies work/recording/release metadata;
 * the Split Sheets snapshot supplies approved composition ownership. The Hub never
 * edits either — it only assembles an immutable Universal Registration Profile.
 */

export type SourceSnapshot = {
  id: string;
  source_app: "catalog" | "splits";
  source_revision: string | null;
  ownership_revision: string | null;
  payload: Record<string, unknown>;
  received_at: string;
};

export type ValidationIssue = {
  code: string;
  severity: "blocking" | "warning";
  path: string;
  message: string;
};

export type FieldStatus = { path: string; status: "present" | "missing" | "unsupported"; note?: string };

const has = (o: Record<string, unknown>, k: string) => Object.prototype.hasOwnProperty.call(o, k);
const filled = (v: unknown) => v !== null && v !== undefined && !(typeof v === "string" && !v.trim()) && !(Array.isArray(v) && v.length === 0);

/** Distinguishes "Catalog has the field but it is empty" from "Catalog cannot supply it". */
export function catalogFieldStatus(payload: Record<string, unknown> | null): FieldStatus[] {
  if (!payload) return [];
  const out: FieldStatus[] = [];
  const check = (o: Record<string, unknown>, prefix: string, fields: readonly string[]) => {
    for (const f of fields)
      out.push({ path: `${prefix}${f}`, status: !has(o, f) ? "unsupported" : filled(o[f]) ? "present" : "missing" });
  };
  check(payload, "work.", CATALOG_WORK_FIELDS);
  const recs = Array.isArray(payload.recordings) ? (payload.recordings as Record<string, unknown>[]) : [];
  recs.forEach((r, i) => {
    check(r, `recordings[${i}].`, CATALOG_RECORDING_FIELDS);
    const rels = Array.isArray(r.releases) ? (r.releases as Record<string, unknown>[]) : [];
    rels.forEach((rel, j) => check(rel, `recordings[${i}].releases[${j}].`, CATALOG_RELEASE_FIELDS));
  });
  for (const u of CATALOG_UNSUPPORTED_FIELDS) out.push({ path: u.path, status: "unsupported", note: u.note });
  return out;
}

export type Urp = {
  schema_version: "1.0";
  source_refs: {
    work_uid: string;
    catalog_snapshot_id: string | null;
    splits_snapshot_id: string | null;
    catalog_revision: string | null;
    ownership_revision: string | null;
    ownership_validated_at: string | null;
  };
  work: {
    title: string | null;
    iswc: string | null;
    language: string | null;
    duration_seconds: number | null;
    alternate_titles: unknown[];
    genre: string | null;
    creation_date: string | null;
    copyright_date: string | null;
    copyright_owner: string | null;
    work_type: string | null;
    version_type: string | null;
    territory: string | null;
    work_code: string | null;
    publisher_reference: string | null;
  };
  /** Per Catalog field: value present, empty in Catalog, or not supplied by the source at all. */
  catalog_fields: FieldStatus[];
  recordings: unknown[];
  writers: {
    source_contributor_id: string | null;
    name: string | null;
    role: string | null;
    ipi: string | null;
    society: string | null;
    /** Ownership exactly as approved in Split Sheets, as a decimal string. */
    ownership_share: string | null;
    publisher: string | null;
  }[];
  provenance: { path: string; source_app: string; snapshot_id: string | null }[];
};

/** Canonical JSON: sorted keys, so identical content always fingerprints the same. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    return `{${Object.keys(obj)
      .sort()
      .filter((k) => obj[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Share as a fixed 4-decimal string; never rounds silently beyond that. */
export function shareString(v: unknown): string | null {
  const n = typeof v === "string" ? Number(v) : v;
  if (typeof n !== "number" || !Number.isFinite(n)) return null;
  return n.toFixed(4);
}

export function buildUrp(
  workUid: string,
  catalog: SourceSnapshot | null,
  splits: SourceSnapshot | null,
): Urp {
  const c = (catalog?.payload ?? {}) as Record<string, unknown>;
  const s = (splits?.payload ?? {}) as Record<string, unknown>;
  const writersRaw = Array.isArray(s.writers) ? (s.writers as Record<string, unknown>[]) : [];

  return {
    schema_version: "1.0",
    source_refs: {
      work_uid: workUid,
      catalog_snapshot_id: catalog?.id ?? null,
      splits_snapshot_id: splits?.id ?? null,
      catalog_revision: catalog?.source_revision ?? null,
      ownership_revision: splits?.ownership_revision ?? null,
      ownership_validated_at: str(s.ownership_validated_at),
    },
    work: {
      title: str(c.title),
      iswc: str(c.iswc),
      language: str(c.language),
      duration_seconds: num(c.duration_seconds),
      alternate_titles: Array.isArray(c.alternate_titles) ? c.alternate_titles : [],
      genre: str(c.genre),
      creation_date: str(c.creation_date),
      copyright_date: str(c.copyright_date),
      copyright_owner: str(c.copyright_owner),
      work_type: str(c.work_type),
      version_type: str(c.version_type),
      territory: str(c.territory),
      work_code: str(c.work_code),
      publisher_reference: str(c.publisher_reference),
    },
    catalog_fields: catalogFieldStatus(catalog ? c : null),
    recordings: Array.isArray(c.recordings) ? c.recordings : [],
    // Every contributor is kept; nothing is truncated or dropped here.
    writers: writersRaw.map((w) => ({
      source_contributor_id: str(w.id) ?? str(w.sourcePartyId),
      name: str(w.legalName) ?? str(w.name),
      role: str(w.role),
      ipi: str(w.ipiNumber),
      society: str(w.cmo) ?? str(w.society),
      ownership_share: shareString(w.sharePercent),
      publisher: str(w.publisher),
    })),
    provenance: [
      { path: "work", source_app: "catalog", snapshot_id: catalog?.id ?? null },
      { path: "recordings", source_app: "catalog", snapshot_id: catalog?.id ?? null },
      { path: "writers", source_app: "splits", snapshot_id: splits?.id ?? null },
    ],
  };
}

/** Common (destination-independent) validation, in plain language. */
export function validateUrp(urp: Urp): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const add = (i: ValidationIssue) => issues.push(i);

  if (!urp.source_refs.catalog_snapshot_id)
    add({ code: "no_catalog_source", severity: "blocking", path: "source_refs", message: "No Catalog details have been received for this work yet." });
  if (!urp.source_refs.splits_snapshot_id)
    add({ code: "no_splits_source", severity: "blocking", path: "source_refs", message: "No approved split sheet has been received for this work yet." });
  else if (!urp.source_refs.ownership_validated_at)
    add({ code: "ownership_not_validated", severity: "blocking", path: "source_refs", message: "The split sheet has not been validated and approved in Split Sheets." });
  if (!urp.work.title)
    add({ code: "missing_title", severity: "blocking", path: "work.title", message: "The work needs a title in Catalog." });
  if (urp.source_refs.splits_snapshot_id && urp.writers.length === 0)
    add({ code: "no_writers", severity: "blocking", path: "writers", message: "The split sheet lists no writers." });

  // Catalog readiness: empty values and unsupported fields are reported differently.
  const label = (p: string) => p.replace(/^work\./, "").replace(/_/g, " ");
  for (const f of urp.catalog_fields) {
    if (f.status === "missing" && /^work\.(iswc|language|genre|duration_seconds)$|\.isrc$/.test(f.path))
      add({ code: "catalog_value_missing", severity: "warning", path: f.path, message: `${label(f.path)} is empty in Catalog. Add it in Catalog if the society needs it.` });
    if (f.status === "unsupported" && !f.note)
      add({ code: "catalog_field_unsupported", severity: "warning", path: f.path, message: `Catalog did not send ${label(f.path)}. This Catalog version cannot supply it; it cannot be fixed by editing the work.` });
  }
  if (urp.source_refs.catalog_snapshot_id && urp.recordings.length === 0)
    add({ code: "no_recordings", severity: "warning", path: "recordings", message: "No recordings are linked to this work in Catalog." });

  let total = 0;
  urp.writers.forEach((w, i) => {
    if (!w.name)
      add({ code: "writer_name", severity: "blocking", path: `writers[${i}].name`, message: `Writer ${i + 1} has no name.` });
    if (w.ownership_share === null)
      add({ code: "writer_share", severity: "blocking", path: `writers[${i}].ownership_share`, message: `${w.name ?? `Writer ${i + 1}`} has no ownership share.` });
    else total += Math.round(Number(w.ownership_share) * 10000);
    if (!w.ipi)
      add({ code: "writer_ipi", severity: "warning", path: `writers[${i}].ipi`, message: `${w.name ?? `Writer ${i + 1}`} has no IPI number. Most societies require one.` });
  });
  if (urp.writers.length > 0 && total !== 100 * 10000)
    add({ code: "share_total", severity: "blocking", path: "writers", message: `Writer ownership adds up to ${(total / 10000).toFixed(2)}%, not 100%.` });

  // Registration-only rights are never inferred from ownership percentages.
  add({ code: "rights_not_declared", severity: "warning", path: "interests", message: "Performing, mechanical and collection shares must be declared separately before any society package can be produced." });
  return issues;
}

export function isStale(
  profile: { catalog_snapshot_id: string | null; splits_snapshot_id: string | null } | null,
  latest: { catalog: string | null; splits: string | null },
) {
  if (!profile) return false;
  return profile.catalog_snapshot_id !== latest.catalog || profile.splits_snapshot_id !== latest.splits;
}
