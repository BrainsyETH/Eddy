// eddy-ios/src/hooks/useEddySearch.ts
// The Map tab's search: rivers, gauges and access points in one field.
//
// TWO SOURCES, ON PURPOSE. Rivers and gauges are already in memory — the map
// fetches both to draw itself — so they are matched locally and appear the
// instant a character lands, with no request and no spinner. Access points are
// not: several hundred of them exist, served per river, and downloading the lot
// to build a client index would be paid on cellular at a put-in for a feature
// most sessions never use. Those come from /api/search, debounced.
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
import type { MapGauge, RiverListItem, SearchResult, SearchResultKind } from '@eddy/types';
import { searchEddy } from '@/api/client';

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
}

interface SearchState {
  query: string;
  setQuery: (next: string) => void;
  results: SearchResult[];
  /** True while a server request for the CURRENT query is in flight. */
  searching: boolean;
  /** True once the query is long enough to have produced an answer. */
  active: boolean;
  clear: () => void;
}

function localMatches(
  query: string,
  rivers: RiverListItem[] | null,
  gauges: MapGauge[] | null,
): SearchResult[] {
  const needle = query.trim().toLowerCase();
  if (needle.length < MIN_QUERY_LENGTH) return [];

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

  return [...riverHits, ...gaugeHits];
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
  return {
    kind: 'gauge' as const,
    id: g.id,
    name: g.name,
    subtitle: [link?.riverName ?? 'USGS gauge', g.usgsSiteId].filter(Boolean).join(' · '),
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

export function useEddySearch({ rivers, gauges, kinds, enabled = true }: Options): SearchState {
  const [query, setQuery] = useState('');
  // The server's answer AND the query it answers, in one piece of state.
  // Keeping the two together is what lets render decide whether the list on
  // screen still describes what is in the field — a stale response must not
  // repaint results under a word the user has already typed past. It is state
  // rather than a ref because render reads it, and a ref read during render is
  // exactly the tearing hazard React now flags.
  const [answer, setAnswer] = useState<{ query: string; results: SearchResult[] }>({
    query: '',
    results: [],
  });
  const [searching, setSearching] = useState(false);

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
  const active = trimmed.length >= MIN_QUERY_LENGTH;
  // Stable across renders for a given scope, so it can sit in a dependency
  // array without an array literal re-running the effect on every keystroke.
  const kindKey = kinds?.length ? kinds.join(',') : '';

  const local = useMemo(() => localMatches(trimmed, rivers, gauges), [trimmed, rivers, gauges]);

  useEffect(() => {
    if (!active || !enabled) {
      setAnswer({ query: '', results: [] });
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
      const { results, available } = await searchEddy(
        trimmed,
        controller.signal,
        kindKey ? (kindKey.split(',') as SearchResultKind[]) : undefined,
      );
      if (controller.signal.aborted) return;
      if (!available) {
        failures.current += 1;
        setAnswer({ query: '', results: [] });
      } else {
        failures.current = 0;
        setAnswer({ query: trimmed, results });
      }
      setSearching(false);
    }, delay);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [trimmed, active, enabled, kindKey]);

  const answered = answer.query === trimmed;

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
    searching: searching && !answered,
    active,
    clear,
  };
}
