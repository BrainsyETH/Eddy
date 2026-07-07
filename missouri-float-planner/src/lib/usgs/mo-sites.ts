// Statewide USGS context sites for /river-map.
//
// The observatory map shows every active Missouri stream site with a
// current discharge reading as a NEUTRAL context node — location + flow
// magnitude + data age only. These sites carry no curated thresholds,
// so they are deliberately not dressed in the condition taxonomy
// (see docs/mo-surface-water-observatory.md, "Data honesty").
//
// Modern OGC API only (api.waterdata.usgs.gov). Two requests, both
// server-cached 15 min: monitoring-locations for names, and
// latest-continuous for the newest discharge value per site. Filtering
// uses the spec-standard `bbox` parameter so we don't depend on
// vendor-specific state filters; results are re-filtered to Missouri's
// polygon client-side before rendering.

const MODERN_BASE = 'https://api.waterdata.usgs.gov/ogcapi/v0/collections';
const PARAM_DISCHARGE = '00060';
// Missouri bbox with a slim margin (matches MISSOURI_BOUNDS in constants).
const MO_BBOX = '-95.9,35.9,-88.9,40.7';
/** Render/transfer ceiling — beyond this we keep the highest-discharge sites. */
export const MO_SITES_CAP = 600;

export interface MoContextSite {
  site_no: string;
  name: string | null;
  lat: number;
  lon: number;
  dischargeCfs: number;
  readingTimestamp: string | null;
}

export interface MoContextSitesResult {
  sites: MoContextSite[];
  /** True when the cap dropped lower-flow sites (HUD discloses this). */
  capped: boolean;
}

function headers(): HeadersInit {
  const h: Record<string, string> = { Accept: 'application/geo+json' };
  const key = process.env.USGS_API_KEY;
  if (key) h['X-Api-Key'] = key;
  return h;
}

interface OgcFeature {
  id?: string;
  geometry?: { type: string; coordinates: number[] } | null;
  properties?: Record<string, unknown> | null;
}

function siteNoFromLocationId(id: unknown): string | null {
  if (typeof id !== 'string') return null;
  // "USGS-07064533" → "07064533"
  const m = id.match(/^[A-Z]+-(\d+)$/);
  return m ? m[1] : id;
}

async function fetchJson(url: URL): Promise<{ features?: OgcFeature[] } | null> {
  try {
    const res = await fetch(url.toString(), {
      next: { revalidate: 900 },
      headers: headers(),
    });
    if (!res.ok) return null;
    return (await res.json()) as { features?: OgcFeature[] };
  } catch {
    return null;
  }
}

/**
 * All active MO stream sites with a latest discharge value, largest flow
 * first, capped at MO_SITES_CAP. Returns an empty list on any upstream
 * failure — the page degrades to curated-only rather than breaking.
 */
export async function fetchMoContextSites(): Promise<MoContextSitesResult> {
  // Names (and a coordinate fallback) from monitoring-locations.
  const locUrl = new URL(`${MODERN_BASE}/monitoring-locations/items`);
  locUrl.searchParams.set('f', 'json');
  locUrl.searchParams.set('bbox', MO_BBOX);
  locUrl.searchParams.set('limit', '10000');

  // Latest discharge per site.
  const latestUrl = new URL(`${MODERN_BASE}/latest-continuous/items`);
  latestUrl.searchParams.set('f', 'json');
  latestUrl.searchParams.set('bbox', MO_BBOX);
  latestUrl.searchParams.set('parameter_code', PARAM_DISCHARGE);
  latestUrl.searchParams.set('limit', '10000');

  const [locData, latestData] = await Promise.all([fetchJson(locUrl), fetchJson(latestUrl)]);
  if (!latestData?.features?.length) return { sites: [], capped: false };

  const meta = new Map<string, { name: string | null; lat: number | null; lon: number | null }>();
  for (const f of locData?.features ?? []) {
    const site = siteNoFromLocationId(
      f.id ?? (f.properties?.monitoring_location_id as string | undefined),
    );
    if (!site) continue;
    const coords = f.geometry?.type === 'Point' ? f.geometry.coordinates : null;
    meta.set(site, {
      name:
        (f.properties?.monitoring_location_name as string | undefined) ??
        (f.properties?.name as string | undefined) ??
        null,
      lon: coords?.[0] ?? null,
      lat: coords?.[1] ?? null,
    });
  }

  const out = new Map<string, MoContextSite>();
  for (const f of latestData.features) {
    const props = f.properties ?? {};
    if (props.parameter_code && props.parameter_code !== PARAM_DISCHARGE) continue;
    const site = siteNoFromLocationId(
      (props.monitoring_location_id as string | undefined) ?? f.id,
    );
    if (!site) continue;
    const value = Number(props.value);
    // USGS uses -999999 sentinel for errored readings; also reject junk.
    if (isNaN(value) || value < 0 || value >= 1_000_000) continue;
    const coords = f.geometry?.type === 'Point' ? f.geometry.coordinates : null;
    const m = meta.get(site);
    const lon = coords?.[0] ?? m?.lon ?? null;
    const lat = coords?.[1] ?? m?.lat ?? null;
    if (lon == null || lat == null) continue;
    const existing = out.get(site);
    const time = (props.time as string | undefined) ?? null;
    if (!existing || (time && existing.readingTimestamp && time > existing.readingTimestamp)) {
      out.set(site, {
        site_no: site,
        name: m?.name ?? null,
        lat,
        lon,
        dischargeCfs: value,
        readingTimestamp: time,
      });
    }
  }

  const all = Array.from(out.values()).sort((a, b) => b.dischargeCfs - a.dischargeCfs);
  const capped = all.length > MO_SITES_CAP;
  return { sites: all.slice(0, MO_SITES_CAP), capped };
}
