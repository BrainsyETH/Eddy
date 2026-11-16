import type { RiverReach } from '@shared/reach-types';

/** Only identity and hydrology cross into the selector; live data has one owner. */
export type RiverReportSection = Pick<RiverReach, 'sectionSlug' | 'name' | 'riverType'> & {
  gaugeStationId: string | null;
};

export { riverSectionLabel } from '@shared/river-section-label';

export function reachAnchorId(sectionSlug: string): string {
  return `reach-${sectionSlug}`;
}

/** Both existing dam links (?section=) and old reach anchors remain usable. */
export function sectionFromUrl(sections: RiverReportSection[], url: URL): string | null {
  const hashSection = sections.find((section) => url.hash === `#${reachAnchorId(section.sectionSlug)}`);
  const querySection = sections.find((section) => section.sectionSlug === url.searchParams.get('section'));
  return (hashSection ?? querySection ?? sections[0])?.sectionSlug ?? null;
}

/** Never replace an unavailable section gauge with a gauge across the dam. */
export function sectionGauge<T extends { id: string }>(section: RiverReportSection | null, gauges: T[]): T | null {
  return section?.gaugeStationId ? gauges.find((gauge) => gauge.id === section.gaugeStationId) ?? null : null;
}
