// eddy-ios/src/hooks/useEddySearch.ts
// The Map tab's search: rivers, gauges, access points, dams, hazards and
// services in one field.
//
// TWO SOURCES, ON PURPOSE. Rivers, gauges, dams, hazards and services are
// already in memory — the map fetches or ships all of them to draw itself —
// so they are matched locally and appear the instant a character lands, with
// no request and no spinner. Access points are not: several hundred of them
// exist, served per river, and downloading the lot to build a client index
// would be paid on cellular at a put-in for a feature most sessions never
// use. Those come from /api/search, debounced. The server is never asked for
// the three local-only kinds — it ignores kinds it does not know, and results
// merge by kind:id, so the two halves cannot collide.
//
// The two are layered rather than switched between: local hits render
// immediately and the server's fuller list replaces them when it lands. A
// person typing "cur" sees the Current River before their finger leaves the
// key, and Cedar Grove Access a moment later.
//
// The server half degrades to nothing. /api/search is newer than some deployed
// builds of the website this app talks to, so a failure backs the request off
// and search quietly continues as rivers-and-gauges only. A search field that
// reports an error because the backend has not caught up is worse than one that
// finds less. It BACKS OFF rather than latching, which it used to: a single 500
// once disabled the server half for the rest of the session, taking gauges and
// access points with it and leaving no way to retry.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  Hazard,
  MapGauge,
  RiverListItem,
  RiverService,
  SearchResult,
  SearchResultKind,
} from '@eddy/types';
import { hasCoordinates, serviceEligible } from '@eddy/types';
import { hazardTypeLabel } from '@eddy/hazards';
import { searchEddy } from '@/api/client';
import { stationCaption } from '@/lib/gaugeProvider';
import { DAM_CATALOG, damSubtitle } from '@/lib/damCatalog';
import { mappableService } from '@/map/mappable';
import { serviceTypeLabel } from '@/map/serviceLayers';

/** Matches the server's floor — below this a query matches most of the data. */
const MIN_QUERY_LENGTH = 2;

/**
 * Long enough that a normal typing cadence produces one request per word, short
 * enough that a pause before reading the results does not feel like a stall.
 */
const DEBOUNCE_MS = 250;

/**
 * Ceiling on the failure backoff, as a multiple of the debounce.
 *
 * 250ms × 32 is eight seconds — slow enough that a route which genuinely is not
 * there costs almost nothing to keep asking about, fast enough that one which
 * recovers is noticed inside a single search session.
 */
const MAX_BACKOFF_MULTIPLE = 32;

interface Options {
  rivers: RiverListItem[] | null;
  gauges: MapGauge[] | null;
  /**
   * True to match the Corps' dams. LOCAL, like rivers and gauges — the whole
   * catalog ships in the binary (DAM_CATALOG), so this is a boolean rather
   * than a list the caller has to fetch. The server is never asked.
   */
  dams?: boolean;
  /**
   * The statewide hazard set, matched locally.
   *
   * The launch bundle already holds every hazard Eddy has; the map screen
   * passes its merged set. Rows without usable coordinates are dropped — a
   * result that can move the camera nowhere reads as a broken search.
   */
  hazards?: Hazard[] | null;
  /**
   * The services directory, matched locally.
   *
   * Only the rows the MAP can draw are searchable here — eligible, and with a
   * confirmed coordinate (the same two gates the resolver applies before a
   * pin exists). The un-geocoded majority stays findable on its river's page,
   * which is a list and loses nothing by a missing coordinate.
   */
  services?: RiverService[] | null;
  /**
   * Which kinds to ask the server for. Omit for all three.
   *
   * The Search tab is scoped and passes its active scope; the map's field is
   * not and passes nothing. Threading it through matters more than it sounds —
   * the server allocates its 25-row budget across the kinds it was asked for,
   * so an unscoped request for a word like "river" spent the whole page on
   * rivers and access points and returned no gauges at all.
   *
   * Joined into the cache-relevant part of the query, so changing scope
   * re-asks rather than re-rendering stale rows under a new heading.
   */
  kinds?: readonly SearchResultKind[];
  /**
   * False to skip the server half entirely. Defaults to true.
   *
   * Two of the Search tab's scopes — rivers and dams — are matched wholly out
   * of lists the screen already holds and never read `results`, so a request
   * for them is a round trip whose answer is discarded. Local matching is
   * unaffected either way.
   */
  enabled?: boolean;
  /**
   * Ask the server with an EMPTY field, as a browse rather than a search.
   *
   * Off by default, and only ever on for a scope naming exactly one kind — the
   * server has no order in which to list rivers, put-ins and gauges together.
   *
   * This is what closed the two holes on the Search tab. The Gauges scope
   * opened on the ~45 curated stations because a browse was the only thing it
   * could show without a query, and the Access scope opened on nothing at all:
   * "Search every access point by name", over 308 of them, none visible until
   * you guessed one's name.
   */
  browse?: boolean;
}

interface SearchState {
  query: string;
  setQuery: (next: string) => void;
  results: SearchResult[];
  /** True while a server request for the CURRENT query is in flight. */
  searching: boolean;
  /** True once the query is long enough to have produced an answer. */
  active: boolean;
  /**
   * True when the last server ask did not come back — the empty state's
   * honesty flag, so "nothing matched" cannot stand in for "could not
   * search". Local matches keep working regardless.
   */
  serverUnavailable: boolean;
  clear: () => void;
  /** True when another page exists. False while one is already loading. */
  hasMore: boolean;
  /** Fetch the next page and append it. A no-op unless `hasMore`. */
  loadMore: () => void;
}

/** Everything the local half can match against. All of it already in memory. */
interface LocalData {
  rivers: RiverListItem[] | null;
  gauges: MapGauge[] | null;
  dams: boolean;
  hazards: Hazard[] | null;
  services: RiverService[] | null;
}

function localMatches(
  query: string,
  { rivers, gauges, dams, hazards, services }: LocalData,
): SearchResult[] {
  const needle = query.trim().toLowerCase();
  if (needle.length < MIN_QUERY_LENGTH) return [];

  /** Empty non-gauge fields, so each block below states only what it has. */
  const rest = {
    riverId: null,
    riverName: null,
    riverSlug: null,
    riverMile: null,
    coordinates: null,
  };

  const damHits: SearchResult[] = dams
    ? DAM_CATALOG.filter(
        (d) =>
          d.name.toLowerCase().includes(needle) ||
          (d.lakeName ?? '').toLowerCase().includes(needle),
      ).map((d) => ({
        kind: 'dam' as const,
        id: d.id,
        name: d.name,
        subtitle: damSubtitle(d),
        ...rest,
        coordinates: { lng: d.lon, lat: d.lat },
      }))
    : [];

  const hazardHits: SearchResult[] = (hazards ?? [])
    .filter((h) => h.name.toLowerCase().includes(needle) && hasCoordinates(h))
    .map((h) => {
      // The hazard names a river by id only; the river list — when it has
      // landed — turns that into the name and slug a row and a callout want.
      const river = (rivers ?? []).find((r) => r.id === h.riverId) ?? null;
      return {
        kind: 'hazard' as const,
        id: h.id,
        name: h.name,
        subtitle: [
          hazardTypeLabel(h.type),
          river?.name ?? (h.riverMile ? `Mile ${h.riverMile}` : null),
        ]
          .filter(Boolean)
          .join(' · '),
        ...rest,
        riverId: h.riverId,
        riverName: river?.name ?? null,
        // Deliberately NOT the river's slug, though it is in hand: a set
        // riverSlug makes selecting this result select the river, and tapping
        // a hazard PIN selects none — the callout is about the water hazard,
        // not the trip. Search and tap must land in the same state.
        riverMile: h.riverMile ?? null,
        coordinates: h.coordinates,
      };
    });

  const serviceHits: SearchResult[] = (services ?? [])
    .filter(
      (s) =>
        serviceEligible(s) &&
        mappableService(s) &&
        s.name.toLowerCase().includes(needle),
    )
    .map((s) => ({
      kind: 'service' as const,
      id: s.id,
      name: s.name,
      subtitle: [serviceTypeLabel(s), [s.city, s.state].filter(Boolean).join(', ')]
        .filter(Boolean)
        .join(' · '),
      // No riverSlug for the same reason the hazard rows carry none: tapping
      // a service pin selects no river, and search must match the tap.
      ...rest,
      coordinates: { lng: s.longitude as number, lat: s.latitude as number },
    }));

  const riverHits: SearchResult[] = (rivers ?? [])
    .filter(
      (r) =>
        r.name.toLowerCase().includes(needle) ||
        (r.region ?? '').toLowerCase().includes(needle),
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

  const gaugeHits: SearchResult[] = (gauges ?? [])
    .filter(
      (g) =>
        g.name.toLowerCase().includes(needle) ||
        // Nullable on the wire — a station can have neither a USGS number nor
        // an external site id. Coalesce rather than read through it: this runs
        // on every keystroke, and a throw here takes the screen with it.
        (g.usgsSiteId ?? '').toLowerCase().includes(needle),
    )
    .map(gaugeToSearchResult);

  // Rivers first, as ever; the new kinds trail the two originals so the rows
  // most searches are for keep their positions.
  return [...riverHits, ...gaugeHits, ...damHits, ...hazardHits, ...serviceHits];
}

/**
 * A curated gauge as a search result.
 *
 * Exported because the Search tab needs the same conversion to LIST the rated
 * stations before anything is typed, and two conversions would be two shapes:
 * a browsed row and a searched row have to be interchangeable, or tapping the
 * same station would behave differently depending on how it was found.
 */
export function gaugeToSearchResult(g: MapGauge): SearchResult {
  // A station can grade more than one river; the primary association is the
  // one whose map the app should open.
  const link = g.thresholds?.find((t) => t.isPrimary) ?? g.thresholds?.[0] ?? null;
  // `?? 'usgs'` is a floor for a payload cached before /api/gauges started
  // sending provider, NOT a guess: that endpoint has sent it for every station
  // — Clearwater included — since before this field existed on the wire.
  const provider = g.provider ?? 'usgs';
  // Same caption the server builds for the same station, which is the point of
  // sharing the rule: this list renders rows from both paths at once.
  const providerCaption = stationCaption(provider, g.usgsSiteId);
  return {
    kind: 'gauge' as const,
    id: g.id,
    name: g.name,
    subtitle: [link?.riverName, providerCaption].filter(Boolean).join(' · '),
    riverId: link?.riverId ?? null,
    riverName: link?.riverName ?? null,
    riverSlug: link?.riverSlug ?? null,
    riverMile: null,
    coordinates: g.coordinates,
    // The SAME fields the server sends on a gauge row, so a local hit and
    // a remote one are one shape and every consumer can read either without
    // asking which half answered. Without these a local hit would be the
    // only row in the list that could not be opened — the gauge screen keys
    // off siteId — which would make the fast path the broken one.
    siteId: g.usgsSiteId,
    provider,
    gauge: {
      // Everything in /api/gauges is rated by definition; that endpoint has
      // been curated-only since the national tier got its own route.
      curated: true,
      gaugeHeightFt: g.gaugeHeightFt,
      dischargeCfs: g.dischargeCfs,
      readingTimestamp: g.readingTimestamp,
      readingAgeHours: g.readingAgeHours,
      // Not on the wire for a curated gauge — /api/gauges answers with the
      // ladder instead, which is the stronger statement.
      flowPercentile: null,
    },
  };
}

/**
 * Server results win where they overlap.
 *
 * Deduped by kind+id rather than by name: two rivers can share a gauge name,
 * and "Current River" the river and "Current River at Van Buren" the gauge are
 * different rows that should both survive.
 */
function merge(server: SearchResult[], local: SearchResult[]): SearchResult[] {
  const seen = new Set(server.map((r) => `${r.kind}:${r.id}`));
  return [...server, ...local.filter((r) => !seen.has(`${r.kind}:${r.id}`))];
}

export function useEddySearch({
  rivers,
  gauges,
  dams = false,
  hazards = null,
  services = null,
  kinds,
  enabled = true,
  browse = false,
}: Options): SearchState {
  const [query, setQuery] = useState('');
  // The server's answer AND the query it answers, in one piece of state.
  // Keeping the two together is what lets render decide whether the list on
  // screen still describes what is in the field — a stale response must not
  // repaint results under a word the user has already typed past. It is state
  // rather than a ref because render reads it, and a ref read during render is
  // exactly the tearing hazard React now flags.
  //
  // `hasMore` rides along for the same reason the results do: it describes THIS
  // query, and a flag left over from the previous one would offer a next page
  // of a list nobody is looking at any more.
  const [answer, setAnswer] = useState<{
    query: string;
    results: SearchResult[];
    hasMore: boolean;
  }>({ query: '', results: [], hasMore: false });
  const [searching, setSearching] = useState(false);
  /** True only for a NEXT-page request, so the list spins its footer, not itself. */
  const [paging, setPaging] = useState(false);
  /**
   * True when the LAST server ask did not come back. The backoff below keeps
   * a dead route from costing one slow retry per keystroke, but it used to be
   * silent: the empty state then read "Nothing matched" — a claim about the
   * data — when the truth was "could not search". State, not the failures
   * ref: the empty message renders from it.
   */
  const [serverUnavailable, setServerUnavailable] = useState(false);

  /**
   * How many times in a row the server has failed to answer.
   *
   * THIS USED TO BE A ONE-WAY LATCH — a single failure disabled the server half
   * for the entire session, on the reasoning that /api/search is newer than
   * some deployed builds of the website and retrying per keystroke against a
   * backend that lacks the route is a request storm for no results.
   *
   * That reasoning covers a 404 and nothing else. A 500 has since happened in
   * production, and under the latch one unlucky query left Gauges AND Access
   * returning nothing until the app was restarted, with no way for the user to
   * retry and nothing on screen to suggest one. A counter keeps the storm
   * protection — the backoff below still stops us hammering a dead route — while
   * letting a transient failure heal on the next search.
   *
   * A ref is right: it is read only inside the effect, and bumping it must not
   * itself cause a render.
   */
  const failures = useRef(0);

  const trimmed = query.trim();
  const typed = trimmed.length >= MIN_QUERY_LENGTH;
  // An empty field is a legitimate request when the caller browses. One
  // character is not, in either mode: below the floor neither this hook nor the
  // server has run a search, and "nothing matches" would be a claim about the
  // database rather than a report of one.
  const askable = typed || (browse && trimmed.length === 0);
  // `active` still means "there is something on screen to look at", which is
  // what every consumer uses it for — a browse list counts.
  const active = askable;
  // Stable across renders for a given scope, so it can sit in a dependency
  // array without an array literal re-running the effect on every keystroke.
  const kindKey = kinds?.length ? kinds.join(',') : '';

  const local = useMemo(
    () => localMatches(trimmed, { rivers, gauges, dams, hazards, services }),
    [trimmed, rivers, gauges, dams, hazards, services],
  );

  useEffect(() => {
    if (!askable || !enabled) {
      setAnswer({ query: '', results: [], hasMore: false });
      setSearching(false);
      return;
    }
    const controller = new AbortController();
    setSearching(true);
    // Back off as failures accumulate, so a route that genuinely is not there
    // costs one slow retry per search rather than one per keystroke — and a
    // server that recovers is noticed on the very next query.
    const delay = DEBOUNCE_MS * Math.min(2 ** failures.current, MAX_BACKOFF_MULTIPLE);
    const timer = setTimeout(async () => {
      const { results, available, hasMore } = await searchEddy(
        trimmed,
        controller.signal,
        kindKey ? (kindKey.split(',') as SearchResultKind[]) : undefined,
      );
      if (controller.signal.aborted) return;
      if (!available) {
        failures.current += 1;
        setServerUnavailable(true);
        setAnswer({ query: '', results: [], hasMore: false });
      } else {
        failures.current = 0;
        setServerUnavailable(false);
        setAnswer({ query: trimmed, results, hasMore });
      }
      setSearching(false);
    }, delay);

    return () => {
      clearTimeout(timer);
      controller.abort();
      // A new query invalidates any page request still in flight for the old
      // one. Without this the footer spinner survives into the next search.
      setPaging(false);
    };
  }, [trimmed, askable, enabled, kindKey]);

  const answered = answer.query === trimmed;

  /**
   * The next page, appended.
   *
   * Offset is counted from the rows actually held rather than from a page
   * counter, so a short page — which the server can return when a kind runs out
   * mid-allocation — does not desynchronise the next request from what is on
   * screen.
   *
   * ── Counted PER KIND, because that is how the server applies it ───────────
   * This used to send `answer.results.length`, the total across every kind. For
   * the scoped tabs that is the same number, since every row there is one kind,
   * and it was right by accident. For the Today tab's ALL scope it was not: a
   * 50-row page is roughly seventeen rows of each kind, so page two asked all
   * three kinds to skip fifty. Rows 17–49 of every kind were never requested
   * again by any page, and nothing looked wrong — the list just quietly did not
   * contain them.
   *
   * Guarded on `answered`: paging a query the user has already typed past would
   * append rows belonging to a word that is no longer in the field.
   */
  const loadMore = useCallback(() => {
    if (!enabled || !answered || !answer.hasMore || paging || searching) return;
    setPaging(true);
    void (async () => {
      const offsets = answer.results.reduce<Partial<Record<SearchResultKind, number>>>(
        (acc, r) => ({ ...acc, [r.kind]: (acc[r.kind] ?? 0) + 1 }),
        {},
      );
      const { results, available, hasMore } = await searchEddy(
        trimmed,
        undefined,
        kindKey ? (kindKey.split(',') as SearchResultKind[]) : undefined,
        // `offset` stays the single-kind answer so a backend that predates
        // `offsets` still pages the scoped tabs correctly.
        { offset: answer.results.length, offsets },
      );
      setPaging(false);
      if (!available) return;
      setAnswer((prev) => {
        // The field moved while this was in flight. Dropping the page is right:
        // it answers a question nobody is asking now, and the effect above has
        // already replaced what is on screen.
        if (prev.query !== trimmed) return prev;
        // Deduped on append. The database orders are total (00207 adds an id
        // tiebreak), so this should never fire — but a row rendered twice is a
        // React key collision, which fails loudly and for a reason nobody would
        // connect to paging.
        const seen = new Set(prev.results.map((r) => `${r.kind}:${r.id}`));
        const fresh = results.filter((r) => !seen.has(`${r.kind}:${r.id}`));
        return { query: prev.query, results: [...prev.results, ...fresh], hasMore };
      });
    })();
    // `answer.results` itself, not just its length: the per-kind tally above
    // reads every row's kind, so a page that changed the MIX without changing
    // the count would otherwise be paged from a stale tally.
  }, [enabled, answered, answer.hasMore, answer.results, paging, searching, trimmed, kindKey]);

  const results = useMemo(() => {
    if (!active) return [];
    return merge(answered ? answer.results : [], local);
  }, [active, answered, answer.results, local]);

  // Stable identity so callers can list it in a dependency array without the
  // callback rebuilding on every keystroke.
  const clear = useCallback(() => setQuery(''), []);

  return {
    query,
    setQuery,
    results,
    searching: (searching && !answered) || paging,
    active,
    /** The empty state's honesty flag — see its declaration. */
    serverUnavailable,
    clear,
    hasMore: answered && answer.hasMore && !paging,
    loadMore,
  };
}
