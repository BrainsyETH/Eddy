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
    // Matched on station name AND on USGS site id, because plenty of people
    // know a gauge as "07068000" and nothing else.
    const { data: gaugeRows, error: gaugeError } = await supabase
      .from('gauge_stations')
      .select('id, name, usgs_site_id')
      .eq('active', true)
      .or(`name.ilike.${pattern},usgs_site_id.ilike.${pattern}`)
      .order('name', { ascending: true })
      .limit(limit);

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

    const gaugeResults: SearchResult[] = (gaugeRows ?? []).map((g) => {
      const river = riverByGauge.get(g.id);
      return {
        kind: 'gauge' as const,
        id: g.id,
        name: g.name,
        subtitle: [river ? river.name : 'USGS gauge', g.usgs_site_id]
          .filter(Boolean)
          .join(' · '),
        riverId: river?.id ?? null,
        riverName: river?.name ?? null,
        riverSlug: river?.slug ?? null,
        riverMile: null,
        // Deliberately omitted. gauge_stations.location is PostGIS and comes
        // back in three different shapes depending on how it was written (see
        // the parser in /api/gauges); the client already holds the parsed
        // coordinates from that endpoint and looks them up by id.
        coordinates: null,
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
