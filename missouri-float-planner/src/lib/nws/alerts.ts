// src/lib/nws/alerts.ts
// Fetches active NWS alerts for Missouri river areas.
// Free API, no key required. Used to give Eddy context about flood warnings,
// flash flood watches, and other river-relevant weather alerts.

import { matchAlertsByTerms } from './alert-matching';
import { trackedFetch } from '@/lib/telemetry/upstream';
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
export async function fetchNWSAlerts(stateCode: string = 'MO', options: { strict?: boolean; signal?: AbortSignal } = {}): Promise<NWSAlert[]> {
  const url = `https://api.weather.gov/alerts/active?area=${encodeURIComponent(stateCode)}`;

  const response = await trackedFetch('nws', 'alerts', url, {
    signal: options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(10_000)]) : AbortSignal.timeout(10_000),
    headers: {
      'User-Agent': '(Eddy Float Planner, contact@eddyfloat.com)',
      Accept: 'application/geo+json',
    },
    next: { revalidate: 900 }, // Cache for 15 minutes
  });

  if (!response.ok) {
    if (options.strict) throw new Error('NWS alert lookup failed');
    console.warn(`[NWS] Alert fetch failed: ${response.status} ${response.statusText}`);
    return [];
  }

  const data = await response.json();
  if (options.strict && !Array.isArray(data.features)) throw new Error('Invalid NWS alert response');
  return parseRiverAlerts(data.features);
}

/**
 * The river-relevant alerts in an api.weather.gov FeatureCollection's features.
 *
 * Pure, so the event filter can be tested without the network, and shared by
 * the state-wide and point lookups so the two cannot disagree about which
 * events count.
 */
export function parseRiverAlerts(features: unknown): NWSAlert[] {
  const alerts: NWSAlert[] = [];
  if (!Array.isArray(features)) return alerts;

  for (const feature of features as { id?: string; properties?: Record<string, string | undefined> }[]) {
    const props = feature?.properties;
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
 * Active river-relevant alerts whose area contains one point — a gauge.
 *
 * The state-wide lookup above is matched to RIVERS by search terms, which an
 * unrated station does not have. `?point=` asks the Weather Service directly
 * which alerts cover these coordinates (forecast zones, counties, and the
 * polygons river flood warnings are drawn along), so no matching is needed.
 *
 * Never throws: a gauge screen must not fail because weather.gov is slow. Null
 * means the lookup did not answer; [] means it answered with nothing active.
 * The two are different claims and the caller keeps them apart.
 */
export async function fetchNWSAlertsAtPoint(
  lat: number,
  lng: number,
  options: { timeoutMs?: number } = {},
): Promise<NWSAlert[] | null> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const url = `https://api.weather.gov/alerts/active?point=${lat.toFixed(4)},${lng.toFixed(4)}`;
  try {
    const response = await trackedFetch('nws', 'alerts_point', url, {
      signal: AbortSignal.timeout(options.timeoutMs ?? 4_000),
      headers: {
        'User-Agent': '(Eddy Float Planner, contact@eddyfloat.com)',
        Accept: 'application/geo+json',
      },
      next: { revalidate: 300 },
    });
    if (!response.ok) return null;
    const data = await response.json();
    return Array.isArray(data?.features) ? parseRiverAlerts(data.features) : null;
  } catch {
    return null;
  }
}

/**
 * Filters alerts to those mentioning specific river names or nearby counties.
 * Search terms come from rivers.alert_search_terms (per-river data); the
 * legacy hardcoded map remains as a fallback for rows that predate the
 * migration.
 */
export function filterAlertsForRiver(
  alerts: NWSAlert[],
  riverSlug: string,
  searchTerms?: string[] | null
): NWSAlert[] {
  const riverTerms = searchTerms?.length ? searchTerms : LEGACY_RIVER_SEARCH_TERMS[riverSlug];
  const matched = matchAlertsByTerms(alerts, riverTerms);
  if (matched == null) {
    console.warn(`[NWS] Alert matching unavailable for ${riverSlug}: no usable search terms`);
    return [];
  }
  return matched;
}

/**
 * @deprecated Fallback only — the source of truth is rivers.alert_search_terms
 * (seeded by migration 00145). Do not add rivers here.
 */
const LEGACY_RIVER_SEARCH_TERMS: Record<string, string[]> = {
  current: ['current river', 'shannon county', 'dent county', 'carter county', 'van buren', 'eminence'],
  meramec: ['meramec', 'crawford county', 'franklin county', 'sullivan', 'steelville'],
  'eleven-point': ['eleven point', 'oregon county', 'alton'],
  'jacks-fork': ['jacks fork', 'jack\'s fork', 'shannon county', 'eminence'],
  niangua: ['niangua', 'dallas county', 'laclede county', 'bennett spring'],
  'big-piney': ['big piney', 'texas county', 'pulaski county', 'licking'],
  huzzah: ['huzzah', 'crawford county', 'steelville'],
  courtois: ['courtois', 'crawford county', 'steelville'],
};

/** Truncate long NWS descriptions to keep prompt size manageable. */
function truncateDescription(desc: string, maxLength = 500): string {
  if (desc.length <= maxLength) return desc;
  return desc.slice(0, maxLength) + '...';
}
