import type { RiverReach } from '@eddy/types';

type Section = Pick<RiverReach, 'sectionSlug' | 'name' | 'riverType' | 'differsFromRiver' | 'gaugeStationId'>;
type Gauge = { id: string; usgsSiteId: string | null };
type Source = 'loading' | 'live' | 'cached' | 'missing';

/** Resolve identity before allowing the report to fall back to its primary. */
export function resolveRiverSection<T extends Gauge>({ reaches, source, refreshing = false, gauges, gaugesReady, sectionSlug, gaugeSiteId }: {
  reaches: Section[];
  source: Source;
  refreshing?: boolean;
  gauges: T[];
  gaugesReady: boolean;
  sectionSlug?: string | null;
  gaugeSiteId?: string | null;
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
  return { sections, selected, gauge,
    state: !gaugesReady || (!selected.gaugeStationId && source === 'cached' && refreshing) ? 'loading'
      : gauge?.usgsSiteId ? 'ready' : 'unavailable' };
}

/** A section-scoped dam never qualifies an above-dam reading. */
export function sectionShowsDam(damSectionSlug: string | null | undefined, selectedSectionSlug: string | null | undefined) {
  return !damSectionSlug || damSectionSlug === selectedSectionSlug;
}

/** Older/fallback responses must not describe a different station's water. */
export function sectionOutlook<T extends { gaugeStationId?: string | null }>(outlook: T | null, sectionGaugeId: string | null) {
  return !sectionGaugeId || outlook?.gaugeStationId === sectionGaugeId ? outlook : null;
}
