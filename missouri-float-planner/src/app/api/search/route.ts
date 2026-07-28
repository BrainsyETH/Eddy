// src/app/api/search/route.ts
// GET /api/search?q= — one query across rivers, gauges and access points.
//
// WHY THIS EXISTS: the iOS map replaced its horizontal river picker with a
// search field that promises "rivers, gauges, and access points". Rivers and
// gauges are each already one flat list the app can hold in memory, but access
// points are not: there are several hundred across the curated rivers, and they
// are only served per-river (/api/rivers/[slug]/access-points). Downloading all
// of them on every map open to make a client-side index would cost more than
// the feature is worth, and would be paid on cellular at a put-in.
//
// So matching happens here, where the rows already are, and only the handful of
// hits crosses the wire. The response is deliberately FLAT — one result list,
// pre-sorted, with a pre-composed subtitle — because the client's job is to
// render it, not to decide what a gauge's second line should say.
//
// SCOPE: active rivers and approved access points only, matching every other
// public endpoint. An unapproved access point is not a place we send people.

import { NextRequest, NextResponse } from 'next/server';
import { cdnCacheHeaders } from '@/lib/api-utils';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { withX402Route } from '@/lib/x402-config';
import { toNum } from '@/lib/utils/num';

export const dynamic = 'force-dynamic';

/** Below this a query matches most of the database and helps nobody. */
const MIN_QUERY_LENGTH = 2;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

export type SearchResultKind = 'river' | 'gauge' | 'access_point';

/**
 * The live reading a gauge result carries.
 *
 * NESTED rather than spread across SearchResult, and present only on `gauge`
 * rows. A river result has a condition of its own that means something else
 * entirely, and an access point has no reading at all; six nullable columns at
 * the top level would invite exactly the confusion between the two vocabularies
 * that GaugeFilterBar's header spends a paragraph guarding against.
 *
 * Added because the phone's Search tab now lists the national tier, and a row
 * that can only say "USGS 07019000" is a row nobody can act on. Every field
 * here comes back from search_gauges in the same query that found the station,
 * so it costs no extra round trip.
 */
export interface SearchResultGauge {
  /** Eddy rates this station against a river; it has a condition ladder. */
  curated: boolean;
  gaugeHeightFt: number | null;
  dischargeCfs: number | null;
  readingTimestamp: string | null;
  readingAgeHours: number | null;
  /** 0-100 vs this site's own day-of-year history; null when none is held. */
  flowPercentile: number | null;
}

export interface SearchResult {
  kind: SearchResultKind;
  id: string;
  name: string;
  subtitle: string | null;
  riverId: string | null;
  riverName: string | null;
  riverSlug: string | null;
  riverMile: number | null;
  coordinates: { lng: number; lat: number } | null;
  /**
   * The station's provider-native site id. Gauge results only.
   *
   * It was always in the row and always dropped into the subtitle, which meant
   * a client could SHOW "07019000" and not ADDRESS it — every per-gauge route
   * (/api/gauges/:siteId, its /history) keys off this, not off `id`.
   */
  siteId?: string | null;
  /** Gauge results only; null when the station has no stored reading. */
  gauge?: SearchResultGauge | null;
}

export interface SearchResponse {
  query: string;
  results: SearchResult[];
}

/**
 * Escapes a user string for PostgREST's `ilike` pattern syntax.
 *
 * `%` and `_` are wildcards and `\` escapes them, so a raw query containing any
 * of the three either matches far too much or errors. Commas and parentheses go
 * too: PostgREST parses the filter string itself, and an unescaped comma inside
 * an `.or()` splits it into two filters.
 */
function escapeLike(input: string): string {
  return input.replace(/[\\%_(),]/g, '');
}

/**
 * Human-readable access-point type. Kept in step with AccessPointType in
 * src/types/api.ts — a type we do not recognise falls through to its raw slug
 * with the underscores taken out rather than being dropped.
 */
const ACCESS_TYPE_LABELS: Record<string, string> = {
  boat_ramp: 'Boat ramp',
  gravel_bar: 'Gravel bar',
  campground: 'Campground',
  bridge: 'Bridge',
  access: 'Access',
  park: 'Park',
};

function accessTypeLabel(type: string | null): string {
  if (!type) return 'Access';
  return ACCESS_TYPE_LABELS[type] ?? type.replace(/_/g, ' ');
}

function coordsOf(row: {
  location_orig?: unknown;
  location_snap?: unknown;
}): { lng: number; lat: number } | null {
  // location_orig first, matching /api/rivers/[slug]/access-points: the snapped
  // location is snapped to simplified seed geometry and is the worse of the two
  // until NHD river data lands.
  const source =
    (row.location_orig as { coordinates?: number[] } | null)?.coordinates ??
    (row.location_snap as { coordinates?: number[] } | null)?.coordinates;
  if (!source || source.length < 2) return null;
  const [lng, lat] = source;
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
  return { lng, lat };
}

async function _GET(request: NextRequest) {
  try {
    // 60/min per IP, matching /api/rivers. A search field fires on a debounce,
    // so a person typing costs a handful of requests, not one per keystroke.
    const limited = await rateLimit(`search:${getClientIp(request)}`, 60, 60 * 1000);
    if (limited) return limited;

    const raw = (request.nextUrl.searchParams.get('q') ?? '').trim();
    const limit = Math.min(
      MAX_LIMIT,
      Math.max(1, parseInt(request.nextUrl.searchParams.get('limit') ?? '', 10) || DEFAULT_LIMIT),
    );

    if (raw.length < MIN_QUERY_LENGTH) {
      return NextResponse.json<SearchResponse>({ query: raw, results: [] });
    }

    const needle = escapeLike(raw);
    if (!needle) {
      return NextResponse.json<SearchResponse>({ query: raw, results: [] });
    }
    const pattern = `%${needle}%`;

    const supabase = await createClient();

    // Active rivers are fetched unconditionally rather than as a join: they are
    // a small table, every other section needs to resolve a river id to a name,
    // and doing it once here keeps the access-point query from depending on an
    // embed that no other route in this app relies on.
    const { data: rivers, error: riversError } = await supabase
      .from('rivers')
      .select('id, name, slug, region, state')
      .eq('active', true)
      .order('name', { ascending: true });

    if (riversError) {
      console.error('Error fetching rivers for search:', riversError);
      return NextResponse.json({ error: 'Search unavailable' }, { status: 500 });
    }

    const riverById = new Map((rivers ?? []).map((r) => [r.id, r]));
    const activeRiverIds = [...riverById.keys()];

    if (activeRiverIds.length === 0) {
      return NextResponse.json<SearchResponse>({ query: raw, results: [] });
    }

    const lowered = needle.toLowerCase();

    // ── Rivers ──────────────────────────────────────────────────
    // Filtered in memory. The list is already loaded and small, and matching
    // here lets a region ("Ozarks") hit as well as a name.
    const riverResults: SearchResult[] = (rivers ?? [])
      .filter(
        (r) =>
          r.name?.toLowerCase().includes(lowered) ||
          r.slug?.toLowerCase().includes(lowered) ||
          r.region?.toLowerCase().includes(lowered),
      )
      .map((r) => ({
        kind: 'river' as const,
        id: r.id,
        name: r.name,
        subtitle: r.region ?? r.state ?? null,
        riverId: r.id,
        riverName: r.name,
        riverSlug: r.slug,
        riverMile: null,
        coordinates: null,
      }));

    // ── Access points ───────────────────────────────────────────
    const { data: accessRows, error: accessError } = await supabase
      .from('access_points')
      .select('id, name, slug, river_id, river_mile_downstream, type, location_orig, location_snap')
      .eq('approved', true)
      .in('river_id', activeRiverIds)
      .ilike('name', pattern)
      .order('name', { ascending: true })
      .limit(limit);

    if (accessError) console.error('Access point search failed (non-fatal):', accessError);

    const accessResults: SearchResult[] = (accessRows ?? [])
      .map((ap): SearchResult | null => {
        const river = ap.river_id ? riverById.get(ap.river_id) : undefined;
        // An access point whose river is inactive has nowhere to navigate to.
        if (!river) return null;
        const mile = toNum(ap.river_mile_downstream);
        return {
          kind: 'access_point' as const,
          id: ap.id,
          name: ap.name,
          subtitle: [
            accessTypeLabel(ap.type),
            river.name,
            mile != null ? `Mile ${mile.toFixed(1)}` : null,
          ]
            .filter(Boolean)
            .join(' · '),
          riverId: river.id,
          riverName: river.name,
          riverSlug: river.slug,
          riverMile: mile,
          coordinates: coordsOf(ap),
        };
      })
      .filter((r): r is SearchResult => r !== null);

    // ── Gauges ──────────────────────────────────────────────────
    // Matched on station name AND on site id, because plenty of people know a
    // gauge as "07068000" and nothing else.
    //
    // NOW THROUGH search_gauges (00196), which is what this block's previous
    // comment said it should be doing. That RPC keeps the curated-first
    // ordering — load-bearing since the national tier activated, or "Big"
    // returns nine BIG CREEK NR ... stations ahead of Big River — and adds the
    // two things a hand-rolled PostgREST query cannot get:
    //
    //   COORDINATES, via st_x/st_y in the database. The old block shipped
    //   `coordinates: null` on every gauge with a comment explaining that a
    //   national gauge found by search was therefore a result the map could not
    //   fly to. It selects, and the camera stays put. That is now fixed.
    //
    //   THE LATEST READING, via the left join onto gauge_latest, so a gauge row
    //   in a result list can state its number instead of its id. The phone's
    //   Search tab lists the national tier now; a row that can only say "USGS
    //   07019000" is a row nobody can act on.
    //
    // It goes through the ADMIN client, and that is the whole reason the RPC sat
    // unused: src/types/database.ts predates 00196, so .rpc('search_gauges')
    // against the TYPED anon client above does not compile. The admin client is
    // deliberately untyped (see its header), which is also how /api/gauges and
    // /api/gauges/map already read this exact table. Nothing about RLS is being
    // worked around — gauge stations are public reference data, and the
    // access-point query above keeps the anon client precisely because ITS rows
    // are not.
    //
    // It also matches site ids by PREFIX rather than by substring, which is the
    // one behavioural difference: "7019000" no longer finds 07019000. A site
    // number is read left to right and nobody searches from its middle.
    const gaugeAdmin = createAdminClient();
    const { data: gaugeRpcRows, error: gaugeError } = await gaugeAdmin.rpc('search_gauges', {
      p_query: needle,
      p_limit: limit,
    });

    interface SearchGaugeRow {
      id: string;
      site_id: string | null;
      name: string | null;
      curated: boolean;
      lng: number | null;
      lat: number | null;
      discharge_cfs: number | string | null;
      gauge_height_ft: number | string | null;
      reading_timestamp: string | null;
      flow_percentile: number | null;
    }

    const gaugeRows = (gaugeRpcRows ?? []) as SearchGaugeRow[];

    if (gaugeError) console.error('Gauge search failed (non-fatal):', gaugeError);

    // Resolve each matched gauge to the river it grades, preferring the primary
    // association — a station can serve two rivers, and the primary one is the
    // river whose page the app should open.
    const gaugeIds = (gaugeRows ?? []).map((g) => g.id);
    type RiverRow = NonNullable<typeof rivers>[number];
    const riverByGauge = new Map<string, RiverRow>();
    if (gaugeIds.length > 0) {
      const { data: links } = await supabase
        .from('river_gauges')
        .select('gauge_station_id, river_id, is_primary')
        .in('gauge_station_id', gaugeIds)
        .order('is_primary', { ascending: false });

      for (const link of links ?? []) {
        // Both sides of the join are nullable in the schema. The ordering above
        // puts primaries first, so the first row that survives this is the
        // association the app should navigate to.
        if (!link.gauge_station_id || riverByGauge.has(link.gauge_station_id)) continue;
        const river = link.river_id ? riverById.get(link.river_id) : undefined;
        if (river) riverByGauge.set(link.gauge_station_id, river);
      }
    }

    const now = Date.now();

    const gaugeResults: SearchResult[] = (gaugeRows ?? []).map((g) => {
      const river = riverByGauge.get(g.id);
      const readingTimestamp = g.reading_timestamp;
      const parsed = readingTimestamp ? new Date(readingTimestamp).getTime() : NaN;
      const readingAgeHours = Number.isFinite(parsed) ? (now - parsed) / 3_600_000 : null;
      const gaugeHeightFt = toNum(g.gauge_height_ft);
      const dischargeCfs = toNum(g.discharge_cfs);

      return {
        kind: 'gauge' as const,
        id: g.id,
        name: g.name ?? g.site_id ?? 'Gauge',
        // "USGS gauge" for anything with no river association, which is now the
        // common case rather than the exception — a national station is a real
        // answer to a search, it just is not one Eddy has rated.
        subtitle: [river ? river.name : 'USGS gauge', g.site_id].filter(Boolean).join(' · '),
        riverId: river?.id ?? null,
        riverName: river?.name ?? null,
        riverSlug: river?.slug ?? null,
        riverMile: null,
        // NO LONGER NULL. st_x/st_y in the RPC, so a national gauge found by
        // search is now a result the map can fly to — which is what it always
        // looked like it would do. A station with no location still sends null
        // rather than null island.
        coordinates:
          g.lng !== null && g.lat !== null ? { lng: g.lng, lat: g.lat } : null,
        siteId: g.site_id,
        // Null when the station has no stored reading at all — a real state for
        // a site that reports seasonally, and one the client must render as
        // "no reading" rather than as a zero.
        gauge:
          gaugeHeightFt === null && dischargeCfs === null && readingTimestamp === null
            ? null
            : {
                curated: g.curated,
                gaugeHeightFt,
                dischargeCfs,
                readingTimestamp,
                readingAgeHours,
                flowPercentile: g.flow_percentile,
              },
      };
    });

    // Rivers first, then access points, then gauges. A person typing "current"
    // wants the Current River, not Current River at Van Buren gauge — and an
    // exact-prefix match is promoted within each group.
    const rank = (r: SearchResult) => {
      const name = r.name?.toLowerCase() ?? '';
      if (name === lowered) return 0;
      if (name.startsWith(lowered)) return 1;
      return 2;
    };
    const byRelevance = (a: SearchResult, b: SearchResult) =>
      rank(a) - rank(b) || a.name.localeCompare(b.name);

    const results = [
      ...riverResults.sort(byRelevance),
      ...accessResults.sort(byRelevance),
      ...gaugeResults.sort(byRelevance),
    ].slice(0, limit);

    return NextResponse.json<SearchResponse>(
      { query: raw, results },
      { headers: cdnCacheHeaders(300, 3600) },
    );
  } catch (error) {
    console.error('Error in search endpoint:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = withX402Route(_GET, '/api/search');
