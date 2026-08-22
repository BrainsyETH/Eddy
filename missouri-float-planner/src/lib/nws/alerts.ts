// src/lib/nws/alerts.ts
// Fetches active NWS alerts for Missouri river areas.
// Free API, no key required. Used to give Eddy context about flood warnings,
// flash flood watches, and other river-relevant weather alerts.

export interface NWSAlert {
  id: string;
  event: string;         // e.g. "Flood Warning", "Flash Flood Watch"
  headline: string;
  description: string;
  severity: string;      // "Extreme" | "Severe" | "Moderate" | "Minor" | "Unknown"
  urgency: string;       // "Immediate" | "Expected" | "Future" | "Unknown"
  onset: string;
  expires: string;
  areaDesc: string;      // affected counties/areas
}

// River-relevant NWS alert event types
const RIVER_ALERT_EVENTS = [
  'Flood Warning',
  'Flood Watch',
  'Flood Advisory',
  'Flash Flood Warning',
  'Flash Flood Watch',
  'River Flood Warning',
  'River Flood Watch',
  'Hydrologic Outlook',
];

/**
 * Fetches active NWS alerts relevant to river conditions for one state.
 * Uses the free weather.gov API (no API key needed). NWS covers US states and
 * territories only — non-US regions will need a different alert provider.
 *
 * @param stateCode Two-letter state/territory code (from rivers.state)
 */
export async function fetchNWSAlerts(stateCode: string = 'MO'): Promise<NWSAlert[]> {
  const url = `https://api.weather.gov/alerts/active?area=${encodeURIComponent(stateCode)}`;

  const response = await fetch(url, {
    signal: AbortSignal.timeout(10_000),
    headers: {
      'User-Agent': '(Eddy Float Planner, contact@eddyfloat.com)',
      Accept: 'application/geo+json',
    },
    next: { revalidate: 900 }, // Cache for 15 minutes
  });

  if (!response.ok) {
    console.warn(`[NWS] Alert fetch failed: ${response.status} ${response.statusText}`);
    return [];
  }

  const data = await response.json();
  const features = data.features || [];

  const alerts: NWSAlert[] = [];

  for (const feature of features) {
    const props = feature.properties;
    if (!props) continue;

    // Only keep river/flood-relevant alerts
    const isRelevant = RIVER_ALERT_EVENTS.some(
      (event) => props.event?.toLowerCase().includes(event.toLowerCase())
    );
    if (!isRelevant) continue;

    alerts.push({
      id: props.id || feature.id || '',
      event: props.event || '',
      headline: props.headline || '',
      description: truncateDescription(props.description || ''),
      severity: props.severity || 'Unknown',
      urgency: props.urgency || 'Unknown',
      onset: props.onset || '',
      expires: props.expires || '',
      areaDesc: props.areaDesc || '',
    });
  }

  return alerts;
}

/**
 * Filters alerts to those mentioning specific river names or nearby counties.
 * Search terms come from rivers.alert_search_terms (per-river data).
 */
export function filterAlertsForRiver(
  alerts: NWSAlert[],
  riverSlug: string,
  searchTerms?: string[] | null
): NWSAlert[] {
  const riverTerms = searchTerms?.length ? searchTerms : null;
  if (!riverTerms) {
    // Fails OPEN, and that is load-bearing rather than lazy.
    //
    // Both callers of this helper are prompt builders — generate-update.ts and
    // chat/tool-handlers.ts. Neither renders what comes back; a model reads it.
    // Surplus alerts there cost a few tokens and some hedged prose. Returning
    // nothing instead would tell the model the river is quiet, which is the one
    // wrong answer available.
    //
    // The screen path does NOT share this posture. matchWeatherAlerts skips
    // untermed rivers at its own boundary (src/lib/alerts/river-alerts.ts) so a
    // newly ingested creek cannot show every flood warning in the state as its
    // own — and the comment there says explicitly that the guard lives at the
    // call site "rather than by changing the shared helper, so the two LLM
    // callers keep the behaviour they were written against". Tightening this
    // function is what that sentence is asking you not to do; it also silently
    // makes that comment false.
    //
    // The missing terms are still a defect. They surface as a
    // `canonical_alert_terms_missing` Trust finding, filed `high`.
    console.warn(`[NWS] Missing canonical alert_search_terms for active river ${riverSlug}; returning unfiltered alerts`);
    return alerts;
  }

  return alerts.filter((alert) => {
    const searchText = `${alert.headline} ${alert.description} ${alert.areaDesc}`.toLowerCase();
    return riverTerms.some((term) => searchText.includes(term.toLowerCase()));
  });
}

/** Truncate long NWS descriptions to keep prompt size manageable. */
function truncateDescription(desc: string, maxLength = 500): string {
  if (desc.length <= maxLength) return desc;
  return desc.slice(0, maxLength) + '...';
}
