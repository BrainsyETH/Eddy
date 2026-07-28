// eddy-ios/src/lib/gaugeProvider.ts
// Who publishes a station's numbers, and what the app may therefore say about it.
//
// ── Why this exists ────────────────────────────────────────────────────────
// The gauge screen used to assume every station was a USGS one. It printed
// "USGS <site id>" as the caption and built a waterdata.usgs.gov link straight
// from the id. That held until migration 00198 registered Clearwater Dam as a
// curated station so its release could ride the normal ingestion pipeline —
// correct on the server, and instantly visible in the app, which drew it on the
// map, returned it in Search and let you open it.
//
// What you got was a screen headed "USGS swl-clearwater-dam" with an "Open on
// USGS" button pointing at waterdata.usgs.gov/monitoring-location/
// swl-clearwater-dam/, which is a 404. Neither is a rendering bug: both are the
// app asserting a provenance the record never claimed.
//
// So provenance is read, never assumed. `null` means the source did not say,
// and a caller that does not know must print nothing rather than guess.

/** Registry ids from the backend's flow-provider registry. */
export type ProviderId = 'usgs' | 'nws' | 'usace';

/**
 * How to name the operator in a caption.
 *
 * Null for an unknown provider — the caption drops to the station name alone,
 * which is always true, rather than attributing it to somebody.
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
 * A USGS site number is a real public identifier people cross-reference, so it
 * is printed. A USACE dam's id is an EDDY SLUG ('swl-clearwater-dam') that
 * exists nowhere else — printing it would look like a citation while naming
 * nothing the reader could look up, so the operator is named without it.
 */
export function stationCaption(
  provider: string | null | undefined,
  siteId: string
): string | null {
  const label = providerLabel(provider);
  if (!label) return null;
  return provider === 'usgs' ? `${label} ${siteId}` : label;
}

/**
 * Whether a station's reading may be described with the flow-band vocabulary.
 *
 * No for a dam release, and not because the data is missing. UsaceProvider
 * declines to compute a percentile at all, on the grounds that a percentile on
 * a REGULATED release describes the Corps' schedule rather than the river's
 * hydrology — "much higher than usual for late July" is a statement about
 * rainfall, and it is simply false about a dam that is generating on a Tuesday.
 *
 * Without this the screen falls through to the reference-gauge vocabulary and
 * prints a band chip for a percentile that is deliberately null.
 */
export function supportsFlowBand(provider: string | null | undefined): boolean {
  return provider !== 'usace';
}

/** Whether the station's own id can build a waterdata.usgs.gov URL. */
export function isUsgsSite(provider: string | null | undefined): boolean {
  return provider === 'usgs';
}

/**
 * Whether an id has the SHAPE of a USGS site number, for the one case with no
 * record to read a provider from: the not-found screen.
 *
 * USGS site numbers are 8-15 digits and nothing else. A USACE dam is an Eddy
 * slug ('swl-clearwater-dam') and an NWS station is a five-letter LID, so both
 * fail this cleanly. Use it ONLY where a provider is genuinely unavailable —
 * everywhere else, read the record.
 */
export function looksLikeUsgsSiteId(siteId: string | null | undefined): boolean {
  return !!siteId && /^\d{8,15}$/.test(siteId);
}
