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
import { loadCurrentReadings } from '@/lib/gauges/latest-readings';
import { createClient } from '@/lib/supabase/server';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { withX402Route } from '@/lib/x402-config';
import { toNum } from '@/lib/utils/num';

export const dynamic = 'force-dynamic';

/** Below this a query matches most of the database and helps nobody. */
const MIN_QUERY_LENGTH = 2;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export type SearchResultKind = 'river' | 'gauge' | 'access_point';

const ALL_KINDS: readonly SearchResultKind[] = ['river', 'access_point', 'gauge'];

/**
 * Parses `?kinds=gauge` / `?kinds=river,access_point`.
 *
 * Absent or unrecognisable means every kind, which is what every caller that
 * predates this parameter sends. An explicit list that resolves to nothing is
 * treated the same way rather than returning an empty search: a typo in a query
 * string should not look like "there are no results".
 */
function parseKinds(raw: string | null): readonly SearchResultKind[] {
  if (!raw) return ALL_KINDS;
  const asked = new Set(raw.split(',').map((k) => k.trim()));
  const kinds = ALL_KINDS.filter((k) => asked.has(k));
  return kinds.length > 0 ? kinds : ALL_KINDS;
}

/**
 * Fills `limit` slots from several ranked lists without letting one starve
 * the others.
 *
 * THIS REPLACED A FLAT `.slice(0, limit)` OVER A CONCATENATION, and the bug it
 * fixes was live: rivers and access points were concatenated ahead of gauges,
 * so `?q=river&limit=25` returned nineteen rivers, six access points and ZERO
 * gauges — while the same query at limit=100 returned fourteen. The phone's
 * Gauges tab asks for 25, so a whole category silently vanished for exactly the
 * common words people search with.
 *
 * Each kind is guaranteed an equal share of the budget first; whatever no kind
 * claims is then handed out in the original priority order, so a query matching
 * only rivers still fills the page with rivers. Order within a kind, and the
 * order of the kinds themselves, are both preserved.
 */
export function allocateByKind(
  groups: readonly { kind: SearchResultKind; results: SearchResult[] }[],
  limit: number,
): SearchResult[] {
  const share = Math.max(1, Math.floor(limit / Math.max(1, groups.length)));
  const taken = groups.map((g) => Math.min(g.results.length, share));

  // Hand out the remainder in priority order, one pass, so a kind with more
  // hits than its share can grow into space nobody else wanted.
  let spare = limit - taken.reduce((a, b) => a + b, 0);
  for (let i = 0; i < groups.length && spare > 0; i++) {
    const extra = Math.min(spare, groups[i].results.length - taken[i]);
    taken[i] += extra;
    spare -= extra;
  }

  return groups.flatMap((g, i) => g.results.slice(0, taken[i]));
}

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
  /**
   * The access point's own slug. Access-point results only.
   *
   * Same omission `siteId` had: the column was already selected and already
   * spent on nothing, so a client could render an access point and not open it
   * — its detail route is /api/rivers/[slug]/access/[accessSlug], and
   * `riverSlug` is only half of that pair.
   */
  accessSlug?: string | null;
}

export interface SearchResponse {
  query: string;
  results: SearchResult[];
  /**
   * Whether another page exists past this one.
   *
   * Computed by asking each source for one row more than the page needs and
   * throwing it away, which is the only way to know without a second COUNT over
   * 14k rows. A client must not infer it from `results.length === limit` — a
   * multi-kind page is allocated across kinds and can come back short while
   * every kind still has more.
   */
  hasMore: boolean;
}

/**
 * Escapes a user string for PostgREST's `ilike` pattern syntax.
 *
 * `%`, `_` and `*` are wildcards and `\` escapes them, so a raw query
 * containing any of them either matches far too much or errors. Commas,
 * parentheses and dots go too: PostgREST parses the filter string itself, and
 * an unescaped comma inside an `.or()` splits it into two filters.
 *
 * `*` joined the set when the access-point branch started using `.or()`, where
 * `*` — not `%` — is the wildcard PostgREST reads.
 */
export function escapeLike(input: string): string {
  return input.replace(/[\\%_*(),]/g, '');
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
    // Per KIND, not across the flat result list. The phone pages one scope at a
    // time, and a shared offset over an allocated page would skip rows in
    // whichever kind happened to be under-represented on the page before.
    const offset = Math.max(
      0,
      parseInt(request.nextUrl.searchParams.get('offset') ?? '', 10) || 0,
    );

    // Which kinds the caller wants back. The phone's Search tab is scoped —
    // one segmented control, exactly one kind at a time — so asking for all
    // three and throwing two away spent the budget on rows nobody would see.
    // Scoping here is also what lets a single kind have the WHOLE limit.
    const kinds = parseKinds(request.nextUrl.searchParams.get('kinds'));
    const wants = (kind: SearchResultKind) => kinds.includes(kind);

    /**
     * BROWSE: an empty `q` against exactly one kind is a request to list that
     * kind, not to search it.
     *
     * This is what fixed two tabs at once. The Gauges scope opened on the ~45
     * curated stations because a list was the only thing it could show without
     * a query, and the Access scope opened on nothing at all — "Search every
     * access point by name", over a database of 308 of them, none of which
     * could be seen without first guessing one's name. Neither tab was broken;
     * neither had a way to say "just show me what there is".
     *
     * ONE KIND ONLY. "Browse everything" is not a question with an answer —
     * rivers, put-ins and gauges have no shared order — and an unscoped empty
     * query stays an empty result, which is also what every existing caller
     * already gets for it.
     */
    const browse = raw.length === 0 && kinds.length === 1;

    if (!browse && raw.length < MIN_QUERY_LENGTH) {
      return NextResponse.json<SearchResponse>({ query: raw, results: [], hasMore: false });
    }

    const needle = escapeLike(raw);
    if (!browse && !needle) {
      return NextResponse.json<SearchResponse>({ query: raw, results: [], hasMore: false });
    }
    const pattern = `%${needle}%`;

    // One row past the page, discarded before it is returned. Cheaper than a
    // COUNT and exact, which an estimate would not be.
    const probe = limit + 1;

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
      return NextResponse.json<SearchResponse>({ query: raw, results: [], hasMore: false });
    }

    const lowered = needle.toLowerCase();

    /** Rivers the query names, for the access-point join below. */
    const matchedRivers = (rivers ?? []).filter(
      (r) =>
        r.name?.toLowerCase().includes(lowered) ||
        r.slug?.toLowerCase().includes(lowered) ||
        r.region?.toLowerCase().includes(lowered),
    );

    // ── Rivers ──────────────────────────────────────────────────
    // Filtered in memory. The list is already loaded and small, and matching
    // here lets a region ("Ozarks") hit as well as a name. Browse returns them
    // in the name order they were fetched in.
    const riverResults: SearchResult[] = (
      wants('river') ? (browse ? (rivers ?? []) : matchedRivers) : []
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
    //
    // MATCHED ON THEIR RIVER AS WELL AS THEIR OWN NAME. This used to be
    // `ilike('name', …)` alone, and the result was that `?q=current` against
    // the access kind returned ZERO — while the Current River has dozens of
    // approved put-ins, and while every row this endpoint returns prints its
    // river in the subtitle. The one word a person is most likely to type was
    // the one word that could not match, and the rows said so on their face.
    //
    // The river half is resolved in memory against `rivers`, which is already
    // loaded, so it costs an `in (…)` on an indexed column rather than a join.
    const accessRiverIds = matchedRivers.map((r) => r.id);
    // `*`, not `%`, inside an `or()` string: PostgREST parses that filter list
    // itself and translates `*` to the SQL wildcard, so this needs no thought
    // about how a literal percent survives being put in a query string.
    const accessFilter = accessRiverIds.length
      ? `name.ilike.*${needle}*,river_id.in.(${accessRiverIds.join(',')})`
      : null;

    const accessQuery = wants('access_point')
      ? supabase
          .from('access_points')
          .select(
            'id, name, slug, river_id, river_mile_downstream, type, location_orig, location_snap',
          )
          .eq('approved', true)
          .in('river_id', activeRiverIds)
      : null;

    const { data: accessRows, error: accessError } = accessQuery
      ? await (browse
          ? accessQuery
          : accessFilter
            ? accessQuery.or(accessFilter)
            : accessQuery.ilike('name', pattern)
        )
          .order('name', { ascending: true })
          // A total order. `name` is not unique across rivers — "Boat Ramp"
          // exists more than once — and paging an unstable tail repeats rows.
          .order('id', { ascending: true })
          .range(offset, offset + probe - 1)
      : { data: null, error: null };

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
          accessSlug: ap.slug,
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
    //
    // p_offset and the empty-query browse arrived with 00207. An empty p_query
    // means "no name filter", which is how the Gauges scope can now be scrolled
    // through all 14,264 stations instead of opening on the 45 curated ones and
    // stopping there.
    //
    // WITH A FALLBACK TO THE 00196 SIGNATURE, because code and migrations do not
    // deploy together. Vercel ships this file the moment it merges; 00207 is
    // applied by hand. In the window between the two, `p_offset` is an argument
    // no function has, PostgREST answers PGRST202, and gaugeError is non-fatal —
    // so the Gauges scope would quietly return NOTHING rather than degrading to
    // its old behaviour. Retrying without the offset gives back exactly the
    // first page, which is what this endpoint served before today.
    //
    // The same posture the river_gauges block below takes for its alt columns.
    const admin = wants('gauge') ? createAdminClient() : null;
    let gaugeRpcRows: unknown = null;
    let gaugeError: { message?: string } | null = null;

    if (admin) {
      const paged = await admin.rpc('search_gauges', {
        p_query: browse ? '' : needle,
        p_limit: probe,
        p_offset: offset,
      });

      if (paged.error) {
        console.warn('[search] paged search_gauges unavailable, retrying unpaged:', paged.error.message);
        // Browse has no unpaged equivalent — the old signature would match every
        // station against '%%' in an order nobody chose — so it asks for nothing
        // rather than for something arbitrary, and the client's curated fallback
        // fills the scope until the migration lands.
        const legacy = browse
          ? { data: [], error: null }
          : await admin.rpc('search_gauges', { p_query: needle, p_limit: limit });
        gaugeRpcRows = legacy.data;
        gaugeError = legacy.error;
      } else {
        gaugeRpcRows = paged.data;
      }
    }

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

    // search_gauges joins gauge_latest, which is the OLDER tier for a curated
    // station — rewritten hourly at :20, while update-gauges appends to
    // gauge_readings hourly and every 15 minutes on a rising river. Without this
    // a curated row here disagreed with the same station's detail screen, its
    // map pin, and the number the alert engine seeds from. Only curated rows
    // have a second tier to consult, and admin is already open for the RPC.
    const currentReadings = admin
      ? await loadCurrentReadings(
          admin,
          (gaugeRows ?? []).filter((g) => g.curated).map((g) => g.id),
        )
      : new Map();

    const gaugeResults: SearchResult[] = (gaugeRows ?? []).map((g) => {
      const river = riverByGauge.get(g.id);
      const current = currentReadings.get(g.id) ?? null;
      const readingTimestamp = current ? current.reading_at : g.reading_timestamp;
      const parsed = readingTimestamp ? new Date(readingTimestamp).getTime() : NaN;
      const readingAgeHours = Number.isFinite(parsed) ? (now - parsed) / 3_600_000 : null;
      const gaugeHeightFt = current ? current.gauge_height_ft : toNum(g.gauge_height_ft);
      const dischargeCfs = current ? current.discharge_cfs : toNum(g.discharge_cfs);

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

    // BROWSE DOES NOT RE-RANK. Relevance is a comparison against the query, and
    // there is no query — sorting a browse list by how well each row matches ""
    // would shuffle it into the order `localeCompare` happens to produce, on
    // top of the order the database was asked for. Each source already returns
    // browse rows sorted the way that kind should be listed.
    const ordered = (rows: SearchResult[]) => (browse ? rows : [...rows].sort(byRelevance));

    // Rivers are the one source paged in memory: the list is small, already
    // loaded, and matched here rather than in SQL. The other two page in the
    // database, and have had `offset` applied before they got here.
    const pagedRivers = riverResults.slice(offset, offset + probe);

    const groups = (
      [
        { kind: 'river', results: ordered(pagedRivers) },
        { kind: 'access_point', results: ordered(accessResults) },
        { kind: 'gauge', results: ordered(gaugeResults) },
      ] as const satisfies readonly { kind: SearchResultKind; results: SearchResult[] }[]
    ).filter((g) => wants(g.kind));

    // The probe row, read and then dropped. A kind that filled its probe has at
    // least one more row behind this page.
    const hasMore = groups.some((g) => g.results.length > limit);

    // Allocated per kind rather than sliced off a concatenation — see
    // allocateByKind for the bug that change fixes. The ORDER of the groups is
    // still rivers, then access points, then gauges: a person typing "current"
    // wants the Current River, not Current River at Van Buren gauge. What has
    // changed is that being third no longer means being cut.
    const results = allocateByKind(
      groups.map((g) => ({ kind: g.kind, results: g.results.slice(0, limit) })),
      limit,
    );

    return NextResponse.json<SearchResponse>(
      { query: raw, results, hasMore },
      { headers: cdnCacheHeaders(300, 3600) },
    );
  } catch (error) {
    console.error('Error in search endpoint:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = withX402Route(_GET, '/api/search');
