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
//
// ── The caption rule itself lives in shared/, not here ─────────────────────
// It used to live here AND in the web search route, and the two copies had
// already drifted — this side answered 'USACE' where the server answered
// 'USACE release', and the Search tab renders both in one list. The rule is now
// stated once in @eddy/conditions/station-caption and re-exported here so this
// module stays the app's single answer to "what may I say about this station".
// Everything below the re-export is app behaviour rather than copy, which is
// why it does not move with it.

// `looksLikeUsgsSiteId` moves with them: the caption's unknown-provider
// fallback IS that shape test, so a second copy of the regex here would be the
// same drift in miniature.
export type { ProviderId } from '@eddy/conditions/station-caption';
export {
  looksLikeUsgsSiteId,
  providerLabel,
  stationCaption,
} from '@eddy/conditions/station-caption';

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

/**
 * Whether this station is a USACE dam release rather than a stream gauge.
 *
 * True means there is a whole dam behind the number — a pool, a generating
 * state, an hourly schedule — none of which fits gauge_stations, which models a
 * river discharge. The station id doubles as the dam id, so `/dam/${siteId}`
 * resolves: the registry key IS gauge_stations.site_id_external.
 */
export function isDamRelease(provider: string | null | undefined): boolean {
  return provider === 'usace';
}

/** Whether the station's own id can build a waterdata.usgs.gov URL. */
export function isUsgsSite(provider: string | null | undefined): boolean {
  return provider === 'usgs';
}

