#!/usr/bin/env npx tsx
/**
 * Independent check of the November 2026 access enrichment. WRITES NOTHING.
 *
 * PAD-US, which the proposer used for managing agency, is a compilation: its
 * "Ozark National Scenic Riverway" polygon covers the whole boundary,
 * including private land under scenic easements, and its national-forest
 * polygons blur inholdings. This re-checks every managing-agency value — the
 * round-1 rows already applied and the round-2 proposals — against each
 * agency's own land records:
 *
 *   NPS   Land Resources Division tracts. NPS manages a spot only where the
 *         tract is "Federal Land (Fee)". Scenic easements, "less than fee"
 *         interests and private or other public land inside the boundary are
 *         not NPS-managed.
 *   USFS  EDW Basic Ownership: "USDA FOREST SERVICE" vs "NON-FS".
 *
 * Each pin is tested at the pin itself (±1 m) and within 30 m (box queries:
 * the NPS service rejects point-plus-distance in 4326). Verdicts:
 *   confirmed     the agency's own record at the pin agrees;
 *   contradicted  it disagrees (e.g. NPS proposed on a scenic easement), or
 *                 another agency's fee land is under the pin;
 *   ambiguous     only a record within 30 m agrees, or two agencies' land
 *                 meets at the pin;
 *   unverified    no independent land record covers this agency (MDC, AGFC,
 *                 County, Municipal, State Park, Private).
 * It also fetches every proposed official_site_url, checks every added amenity
 * and parking description against the record's own text, and checks road
 * surfaces against the record's road text.
 *
 * With --decide it writes round2-decided.csv (the round-2 rows to apply, with
 * a reason per row) and round1-corrections.csv (round-1 amenity additions that
 * are not confirmed, taken back out). Both are applied with
 * scripts/repair-access-enrichment-2026-11.ts --sheet=….
 *
 * Run from missouri-float-planner/ (Node 20):
 *   npx tsx scripts/ingestion/audit-access-enrichment-2026-11.ts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getScriptClient } from '../lib/db';
import { type LngLat, csvCell, nameCore, parseCsv } from './access-enrichment-2026-11';
import { arcgis, envelope, envelopeFilter, mapLimit, selectAll } from './arcgis-fetch';

const NPS_TRACTS = 'https://services1.arcgis.com/fBc8EJBxQRMcHlei/arcgis/rest/services/NPS_Land_Resources_Division_Boundary_and_Tract_Data_Service/FeatureServer/1';
const USFS_OWNERSHIP = 'https://apps.fs.usda.gov/arcx/rest/services/EDW/EDW_BasicOwnership_01/MapServer/0';
const USFS_SITES = 'https://apps.fs.usda.gov/arcx/rest/services/EDW/EDW_InfraRecreationSites_01/MapServer/0';

/** Two names share a distinctive word (ignoring generic place words), e.g. "Campbell Cemetery access" / "Campbell Cemetery". */
export function sharesDistinctiveName(a: string, b: string): boolean {
  const words = (s: string) => new Set(nameCore(s).replace(/\b(float|camp|campground|boating|picnic|day|north|south|east|west|river|creek|mill)\b/g, ' ').split(' ').filter((t) => t.length > 2));
  const wa = words(a);
  return [...words(b)].some((t) => wa.has(t));
}
const TOLERANCE_M = 30;
const DIR = join(__dirname, 'agency-gis', '2026-11-oneoff');


export interface LandRecords {
  /** Land records at the pin itself (a ±1 m box). */
  at: { npsTracts: { alpha: string; estate: string; interest: string }[]; usfs: string[] };
  /** Land records within the 30 m tolerance. */
  near: { npsTracts: { alpha: string; estate: string; interest: string }[]; usfs: string[] };
}

export type Verdict = 'confirmed' | 'contradicted' | 'ambiguous' | 'unverified';

/**
 * Pure verdict for one managing-agency value. It is decided by the land record
 * at the pin itself; one within 30 m only makes it ambiguous, because a box
 * that reaches a neighbouring tract is how a private parcel inside a park
 * boundary passes for NPS land.
 */
export interface OperatorRecords {
  /** NPS's own campground record is linked to this access point (access_points.nps_campground_id). */
  npsCampground: boolean;
  /** A USFS INFRA recreation site within 300 m whose name matches the place (the proposer's site radius). */
  usfsSite: string | null;
}

/** A public road or utility easement says nothing about who runs the access beside it. */
const isRoadEasement = (t: { estate: string; interest: string }) =>
  (t.estate === 'Easement' || t.estate === 'Right-of-Way') && t.interest === 'Public';

export function landVerdict(agency: string, land: LandRecords, ops: OperatorRecords = { npsCampground: false, usfsSite: null }): { verdict: Verdict; why: string } {
  if (agency === 'NPS' && ops.npsCampground) return { verdict: 'confirmed', why: 'NPS campground record linked to this access point' };
  if (agency === 'USFS' && ops.usfsSite) return { verdict: 'confirmed', why: `USFS recreation site "${ops.usfsSite}" at this access` };
  land = { ...land, at: { ...land.at, npsTracts: land.at.npsTracts.filter((t) => !isRoadEasement(t)) } };
  const fee = (t: LandRecords['at']['npsTracts']) => t.some((x) => x.interest === 'Federal Land (Fee)');
  const fs = (u: string[]) => u.includes('USDA FOREST SERVICE');
  const describe = (l: LandRecords['at']) =>
    `${l.npsTracts.map((t) => `${t.alpha} ${t.estate}/${t.interest}`).join('; ') || 'no NPS tract'}; ${l.usfs.join('/') || 'no USFS record'}`;
  const at = `at pin: ${describe(land.at)}`;
  const near = `within 30 m: ${describe(land.near)}`;
  if (agency === 'NPS') {
    if (fee(land.at.npsTracts)) return fs(land.at.usfs) ? { verdict: 'ambiguous', why: `NPS fee and Forest Service land both at pin — ${at}` } : { verdict: 'confirmed', why: at };
    if (land.at.npsTracts.length) return { verdict: 'contradicted', why: `not NPS fee land — ${at}` };
    if (fee(land.near.npsTracts)) return { verdict: 'ambiguous', why: `no NPS tract at the pin, NPS fee land nearby — ${near}` };
    return { verdict: 'contradicted', why: `no NPS fee land — ${near}` };
  }
  if (agency === 'USFS') {
    if (fs(land.at.usfs)) return fee(land.at.npsTracts) ? { verdict: 'ambiguous', why: `Forest Service and NPS fee land both at pin — ${at}` } : { verdict: 'confirmed', why: at };
    if (land.at.usfs.length) return { verdict: 'contradicted', why: `not Forest Service land — ${at}` };
    if (fs(land.near.usfs)) return { verdict: 'ambiguous', why: `Forest Service land only nearby — ${near}` };
    return { verdict: 'unverified', why: near };
  }
  // Any other manager is contradicted by NPS fee or Forest Service land at the pin.
  if (fee(land.at.npsTracts)) return { verdict: 'contradicted', why: `pin is on NPS fee land — ${at}` };
  if (fs(land.at.usfs)) return { verdict: 'contradicted', why: `pin is on Forest Service land — ${at}` };
  if (fee(land.near.npsTracts) || fs(land.near.usfs)) return { verdict: 'ambiguous', why: `federal land within 30 m — ${near}` };
  return { verdict: 'unverified', why: at };
}

/**
 * What the record's own curated text and types say about one amenity.
 * MDC's "Boat Ramps" layer also lists carry-in and canoe launches
 * (Millstream Gardens: "no ramp"; Woodson K. Woods: "no formal boat ramp"), and
 * a privy "in the same area" can be across a conservation area (Scotts Ford:
 * "No restrooms at this specific access point"). So an agency feature alone
 * does not make an amenity true; the record must not deny it, and should
 * corroborate it.
 */
export function amenityVerdict(amenity: string, text: string, types: string[]): { verdict: Verdict; why: string } {
  const t = text.toLowerCase();
  const deny: Record<string, RegExp> = {
    // Qualified negatives count: "no confirmed restrooms" (Sappington Bridge),
    // "no formal boat ramp", "no water or restrooms".
    boat_ramp: /\bno (confirmed |formal |developed |boat |concrete )*ramps?\b/,
    restrooms: /\bno (confirmed |public |developed |formal )*(restrooms?|toilets?|privy|privies|facilities)\b|\bno (water|trash)[^.;|]{0,20}\bor (restrooms?|toilets?)\b|no amenities/,
    // "day-use only June through mid-September" is a season, not a ban (Huzzah).
    camping: /\bno (confirmed |designated )*camping|camping (is )?(prohibited|not allowed)|day-use only(?! (in summer|in the summer|june|from|through|during|between|in season))/,
    // "no parking … along Kyles Landing Road" is about the road, not the lot.
    parking: /\bno (public )?parking\b(?! is allowed (anywhere )?along| along)|closed for parking|no vehicle access/,
    picnic: /\bno picnic/,
  };
  const affirm: Record<string, RegExp> = {
    boat_ramp: /\b(boat|concrete|gravel|paved|launch) ramp|\bramps?\b(?! *(is|are) (closed|gone))/,
    restrooms: /\b(privy|privies|restrooms?|toilets?|vault)\b/,
    camping: /\b(camping|campsites?|campground)\b/,
    parking: /\b(parking|lot)\b/,
    picnic: /\bpicnic\b/,
  };
  const typeOf: Record<string, string> = { boat_ramp: 'boat_ramp', camping: 'campground' };
  // A closure stated in the record outranks any agency feature for physical amenities.
  const closed = t.match(/\b(officially|permanently|temporarily) closed\b|\bclosed (for|to) (parking|vehicles|the public)/);
  if (closed && amenity !== 'camping') {
    return { verdict: 'contradicted', why: `record says closed: "…${t.slice(Math.max(0, (closed.index ?? 0) - 40), (closed.index ?? 0) + 60).trim()}…"` };
  }
  const m = t.match(deny[amenity] ?? /$^/);
  if (m) return { verdict: 'contradicted', why: `record text: "…${t.slice(Math.max(0, (m.index ?? 0) - 40), (m.index ?? 0) + 60).trim()}…"` };
  // A carry-in or canoe launch is not a boat ramp — unless the record also names
  // one ("concrete boat ramp and canoe launch", Barclay).
  if (amenity === 'boat_ramp') {
    const soft = t.match(/carry-in|canoe launch(?! ramp)|small-boat\/canoe/);
    if (soft && !/\b(boat|concrete|paved) ramp\b/.test(t)) {
      return { verdict: 'contradicted', why: `record text: "…${t.slice(Math.max(0, (soft.index ?? 0) - 40), (soft.index ?? 0) + 60).trim()}…"` };
    }
  }
  if (typeOf[amenity] && types.includes(typeOf[amenity])) return { verdict: 'confirmed', why: `record types include ${typeOf[amenity]}` };
  // A hedge is not corroboration: "no specific restroom information — may have
  // portable or vault toilets seasonally" (Campbell Bridge).
  const hedge: Record<string, RegExp> = {
    restrooms: /\bno (specific )?(restroom|toilet) information\b|\bmay have (a )?(portable|vault)|\b(restrooms?|toilets?) (not )?(confirmed|unconfirmed|unknown)\b/,
    boat_ramp: /\bramp (not )?(confirmed|unconfirmed|unknown)\b/,
  };
  if (hedge[amenity]?.test(t)) return { verdict: 'unverified', why: 'record text hedges on it' };
  const a = t.match(affirm[amenity] ?? /$^/);
  if (a) return { verdict: 'confirmed', why: `record text: "…${t.slice(Math.max(0, (a.index ?? 0) - 40), (a.index ?? 0) + 60).trim()}…"` };
  return { verdict: 'unverified', why: 'record text neither confirms nor denies it' };
}

async function landAt(p: LngLat): Promise<LandRecords> {
  const feats = (r: Record<string, unknown>) => ((r.features as { attributes: Record<string, unknown> }[]) ?? []);
  const query = async (m: number) => {
    const box = { ...envelopeFilter(envelope(p, m)), returnGeometry: 'false' };
    const [nps, fs] = await Promise.all([
      arcgis(NPS_TRACTS, { ...box, outFields: 'ALPHA,ESTATE,Interest' }),
      arcgis(USFS_OWNERSHIP, { ...box, outFields: 'ownerclassification' }),
    ]);
    return {
      npsTracts: feats(nps).map((f) => ({ alpha: String(f.attributes.ALPHA), estate: String(f.attributes.ESTATE), interest: String(f.attributes.Interest) })),
      usfs: [...new Set(feats(fs).map((f) => String(f.attributes.ownerclassification)))],
    };
  };
  const [at, near] = await Promise.all([query(1), query(TOLERANCE_M)]);
  return { at, near };
}

/**
 * A link is good only if it lands on the page it names. The USFS moved its
 * site in 2025: old /recarea/?recid= links answer 200 after redirecting to the
 * forest's generic recreation page, which is a dead link that looks alive.
 */
export function linkVerdict(requested: string, status: number | null, finalUrl: string | null): { verdict: Verdict; why: string } {
  if (status !== 200 || !finalUrl) return { verdict: 'contradicted', why: `HTTP ${status ?? 'error'}` };
  const id = new URL(requested).searchParams.get('recid');
  if (finalUrl !== requested && id && !finalUrl.includes(id)) {
    return { verdict: 'contradicted', why: `redirects to a generic page: ${finalUrl}` };
  }
  return { verdict: 'confirmed', why: finalUrl === requested ? 'HTTP 200' : `HTTP 200 → ${finalUrl}` };
}

// ── Decisions ────────────────────────────────────────────────────────────────

/** Does the place's own name or description name this manager? Corroboration for a text-only agency. */
export function namesManager(agency: string, name: string, description: string): boolean {
  const t = `${name} || ${description}`;
  const rules: Record<string, RegExp> = {
    'State Park': /\bstate park\b/i,
    Municipal: /\bcity (access|park)\b|\bcity of\b/i,
    MDC: /\bMDC\b|\bconservation area\b/i,
    NPS: /\bNPS\b|national scenic riverway|national (park|river)\b/i,
    USFS: /\bforest service\b|\bUSFS\b/i,
    Private: /\bprivate (bridge )?access\b|\bno public access\b/i,
    AGFC: /\bAGFC\b|game and fish/i,
  };
  return rules[agency]?.test(t) ?? false;
}

/** A place named as a city park: AGFC may own the ramp, but the city may run the place. */
export const cityParkName = (name: string) => /\bcity park\b|\(.*\bpark\)/i.test(name);

export interface Decision { accept: boolean; proposed?: unknown; reason: string }

/**
 * Whether a managing-agency proposal is good enough to write:
 *   - the agency's own land or operator record confirms it; or
 *   - nothing contradicts it and a second, separate source agrees: two
 *     concordant agency sources (confidence high), the record's curated
 *     ownership plus every known-owner AGFC record saying AGFC (not for a place
 *     named as a city park), or the place's own name/description naming it.
 * Ambiguous and contradicted values are never written.
 */
export function decideAgency(a: { proposed: string; verdict: Verdict; confidence: string; ownership: string | null; name: string; description: string }): Decision {
  if (a.verdict === 'confirmed') return { accept: true, reason: 'confirmed by the agency’s own land/operator record' };
  if (a.verdict !== 'unverified') return { accept: false, reason: `${a.verdict} by land records` };
  if (a.confidence === 'high') return { accept: true, reason: 'two concordant agency sources; no land record contradicts' };
  if (a.proposed === 'AGFC') {
    if (cityParkName(a.name)) return { accept: false, reason: 'named as a city park: confirm AGFC, not the city, runs it' };
    if ((a.ownership ?? '').trim() === 'AGFC') return { accept: true, reason: 'curated ownership and AGFC records agree; no conflicting owner' };
    return { accept: false, reason: 'AGFC records only' };
  }
  if (namesManager(a.proposed, a.name, a.description)) return { accept: true, reason: 'the place’s own name/description names this manager' };
  return { accept: false, reason: 'one source only (ownership text or one agency record); not corroborated' };
}

/** Text surface words → the road_surface base they assert. */
export function roadVerdict(proposed: string[], text: string): { verdict: Verdict; why: string } {
  const t = text.toLowerCase();
  const says = new Set<string>();
  if (/\b(paved|asphalt|blacktop|concrete road)\b/.test(t)) says.add('paved');
  if (/\bgravel (road|access road|lane)\b|\bgravel\b(?= road)/.test(t)) says.add('gravel_maintained');
  if (/\b(dirt|unimproved|4x4|4wd|high[- ]clearance)\b/.test(t)) says.add('dirt');
  const base = proposed.filter((x) => x !== 'seasonal');
  if (says.size === 0) return { verdict: 'unverified', why: 'record text does not describe the road surface' };
  if (base.some((b) => says.has(b))) return { verdict: 'confirmed', why: `record text agrees (${[...says].join('/')})` };
  return { verdict: 'contradicted', why: `record text says ${[...says].join('/')}` };
}

async function fetchLink(url: string): Promise<{ status: number | null; finalUrl: string | null }> {
  try {
    const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(30_000), headers: { 'User-Agent': 'eddy-float-planner/1.0 (link check; https://eddy.guide)' } });
    return { status: res.status, finalUrl: res.url };
  } catch {
    return { status: null, finalUrl: null };
  }
}

async function main() {
  const round1 = parseCsv(readFileSync(join(DIR, 'review-round1-applied.csv'), 'utf8')).filter((r) => r.accept === 'y');
  const round2 = parseCsv(readFileSync(join(DIR, 'review.csv'), 'utf8')).filter((r) => r.confidence !== 'flag' && r.proposed);
  const items: Record<string, string>[] = [
    ...round1.map((r): Record<string, string> => ({ ...r, round: 'round1-applied' })),
    ...round2.map((r): Record<string, string> => ({ ...r, round: 'round2-proposed' })),
  ].filter((r) => ['managing_agency', 'official_site_url', 'amenities', 'parking_info', 'road_surface'].includes(r.field));

  const db = getScriptClient({ script: 'audit-access-enrichment-2026-11', write: false });
  const aps = await selectAll<{ id: string; name: string; nps_campground_id: string | null; location_orig: { coordinates?: number[] } | null;
    description: string | null; facilities: string | null; parking_info: string | null; local_tips: string | null; types: string[] | null;
    road_access: string | null; ownership: string | null; amenities: string[] | null }>(
    (a, b) => db.from('access_points').select('id, name, nps_campground_id, location_orig, description, facilities, parking_info, local_tips, types, road_access, ownership, amenities').in('id', [...new Set(items.map((i) => i.access_point_id))]).order('id').range(a, b));
  const pin = new Map(aps.map((a) => [a.id, a.location_orig?.coordinates as LngLat | undefined]));
  const apById = new Map(aps.map((a) => [a.id, a]));
  /** The operator's own records: a linked NPS campground, or a same-named USFS recreation site within 300 m. */
  const operators = async (id: string, p: LngLat): Promise<OperatorRecords> => {
    const ap = apById.get(id)!;
    const sites = await arcgis(USFS_SITES, { ...envelopeFilter(envelope(p, 300)), returnGeometry: 'false', outFields: 'site_name,public_site_name' });
    const names = ((sites.features as { attributes: Record<string, unknown> }[]) ?? [])
      .map((f) => String(f.attributes.public_site_name ?? f.attributes.site_name ?? ''));
    const usfsSite = names.find((n) => sharesDistinctiveName(ap.name, n)) ?? null;
    return { npsCampground: !!ap.nps_campground_id, usfsSite };
  };

  const out = await mapLimit(items, 4, async (r) => {
    const p = pin.get(r.access_point_id);
    if (!p) return { ...r, verdict: 'unverified', why: 'no pin' };
    if (r.field === 'amenities') {
      // One verdict per ADDED amenity; the row is as strong as its weakest addition.
      const ap = apById.get(r.access_point_id)!;
      const text = [ap.description, ap.facilities, ap.parking_info, ap.local_tips].filter(Boolean).join(' || ');
      const before = new Set<string>(JSON.parse(r.current || '[]') ?? []);
      const added = (JSON.parse(r.proposed) as string[]).filter((a) => !before.has(a));
      // A matched agency lot is itself the corroboration for `parking`, as for parking_info.
      const each = added.map((a) => {
        const v = amenityVerdict(a, text, ap.types ?? []);
        return { a, ...(a === 'parking' && v.verdict === 'unverified' ? { verdict: 'confirmed' as Verdict, why: 'agency lot record; record text does not deny parking' } : v) };
      });
      const rank = { contradicted: 0, unverified: 1, ambiguous: 1, confirmed: 2 } as const;
      const worst = each.reduce((w, e) => (rank[e.verdict] < rank[w] ? e.verdict : w), 'confirmed' as Verdict);
      return { ...r, verdict: worst, why: each.map((e) => `${e.a}: ${e.verdict} (${e.why})`).join(' | '),
        confirmed_additions: JSON.stringify(each.filter((e) => e.verdict === 'confirmed').map((e) => e.a)) };
    }
    if (r.field === 'parking_info') {
      const ap = apById.get(r.access_point_id)!;
      const text = [ap.description, ap.facilities, ap.local_tips].filter(Boolean).join(' || ');
      const v = amenityVerdict('parking', text, ap.types ?? []);
      // A lot record IS the corroboration for parking; only a denial or closure stops it.
      return { ...r, ...(v.verdict === 'contradicted' ? v : { verdict: 'confirmed', why: 'agency lot record; record text does not deny parking' }) };
    }
    if (r.field === 'road_surface') {
      const ap = apById.get(r.access_point_id)!;
      // A name-matched MVUM road is the agency's record of that road; only the record's own text can contradict it.
      const v = roadVerdict(JSON.parse(r.proposed), [ap.road_access, ap.description, ap.local_tips].filter(Boolean).join(' || '));
      return { ...r, ...(v.verdict === 'unverified' ? { verdict: 'confirmed' as Verdict, why: `name-matched MVUM road; ${v.why}` } : v) };
    }
    if (r.field === 'official_site_url') {
      const url = JSON.parse(r.proposed) as string;
      const { status, finalUrl } = await fetchLink(url);
      return { ...r, ...linkVerdict(url, status, finalUrl) };
    }
    const v = landVerdict(JSON.parse(r.proposed), await landAt(p), await operators(r.access_point_id, p));
    return { ...r, ...v };
  });

  const cols = ['round', 'verdict', 'field', 'proposed', 'confirmed_additions', 'river', 'slug', 'name', 'confidence', 'why', 'evidence', 'access_point_id'];
  const rows = (out as Record<string, string>[]).sort((a, b) => a.round.localeCompare(b.round) || a.verdict.localeCompare(b.verdict) || a.slug.localeCompare(b.slug));
  writeFileSync(join(DIR, 'audit.csv'), `${[cols.join(','), ...rows.map((r) => cols.map((c) => csvCell(r[c])).join(','))].join('\n')}\n`);
  const tally: Record<string, Record<string, number>> = {};
  for (const r of rows) (tally[`${r.round} ${r.field}`] ??= {})[r.verdict] = ((tally[`${r.round} ${r.field}`] ?? {})[r.verdict] ?? 0) + 1;
  console.table(tally);
  console.log(`Wrote ${rows.length} checks to ${join(DIR, 'audit.csv')}. Nothing was written to the database.`);
  if (!process.argv.includes('--decide')) return;

  // ── Round 2: what to write ────────────────────────────────────────────────
  const decided = rows.filter((r) => r.round === 'round2-proposed').map((r): Record<string, string> => {
    const ap = apById.get(r.access_point_id)!;
    let d: Decision;
    if (r.field === 'managing_agency') {
      d = decideAgency({ proposed: JSON.parse(r.proposed), verdict: r.verdict as Verdict, confidence: r.confidence, ownership: ap.ownership, name: ap.name, description: ap.description ?? '' });
    } else if (r.field === 'amenities') {
      // Write only the confirmed additions, on top of the current value.
      const keep: string[] = JSON.parse(r.confirmed_additions ?? '[]');
      const current: string[] = JSON.parse(r.current || '[]') ?? [];
      d = keep.length ? { accept: true, proposed: [...current, ...keep], reason: `confirmed additions only: ${keep.join(', ')}` } : { accept: false, reason: r.why };
    } else {
      d = r.verdict === 'confirmed' ? { accept: true, reason: r.why } : { accept: false, reason: `${r.verdict}: ${r.why}` };
    }
    return { ...r, accept: d.accept ? 'y' : '', proposed: d.proposed !== undefined ? JSON.stringify(d.proposed) : r.proposed, decision: d.reason };
  });

  // ── Round 1: correct what was already written ─────────────────────────────
  // An applied amenity addition that is not confirmed comes back out: the value
  // returns to its pre-apply state plus the confirmed additions only.
  const rollback = new Map((JSON.parse(readFileSync(join(DIR, 'rollback-2026-10-31.json'), 'utf8')).rollback as Record<string, unknown>[]).map((x) => [x.id as string, x]));
  const corrections = rows.filter((r) => r.round === 'round1-applied' && r.field === 'amenities').flatMap((r): Record<string, string>[] => {
    const original = ((rollback.get(r.access_point_id)?.amenities as string[] | null) ?? []);
    const keep: string[] = JSON.parse(r.confirmed_additions ?? '[]');
    const applied: string[] = JSON.parse(r.proposed);
    const corrected = [...original, ...keep.filter((k) => !original.includes(k))];
    if (JSON.stringify(corrected) === JSON.stringify(applied)) return [];
    const removed = applied.filter((a) => !corrected.includes(a));
    return [{ ...r, accept: 'y', current: JSON.stringify(applied), proposed: JSON.stringify(corrected), decision: `remove ${removed.join(', ')}: ${r.why}` }];
  });
  const flagged = rows.filter((r) => r.round === 'round1-applied' && r.field !== 'amenities' && r.verdict === 'contradicted');
  if (flagged.length) console.warn(`Round-1 non-amenity contradictions to resolve by hand: ${flagged.map((f) => `${f.slug}.${f.field}`).join(', ')}`);

  const sheetCols = ['accept', 'decision', 'confidence', 'river', 'slug', 'name', 'field', 'current', 'proposed', 'evidence', 'evidence_ids', 'evidence_url', 'launch_map', 'note', 'access_point_id'];
  const write = (file: string, list: Record<string, string>[]) =>
    writeFileSync(join(DIR, file), `${[sheetCols.join(','), ...list.map((r) => sheetCols.map((c) => csvCell(r[c])).join(','))].join('\n')}\n`);
  // Carry the review sheet's evidence columns onto decided rows (audit rows only hold a subset).
  const sheet = new Map(parseCsv(readFileSync(join(DIR, 'review.csv'), 'utf8')).map((r) => [`${r.access_point_id}|${r.field}`, r]));
  write('round2-decided.csv', decided.map((r) => ({ ...sheet.get(`${r.access_point_id}|${r.field}`), ...r })));
  const r1 = new Map(parseCsv(readFileSync(join(DIR, 'review-round1-applied.csv'), 'utf8')).map((r) => [`${r.access_point_id}|${r.field}`, r]));
  write('round1-corrections.csv', corrections.map((r) => ({ ...r1.get(`${r.access_point_id}|${r.field}`), ...r })));
  console.log(`Round 2: ${decided.filter((d) => d.accept).length} of ${decided.length} rows accepted → round2-decided.csv`);
  console.log(`Round 1: ${corrections.length} amenity corrections → round1-corrections.csv`);
}

/**
 * --whole-table: the same amenity and land checks over EVERY approved access
 * point, so problems that predate this session are visible too. Each finding
 * says whether this session wrote the value (from the rollback files) or it
 * was already there. Writes audit-whole-table.csv; changes nothing.
 */
async function wholeTable() {
  const db = getScriptClient({ script: 'audit-access-enrichment-2026-11:whole-table', write: false });
  const aps = await selectAll<{ id: string; slug: string; name: string; managing_agency: string | null; amenities: string[] | null; types: string[] | null;
    nps_campground_id: string | null; official_site_url: string | null; location_orig: { coordinates?: number[] } | null;
    description: string | null; facilities: string | null; parking_info: string | null; local_tips: string | null }>(
    (a, b) => db.from('access_points').select('id, slug, name, managing_agency, amenities, types, nps_campground_id, official_site_url, location_orig, description, facilities, parking_info, local_tips')
      .eq('approved', true).order('id').range(a, b));
  // What this session wrote: any field whose pre-apply value is in a rollback file.
  const before = new Map<string, Record<string, unknown>>();
  for (const f of ['rollback-2026-10-31.json', 'rollback-round2-2026-10-31.json']) {
    for (const x of JSON.parse(readFileSync(join(DIR, f), 'utf8')).rollback as Record<string, unknown>[]) {
      before.set(x.id as string, { ...(x as object), ...(before.get(x.id as string) ?? {}) });
    }
  }
  const findings: Record<string, string>[] = [];
  await mapLimit(aps, 4, async (ap) => {
    const text = [ap.description, ap.facilities, ap.parking_info, ap.local_tips].filter(Boolean).join(' || ');
    const orig = before.get(ap.id);
    const origAmenities = new Set<string>(((orig?.amenities as string[] | null | undefined) ?? (orig && 'amenities' in orig ? [] : ap.amenities)) ?? []);
    for (const a of ap.amenities ?? []) {
      const v = amenityVerdict(a, text, ap.types ?? []);
      if (v.verdict === 'contradicted') {
        findings.push({ slug: ap.slug, name: ap.name, field: 'amenities', value: a, verdict: v.verdict, why: v.why,
          source: orig && 'amenities' in orig && !origAmenities.has(a) ? 'this session' : 'pre-existing' });
      }
    }
    const p = ap.location_orig?.coordinates as LngLat | undefined;
    if (p && (ap.managing_agency === 'NPS' || ap.managing_agency === 'USFS')) {
      const sites = await arcgis(USFS_SITES, { ...envelopeFilter(envelope(p, 300)), returnGeometry: 'false', outFields: 'site_name,public_site_name' });
      const names = ((sites.features as { attributes: Record<string, unknown> }[]) ?? []).map((f) => String(f.attributes.public_site_name ?? f.attributes.site_name ?? ''));
      const v = landVerdict(ap.managing_agency, await landAt(p), { npsCampground: !!ap.nps_campground_id, usfsSite: names.find((n) => sharesDistinctiveName(ap.name, n)) ?? null });
      if (v.verdict === 'contradicted' || v.verdict === 'ambiguous') {
        findings.push({ slug: ap.slug, name: ap.name, field: 'managing_agency', value: ap.managing_agency, verdict: v.verdict, why: v.why,
          source: orig && 'managing_agency' in orig && orig.managing_agency !== ap.managing_agency ? 'this session' : 'pre-existing' });
      }
    }
    if (ap.official_site_url && /fs\.usda\.gov\/recarea\//.test(ap.official_site_url)) {
      findings.push({ slug: ap.slug, name: ap.name, field: 'official_site_url', value: ap.official_site_url, verdict: 'contradicted',
        why: 'pre-2025 USFS link format; these redirect to the forest’s generic recreation page', source: 'pre-existing' });
    }
  });
  findings.sort((a, b) => a.source.localeCompare(b.source) || a.field.localeCompare(b.field) || a.slug.localeCompare(b.slug));
  const cols = ['source', 'field', 'verdict', 'slug', 'name', 'value', 'why'];
  writeFileSync(join(DIR, 'audit-whole-table.csv'), `${[cols.join(','), ...findings.map((r) => cols.map((c) => csvCell(r[c])).join(','))].join('\n')}\n`);
  const tally: Record<string, Record<string, number>> = {};
  for (const f of findings) (tally[`${f.source} ${f.field}`] ??= {})[f.verdict] = ((tally[`${f.source} ${f.field}`] ?? {})[f.verdict] ?? 0) + 1;
  console.log(`${aps.length} approved access points checked.`);
  console.table(tally);
  console.log(`Wrote ${findings.length} findings to ${join(DIR, 'audit-whole-table.csv')}. Nothing was written to the database.`);
}

if (require.main === module) (process.argv.includes('--whole-table') ? wholeTable() : main()).catch((error) => { console.error(error); process.exitCode = 1; });
