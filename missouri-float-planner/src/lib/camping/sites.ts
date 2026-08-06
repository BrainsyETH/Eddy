// src/lib/camping/sites.ts
// Reading individual campsites, and the encoding that makes it affordable.
//
// Same rule as read.ts: Supabase only, never an upstream booking system.

import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveHorizon } from './window';
import type { UnitStatus } from './types';

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
};

/** The night was not measured. Never rendered as "taken". */
export const SITE_NIGHT_UNKNOWN = '-';

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
 * Two queries regardless of how many sites there are. Returns null when the
 * facility is unknown or disabled, which the route renders as a 404 — a
 * campground Eddy does not track is not an error, it is a different question.
 */
export async function loadFacilitySites(
  supabase: SupabaseClient,
  facilityId: string,
  now = new Date(),
): Promise<CampsiteSitesResult | null> {
  const window = resolveHorizon(now);

  const { data: facility, error: facilityError } = await supabase
    .from('campsite_facilities')
    .select('id, display_name, kind, source, enabled')
    .eq('id', facilityId)
    .eq('enabled', true)
    .maybeSingle();

  if (facilityError || !facility) return null;

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

  const bySite = new Map<string, Map<string, UnitStatus>>();
  let fetchedAt: string | null = null;

  for (const row of nightRows) {
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
          name: site.name,
          loop: site.loop,
          siteType: site.site_type,
          maxOccupancy: site.max_occupancy,
          bookingUrl: bookingUrl(source, site.source_site_id),
          nights: window.nights
            .map((date) => {
              const status = nights?.get(date);
              return status ? SITE_NIGHT_CODE[status] : SITE_NIGHT_UNKNOWN;
            })
            .join(''),
        };
      })
      // A site with nothing measured at all is noise in a list somebody is
      // scanning for a place to sleep.
      .filter((site) => site.nights !== SITE_NIGHT_UNKNOWN.repeat(window.nights.length)),
  };
}
