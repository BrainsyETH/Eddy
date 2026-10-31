/**
 * Pure rules for the one-off November 2026 access-point enrichment.
 *
 * Every rule here proposes a value for a column that already exists, from one
 * piece of direct agency evidence, and says how sure it is. Nothing here
 * decides that a place is open, public or launchable — ownership is not
 * permission (see the 00209 migration header). The CLI that fetches the
 * evidence and writes the review sheet is oneoff-access-enrichment-2026-11.ts;
 * the reviewed sheet is applied by scripts/repair-access-enrichment-2026-11.ts.
 */
import { distance, lineString, nearestPointOnLine, point } from '@turf/turf';
import type { LineString, MultiLineString } from 'geojson';

export type LngLat = [number, number];
export type Confidence = 'high' | 'medium' | 'low' | 'flag';
export type ProposalField =
  | 'driving_pin'
  | 'parking_info'
  | 'amenities'
  | 'managing_agency'
  | 'official_site_url'
  | 'fee_required'
  | 'road_surface'
  | 'ownership';

/** The 00034 check constraint. AGFC and USFWS are not in it (yet). */
export const MANAGING_AGENCIES = ['MDC', 'NPS', 'USFS', 'COE', 'State Park', 'County', 'Municipal', 'Private'] as const;
export type ManagingAgency = (typeof MANAGING_AGENCIES)[number];

export const metersBetween = (a: LngLat, b: LngLat) => distance(point(a), point(b), { units: 'meters' });

// ── Which bank ────────────────────────────────────────────────────────────────

/** Closer than this to the centerline, a point is "in the river" and has no bank. */
export const ON_LINE_M = 15;

/**
 * Which side of the river line a point is on: +1 left, -1 right (looking along
 * the digitized direction), 0 when it is on the line itself. Computed from the
 * nearest segment, so a meander behind the point does not flip the answer.
 */
export function sideOfRiver(pt: LngLat, river: LineString | MultiLineString): { side: -1 | 0 | 1; meters: number } {
  const lines = river.type === 'LineString' ? [river.coordinates] : river.coordinates;
  const near = nearestPointOnLine(river, point(pt), { units: 'meters' });
  const p = near.properties as Record<string, number>;
  const lineIdx = p.lineStringIndex ?? p.multiFeatureIndex ?? 0;
  const segIdx = p.segmentIndex ?? p.index ?? 0;
  const meters = p.pointDistance ?? p.dist;
  const line = lines[lineIdx];
  const a = line[Math.min(segIdx, line.length - 2)];
  const b = line[Math.min(segIdx, line.length - 2) + 1];
  if (meters < ON_LINE_M) return { side: 0, meters };
  const k = Math.cos((a[1] * Math.PI) / 180);
  const cross = (b[0] - a[0]) * k * (pt[1] - a[1]) - (b[1] - a[1]) * (pt[0] - a[0]) * k;
  return { side: cross > 0 ? 1 : cross < 0 ? -1 : 0, meters };
}

// ── Parking pin ───────────────────────────────────────────────────────────────

export interface Lot {
  id: string;
  at: LngLat;
  /** 'high' when the lot is tied to this place by a reviewed link or a shared agency area ID. */
  tie: 'linked' | 'same_area' | 'same_name';
  provider: 'mdc' | 'agfc';
  url: string;
  attributes: Record<string, unknown>;
}

export const MAX_LOT_M = 600;
/** A lot this close adds nothing to directions the launch pin does not already give. */
export const MIN_USEFUL_LOT_M = 25;

export interface LotChoice {
  lot: Lot;
  meters: number;
  confidence: Confidence;
  note: string;
}

/**
 * The primary parking pin for one access point, or null with the reasons each
 * candidate lot was refused. A lot is refused when it is too far, on the far
 * bank, or nearer to another access point than to this one.
 */
export function chooseLot(
  launch: LngLat,
  lots: Lot[],
  otherPins: LngLat[],
  river: LineString | MultiLineString | null,
): { choice: LotChoice | null; refused: string[] } {
  const refused: string[] = [];
  const launchSide = river ? sideOfRiver(launch, river) : null;
  const ok: { lot: Lot; meters: number }[] = [];
  for (const lot of lots) {
    const meters = metersBetween(launch, lot.at);
    if (meters > MAX_LOT_M) { refused.push(`${lot.id}: ${Math.round(meters)} m away`); continue; }
    if (river && launchSide && launchSide.side !== 0) {
      const lotSide = sideOfRiver(lot.at, river);
      if (lotSide.side !== 0 && lotSide.side !== launchSide.side) { refused.push(`${lot.id}: opposite bank`); continue; }
    }
    if (otherPins.some((o) => metersBetween(o, lot.at) < meters)) { refused.push(`${lot.id}: nearer another access point`); continue; }
    ok.push({ lot, meters });
  }
  if (ok.length === 0) return { choice: null, refused };
  const rank = { linked: 0, same_area: 1, same_name: 2 } as const;
  ok.sort((x, y) => rank[x.lot.tie] - rank[y.lot.tie] || x.meters - y.meters);
  const best = ok[0];
  if (best.meters < MIN_USEFUL_LOT_M) return { choice: null, refused: [...refused, `${best.lot.id}: ${Math.round(best.meters)} m, same as launch pin`] };
  const notes = [`${Math.round(best.meters)} m from launch`];
  if (!river) notes.push('river geometry missing; bank not checked');
  else if (launchSide?.side === 0) notes.push('launch pin is on the river line; bank not checked');
  if (ok.length > 1) notes.push(`${ok.length - 1} other lot(s) also qualify`);
  const confidence: Confidence =
    best.lot.tie === 'same_name' || !river || launchSide?.side === 0 ? 'medium' : best.meters <= 400 ? 'high' : 'medium';
  return { choice: { lot: best.lot, meters: best.meters, confidence, note: notes.join('; ') }, refused };
}

/** "Gravel lot; trailers allowed (MDC)." Only what the MDC layer states. */
export function mdcParkingInfo(attrs: Record<string, unknown>): string | null {
  const surface = typeof attrs.Surface === 'string' && attrs.Surface.trim() ? attrs.Surface.trim() : null;
  const trailers = attrs.Allows_Trailers === 'Yes' ? 'trailers allowed' : attrs.Allows_Trailers === 'No' ? 'no trailers' : null;
  if (!surface && !trailers) return null;
  const parts = [surface ? `${surface} lot` : 'Parking lot', trailers].filter(Boolean);
  return `${parts.join('; ')} (MDC).`;
}

// ── Road surface (MVUM) ───────────────────────────────────────────────────────

/** MVUM `surfacetype` → access_points.road_surface vocabulary (00034 check). */
export function mvumRoadSurface(surfacetype: unknown, seasonal: unknown): string[] | null {
  const code = typeof surfacetype === 'string' ? surfacetype.split(' - ')[0].trim().toUpperCase() : '';
  const base: Record<string, string> = { AC: 'paved', BST: 'paved', P: 'paved', PCC: 'paved', AGG: 'gravel_maintained', IMP: 'dirt', NAT: 'dirt' };
  if (!base[code]) return null;
  return typeof seasonal === 'string' && seasonal.toLowerCase() === 'seasonal' ? [base[code], 'seasonal'] : [base[code]];
}

// ── Managing agency ───────────────────────────────────────────────────────────

export interface AgencySignal {
  agency: ManagingAgency | null;
  /** A manager the check constraint cannot hold, e.g. AGFC. */
  unsupported?: string;
  source: 'padus' | 'agency_link' | 'ownership_text';
  detail: string;
}

/** PAD-US designations that are easements or overlays, not who manages the ground. */
export const PADUS_NON_FEE = new Set(['CONE', 'AGRE', 'RECE', 'HCAE', 'OTHE', 'IRA', 'WA', 'RNA', 'NCA']);

export function agencyFromPadus(managerName: string | null, stateCode: string | null): Omit<AgencySignal, 'source' | 'detail'> {
  switch ((managerName ?? '').toUpperCase()) {
    case 'NPS': return { agency: 'NPS' };
    case 'USFS': return { agency: 'USFS' };
    case 'USACE': return { agency: 'COE' };
    case 'CNTY': return { agency: 'County' };
    case 'CITY': return { agency: 'Municipal' };
    case 'SPR': return { agency: 'State Park' };
    case 'FWS': return { agency: null, unsupported: 'USFWS' };
    case 'SDC':
    case 'SFW':
      return stateCode === 'MO' ? { agency: 'MDC' } : stateCode === 'AR' ? { agency: null, unsupported: 'AGFC' } : { agency: null };
    default: return { agency: null };
  }
}

export function agencyFromOwnershipText(text: string | null): ManagingAgency | null {
  const t = (text ?? '').trim();
  if (/^(MDC|NPS|USFS|COE)$/.test(t)) return t as ManagingAgency;
  if (/^(state_park|state park)$/i.test(t)) return 'State Park';
  if (/^(county|[A-Z][a-z]+ County)$/i.test(t)) return 'County';
  if (/^(city|City of .+)$/i.test(t)) return 'Municipal';
  if (/^private$/i.test(t)) return 'Private';
  return null;
}

export function chooseManagingAgency(signals: AgencySignal[]): { agency: ManagingAgency | null; confidence: Confidence; evidence: string } {
  const evidence = signals.map((s) => `${s.source}: ${s.detail}`).join(' | ');
  const values = [...new Set(signals.map((s) => s.agency).filter((a): a is ManagingAgency => a !== null))];
  if (values.length > 1) return { agency: null, confidence: 'flag', evidence: `conflict (${values.join(' vs ')}) — ${evidence}` };
  if (values.length === 0) {
    const unsupported = [...new Set(signals.map((s) => s.unsupported).filter(Boolean))];
    return unsupported.length
      ? { agency: null, confidence: 'flag', evidence: `manager ${unsupported.join('/')} is not an allowed managing_agency value — ${evidence}` }
      : { agency: null, confidence: 'low', evidence };
  }
  const agreeing = signals.filter((s) => s.agency === values[0]);
  const independent = new Set(agreeing.map((s) => s.source)).size;
  const confidence: Confidence = independent >= 2 ? 'high' : agreeing.some((s) => s.source !== 'ownership_text') ? 'medium' : 'low';
  return { agency: values[0], confidence, evidence };
}

// ── Ownership spelling ────────────────────────────────────────────────────────

/** Exact case/spelling duplicates only. Descriptive ownership text is never rewritten. */
export function ownershipSpelling(text: string | null): string | null {
  const map: Record<string, string> = { County: 'county', Private: 'private', 'State Park': 'state_park', City: 'city' };
  const t = (text ?? '').trim();
  return map[t] ?? null;
}

// ── Amenities and USFS facts ──────────────────────────────────────────────────

/** Adds, never removes. Returns null when nothing would change. */
export function addAmenities(current: string[] | null, additions: string[]): string[] | null {
  const have = new Set(current ?? []);
  const add = additions.filter((a) => !have.has(a));
  return add.length ? [...(current ?? []), ...[...new Set(add)]] : null;
}

/** USFS `restroom_availability` is free text: "Vault toilet", "No restrooms available"… */
export const usfsHasRestroom = (text: unknown) =>
  typeof text === 'string' && /toilet|restroom|flush/i.test(text) && !/^\s*no\b/i.test(text);

export const usfsFeeRequired = (code: unknown): boolean | null => (code === 'Y' ? true : code === 'N' ? false : null);

/** Lowercased, punctuation-free, without generic place words — for same-name matching only. */
export function nameCore(name: string | null): string {
  return (name ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\b(access|area|parking|lot|boat|ramp|launch|canoe|kayak|the|public|use|site|campground|recreation)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ── Review sheet ──────────────────────────────────────────────────────────────

export interface Proposal {
  access_point_id: string;
  slug: string;
  name: string;
  river: string;
  field: ProposalField;
  /** JSON-encoded current and proposed values (null for flags). */
  current: string;
  proposed: string;
  confidence: Confidence;
  evidence: string;
  evidence_url: string;
  launch_map: string;
  proposed_map: string;
  note: string;
}

export const PROPOSAL_COLUMNS: (keyof Proposal | 'accept')[] = [
  'accept', 'confidence', 'river', 'slug', 'name', 'field', 'current', 'proposed',
  'evidence', 'evidence_url', 'launch_map', 'proposed_map', 'note', 'access_point_id',
];

export const mapLink = ([lng, lat]: LngLat) => `https://www.google.com/maps/search/?api=1&query=${lat.toFixed(6)},${lng.toFixed(6)}`;

export function csvCell(value: unknown): string {
  const s = value == null ? '' : String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: Proposal[]): string {
  const lines = [PROPOSAL_COLUMNS.join(',')];
  for (const r of rows) lines.push(PROPOSAL_COLUMNS.map((c) => csvCell(c === 'accept' ? '' : r[c])).join(','));
  return `${lines.join('\n')}\n`;
}

/** RFC 4180 parser for the reviewed sheet (quoted cells, doubled quotes, newlines in quotes). */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  const [header, ...body] = rows.filter((r) => r.some((c) => c !== ''));
  return body.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ''])));
}

/** For tests and the CLI: a straight line, so callers need not import turf. */
export const line = (coords: LngLat[]) => lineString(coords).geometry;
