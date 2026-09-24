import {
  CATALOG_RECORDING_FIELDS,
  CATALOG_RELEASE_FIELDS,
  CATALOG_RELEASE_LINK_FIELDS,
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
  /** Catalog works.id / Splits sheet id. */
  source_entity_id?: string | null;
};

export type ValidationIssue = {
  code: string;
  severity: "blocking" | "warning";
  path: string;
  message: string;
};

export type FieldStatus = {
  path: string;
  status: "present" | "missing" | "invalid" | "unsupported";
  spec?: string;
  note?: string;
};

const has = (o: Record<string, unknown>, k: string) => Object.prototype.hasOwnProperty.call(o, k);
const filled = (v: unknown) => v !== null && v !== undefined && !(typeof v === "string" && !v.trim()) && !(Array.isArray(v) && v.length === 0);

// ---- identifier canonicalisation (universal values; destinations format for display)

/** ISWC → canonical "T" + 10 digits, or null if not a valid ISWC (check digit verified). */
export function canonicalIswc(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const m = /^T-?(\d{3})\.?(\d{3})\.?(\d{3})-?(\d)$/.exec(v.trim().toUpperCase());
  if (!m) return null;
  const digits = (m[1] + m[2] + m[3]).split("").map(Number);
  const sum = 1 + digits.reduce((acc, d, i) => acc + d * (i + 1), 0);
  const check = (10 - (sum % 10)) % 10;
  return check === Number(m[4]) ? `T${m[1]}${m[2]}${m[3]}${m[4]}` : null;
}
/** ISRC → 12 uppercase characters without separators, or null if malformed. */
export function canonicalIsrc(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.replace(/[-\s]/g, "").toUpperCase();
  return /^[A-Z]{2}[A-Z0-9]{3}\d{7}$/.test(t) ? t : null;
}
/** UPC/EAN → 12 or 13 digits, or null if malformed. Leading zeros are kept (string). */
export function canonicalUpc(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.replace(/[-\s]/g, "");
  return /^\d{12,13}$/.test(t) ? t : null;
}
const VALIDATORS: Record<string, (v: unknown) => string | null> = { iswc: canonicalIswc, isrc: canonicalIsrc, upc: canonicalUpc };

/** Present / missing (null) / invalid (stored but malformed) / unsupported (Catalog cannot supply). */
export function catalogFieldStatus(payload: Record<string, unknown> | null): FieldStatus[] {
  if (!payload) return [];
  const out: FieldStatus[] = [];
  const check = (o: Record<string, unknown>, prefix: string, fields: readonly string[]) => {
    for (const f of fields) {
      if (!has(o, f)) { out.push({ path: `${prefix}${f}`, status: "unsupported" }); continue; }
      if (!filled(o[f])) { out.push({ path: `${prefix}${f}`, status: "missing" }); continue; }
      const v = VALIDATORS[f];
      out.push({ path: `${prefix}${f}`, status: v && v(o[f]) === null ? "invalid" : "present" });
    }
  };
  check(payload, "work.", CATALOG_WORK_FIELDS);
  const recs = Array.isArray(payload.recordings) ? (payload.recordings as Record<string, unknown>[]) : [];
  recs.forEach((r, i) => {
    check(r, `recordings[${i}].`, CATALOG_RECORDING_FIELDS);
    const links = Array.isArray(r.release_links) ? (r.release_links as Record<string, unknown>[]) : [];
    links.forEach((l, j) => check(l, `recordings[${i}].release_links[${j}].`, CATALOG_RELEASE_LINK_FIELDS));
  });
  const rels = Array.isArray(payload.releases) ? (payload.releases as Record<string, unknown>[]) : [];
  rels.forEach((rel, j) => check(rel, `releases[${j}].`, CATALOG_RELEASE_FIELDS));
  for (const u of CATALOG_UNSUPPORTED_FIELDS) out.push({ path: u.path, status: "unsupported", spec: u.spec, note: u.note });
  return out;
}

export type Urp = {
  schema_version: "1.0";
  source_refs: {
    work_uid: string;
    catalog_work_id: string | null;
    catalog_snapshot_id: string | null;
    splits_snapshot_id: string | null;
    catalog_revision: string | null;
    ownership_revision: string | null;
    ownership_validated_at: string | null;
  };
  work: {
    title: string | null;
    /** Structured alternate titles; type/language are unsupported by Catalog (null). */
    alternate_titles: { title: string; type: null; language: null }[];
    /** Canonical "T" + 10 digits; null when missing or invalid. */
    iswc: string | null;
    language: string | null;
    genre: string | null;
    duration_seconds: number | null;
    creation_date: string | null;
    copyright_date: string | null;
    /** Information only; ownership comes from interested parties (Splits). */
    copyright_owner: string | null;
    work_type: string | null;
    version_type: string | null;
    /** Catalog's descriptive territory. Not a rights, collection or agreement territory. */
    catalog_territory: string | null;
    /** From works.work_code (spec F10). */
    internal_code: string | null;
    publisher_reference: string | null;
    /** Registration first-release date is confirmed in the Hub (F11); never derived here. */
    first_release_date: null;
  };
  /** Hub selection (F12); never the earliest or title-matched recording. */
  selected_recording_id: null;
  recordings: Record<string, unknown>[];
  releases: Record<string, unknown>[];
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
      catalog_work_id: catalog?.source_entity_id ?? null,
      catalog_snapshot_id: catalog?.id ?? null,
      splits_snapshot_id: splits?.id ?? null,
      catalog_revision: catalog?.source_revision ?? null,
      ownership_revision: splits?.ownership_revision ?? null,
      ownership_validated_at: str(s.ownership_validated_at),
    },
    work: {
      title: str(c.title),
      alternate_titles: (Array.isArray(c.alternate_titles) ? (c.alternate_titles as Record<string, unknown>[]) : [])
        .map((a) => str(a?.title))
        .filter((t): t is string => !!t)
        .map((title) => ({ title, type: null, language: null })),
      iswc: canonicalIswc(c.iswc),
      language: str(c.language),
      genre: str(c.genre),
      duration_seconds: num(c.duration_seconds),
      creation_date: str(c.creation_date),
      copyright_date: str(c.copyright_date),
      copyright_owner: str(c.copyright_owner),
      work_type: str(c.work_type),
      version_type: str(c.version_type),
      catalog_territory: str(c.territory),
      internal_code: str(c.work_code),
      publisher_reference: str(c.publisher_reference),
      first_release_date: null,
    },
    selected_recording_id: null,
    recordings: (Array.isArray(c.recordings) ? (c.recordings as Record<string, unknown>[]) : []).map((r) => ({
      ...r,
      isrc: canonicalIsrc(r.isrc),
      // Catalog stores one credit text; kept as a display credit, not a structured party.
      artists: str(r.artist) ? [{ display_name: str(r.artist), party_type: null }] : [],
    })),
    releases: (Array.isArray(c.releases) ? (c.releases as Record<string, unknown>[]) : []).map((r) => ({ ...r, upc: canonicalUpc(r.upc) })),
    catalog_fields: catalogFieldStatus(catalog ? c : null),
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
      { path: "releases", source_app: "catalog", snapshot_id: catalog?.id ?? null },
      { path: "work.first_release_date", source_app: "hub", snapshot_id: null },
      { path: "selected_recording_id", source_app: "hub", snapshot_id: null },
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

  // Catalog readiness: missing, invalid and unsupported are reported differently.
  const label = (p: string) => p.replace(/^work\./, "").replace(/_/g, " ");
  for (const f of urp.catalog_fields) {
    if (f.status === "invalid")
      add({ code: "catalog_value_invalid", severity: "blocking", path: f.path, message: `${label(f.path)} in Catalog is not in a valid format. Correct it in Catalog.` });
    else if (f.status === "missing" && /^work\.(iswc|language|genre|duration_seconds)$|\.isrc$/.test(f.path))
      add({ code: "catalog_value_missing", severity: "warning", path: f.path, message: `${label(f.path)} is empty in Catalog. Add it in Catalog if the society needs it.` });
    else if (f.status === "unsupported" && !f.note)
      add({ code: "catalog_field_unsupported", severity: "warning", path: f.path, message: `Catalog did not send ${label(f.path)}. This Catalog version cannot supply it; it cannot be fixed by editing the work.` });
  }
  if (urp.recordings.length > 1 && !urp.selected_recording_id)
    add({ code: "primary_recording_unselected", severity: "warning", path: "selected_recording_id", message: "This work has several recordings. Choose the registration recording in the Hub before packaging." });
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
