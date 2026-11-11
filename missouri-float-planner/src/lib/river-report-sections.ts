import type { RiverReach } from '@shared/reach-types';

/** Only identity and hydrology cross into the selector; live data has one owner. */
export type RiverReportSection = Pick<RiverReach, 'sectionSlug' | 'name' | 'riverType'> & {
  gaugeStationId: string | null;
};

const BLACK_LABELS: Record<string, { title: string; subtitle: string }> = {
  'upper-lesterville': { title: 'Upper Black', subtitle: 'Lesterville–Hwy K' },
  'lower-markham-hammer': { title: 'Lower Black', subtitle: 'Markham Springs–Hammer' },
};

export function riverSectionLabel(section: RiverReportSection) {
  if (BLACK_LABELS[section.sectionSlug]) return BLACK_LABELS[section.sectionSlug];
  const match = section.name.match(/^(.+?)\s*\((.+)\)$/);
  return { title: match?.[1] ?? section.name, subtitle: match?.[2] ?? '' };
}

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
