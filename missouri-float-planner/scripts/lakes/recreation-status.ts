/**
 * USACE recreation-area status: source normalization, the observation ledger,
 * and the per-project freshness classification.
 *
 * Source-only. Nothing here decides that a ramp is usable; it records what the
 * Corps publishes, when the Corps says it published it, and when Eddy saw it.
 * See docs/LAKES_AND_LAUNCHES_PLAN_2026-11-09.md §3 (three timestamps) and §5.
 *
 * ── WHICH LAYER, AND WHY ───────────────────────────────────────────────────
 * Two layers publish the same 4,8xx recreation-area entrances:
 *
 *   Recreation/Recreation_Site/FeatureServer/0      public view, NO dates
 *   Hosted/RecreationSite_Status_gdb/FeatureServer/0 edited source, date_updated
 *
 * Measured 2026-11-09: every area with a status in the hosted layer carries a
 * `date_updated` (2,623 of 2,623), the two layers disagree on the boat status
 * of 257 areas, and 210 entrances sit more than 50 m apart between them (one by
 * 1,100 km). The hosted layer is the one with provenance, so it is the one Eddy
 * records. The public layer is kept only as a cross-check.
 *
 * ── THE THREE TIMESTAMPS ───────────────────────────────────────────────────
 * source_updated_at  the Corps' own `date_updated`; the only date a reader may
 *                    be shown as the agency's.
 * first_observed_at  when Eddy first saw this exact status value for the area.
 * last_checked_at    when Eddy last retrieved the record successfully.
 *
 * Nothing derives currency from how long a value has stayed the same. An area
 * listed "Open" since 2022 is dated 2022, however many times Eddy reads it.
 */

export const USACE_RECREATION_STATUS_SOURCE = {
  url: 'https://geospatial.sec.usace.army.mil/server/rest/services/Hosted/RecreationSite_Status_gdb/FeatureServer/0',
  objectId: 'objectid',
  /** Field allowlist: identity, place, launch facilities, status, provenance. Visit counts and parking stay out. */
  fields: [
    'objectid', 'district', 'recprojectsitename', 'recprojectsiteid', 'recreationboundaryidpk', 'recprojectsiteareaid',
    'recprojectsiteareaname', 'primaryareasubtype', 'managingagency',
    'psa_entrance_xy_fy20_entrancelat', 'psa_entrance_xy_fy20_entrancelong',
    'boat_ramp', 'launch_lanes', 'manmade_canoe_kayak_launch',
    'status', 'camp', 'boat', 'beach', 'storm_damage', 'notes', 'date_updated',
  ].join(','),
} as const;

export interface StatusFeature {
  attributes: Record<string, unknown>;
  geometry?: { x?: number; y?: number } | null;
}

export interface StatusSnapshot {
  url: string;
  retrieved_at: string;
  count: number;
  features: StatusFeature[];
}

/** The Corps' vocabulary, kept distinct. `partial` renders as "Limited access", never as open or closed. */
export type ReportedStatus = 'open' | 'partial' | 'closed' | 'seasonal_closure' | 'unknown';

export interface AreaRecord {
  area_id: string;
  project: string;
  district: string | null;
  name: string;
  subtype: string | null;
  managing_agency: string | null;
  /** The area ENTRANCE. Never a launch pin (plan §5). */
  entrance: { lon: number; lat: number } | null;
  boat_ramps: number | null;
  launch_lanes: number | null;
  canoe_kayak_launches: number | null;
  area_status: ReportedStatus | null;
  boat_status: ReportedStatus | null;
  camp_status: ReportedStatus | null;
  beach_status: ReportedStatus | null;
  storm_damage: string | null;
  notes: string | null;
  /** Dates the note itself states, ISO `YYYY-MM-DD`, oldest first. */
  note_dates: string[];
  /** True when the note's own latest date is before the day it was retrieved. */
  stale_note: boolean;
  source_updated_at: string | null;
}

const STATUS_FIELDS = ['area_status', 'boat_status', 'camp_status', 'beach_status', 'notes', 'source_updated_at'] as const;
type TrackedField = (typeof STATUS_FIELDS)[number];

export interface LedgerChange {
  at: string;
  field: TrackedField;
  from: string | null;
  to: string | null;
  source_updated_at: string | null;
}

export interface LedgerEntry {
  record: AreaRecord;
  first_observed_at: string;
  last_checked_at: string;
  /** Set when a run no longer returned the area; cleared if it returns. */
  missing_since: string | null;
  changes: LedgerChange[];
}

export interface Ledger {
  source: string;
  started_at: string;
  last_recorded_at: string;
  runs: number;
  areas: Record<string, LedgerEntry>;
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function count(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return Math.trunc(value);
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) return Number(value.trim());
  return null;
}

export function reportedStatus(value: unknown): ReportedStatus | null {
  const v = text(value)?.toLowerCase();
  if (!v) return null;
  if (v === 'open') return 'open';
  if (v === 'partial') return 'partial';
  if (v === 'closed') return 'closed';
  if (v === 'seasonal closure') return 'seasonal_closure';
  if (v === 'status unknown') return 'unknown';
  throw new Error(`Unrecognized status value: ${String(value)}`);
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

/**
 * Dates a free-text note states, so a note that says "until 1 March 2022" can
 * mark itself stale without a human reading it. Deliberately conservative:
 * a bare year or a month without a year is not a date.
 */
export function parseNoteDates(note: string | null): string[] {
  if (!note) return [];
  const found = new Set<string>();
  const push = (y: number, m: number, d: number) => {
    if (y < 100) y += 2000;
    if (y < 2000 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return;
    found.add(`${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
  };
  for (const m of note.matchAll(/\b(\d{1,2})[/-](\d{1,2})[/-](\d{2}|\d{4})\b/g)) {
    push(Number(m[3]), Number(m[1]), Number(m[2]));
  }
  const mon = '(jan|feb|mar|apr|may|jun|jul|aug|sept?|oct|nov|dec)[a-z]*\\.?';
  for (const m of note.matchAll(new RegExp(`\\b(\\d{1,2})\\s+${mon},?\\s+(\\d{4})\\b`, 'gi'))) {
    push(Number(m[3]), MONTHS[m[2].toLowerCase()], Number(m[1]));
  }
  for (const m of note.matchAll(new RegExp(`\\b${mon}\\s+(\\d{1,2}),?\\s+(\\d{4})\\b`, 'gi'))) {
    push(Number(m[3]), MONTHS[m[1].toLowerCase()], Number(m[2]));
  }
  return [...found].sort();
}

function isoDate(value: unknown, retrievedAt: string, label: string): string | null {
  if (value == null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${label}: date is not an epoch number`);
  if (value > Date.parse(retrievedAt)) throw new Error(`${label}: source date is after retrieval`);
  return new Date(value).toISOString();
}

/** Every area in a COMPLETE snapshot, or a thrown error. A partial read never becomes a ledger run. */
export function normalizeStatusSnapshot(snapshot: StatusSnapshot): AreaRecord[] {
  if (snapshot.url !== USACE_RECREATION_STATUS_SOURCE.url) throw new Error('Unrecognized recreation status source');
  if (!Number.isFinite(Date.parse(snapshot.retrieved_at))) throw new Error('Invalid retrieval time');
  if (!Array.isArray(snapshot.features) || snapshot.features.length !== snapshot.count || snapshot.count === 0) {
    throw new Error('Incomplete or empty recreation status snapshot');
  }
  const retrievedDay = snapshot.retrieved_at.slice(0, 10);
  const seen = new Set<string>();
  return snapshot.features.map((feature) => {
    const a = feature.attributes;
    // 19 of 4,854 areas (2026-11-09) carry an empty `recreationboundaryidpk` but
    // the same number in `recprojectsiteareaid`, which equals it everywhere else.
    const areaId = text(a.recreationboundaryidpk)
      ?? (typeof a.recprojectsiteareaid === 'number' && Number.isSafeInteger(a.recprojectsiteareaid) ? String(a.recprojectsiteareaid) : null);
    const project = text(a.recprojectsitename);
    const name = text(a.recprojectsiteareaname);
    if (!areaId || !project || !name) throw new Error(`Area ${String(a.objectid)}: missing identity`);
    if (seen.has(areaId)) throw new Error(`Duplicate area identity: ${areaId}`);
    seen.add(areaId);
    const x = feature.geometry?.x ?? (typeof a.psa_entrance_xy_fy20_entrancelong === 'number' ? a.psa_entrance_xy_fy20_entrancelong : null);
    const y = feature.geometry?.y ?? (typeof a.psa_entrance_xy_fy20_entrancelat === 'number' ? a.psa_entrance_xy_fy20_entrancelat : null);
    const entrance = typeof x === 'number' && typeof y === 'number' && x >= -180 && x <= 180 && y >= -90 && y <= 90 && (x !== 0 || y !== 0)
      ? { lon: x, lat: y }
      : null;
    const notes = text(a.notes);
    const noteDates = parseNoteDates(notes);
    const label = `${project} / ${name}`;
    return {
      area_id: areaId,
      project,
      district: text(a.district),
      name,
      subtype: text(a.primaryareasubtype),
      managing_agency: text(a.managingagency),
      entrance,
      boat_ramps: count(a.boat_ramp),
      launch_lanes: count(a.launch_lanes),
      canoe_kayak_launches: count(a.manmade_canoe_kayak_launch),
      area_status: reportedStatus(a.status),
      boat_status: reportedStatus(a.boat),
      camp_status: reportedStatus(a.camp),
      beach_status: reportedStatus(a.beach),
      storm_damage: text(a.storm_damage),
      notes,
      note_dates: noteDates,
      stale_note: noteDates.length > 0 && noteDates[noteDates.length - 1] < retrievedDay,
      source_updated_at: isoDate(a.date_updated, snapshot.retrieved_at, label),
    };
  });
}

export function emptyLedger(startedAt: string): Ledger {
  return { source: USACE_RECREATION_STATUS_SOURCE.url, started_at: startedAt, last_recorded_at: startedAt, runs: 0, areas: {} };
}

export interface MergeOutcome {
  ledger: Ledger;
  added: number;
  changed: number;
  missing: number;
}

/**
 * Fold one complete snapshot into the ledger. `first_observed_at` moves only
 * when a tracked field changes; `last_checked_at` moves every run.
 */
export function mergeLedger(previous: Ledger | null, records: AreaRecord[], retrievedAt: string): MergeOutcome {
  const ledger: Ledger = previous
    ? { ...previous, areas: { ...previous.areas } }
    : emptyLedger(retrievedAt);
  if (ledger.source !== USACE_RECREATION_STATUS_SOURCE.url) throw new Error('Ledger belongs to a different source');
  if (Date.parse(retrievedAt) < Date.parse(ledger.last_recorded_at)) throw new Error('Snapshot is older than the ledger');
  let added = 0;
  let changed = 0;
  const seen = new Set<string>();
  for (const record of records) {
    seen.add(record.area_id);
    const entry = ledger.areas[record.area_id];
    if (!entry) {
      ledger.areas[record.area_id] = { record, first_observed_at: retrievedAt, last_checked_at: retrievedAt, missing_since: null, changes: [] };
      added += 1;
      continue;
    }
    const changes: LedgerChange[] = [];
    for (const field of STATUS_FIELDS) {
      const from = entry.record[field] ?? null;
      const to = record[field] ?? null;
      if (from !== to) changes.push({ at: retrievedAt, field, from, to, source_updated_at: record.source_updated_at });
    }
    if (changes.length) changed += 1;
    ledger.areas[record.area_id] = {
      record,
      first_observed_at: changes.length ? retrievedAt : entry.first_observed_at,
      last_checked_at: retrievedAt,
      missing_since: null,
      changes: [...entry.changes, ...changes],
    };
  }
  let missing = 0;
  for (const [id, entry] of Object.entries(ledger.areas)) {
    if (seen.has(id)) continue;
    missing += 1;
    if (!entry.missing_since) ledger.areas[id] = { ...entry, missing_since: retrievedAt };
  }
  ledger.runs += 1;
  ledger.last_recorded_at = retrievedAt;
  return { ledger, added, changed, missing };
}

/**
 * How a project maintains its status fields. The class is a summary; the
 * report always prints the newest source date beside it, which is the evidence.
 *
 *   maintained    newest date_updated within MAINTAINED_DAYS, or Eddy has seen a
 *                 status change in its own recording window
 *   static        dated statuses exist but the newest is older than that
 *   stale         the newest date is over a year old, or every dated note is in
 *                 the past and nothing newer exists
 *   unmaintained  no area carries a status at all
 */
export type ProjectClass = 'maintained' | 'static' | 'stale' | 'unmaintained';

export const MAINTAINED_DAYS = 120;
export const STALE_DAYS = 365;

export interface ProjectSummary {
  project: string;
  district: string | null;
  areas: number;
  with_status: number;
  with_boat_status: number;
  dated: number;
  newest_source_update: string | null;
  oldest_source_update: string | null;
  boat_ramp_areas: number;
  launch_lanes: number;
  canoe_kayak_launch_areas: number;
  stale_notes: number;
  changes_observed: number;
  class: ProjectClass;
}

export function classifyProjects(ledger: Ledger, now: string): ProjectSummary[] {
  const nowMs = Date.parse(now);
  const byProject = new Map<string, LedgerEntry[]>();
  for (const entry of Object.values(ledger.areas)) {
    if (entry.missing_since) continue;
    const list = byProject.get(entry.record.project) ?? [];
    list.push(entry);
    byProject.set(entry.record.project, list);
  }
  const summaries: ProjectSummary[] = [];
  for (const [project, entries] of byProject) {
    const dates = entries.map((e) => e.record.source_updated_at).filter((d): d is string => Boolean(d)).sort();
    const newest = dates.length ? dates[dates.length - 1] : null;
    const withStatus = entries.filter((e) => e.record.area_status || e.record.boat_status).length;
    const staleNotes = entries.filter((e) => e.record.stale_note).length;
    const changes = entries.reduce((n, e) => n + e.changes.length, 0);
    let cls: ProjectClass;
    const ageDays = newest ? (nowMs - Date.parse(newest)) / 86_400_000 : null;
    if (withStatus === 0) cls = 'unmaintained';
    else if (changes > 0 || (ageDays !== null && ageDays <= MAINTAINED_DAYS)) cls = 'maintained';
    else if (ageDays === null || ageDays > STALE_DAYS || staleNotes === withStatus) cls = 'stale';
    else cls = 'static';
    summaries.push({
      project,
      district: entries[0].record.district,
      areas: entries.length,
      with_status: withStatus,
      with_boat_status: entries.filter((e) => e.record.boat_status).length,
      dated: dates.length,
      newest_source_update: newest,
      oldest_source_update: dates[0] ?? null,
      boat_ramp_areas: entries.filter((e) => (e.record.boat_ramps ?? 0) > 0).length,
      launch_lanes: entries.reduce((n, e) => n + (e.record.launch_lanes ?? 0), 0),
      canoe_kayak_launch_areas: entries.filter((e) => (e.record.canoe_kayak_launches ?? 0) > 0).length,
      stale_notes: staleNotes,
      changes_observed: changes,
      class: cls,
    });
  }
  return summaries.sort((a, b) => a.project.localeCompare(b.project));
}

/** The provenance line a reader sees. The agency's date, or the fact that there is none. */
export function provenanceLine(record: Pick<AreaRecord, 'source_updated_at'>): string {
  return record.source_updated_at
    ? `Corps of Engineers listing, updated ${record.source_updated_at.slice(0, 10)}`
    : 'Corps of Engineers listing · update date unavailable';
}

export const REPORTED_STATUS_LABELS: Record<ReportedStatus, string> = {
  open: 'Reported open',
  partial: 'Limited access',
  closed: 'Reported closed',
  seasonal_closure: 'Seasonal closure',
  unknown: 'Status unknown',
};
