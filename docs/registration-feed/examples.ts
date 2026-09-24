// Fictional data only. No real people, works, workspaces or identifiers.
export const exampleCatalogEvent = {
  schema_version: "1.0",
  event_type: "catalog.work.snapshot",
  event_id: "cat-evt-0001",
  occurred_at: "2026-09-24T12:00:00Z",
  workspace_id: "00000000-0000-4000-8000-000000000001",
  work_uid: "wrk_example_sunrise_0001",
  source_record_id: "cat-work-1111",
  source_revision: "cat-rev-7",
  payload: {
    title: "Sunrise Over Example Bay",
    iswc: "T-000.000.001-0",
    language: "EN",
    duration_seconds: 214,
    alternate_titles: [{ title: "Example Bay Sunrise", type: "AT" }],
    recordings: [
      {
        recording_id: "cat-rec-2222",
        recording_uid: "rec_example_0001",
        isrc: "ZZX000000001",
        title: "Sunrise Over Example Bay",
        artist: "The Fictional Band",
        duration_seconds: 214,
        release_date: "2026-01-15",
        primary: true,
        releases: [
          { release_id: "cat-rel-3333", upc: "000000000001", title: "Example EP", release_date: "2026-01-15", label: "Sample Records" },
        ],
      },
    ],
  },
} as const;

export const exampleSplitsEvent = {
  schema_version: "1.0",
  event_type: "splits.composition.snapshot",
  event_id: "spl-evt-0001",
  occurred_at: "2026-09-24T12:05:00Z",
  workspace_id: "00000000-0000-4000-8000-000000000001",
  work_uid: "wrk_example_sunrise_0001",
  source_record_id: "spl-sheet-4444",
  source_revision: "spl-rev-3",
  ownership_revision: "own-rev-2",
  payload: {
    sheet_type: "composition",
    ownership_validated_at: "2026-09-20T09:00:00Z",
    writers: [
      { id: "spl-c-1", legalName: "Alex Example", role: "CA", ipiNumber: "00000000001", cmo: "COTT", sharePercent: 60 },
      { id: "spl-c-2", legalName: "Jordan Sample", role: "C", ipiNumber: null, cmo: null, publisher: "Sample Music Publishing", sharePercent: 40 },
    ],
  },
} as const;
