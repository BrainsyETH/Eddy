import type { RiverReach } from '@eddy/types';

type Section = Pick<RiverReach, 'sectionSlug' | 'name' | 'riverType' | 'differsFromRiver' | 'gaugeStationId'>;
type Gauge = { id: string; usgsSiteId: string | null };
type Source = 'loading' | 'live' | 'cached' | 'missing';

/**
 * Resolve identity before allowing the report to fall back to its primary.
 *
 * `ready` with a null gauge means "read the river's own primary report": the
 * selected section is the river's primary stretch, but its station could not be
 * joined to /api/gauges — a failed statewide gauge request, or reaches cached
 * before they carried `gaugeStationId`. That stretch's water IS what
 * /api/conditions answers for, so blanking its reading, scale and chart behind
 * "Report unavailable" punished the reader for a join failure. A section that
 * differs from the river, or names a station that is not the primary, still
 * never borrows the primary's water.
 */
export function resolveRiverSection<T extends Gauge>({ reaches, source, refreshing = false, gauges, gaugesReady, sectionSlug, gaugeSiteId, primaryGaugeId = null }: {
  reaches: Section[];
  source: Source;
  refreshing?: boolean;
  gauges: T[];
  gaugesReady: boolean;
  sectionSlug?: string | null;
  gaugeSiteId?: string | null;
  /** The river's primary station UUID, when known. */
  primaryGaugeId?: string | null;
}): { sections: Section[]; selected: Section | null; gauge: T | null; state: 'ordinary' | 'loading' | 'unavailable' | 'ready' } {
  const sections = reaches.length > 1 && reaches.some(reach => reach.differsFromRiver) ? reaches : [];
  if (!sections.length) {
    return { sections, selected: null, gauge: null,
      state: (sectionSlug || gaugeSiteId) && (source === 'loading' || (source === 'cached' && refreshing))
        ? 'loading' : sectionSlug ? 'unavailable' : 'ordinary' };
  }
  const arrivalGauge = gauges.find(gauge => gauge.usgsSiteId === gaugeSiteId);
  const selected = sections.find(reach => reach.sectionSlug === sectionSlug)
    ?? sections.find(reach => arrivalGauge && reach.gaugeStationId === arrivalGauge.id)
    ?? sections[0];
  const gauge = gauges.find(candidate => candidate.id === selected.gaugeStationId) ?? null;
  if (!gaugesReady || (!selected.gaugeStationId && source === 'cached' && refreshing)) {
    return { sections, selected, gauge, state: 'loading' };
  }
  if (gauge?.usgsSiteId) return { sections, selected, gauge, state: 'ready' };
  const readsPrimary = !selected.differsFromRiver && !gauge
    && (!selected.gaugeStationId || selected.gaugeStationId === primaryGaugeId);
  return { sections, selected, gauge: null, state: readsPrimary ? 'ready' : 'unavailable' };
}

/** A section-scoped dam never qualifies an above-dam reading. */
export function sectionShowsDam(damSectionSlug: string | null | undefined, selectedSectionSlug: string | null | undefined) {
  return !damSectionSlug || damSectionSlug === selectedSectionSlug;
}

/** Older/fallback responses must not describe a different station's water. */
export function sectionOutlook<T extends { gaugeStationId?: string | null }>(outlook: T | null, sectionGaugeId: string | null) {
  return !sectionGaugeId || outlook?.gaugeStationId === sectionGaugeId ? outlook : null;
}
