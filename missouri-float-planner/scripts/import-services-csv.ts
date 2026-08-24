#!/usr/bin/env npx tsx
/**
 * Import Nearby Services (outfitters / campgrounds / cabins) from CSV.
 *
 * ── WHY THIS WAS REWRITTEN ────────────────────────────────────────────────
 *
 * The previous version validated and wrote one row at a time, and built its
 * UPDATE payload out of every column whether the CSV had an opinion about it
 * or not. Both facts are visible in production today.
 *
 * An empty cell was never merely a null. `status` became 'active', `state`
 * became 'MO', `display_order` became 100, the authorization flags became
 * false, and `services_offered` became []. So a thin re-import did not leave a
 * richer row alone — it overwrote it with defaults.
 *
 * And an offering key outside the `service_offering` enum was dropped with a
 * warning nobody read. The drained corridor CSVs used `camping`, `lodging`,
 * `store` and `restrooms`; none are enum members. Twelve campgrounds sit in
 * production with no camping offering at all — Withrow Springs State Park was
 * imported carrying 10 tent sites and 29 RV sites and records {showers}.
 *
 * ── THE RULES THAT REPLACED THEM ──────────────────────────────────────────
 *
 *   PRESENCE    An absent cell is "no claim", never "set to the default".
 *               Defaults apply on INSERT only.
 *   WHOLE FILE  Nothing is written until every row validates. The old loop
 *               could leave 39 rows in and then fail on the 40th.
 *   NO GUESSES  An ambiguous offering alias is an error naming the precise
 *               alternatives. The author decides. This script never invents a
 *               distinction the source did not make — which is also why site
 *               counts do NOT imply a camping offering here. That inference is
 *               a real rule, but it belongs to whoever writes the CSV, where a
 *               human can see it, not to the translator.
 *   CLAIMED     `last_verified_at` comes from `source_checked_at` — the date
 *               somebody actually opened the page — never from now().
 *
 * ── WHAT THIS CANNOT CHECK ────────────────────────────────────────────────
 *
 * That a source actually establishes the business still exists is not
 * machine-checkable. What is enforced here is shape: a source is present, it
 * looks like a URL or an agency record id, it is not the meaningless
 * 'csv_import', and the check date is real and recent. The research contract
 * and corridor review enforce the meaning. Saying so plainly is better than a
 * validator that implies a check it is not performing.
 *
 * Usage:
 *   npx tsx scripts/import-services-csv.ts <csv>                  # validate + diff
 *   npx tsx scripts/import-services-csv.ts <csv> --out diff.txt   # save the diff
 *   npx tsx scripts/import-services-csv.ts <csv> --import         # write
 *   npx tsx scripts/import-services-csv.ts <csv> --import --overwrite
 *
 * --overwrite is the only destructive mode: it lets a populated cell replace an
 * array wholesale, re-point `is_primary`, and remove river links the CSV omits.
 */

import * as fs from 'fs';
import * as path from 'path';
import { getScriptClient } from './lib/db';
import { nameScore } from './ingestion/geocode-services-dryrun';

// ── Vocabulary ────────────────────────────────────────────────────────────
// Mirror of ServiceOffering in src/types/api.ts and the labels in
// src/lib/services/offerings.ts. Kept inline so this maintenance script does
// not depend on path-aliased src modules at runtime.
export const VALID_OFFERINGS = new Set<string>([
  'canoe_rental', 'kayak_rental', 'raft_rental', 'tube_rental', 'jon_boat_rental',
  'shuttle', 'camping_primitive', 'camping_rv', 'cabins', 'lodge_rooms',
  'general_store', 'food_service', 'showers', 'fishing_supplies', 'horseback_riding',
  'swimming_pool', 'wifi', 'potable_water', 'fire_rings', 'picnic_tables',
  'boat_ramp', 'dump_station', 'flush_toilets', 'vault_toilets', 'laundry', 'playground',
]);

/**
 * Only exact synonyms. A safe alias renames a concept; it never splits one.
 * `store` and `general_store` are the same thing said twice. `camping` is not
 * `camping_primitive` — a campground may be RV-only — which is why the list
 * below is two entries long and the ambiguous ones are errors.
 */
export const OFFERING_ALIASES: Record<string, string> = {
  store: 'general_store',
  rv: 'camping_rv',
};

/** Aliases that would require guessing. Each maps to the choices on offer. */
export const AMBIGUOUS_OFFERINGS: Record<string, string[]> = {
  camping: ['camping_primitive', 'camping_rv'],
  restrooms: ['flush_toilets', 'vault_toilets'],
  toilets: ['flush_toilets', 'vault_toilets'],
  lodging: ['lodge_rooms', 'cabins'],
};

const VALID_TYPES = new Set(['outfitter', 'campground', 'cabin_lodge']);
const VALID_STATUSES = new Set([
  'active', 'seasonal', 'temporarily_closed', 'permanently_closed', 'unverified',
]);

/** Applied to absent cells on INSERT only — never on update. */
const INSERT_DEFAULTS: Record<string, unknown> = {
  status: 'active',
  state: 'MO',
  display_order: 100,
  nps_authorized: false,
  usfs_authorized: false,
  services_offered: [],
  alt_names: [],
};

const TEXT_FIELDS = [
  'name', 'type', 'status', 'phone', 'phone_toll_free', 'email', 'website',
  'reservation_url', 'booking_platform', 'address_line1', 'city', 'state', 'zip',
  'description', 'seasonal_notes', 'fee_range', 'managing_agency', 'verified_source',
];
const NUM_FIELDS = ['latitude', 'longitude'];
const INT_FIELDS = [
  'tent_sites', 'rv_sites', 'cabin_count', 'max_guests',
  'season_open_month', 'season_close_month', 'display_order',
];
const BOOL_FIELDS = ['nps_authorized', 'usfs_authorized'];
/** Set-union on update. --overwrite replaces instead. */
const UNION_FIELDS = ['services_offered', 'alt_names'];

/** A source older than this is re-research, not a re-import of old research. */
export const SOURCE_MAX_AGE_DAYS = 180;
/** The value the old script defaulted to. It records nothing; it is an error. */
export const FORBIDDEN_SOURCES = new Set(['csv_import', 'unknown', 'n/a']);
/** Same threshold the coordinate and place-id pipelines already use. */
export const NAME_COLLISION_MIN = 0.86;

/**
 * Generous continental-US envelope. Not a precision check — it exists to catch
 * the coordinate that is well-formed and somewhere else entirely, which in
 * practice means a dropped minus sign putting an Ozark outfitter in China.
 */
export const US_BOUNDS = { minLat: 24, maxLat: 50, minLon: -125, maxLon: -66 };

// ── RFC4180-ish CSV parser (handles quoted fields, embedded commas/newlines) ──
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field); field = '';
    } else if (c === '\r') {
      // ignore — handled by \n
    } else if (c === '\n') {
      row.push(field); rows.push(row); row = []; field = '';
    } else {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

export function slugify(text: string): string {
  return text.toLowerCase().replace(/['‘’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

// parseInt and parseFloat stop at the first character they cannot use and
// return what they had. `parseInt('10abc')` is 10 and `parseFloat('37x')` is
// 37, so a typo in a site count or a coordinate arrives looking like data.
// These refuse the whole value instead, and report why.
function int(v: string): number | { bad: string } {
  if (!/^-?\d+$/.test(v)) return { bad: `"${v}" is not a whole number` };
  const n = Number(v);
  return Number.isSafeInteger(n) ? n : { bad: `"${v}" is out of range` };
}
function num(v: string): number | { bad: string } {
  if (!/^-?(\d+\.?\d*|\.\d+)$/.test(v)) return { bad: `"${v}" is not a number` };
  const n = Number(v);
  return Number.isFinite(n) ? n : { bad: `"${v}" is not a finite number` };
}
const TRUE_WORDS = ['true', '1', 'yes', 'y'];
const FALSE_WORDS = ['false', '0', 'no', 'n'];
// Anything unrecognised used to read as false, so `nps_authorized = ture`
// silently un-authorised a concessioner.
function bool(v: string): boolean | { bad: string } {
  const t = v.toLowerCase();
  if (TRUE_WORDS.includes(t)) return true;
  if (FALSE_WORDS.includes(t)) return false;
  return { bad: `"${v}" is not true/false (accepted: ${[...TRUE_WORDS, ...FALSE_WORDS].join(', ')})` };
}
function isBad(v: unknown): v is { bad: string } {
  return typeof v === 'object' && v !== null && 'bad' in v;
}
function list(v: string): string[] {
  return v.split('|').map((s) => s.trim()).filter(Boolean);
}
function fmt(v: unknown): string {
  if (v === null || v === undefined) return '(unset)';
  if (Array.isArray(v)) return `{${v.join(',')}}`;
  return String(v);
}

// ── Source and date checks ────────────────────────────────────────────────

/**
 * A source must look like something a reader could open again: a URL, a
 * hostname, or an agency record id. Comma-separated lists are checked part by
 * part, because that is how the existing rows record multiple sources.
 */
export function sourceProblem(raw: string): string | null {
  const parts = raw.split(',').map((s) => s.trim()).filter(Boolean);
  if (parts.length === 0) return 'is empty';
  for (const part of parts) {
    if (FORBIDDEN_SOURCES.has(part.toLowerCase())) {
      return `"${part}" records nothing — cite the page or agency record you actually read`;
    }
    const looksLikeUrl = part.includes('://');
    const looksLikeHost = /^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}(\/.*)?$/i.test(part);
    const looksLikeRecordId = /^[A-Z][A-Z0-9_-]{2,}$/.test(part);
    if (!looksLikeUrl && !looksLikeHost && !looksLikeRecordId) {
      return `"${part}" is neither a URL, a hostname, nor an agency record id`;
    }
  }
  return null;
}

export function checkedAtProblem(raw: string, today = new Date()): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return 'must be YYYY-MM-DD';
  const when = new Date(`${raw}T00:00:00Z`);
  if (Number.isNaN(when.getTime())) return 'is not a real date';
  // JavaScript rolls impossible days forward rather than rejecting them, so
  // 2026-02-31 parses happily as 3 March. Round-tripping catches that.
  if (when.toISOString().slice(0, 10) !== raw) return `is not a real calendar date (${raw})`;
  const days = (today.getTime() - when.getTime()) / 86_400_000;
  if (days < -1) return 'is in the future';
  if (days > SOURCE_MAX_AGE_DAYS) {
    return `is ${Math.round(days)} days old — re-check the source rather than ` +
      `importing old research under a fresh timestamp (limit ${SOURCE_MAX_AGE_DAYS})`;
  }
  return null;
}

// ── Offerings ─────────────────────────────────────────────────────────────

export function resolveOfferings(raw: string[]): { offerings: string[]; errors: string[] } {
  const offerings: string[] = [];
  const errors: string[] = [];
  for (const key of raw) {
    const lower = key.toLowerCase();
    if (VALID_OFFERINGS.has(lower)) { offerings.push(lower); continue; }
    if (OFFERING_ALIASES[lower]) { offerings.push(OFFERING_ALIASES[lower]); continue; }
    if (AMBIGUOUS_OFFERINGS[lower]) {
      errors.push(
        `offering "${key}" is ambiguous — say which: ${AMBIGUOUS_OFFERINGS[lower].join(' or ')}`,
      );
      continue;
    }
    errors.push(`offering "${key}" is not a service_offering value`);
  }
  return { offerings: [...new Set(offerings)], errors };
}

// ── Row model ─────────────────────────────────────────────────────────────

export interface ParsedRow {
  line: number;
  slug: string;
  name: string;
  type: string;
  riverSlugs: string[];
  /** Only the columns this row actually had an opinion about. */
  claimed: Record<string, unknown>;
  slugWasExplicit: boolean;
}

export interface Problem { line: number; who: string; message: string }

export function buildRows(
  matrix: string[][],
  today = new Date(),
): { rows: ParsedRow[]; errors: Problem[] } {
  const errors: Problem[] = [];
  const rows: ParsedRow[] = [];
  const headers = matrix[0].map((h) => h.trim());
  const seenSlugs = new Map<string, number>();

  for (let i = 1; i < matrix.length; i++) {
    const values = matrix[i];
    if (values.length === 1 && values[0].trim() === '') continue;
    const line = i + 1;

    const cell = (key: string): string => {
      const idx = headers.indexOf(key);
      return idx === -1 ? '' : (values[idx] ?? '').trim();
    };
    const has = (key: string): boolean => cell(key).length > 0;

    const name = cell('name');
    const type = cell('type');
    const who = name || `line ${line}`;

    if (!name) { errors.push({ line, who, message: 'name is required' }); continue; }
    if (!type) { errors.push({ line, who, message: 'type is required' }); continue; }
    if (!VALID_TYPES.has(type)) {
      errors.push({ line, who, message: `type "${type}" is not outfitter|campground|cabin_lodge` });
      continue;
    }

    const riverSlugs = list(cell('river_slugs'));
    if (riverSlugs.length === 0) {
      errors.push({ line, who, message: 'river_slugs is required' });
      continue;
    }

    // Provenance is required on every row this file touches.
    if (!has('verified_source')) {
      errors.push({ line, who, message: 'verified_source is required — cite the page you read' });
    } else {
      const problem = sourceProblem(cell('verified_source'));
      if (problem) errors.push({ line, who, message: `verified_source ${problem}` });
    }
    if (!has('source_checked_at')) {
      errors.push({
        line, who,
        message: 'source_checked_at is required — the date you opened the source',
      });
    } else {
      const problem = checkedAtProblem(cell('source_checked_at'), today);
      if (problem) errors.push({ line, who, message: `source_checked_at ${problem}` });
    }

    if (has('status') && !VALID_STATUSES.has(cell('status'))) {
      errors.push({ line, who, message: `status "${cell('status')}" is not a service_status value` });
    }

    const claimed: Record<string, unknown> = {};
    for (const f of TEXT_FIELDS) if (has(f)) claimed[f] = cell(f);
    for (const f of NUM_FIELDS) {
      if (!has(f)) continue;
      const parsed = num(cell(f));
      if (isBad(parsed)) errors.push({ line, who, message: `${f} ${parsed.bad}` });
      else claimed[f] = parsed;
    }
    for (const f of INT_FIELDS) {
      if (!has(f)) continue;
      const parsed = int(cell(f));
      if (isBad(parsed)) errors.push({ line, who, message: `${f} ${parsed.bad}` });
      else claimed[f] = parsed;
    }
    for (const f of BOOL_FIELDS) {
      if (!has(f)) continue;
      const parsed = bool(cell(f));
      if (isBad(parsed)) errors.push({ line, who, message: `${f} ${parsed.bad}` });
      else claimed[f] = parsed;
    }

    // ── A coordinate is a pair, and it has to be somewhere Eddy operates ──
    // Half a coordinate cannot draw a pin, and the quality ratchet tested only
    // latitude, so a row with a latitude and no longitude passed it.
    if (has('latitude') !== has('longitude')) {
      errors.push({ line, who, message: 'latitude and longitude must be given together' });
    }
    const lat = claimed.latitude;
    const lon = claimed.longitude;
    if (typeof lat === 'number' && Math.abs(lat) > 90) {
      errors.push({ line, who, message: `latitude ${lat} is outside -90..90` });
    } else if (typeof lat === 'number' && (lat < US_BOUNDS.minLat || lat > US_BOUNDS.maxLat)) {
      errors.push({ line, who, message: `latitude ${lat} is outside the area Eddy covers` });
    }
    if (typeof lon === 'number' && Math.abs(lon) > 180) {
      errors.push({ line, who, message: `longitude ${lon} is outside -180..180` });
    } else if (typeof lon === 'number' && (lon < US_BOUNDS.minLon || lon > US_BOUNDS.maxLon)) {
      // A dropped minus sign is the usual cause and stays inside -180..180.
      errors.push({ line, who, message: `longitude ${lon} is outside the area Eddy covers — check the sign` });
    }
    for (const f of ['season_open_month', 'season_close_month']) {
      const v = claimed[f];
      if (typeof v === 'number' && (v < 1 || v > 12)) {
        errors.push({ line, who, message: `${f} ${v} is not a month` });
      }
    }

    if (has('services_offered')) {
      const { offerings, errors: offErrors } = resolveOfferings(list(cell('services_offered')));
      for (const message of offErrors) errors.push({ line, who, message });
      claimed.services_offered = offerings;
    }
    if (has('alt_names')) claimed.alt_names = list(cell('alt_names'));
    if (has('source_checked_at')) {
      claimed.last_verified_at = new Date(`${cell('source_checked_at')}T00:00:00Z`).toISOString();
    }

    const slugWasExplicit = has('slug');
    const slug = slugWasExplicit ? cell('slug') : slugify(name);
    claimed.slug = slug;

    const priorLine = seenSlugs.get(slug);
    if (priorLine !== undefined) {
      errors.push({ line, who, message: `slug "${slug}" already used on line ${priorLine}` });
    }
    seenSlugs.set(slug, line);

    rows.push({ line, slug, name, type, riverSlugs, claimed, slugWasExplicit });
  }

  return { rows, errors };
}

// ── Identity collisions against what is already there ─────────────────────

export interface ExistingService {
  id: string;
  slug: string;
  name: string;
  alt_names: string[] | null;
  [key: string]: unknown;
}

/**
 * `slugify(name)` means a RENAMED business mints a new slug and silently
 * inserts a second row instead of updating the first. Duplicate detection
 * inside the file cannot see that; this can. Scored against `name` and every
 * `alt_names` entry, which is what alt_names was for.
 */
export function nameCollisions(
  row: ParsedRow,
  existing: ExistingService[],
): ExistingService[] {
  if (row.slugWasExplicit) return [];
  if (existing.some((e) => e.slug === row.slug)) return [];
  return existing.filter((e) => {
    const names = [e.name, ...(e.alt_names ?? [])];
    return names.some((n) => nameScore(n, row.name) >= NAME_COLLISION_MIN);
  });
}

// ── Planning ──────────────────────────────────────────────────────────────

export interface FieldChange { field: string; before: unknown; after: unknown; note?: string }
export interface RowPlan {
  row: ParsedRow;
  action: 'insert' | 'update' | 'unchanged';
  existingId: string | null;
  payload: Record<string, unknown>;
  changes: FieldChange[];
  linkAdds: string[];
  linkRemoves: string[];
  primaryFlips: string[];
}

/** An ISO instant, as opposed to any other string that happens to parse. */
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

function sameValue(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && [...a].sort().join('|') === [...b].sort().join('|');
  }
  // Postgres returns 2026-08-23T00:00:00+00:00 where toISOString() produced
  // 2026-08-23T00:00:00.000Z. Comparing those as text reports every timestamp
  // this script writes as having failed to land, and reports a row that is
  // already correct as needing an update. They are the same instant.
  if (typeof a === 'string' && typeof b === 'string' && ISO_INSTANT.test(a) && ISO_INSTANT.test(b)) {
    const [x, y] = [Date.parse(a), Date.parse(b)];
    if (!Number.isNaN(x) && !Number.isNaN(y)) return x === y;
  }
  return a === b;
}

export function planRow(
  row: ParsedRow,
  existing: ExistingService | undefined,
  existingLinks: Array<{ river_slug: string; is_primary: boolean }>,
  riverMap: Map<string, string>,
  overwrite: boolean,
): RowPlan {
  const payload: Record<string, unknown> = {};
  const changes: FieldChange[] = [];

  if (!existing) {
    Object.assign(payload, INSERT_DEFAULTS, row.claimed);
    payload.name = row.name;
    payload.type = row.type;
    for (const [field, after] of Object.entries(payload)) {
      changes.push({ field, before: null, after });
    }
    return {
      row, action: 'insert', existingId: null, payload, changes,
      linkAdds: [...row.riverSlugs], linkRemoves: [], primaryFlips: [],
    };
  }

  for (const [field, claimedValue] of Object.entries(row.claimed)) {
    if (field === 'slug') continue;
    const before = existing[field] ?? null;

    if (UNION_FIELDS.includes(field) && !overwrite) {
      const merged = [...new Set([...((before as string[]) ?? []), ...(claimedValue as string[])])];
      if (!sameValue(before, merged)) {
        payload[field] = merged;
        changes.push({ field, before, after: merged, note: 'union' });
      }
      continue;
    }

    if (!sameValue(before, claimedValue)) {
      payload[field] = claimedValue;
      changes.push({
        field, before, after: claimedValue,
        note: UNION_FIELDS.includes(field) ? 'replaced (--overwrite)' : undefined,
      });
    }
  }

  const linkedSlugs = existingLinks.map((l) => l.river_slug);
  const linkAdds = row.riverSlugs.filter((s) => !linkedSlugs.includes(s) && riverMap.has(s));
  const linkRemoves = overwrite ? linkedSlugs.filter((s) => !row.riverSlugs.includes(s)) : [];

  // is_primary is never re-pointed silently: a service that already has a
  // primary river keeps it, however the CSV happens to be ordered.
  const primaryFlips: string[] = [];
  if (overwrite) {
    const wanted = row.riverSlugs[0];
    const currentPrimary = existingLinks.find((l) => l.is_primary)?.river_slug;
    if (wanted && currentPrimary && wanted !== currentPrimary) primaryFlips.push(wanted);
  }

  const action = changes.length === 0 && linkAdds.length === 0
    && linkRemoves.length === 0 && primaryFlips.length === 0 ? 'unchanged' : 'update';

  return { row, action, existingId: existing.id, payload, changes, linkAdds, linkRemoves, primaryFlips };
}

// ── Diff rendering ────────────────────────────────────────────────────────

export function renderDiff(plans: RowPlan[]): string {
  const lines: string[] = [];
  for (const plan of plans) {
    if (plan.action === 'unchanged') {
      lines.push(`UNCHANGED  ${plan.row.slug}`);
      continue;
    }
    lines.push(`${plan.action.toUpperCase().padEnd(10)} ${plan.row.slug}  — ${plan.row.name} [${plan.row.type}]`);
    for (const c of plan.changes) {
      if (plan.action === 'insert') {
        lines.push(`             ${c.field.padEnd(20)} = ${fmt(c.after)}`);
      } else {
        const note = c.note ? `   [${c.note}]` : '';
        lines.push(`             ${c.field.padEnd(20)} ${fmt(c.before)} -> ${fmt(c.after)}${note}`);
      }
    }
    for (const s of plan.linkAdds) lines.push(`             + river link ${s}`);
    for (const s of plan.linkRemoves) lines.push(`             - river link ${s}   [--overwrite]`);
    for (const s of plan.primaryFlips) lines.push(`             ! is_primary -> ${s}   [--overwrite]`);
  }
  return lines.join('\n');
}

// ── Main ──────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const shouldImport = args.includes('--import');
  const overwrite = args.includes('--overwrite');
  const outIdx = args.indexOf('--out');
  const outFile = outIdx === -1 ? null : args[outIdx + 1];
  const file = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--out');

  if (!file) {
    console.error('Usage: npx tsx scripts/import-services-csv.ts <csv-file> [--out <file>] [--import] [--overwrite]');
    process.exit(1);
  }
  const csvPath = path.resolve(process.cwd(), file);
  if (!fs.existsSync(csvPath)) {
    console.error(`File not found: ${csvPath}`);
    process.exit(1);
  }

  console.log('🏕️  Nearby Services CSV Import');
  console.log('='.repeat(70));
  console.log(`Mode: ${shouldImport ? 'IMPORT (writing to DB)' : 'VALIDATE + DIFF (no writes)'}`);
  if (overwrite) {
    console.log('');
    console.log('⚠️  --overwrite: arrays may be REPLACED, is_primary may be RE-POINTED,');
    console.log('   and river links the CSV omits may be REMOVED.');
    console.log('');
  }

  const matrix = parseCsv(fs.readFileSync(csvPath, 'utf-8'));
  if (matrix.length < 2) {
    console.error('CSV must have a header row and at least one data row.');
    process.exit(1);
  }
  const headers = matrix[0].map((h) => h.trim());
  for (const req of ['name', 'type', 'river_slugs']) {
    if (!headers.includes(req)) {
      console.error(`Missing required header: ${req}`);
      process.exit(1);
    }
  }

  // ── Pass 1: parse and validate every row before touching the database ──
  const { rows, errors } = buildRows(matrix);

  const supabase = getScriptClient({ script: 'import-services-csv', write: shouldImport });

  // A failed read used to arrive as an empty array, which reads as "no rivers
  // exist" — every row would then fail with "unknown river slug" and the real
  // cause would never be printed. Same for the reads below: an empty result
  // from an error is indistinguishable from an empty table, and each one would
  // quietly change what this script decides to do.
  const { data: rivers, error: riversError } = await supabase.from('rivers').select('id, slug');
  if (riversError) throw new Error(`Could not read rivers: ${riversError.message}`);
  const riverMap = new Map<string, string>((rivers ?? []).map((r: { id: string; slug: string }) => [r.slug, r.id]));
  for (const row of rows) {
    const unknown = row.riverSlugs.filter((s) => !riverMap.has(s));
    if (unknown.length > 0) {
      errors.push({ line: row.line, who: row.name, message: `unknown river slug(s): ${unknown.join(', ')}` });
    }
  }

  const { data: existingRaw, error: existingError } =
    await supabase.from('nearby_services').select('*');
  if (existingError) throw new Error(`Could not read nearby_services: ${existingError.message}`);
  const existing = (existingRaw ?? []) as ExistingService[];
  const bySlug = new Map(existing.map((e) => [e.slug, e]));

  for (const row of rows) {
    const collisions = nameCollisions(row, existing);
    if (collisions.length > 0) {
      errors.push({
        line: row.line, who: row.name,
        message:
          `derived slug "${row.slug}" is new, but the name matches existing ` +
          `${collisions.map((c) => `"${c.name}" (${c.slug})`).join(', ')}. ` +
          'If this is the same business under a new name, set the slug column ' +
          'explicitly so it updates instead of duplicating.',
      });
    }
  }

  const { data: linkRaw, error: linkError } = await supabase
    .from('service_rivers')
    .select('service_id, is_primary, rivers(slug)');
  if (linkError) throw new Error(`Could not read service_rivers: ${linkError.message}`);
  const linksByService = new Map<string, Array<{ river_slug: string; is_primary: boolean }>>();
  for (const link of (linkRaw ?? []) as Array<Record<string, unknown>>) {
    const serviceId = link.service_id as string;
    const riverField = link.rivers as { slug?: string } | Array<{ slug?: string }> | null;
    const riverRows = Array.isArray(riverField) ? riverField : [riverField];
    for (const r of riverRows) {
      if (!r?.slug || !serviceId) continue;
      const arr = linksByService.get(serviceId) ?? [];
      arr.push({ river_slug: r.slug, is_primary: Boolean(link.is_primary) });
      linksByService.set(serviceId, arr);
    }
  }

  // ── Pass 2: the complete proposed diff ──
  const plans = rows.map((row) => {
    const found = bySlug.get(row.slug);
    return planRow(row, found, found ? (linksByService.get(found.id) ?? []) : [], riverMap, overwrite);
  });

  const diff = renderDiff(plans);
  console.log('\nProposed changes');
  console.log('-'.repeat(70));
  console.log(diff || '(nothing)');
  if (outFile) {
    fs.writeFileSync(path.resolve(process.cwd(), outFile), `${diff}\n`, 'utf-8');
    console.log(`\nDiff written to ${outFile}`);
  }

  if (errors.length > 0) {
    console.error('\n' + '='.repeat(70));
    console.error(`❌ ${errors.length} problem(s) — NOTHING was written.`);
    console.error('='.repeat(70));
    for (const e of errors.sort((a, b) => a.line - b.line)) {
      console.error(`  line ${String(e.line).padStart(3)}  ${e.who}: ${e.message}`);
    }
    process.exit(1);
  }

  const inserts = plans.filter((p) => p.action === 'insert');
  const updates = plans.filter((p) => p.action === 'update');
  const unchanged = plans.filter((p) => p.action === 'unchanged');

  console.log('\n' + '='.repeat(70));
  console.log(`Valid rows: ${plans.length}   insert: ${inserts.length}   update: ${updates.length}   unchanged: ${unchanged.length}`);

  if (!shouldImport) {
    console.log('\n💡 Validation only. Re-run with --import to write.');
    return;
  }

  // ── Pass 3: hand the whole plan to the database, once ──
  // Every operation goes in a single import_services() call, and a plpgsql
  // body is atomic: if any statement raises, the entire plan rolls back. The
  // previous loop issued a separate request per row and per link, so a dropped
  // connection or a constraint violation part-way through left some rows
  // written and some not — the failure validation-before-write does not cover.
  //
  // The function decides nothing. Everything below has already been decided by
  // planRow() and printed in the diff a person just read.
  const operations = plans
    .filter((plan) => plan.action !== 'unchanged')
    .map((plan) => ({
      action: plan.action,
      slug: plan.row.slug,
      payload: plan.payload,
      link_adds: plan.linkAdds,
      link_removes: plan.linkRemoves,
      // is_primary for a NEW row's first river. An existing row's primary is
      // never re-pointed except through --overwrite, which sets primary_river.
      insert_primary: plan.action === 'insert' ? plan.row.riverSlugs[0] : null,
      primary_river: plan.primaryFlips[0] ?? null,
    }));

  const failures: string[] = [];
  const { data: tally, error: rpcError } = await supabase.rpc('import_services', {
    p_plan: operations,
  });
  if (rpcError) {
    console.error('\n' + '='.repeat(70));
    console.error(`❌ Nothing was written — the whole plan rolled back.`);
    console.error(`   ${rpcError.message}`);
    console.error('='.repeat(70));
    process.exit(1);
  }
  console.log(`\nDatabase applied: ${JSON.stringify(tally)}`);

  const written = plans
    .filter((plan) => plan.action !== 'unchanged')
    .map((plan) => ({ slug: plan.row.slug }));

  // ── Pass 4: read back, and name anything that did not land ──
  const { data: after, error: afterError } = await supabase
    .from('nearby_services').select('*').in('slug', written.map((w) => w.slug));
  // Read-back is the verification step; if it fails, nothing has been verified.
  if (afterError) throw new Error(`Wrote rows but could not verify them: ${afterError.message}`);
  const afterBySlug = new Map(((after ?? []) as ExistingService[]).map((r) => [r.slug, r]));

  for (const plan of plans) {
    if (plan.action === 'unchanged') continue;
    const landed = afterBySlug.get(plan.row.slug);
    if (!landed) { failures.push(`${plan.row.slug}: not present after write`); continue; }
    for (const change of plan.changes) {
      if (change.field === 'slug') continue;
      if (!sameValue(landed[change.field] ?? null, change.after)) {
        failures.push(
          `${plan.row.slug}.${change.field}: expected ${fmt(change.after)}, found ${fmt(landed[change.field] ?? null)}`,
        );
      }
    }
  }

  console.log('\n' + '='.repeat(70));
  console.log('📋 Summary');
  console.log('='.repeat(70));
  console.log(`Inserted:  ${inserts.length}`);
  console.log(`Updated:   ${updates.length}`);
  console.log(`Unchanged: ${unchanged.length}`);
  if (failures.length > 0) {
    console.error(`\n❌ ${failures.length} row(s) did not land as planned:`);
    for (const f of failures) console.error(`  ${f}`);
    console.error('\nRe-running this file is safe: updates are additive and idempotent.');
    process.exit(1);
  }
  console.log('\n✅ Every planned change verified against the database.');
}

// Exact, not `includes`: this module is imported by import-services-csv.test.ts,
// whose path contains this file's name. A substring guard runs main() during the
// test run and exits the process before a single assertion executes.
const invokedAs = path.basename(process.argv[1] ?? '').replace(/\.[cm]?[tj]s$/, '');
if (invokedAs === 'import-services-csv') {
  main().catch((e) => { console.error(e); process.exit(1); });
}
