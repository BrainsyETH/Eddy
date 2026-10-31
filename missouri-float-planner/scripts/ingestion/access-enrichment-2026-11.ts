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

// ── Parking lots belong to their access point ────────────────────────────────
//
// A lot is never a pin of its own. It is evidence ABOUT the access point it
// serves: that there is parking, and what surface it is. The launch pin stays
// the place's only coordinate.

export interface Lot {
  id: string;
  at: LngLat;
  /** How the lot is tied to this place: a reviewed link, a shared agency area ID, or the same name. */
  tie: 'linked' | 'same_area' | 'same_name';
  provider: 'mdc' | 'agfc';
  url: string;
  attributes: Record<string, unknown>;
}

export const MAX_LOT_M = 600;

export interface LotMatch {
  lots: { lot: Lot; meters: number }[];
  confidence: Confidence;
  note: string;
}

/**
 * The agency parking lots that belong to one access point, with the reasons
 * any candidate was refused. A lot is refused when it is too far, on the far
 * bank, or nearer another access point than this one (it belongs to that one).
 */
export interface Belonging {
  /** Null when the feature belongs to this place; otherwise why it does not. */
  refused: string | null;
  meters: number;
  /** False when either point sits on the river line or there is no river geometry. */
  bankChecked: boolean;
}

/**
 * Whether an agency feature (lot, privy, campsite, recreation site) belongs to
 * this access point: within `maxM`, on the same bank, and not nearer another
 * access point (then it belongs to that one). Every amenity and parking match
 * goes through this one test.
 */
export function belongsTo(
  launch: LngLat,
  at: LngLat,
  otherPins: LngLat[],
  river: LineString | MultiLineString | null,
  maxM: number,
): Belonging {
  const meters = metersBetween(launch, at);
  const launchSide = river ? sideOfRiver(launch, river).side : 0;
  const featureSide = river ? sideOfRiver(at, river).side : 0;
  const bankChecked = !!river && launchSide !== 0 && featureSide !== 0;
  if (meters > maxM) return { refused: `${Math.round(meters)} m away`, meters, bankChecked };
  if (bankChecked && featureSide !== launchSide) return { refused: 'opposite bank', meters, bankChecked };
  if (otherPins.some((o) => metersBetween(o, at) < meters)) return { refused: 'nearer another access point', meters, bankChecked };
  return { refused: null, meters, bankChecked };
}

export function matchLots(
  launch: LngLat,
  lots: Lot[],
  otherPins: LngLat[],
  river: LineString | MultiLineString | null,
): { match: LotMatch | null; refused: string[] } {
  const refused: string[] = [];
  const ok: { lot: Lot; meters: number; bankChecked: boolean }[] = [];
  for (const lot of lots) {
    const b = belongsTo(launch, lot.at, otherPins, river, MAX_LOT_M);
    if (b.refused) refused.push(`${lot.id}: ${b.refused}`);
    else ok.push({ lot, meters: b.meters, bankChecked: b.bankChecked });
  }
  if (ok.length === 0) return { match: null, refused };
  ok.sort((x, y) => x.meters - y.meters);
  const notes = [`${ok.length} lot(s), ${ok.map((o) => `${Math.round(o.meters)} m`).join(', ')} from launch`];
  const bankChecked = ok.every((o) => o.bankChecked);
  if (!river) notes.push('river geometry missing; bank not checked');
  else if (!bankChecked) notes.push('a pin is on the river line; bank not checked');
  const firm = ok.every((o) => o.lot.tie !== 'same_name' && o.meters <= 400);
  return {
    match: { lots: ok.map(({ lot, meters }) => ({ lot, meters })), confidence: firm && bankChecked ? 'high' : 'medium', note: notes.join('; ') },
    refused,
  };
}

/** The surface a lot record states: MDC `Surface`, AGFC `fdescrip` (Paved/Gravel/Dirt). */
export function lotSurface(lot: Lot): string | null {
  const raw = lot.provider === 'mdc' ? lot.attributes.Surface : lot.attributes.fdescrip;
  return typeof raw === 'string' && /^(paved|gravel|dirt|concrete|asphalt)$/i.test(raw.trim()) ? raw.trim().toLowerCase() : null;
}

/**
 * "Paved lot (MDC)." / "2 gravel lots (AGFC)." / "2 lots: paved, dirt (AGFC)."
 * Surface only. MDC's Allows_Trailers is deliberately not used: its meaning is
 * unconfirmed, and "no trailers" at a boat ramp would be a costly misreading.
 */
export function parkingInfo(lots: Lot[]): string | null {
  const surfaces = lots.map(lotSurface).filter((s): s is string => s !== null);
  if (surfaces.length === 0) return null;
  const who = [...new Set(lots.map((l) => l.provider.toUpperCase()))].join('/');
  const kinds = [...new Set(surfaces)];
  const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
  if (lots.length === 1) return `${cap(surfaces[0])} lot (${who}).`;
  if (kinds.length === 1 && surfaces.length === lots.length) return `${lots.length} ${kinds[0]} lots (${who}).`;
  return `${lots.length} lots: ${kinds.join(', ')} (${who}).`;
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

/**
 * Every identified manager is compared BEFORE asking whether the column can
 * hold it. Dropping an unsupported manager first would turn "AGFC vs COE" into
 * an uncontested COE; it must stay a flag until a person resolves it.
 */
export function chooseManagingAgency(signals: AgencySignal[]): { agency: ManagingAgency | null; confidence: Confidence; evidence: string } {
  const evidence = signals.map((s) => `${s.source}: ${s.detail}`).join(' | ');
  const identified = [...new Set(signals.map((s) => s.agency ?? s.unsupported).filter((a): a is string => !!a))];
  if (identified.length > 1) return { agency: null, confidence: 'flag', evidence: `conflict (${identified.join(' vs ')}) — ${evidence}` };
  if (identified.length === 0) return { agency: null, confidence: 'low', evidence };
  const values = signals.map((s) => s.agency).filter((a): a is ManagingAgency => a !== null);
  if (values.length === 0) {
    return { agency: null, confidence: 'flag', evidence: `manager ${identified[0]} is not an allowed managing_agency value — ${evidence}` };
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

/**
 * Whether an MVUM road's NAME shows it serves this access: every distinctive
 * word of the road name must be in the place name. "TURNER MILL NORTH" does not
 * serve "Turner Mill South", and "RIVERTON WEST RECREATION AREA" is not shown
 * to serve "Riverton". Being the nearest road is not evidence of the approach.
 */
export function roadServes(placeName: string, roadName: unknown): boolean {
  const generic = /\b(picnic|road|rd|fs|forest|service|day|use|ramp)\b/g;
  const tokens = (s: string) => new Set(nameCore(s).replace(generic, ' ').split(' ').filter((t) => t.length > 1));
  const road = tokens(typeof roadName === 'string' ? roadName : '');
  const place = tokens(placeName);
  return road.size > 0 && [...road].every((t) => place.has(t));
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
  /** One URL per contributing feature, space-separated, in `evidence_ids` order. */
  evidence_url: string;
  /** Keys into sources.json `evidence`: each holds the feature's ID, attributes and geometry. */
  evidence_ids: string;
  launch_map: string;
  note: string;
}

export const PROPOSAL_COLUMNS: (keyof Proposal | 'accept')[] = [
  'accept', 'confidence', 'river', 'slug', 'name', 'field', 'current', 'proposed',
  'evidence', 'evidence_ids', 'evidence_url', 'launch_map', 'note', 'access_point_id',
];

export const mapLink = ([lng, lat]: LngLat) => `https://www.google.com/maps/search/?api=1&query=${lat.toFixed(6)},${lng.toFixed(6)}`;

export function csvCell(value: unknown): string {
  const s = value == null ? '' : String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: Proposal[]): string {
  const lines = [PROPOSAL_COLUMNS.join(',')];
  // High-confidence rows are pre-accepted; a reviewer clears any they disagree with.
  for (const r of rows) lines.push(PROPOSAL_COLUMNS.map((c) => csvCell(c === 'accept' ? (r.confidence === 'high' ? 'y' : '') : r[c])).join(','));
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
