// eddy-ios/src/hooks/searchFallback.ts
// What the map's search can still find when its usual sources are not there.
//
// useEddySearch matches rivers from /api/rivers, rated gauges from /api/gauges
// and access points from /api/search. Offline, all three can be missing while
// the map keeps drawing every river, put-in and rated gauge from the statewide
// network and the launch bundle on disk — so the field could not find a
// put-in whose pin was on screen, and the empty state's "only what the map
// already holds can match" was false. This matches against that on-disk copy,
// and only for a source that is absent: the live sources stay authoritative
// whenever they answer.
//
// Pure and React-free, so the web suite can test it (the hook itself imports
// the API client, which it cannot load).

import type { MapAccessPoint, SearchResult } from '@eddy/types';

/** The fields of a statewide river this needs — structural, see the header. */
export interface FallbackRiver {
  id: string;
  slug: string;
  name: string;
  region: string | null;
  gauges: readonly { site_id: string; lon: number; lat: number; is_primary: boolean }[] | null;
}

export interface FallbackSources {
  /** Every river the map draws; null or empty when the network has not loaded. */
  rivers: readonly FallbackRiver[] | null;
  /** Every put-in the map draws, with the river each belongs to. */
  accessPoints: readonly { point: MapAccessPoint; riverSlug?: string | null }[] | null;
  /** Which kinds have no live source right now. */
  missing: { rivers: boolean; gauges: boolean; accessPoints: boolean };
}

/**
 * Enough rows to find a put-in by part of its name without a common word
 * ("access", "ford") listing half the state.
 */
const ACCESS_LIMIT = 20;

export function fallbackMatches(needle: string, sources: FallbackSources): SearchResult[] {
  const query = needle.trim().toLowerCase();
  if (query.length < 2) return [];
  const rivers = sources.rivers ?? [];
  const riverBySlug = new Map(rivers.map((river) => [river.slug, river]));

  const riverHits: SearchResult[] = sources.missing.rivers
    ? rivers
        .filter((r) => r.name.toLowerCase().includes(query) || (r.region ?? '').toLowerCase().includes(query))
        .map((r) => ({
          kind: 'river' as const,
          id: r.id,
          name: r.name,
          subtitle: r.region,
          riverId: r.id,
          riverName: r.name,
          riverSlug: r.slug,
          riverMile: null,
          coordinates: null,
        }))
    : [];

  // The network names a rated gauge by site number only, so that and its
  // river are what can match. No reading is claimed: `gauge: null` renders
  // as "no reading", which is true of what this copy holds.
  const gaugeHits: SearchResult[] = [];
  if (sources.missing.gauges) {
    const seen = new Set<string>();
    for (const river of rivers) {
      const riverMatches = river.name.toLowerCase().includes(query);
      for (const gauge of river.gauges ?? []) {
        if (seen.has(gauge.site_id)) continue;
        if (!riverMatches && !gauge.site_id.toLowerCase().includes(query)) continue;
        if (!Number.isFinite(gauge.lon) || !Number.isFinite(gauge.lat)) continue;
        seen.add(gauge.site_id);
        gaugeHits.push({
          kind: 'gauge',
          id: `site:${gauge.site_id}`,
          name: `USGS ${gauge.site_id}`,
          subtitle: [river.name, gauge.is_primary ? 'primary gauge' : null].filter(Boolean).join(' · '),
          riverId: river.id,
          riverName: river.name,
          riverSlug: river.slug,
          riverMile: null,
          coordinates: { lng: gauge.lon, lat: gauge.lat },
          siteId: gauge.site_id,
          provider: 'usgs',
          gauge: null,
        });
      }
    }
  }

  const accessHits: SearchResult[] = sources.missing.accessPoints
    ? (sources.accessPoints ?? [])
        .filter(({ point }) => point.name.toLowerCase().includes(query))
        .slice(0, ACCESS_LIMIT)
        .map(({ point, riverSlug }) => {
          const river = riverSlug ? riverBySlug.get(riverSlug) ?? null : null;
          return {
            kind: 'access_point' as const,
            id: point.id,
            name: point.name,
            subtitle: [river?.name, `Mile ${point.riverMile.toFixed(1)}`].filter(Boolean).join(' · '),
            riverId: river?.id ?? null,
            riverName: river?.name ?? null,
            riverSlug: riverSlug ?? null,
            riverMile: point.riverMile,
            coordinates: point.coordinates,
            accessSlug: point.slug ?? null,
          };
        })
    : [];

  return [...riverHits, ...gaugeHits, ...accessHits];
}
