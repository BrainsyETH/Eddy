// missouri-float-planner/shared/station-caption.ts
// What a station may say about who published its number.
//
// ── Why this is shared rather than written twice ────────────────────────────
// It WAS written twice. `gaugeProviderCaption` in the web search route and
// `stationCaption` in the iOS app implemented the same rule, and had already
// drifted: one answered 'USACE release' and the other 'USACE'. That is not a
// theoretical divergence — the phone's Search tab renders both, because a rated
// station comes from the local /api/gauges list while everything else comes
// from /api/search, so one list could credit the same operator two ways.
//
// It lives under shared/ for the same reason the condition system does: it is
// pure, both apps need the identical answer, and the web build can import it
// without reaching outside Vercel's root directory.
//
// ── The rule ────────────────────────────────────────────────────────────────
// A USGS site number is a public identifier people cross-reference, so it is
// printed. A USACE dam's id is an EDDY SLUG ('swl-clearwater-dam') that exists
// nowhere else: printing it looks like a citation while naming nothing the
// reader could look up, so the operator is named instead. This is the whole
// reason the app once headed a screen "USGS swl-clearwater-dam" and pointed an
// "Open on USGS" button at a 404.
//
// ── Two different nulls meet here, and only one means "unknown" ─────────────
// This is the distinction that made the rule easy to get wrong, so it is stated
// once, here, rather than argued in each caller:
//
//   A NULL PROVIDER COLUMN is a legacy row, written before the registry
//   existed, and every one of those is USGS. The server resolves it before it
//   reaches this function — `coalesce(gs.provider, 'usgs')` in search_gauges,
//   `?? 'usgs'` in the gauge routes.
//
//   AN ABSENT PROVIDER FIELD means an older deployment answered, and that is
//   genuinely unknown. It must never be resolved to USGS: Clearwater Dam is
//   reachable through search and through a saved star, so guessing would print
//   "USGS swl-clearwater-dam" about the Corps.
//
// ── What an unknown provider prints, and why it is not nothing ──────────────
// It falls back to the ID'S OWN SHAPE. A USGS site number is 8-15 digits and
// nothing else Eddy stores looks like one: an NWS LID is alphanumeric
// ('VBUM7'), a USACE id is a hyphenated slug. So a bare number attributes
// nothing while still telling the reader WHICH STATION this is, which is what
// the caption existed to do.
//
// That fallback is load-bearing twice over. A star saved before 1.1 carries no
// provider and never will for a signed-out user, and a client talking to a
// backend deployed before search_gauges grew its provider column gets none
// either — without this, every gauge in both cases degrades to a bare "Gauge"
// and loses the only identifying detail on the row. With it, the caption lands
// exactly where 1.0 left it, which is what keeps migration-first an ordering
// preference rather than a release gate.

/** Registry ids from the backend's flow-provider registry. */
export type ProviderId = 'usgs' | 'nws' | 'usace';

/**
 * A USGS site number: 8-15 digits, and the one id shape safe to print with no
 * publisher attached to it. Anchored, because a slug that merely CONTAINS
 * digits is exactly what must not qualify.
 */
const USGS_SITE_NUMBER = /^\d{8,15}$/;

/**
 * Whether an id has the SHAPE of a USGS site number.
 *
 * USGS site numbers are 8-15 digits and nothing else. A USACE dam is an Eddy
 * slug ('swl-clearwater-dam') and an NWS station is a five-character LID, so
 * both fail this cleanly.
 *
 * Two callers, and both are "no provider to read": the caption below, and the
 * app's not-found screen deciding whether an unknown id could carry a
 * waterdata.usgs.gov link. Everywhere a record exists, READ THE PROVIDER — an
 * id's shape is evidence, not provenance, and a USGS-shaped id on a station
 * some other agency publishes would pass this happily.
 */
export function looksLikeUsgsSiteId(siteId: string | null | undefined): boolean {
  const id = siteId?.trim();
  return !!id && USGS_SITE_NUMBER.test(id);
}

/**
 * How to name the operator, with no other words around it.
 *
 * Null for an unknown provider, so a caller that wants to say "Open on X" has
 * to handle not knowing rather than defaulting into a claim.
 */
export function providerLabel(provider: string | null | undefined): string | null {
  switch (provider) {
    case 'usgs':
      return 'USGS';
    case 'nws':
      return 'NWS';
    case 'usace':
      return 'USACE';
    default:
      return null;
  }
}

/**
 * The caption under a station's name.
 *
 * Null means "there is nothing this can honestly say" — an unknown publisher
 * and an id that is not a USGS site number. Callers decide what fills that
 * space; most drop the caption and let the station's name stand alone, which is
 * always true.
 *
 * An empty or whitespace-only site id is the same as no site id. Handled here
 * rather than at each call site because getting it wrong produces 'USGS ' with
 * a trailing space, which is the kind of defect that ships.
 */
export function stationCaption(
  provider: string | null | undefined,
  siteId: string | null | undefined,
): string | null {
  const id = siteId?.trim() ? siteId.trim() : null;
  switch (provider) {
    case 'usgs':
      return id ? `USGS ${id}` : 'USGS gauge';
    case 'nws':
      // An NWS LID ('VBUM7') is an internal forecast-point code, not something
      // a reader looks up, so it is credited like a slug: operator only.
      return 'NWS gauge';
    case 'usace':
      return 'USACE release';
    default:
      return looksLikeUsgsSiteId(id) ? id : null;
  }
}
