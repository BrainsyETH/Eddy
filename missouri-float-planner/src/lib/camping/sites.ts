// src/lib/camping/sites.ts
// Reading individual campsites, and the encoding that makes it affordable.
//
// Same rule as read.ts: Supabase only, never an upstream booking system.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { CampingSitePolicy } from '../../../shared/camping-policy';
import { campsitePolicy } from './policies';
import { resolveHorizon, resolvePlanningMonth, type CampingWindow } from './window';
import { MAX_AGE_MS } from './freshness';
import type { UnitStatus } from './types';
import type { CampingStayResult } from '../../../shared/camping-stay';

/**
 * One night of one site, as a single character.
 *
 * ── Why a string and not objects ───────────────────────────────────────────
 *
 * Meramec has 197 sites. Fourteen nights of `{date, status}` objects for all of
 * them is roughly 40 KB of JSON; fourteen characters each is 2.7 KB. The reader
 * is on a phone at a put-in with one bar, and the difference is whether the tab
 * opens or spins.
 *
 * The characters align to `window.nights` BY INDEX, so a site's string is
 * always exactly as long as the window and position carries the date. `-` means
 * the night was not measured, which is not the same as nothing being free —
 * a season that ends mid-horizon leaves a real tail of them.
 *
 * MIRRORED in packages/eddy-types as CAMPSITE_NIGHT_CODES for the app to
 * decode, because Vercel installs only missouri-float-planner/ and the app
 * cannot import from it. A parity test is the guard on that duplication.
 */
export const SITE_NIGHT_CODE: Record<UnitStatus, string> = {
  open: 'A',
  reserved: 'R',
  walk_up: 'W',
  closed: 'C',
  not_yet_released: 'N',
  // Server-internal. Never leaves this process: see toWireSiteNights.
  continuation_only: 'O',
};

/** The night was not measured. Never rendered as "taken". */
export const SITE_NIGHT_UNKNOWN = '-';

/**
 * Codes that are read by the server only and replaced before a response.
 *
 * `O` (continuation_only) is a night bookable only after a valid arrival.
 * Stay search needs that distinction — Available then Open is a real two-night
 * stay — but a per-night list cannot say "free if you are already here", and
 * the app's table (CAMPSITE_NIGHT_CODES) does not carry it. On the wire it
 * reads as the arrival question it answers: not yet released.
 */
const WIRE_PROJECTION: Readonly<Record<string, string>> = {
  [SITE_NIGHT_CODE.continuation_only]: SITE_NIGHT_CODE.not_yet_released,
};

/**
 * One site's night string, server-side: a code per `windowNights` entry,
 * `-` where nothing was measured. Pure, so the codec is tested end to end
 * (provider parse -> encode -> stay search) without a database.
 */
export function encodeSiteNights(
  windowNights: readonly string[],
  byDate: ReadonlyMap<string, UnitStatus> | undefined,
): string {
  return windowNights
    .map((date) => {
      const status = byDate?.get(date);
      return status ? SITE_NIGHT_CODE[status] : SITE_NIGHT_UNKNOWN;
    })
    .join('');
}

/** One site's night string as the app may see it. */
export function toWireSiteNights(nights: string): string {
  let out = '';
  for (const code of nights) out += WIRE_PROJECTION[code] ?? code;
  return out;
}

/** Every code that can appear in an /api/campsites response. */
export const WIRE_SITE_NIGHT_CODES: ReadonlySet<string> = new Set(
  Object.values(SITE_NIGHT_CODE).filter((code) => !(code in WIRE_PROJECTION)),
);

/** A site list for the wire. Does not mutate its input. */
export function toWireSites(result: CampsiteSitesResult): CampsiteSitesResult {
  return {
    ...result,
    sites: result.sites.map((site) => ({ ...site, nights: toWireSiteNights(site.nights) })),
  };
}

/**
 * A stay-search result for the wire. Only the raw night strings are
 * projected: each site's per-night `state` and whole-stay verdict were
 * computed from the internal codes and are already in the app's vocabulary.
 */
export function toWireStay(result: CampingStayResult): CampingStayResult {
  const wire = <S extends { nights: string }>(site: S): S => ({
    ...site,
    nights: toWireSiteNights(site.nights),
  });
  return {
    ...result,
    availableSites: result.availableSites.map(wire),
    sites: result.sites.map((entry) => ({ ...entry, site: wire(entry.site) })),
  };
}

/**
 * Rows per request.
 *
 * Under PostgREST's default 1,000 ceiling on purpose. Asking for exactly the
 * limit makes "a full page" and "the server truncated me" the same observation,
 * and the whole point of paging here is to be able to tell those apart.
 */
const PAGE = 900;

/** One individual campsite and its fortnight. */
export interface CampsiteSiteInfo {
  policy?: CampingSitePolicy;
  id: string;
  /** What the booking page prints — `RTL3`, `Electric 50 amp #178`. */
  name: string | null;
  loop: string | null;
  /** The provider's own vocabulary, unmapped. Null for Missouri State Parks. */
  siteType: string | null;
  maxOccupancy: number | null;
  /** Deep link to this exact site, when its provider has a per-site page. */
  bookingUrl: string | null;
  /** One character per `window.nights`, aligned by index. See SITE_NIGHT_CODE. */
  nights: string;
}

export interface CampsiteSitesResult {
  facility: {
    id: string;
    displayName: string;
    kind: string;
    source: string;
  };
  window: { startDate: string; endDate: string; label: string; nights: string[] };
  /** Oldest night's timestamp — the weakest part of the answer. */
  fetchedAt: string | null;
  sites: CampsiteSiteInfo[];
}

interface SiteRow {
  id: string;
  name: string | null;
  loop: string | null;
  site_type: string | null;
  max_occupancy: number | null;
  source_site_id: string;
}

/**
 * Recreation.gov publishes a page per campsite, keyed by the very id its
 * availability endpoint reports. UseDirect has no per-unit URL — its booking
 * flow is a park-level calendar — so those sites deep-link nowhere and the app
 * falls back to the facility's own reservation link.
 */
function bookingUrl(source: string, sourceSiteId: string): string | null {
  return source === 'recreation_gov'
    ? `https://www.recreation.gov/camping/campsites/${encodeURIComponent(sourceSiteId)}`
    : null;
}

/**
 * Every site at one facility, with its fortnight.
 *
 * A fixed number of queries regardless of how many sites there are (the
 * per-site read pages, below). Returns null when the
 * facility is unknown or disabled, which the route renders as a 404 — a
 * campground Eddy does not track is not an error, it is a different question.
 */
export async function loadFacilitySites(
  supabase: SupabaseClient,
  facilityId: string,
  now = new Date(),
  month?: string,
): Promise<CampsiteSitesResult | null> {
  const window = month ? resolvePlanningMonth(month, now) : resolveHorizon(now);
  if (!window) return null;

  return loadFacilitySitesForWindow(supabase, facilityId, window, now);
}

export async function loadFacilitySitesForWindow(
  supabase: SupabaseClient, facilityId: string, window: CampingWindow, now = new Date(),
): Promise<CampsiteSitesResult | null> {
  const { data: facility, error: facilityError } = await supabase
    .from('campsite_facilities')
    .select('id, display_name, kind, source, source_facility_id, enabled')
    .eq('id', facilityId)
    .eq('enabled', true)
    .maybeSingle();

  if (facilityError) throw new Error(`campsite_facilities: ${facilityError.message}`);
  if (!facility) return null;

  const { data: siteRows, error: sitesError } = await supabase
    .from('campsite_sites')
    .select('id, name, loop, site_type, max_occupancy, source_site_id')
    .eq('facility_id', facilityId);

  if (sitesError) throw new Error(`campsite_sites: ${sitesError.message}`);

  const sites = (siteRows ?? []) as SiteRow[];
  if (sites.length === 0) return null;

  // ── PAGED, because the cap is silent ──────────────────────────────────────
  //
  // PostgREST answers at most `db-max-rows` and says nothing about it: asked
  // for 14,293 rows it returns 1,000, no error, no flag. Meramec is 197 sites
  // across a fourteen-night horizon — 2,758 rows — so an unpaged read would
  // drop 1,758 of them and every dropped night would decode as `-`, which this
  // feature renders as "not measured".
  //
  // That is the precise failure the whole design is built to avoid: a gap means
  // Eddy did not look, and a truncated response would put that claim against
  // two thirds of a campground that was measured perfectly well. Silence about
  // a fact is honest; inventing silence is not.
  const nightRows: { site_id: string; date: string; status: string; fetched_at: string }[] = [];
  const siteIds = sites.map((s) => s.id);

  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('campsite_site_availability')
      .select('site_id, date, status, fetched_at')
      .in('site_id', siteIds)
      .in('date', window.nights)
      // Ordered so the pages tile rather than overlap: without a total order
      // the server may return the same row on two pages and omit another.
      .order('site_id', { ascending: true })
      .order('date', { ascending: true })
      .range(from, from + PAGE - 1);

    if (error) throw new Error(`campsite_site_availability: ${error.message}`);
    const page = data ?? [];
    nightRows.push(...(page as typeof nightRows));
    // A short page is the last one. A full page might be the last one too, and
    // costs one empty round trip to find out — cheaper than a wrong answer.
    if (page.length < PAGE) break;
  }

  // ── ONE OBSERVATION PER NIGHT ─────────────────────────────────────────────
  //
  // The sync writes the facility's total and its per-site rows from one payload
  // with one timestamp, but the per-site upsert never deletes: a site missing
  // from today's payload keeps yesterday's row. On 2026-10-09 that was 17 of
  // Meramec's sites still "open" beside a total that no longer counted them.
  // A site row is shown only when it belongs to the same observation as the
  // number on the card; anything else is unknown, which renders as a gap.
  const { data: totals, error: totalsError } = await supabase
    .from('campsite_availability')
    .select('date, fetched_at')
    .eq('facility_id', facilityId)
    .in('date', window.nights);

  if (totalsError) throw new Error(`campsite_availability: ${totalsError.message}`);
  const observedAt = new Map<string, number>();
  for (const row of (totals ?? []) as { date: string; fetched_at: string }[]) {
    observedAt.set(row.date, Date.parse(row.fetched_at));
  }

  const bySite = new Map<string, Map<string, UnitStatus>>();
  let fetchedAt: string | null = null;

  for (const row of nightRows) {
    // One expired date cannot invalidate current observations elsewhere in a month.
    const age = now.getTime() - Date.parse(row.fetched_at);
    if (!Number.isFinite(age) || age < 0 || age >= MAX_AGE_MS) continue;
    if (observedAt.get(row.date) !== Date.parse(row.fetched_at)) continue;
    const nights = bySite.get(row.site_id) ?? new Map<string, UnitStatus>();
    nights.set(row.date, row.status as UnitStatus);
    bySite.set(row.site_id, nights);
    if (fetchedAt === null || row.fetched_at < fetchedAt) fetchedAt = row.fetched_at;
  }

  const source = String(facility.source);

  return {
    facility: {
      id: String(facility.id),
      displayName: String(facility.display_name),
      kind: String(facility.kind),
      source,
    },
    window: {
      startDate: window.startDate,
      endDate: window.endDate,
      label: window.label,
      nights: window.nights,
    },
    fetchedAt,
    sites: sites
      .map((site) => {
        const nights = bySite.get(site.id);
        return {
          id: site.id,
          policy: campsitePolicy(source, facility.source_facility_id, site),
          name: site.name,
          loop: site.loop,
          siteType: site.site_type,
          maxOccupancy: site.max_occupancy,
          bookingUrl: bookingUrl(source, site.source_site_id),
          nights: encodeSiteNights(window.nights, nights),
        };
      }),
    // Keep unobserved catalog sites. Detail views hide unknown rows, but need
    // them to distinguish "no confirmed openings" from "nothing open".
  };
}
