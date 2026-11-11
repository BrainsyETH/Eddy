export type SearchResultKind = 'river' | 'gauge' | 'access_point';

export const ALL_KINDS: readonly SearchResultKind[] = [
  'river',
  'access_point',
  'gauge',
];

/**
 * Parses `?offsets=river:12,gauge:20` — where each kind's page starts.
 *
 * ── Why a flat `offset` is not enough ──────────────────────────────────────
 * `offset` is applied PER KIND, which is the only definition that works for a
 * scoped caller paging one kind at a time. A caller asking for SEVERAL kinds
 * at once has no single number to send: one page of 50 hands back roughly
 * seventeen rows of each kind, so by page two the three kinds are each 17 rows
 * in, and there is no value of `offset` that describes that. Sending the total
 * (50) skips fifty rows of every kind and loses rows 17–49 of each; sending
 * the smallest per-kind count re-requests rows already on screen.
 *
 * So a multi-kind caller states each kind's position and this reads them. A
 * kind the parameter omits falls back to the flat `offset`, which keeps every
 * scoped caller — and every caller written before this existed — on exactly
 * the behaviour it already had.
 *
 * Unparseable entries are ignored rather than rejected: a malformed offset
 * should degrade to the first page, not turn a search into an error.
 */
export function parseOffsets(
  raw: string | null,
  fallback: number,
): Record<string, number> {
  const out: Record<string, number> = {};
  if (!raw) return out;
  for (const part of raw.split(',')) {
    const [kind, value] = part.split(':');
    const named = ALL_KINDS.find((k) => k === kind?.trim());
    if (!named) continue;
    const n = parseInt(value ?? '', 10);
    out[named] = Number.isFinite(n) && n > 0 ? n : fallback;
  }
  return out;
}

/**
 * One kind's page: drop the probe row, THEN present what is left.
 *
 * ── The order of those two steps is the whole point ────────────────────────
 * Each source returns `limit + 1` rows in its own stable, total order, and that
 * order is what `offset` walks — page two starts at the source's row
 * `limit + 1`. So the row this page must give up is THE LAST ONE IT WAS HANDED.
 * Cutting that row is what makes consecutive pages meet exactly.
 *
 * Presenting first and cutting second — which is what this route did — cuts by
 * the PRESENTATION order instead, so the row dropped is the relevance-worst
 * one: some arbitrary row from the middle of the source's order. The next page
 * begins past it, so that row was not deferred, it was deleted; no page of that
 * search would ever show it again. Meanwhile the true last row shipped on both
 * pages, which is why the client's "this should never fire" dedupe fired at
 * every page boundary.
 *
 * `present` is applied to the survivors, because how a page is ordered on
 * screen is a separate question from which rows are on it.
 */
export function pageOf<T>(
  rows: T[],
  limit: number,
  present: (rows: T[]) => T[],
): T[] {
  return present(rows.slice(0, limit));
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
  /** Registry id for the station's publisher. Gauge results only. */
  provider?: string | null;
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
