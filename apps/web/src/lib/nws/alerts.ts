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
 * Fetches active NWS alerts for Missouri that are relevant to river conditions.
 * Uses the free weather.gov API (no API key needed).
 */
export async function fetchNWSAlerts(): Promise<NWSAlert[]> {
  const url = 'https://api.weather.gov/alerts/active?area=MO';

  const response = await fetch(url, {
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
 */
export function filterAlertsForRiver(
  alerts: NWSAlert[],
  riverSlug: string
): NWSAlert[] {
  const riverTerms = RIVER_SEARCH_TERMS[riverSlug];
  if (!riverTerms) return alerts; // Return all if no specific terms

  return alerts.filter((alert) => {
    const searchText = `${alert.headline} ${alert.description} ${alert.areaDesc}`.toLowerCase();
    return riverTerms.some((term) => searchText.includes(term.toLowerCase()));
  });
}

// Map river slugs to search terms for filtering NWS alerts
const RIVER_SEARCH_TERMS: Record<string, string[]> = {
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
