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
// builds of the website this app talks to, so a 404 marks it unavailable for
// the session and search quietly continues as rivers-and-gauges only. A search
// field that reports an error because the backend has not caught up is worse
// than one that finds less.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MapGauge, RiverListItem, SearchResult } from '@eddy/types';
import { searchEddy } from '@/api/client';

/** Matches the server's floor — below this a query matches most of the data. */
const MIN_QUERY_LENGTH = 2;

/**
 * Long enough that a normal typing cadence produces one request per word, short
 * enough that a pause before reading the results does not feel like a stall.
 */
const DEBOUNCE_MS = 250;

interface Options {
  rivers: RiverListItem[] | null;
  gauges: MapGauge[] | null;
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
        g.usgsSiteId.toLowerCase().includes(needle),
    )
    .map((g) => {
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
      };
    });

  return [...riverHits, ...gaugeHits];
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

export function useEddySearch({ rivers, gauges }: Options): SearchState {
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

  // A ref is right here: this is written once, read only inside the effect, and
  // flipping it must not itself cause a render.
  const serverAvailable = useRef(true);

  const trimmed = query.trim();
  const active = trimmed.length >= MIN_QUERY_LENGTH;

  const local = useMemo(() => localMatches(trimmed, rivers, gauges), [trimmed, rivers, gauges]);

  useEffect(() => {
    if (!active) {
      setAnswer({ query: '', results: [] });
      setSearching(false);
      return;
    }
    if (!serverAvailable.current) return;

    const controller = new AbortController();
    setSearching(true);
    const timer = setTimeout(async () => {
      const { results, available } = await searchEddy(trimmed, controller.signal);
      if (controller.signal.aborted) return;
      if (!available) {
        // One failure is enough. Retrying per keystroke against a backend that
        // does not have the route yet is a request storm for no results.
        serverAvailable.current = false;
        setAnswer({ query: '', results: [] });
      } else {
        setAnswer({ query: trimmed, results });
      }
      setSearching(false);
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [trimmed, active]);

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
