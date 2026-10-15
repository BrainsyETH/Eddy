import type { MapGauge } from '@eddy/types';
import { pickPrimaryRiverLink } from '@eddy/conditions/primary-river-link';
import { gaugePlaceLabel } from './gaugeCondition';

export interface WidgetGaugeChoice {
  id: string;
  siteId: string;
  gaugeId: string;
  riverId: string | null;
  riverSlug: string | null;
  riverName: string;
  stationName: string;
  primaryForRiver: boolean;
  defaultForGauge: boolean;
}
interface WidgetStar {
  kind: string; entityId: string; name: string; slug: string;
  usgsSiteId?: string | null;
}
export interface WidgetConfiguration {
  version: 1;
  catalog: WidgetGaugeChoice[];
  favorites: WidgetGaugeChoice[];
}

export function widgetGaugeCatalog(gauges: readonly MapGauge[]): WidgetGaugeChoice[] {
  return gauges.flatMap(gauge => {
    if (!gauge.usgsSiteId) return [];
    const primary = pickPrimaryRiverLink(gauge.thresholds);
    const links = gauge.thresholds?.length ? gauge.thresholds : [null];
    return links.map(link => ({
      id: `${gauge.usgsSiteId}|${link?.riverSlug ?? ''}`,
      siteId: gauge.usgsSiteId!, gaugeId: gauge.id,
      riverId: link?.riverId ?? null, riverSlug: link?.riverSlug ?? null,
      riverName: link?.riverName ?? gauge.name,
      stationName: gaugePlaceLabel(gauge.name),
      primaryForRiver: link?.isPrimary ?? false,
      defaultForGauge: link === primary,
    }));
  }).sort((a, b) => a.id.localeCompare(b.id));
}

export function widgetConfiguration(catalog: readonly WidgetGaugeChoice[], stars: readonly WidgetStar[]): WidgetConfiguration {
  const favorites: WidgetGaugeChoice[] = [];
  const choices = [...catalog];
  for (const star of stars) {
    let choice: WidgetGaugeChoice | undefined;
    if (star.kind === 'river') {
      // A secondary station is not a substitute for a missing river primary.
      choice = catalog.find(item => item.primaryForRiver && item.riverId === star.entityId);
    } else if (star.kind === 'gauge') {
      choice = catalog.find(item => item.defaultForGauge && (item.gaugeId === star.entityId || item.siteId === star.usgsSiteId));
      if (!choice && star.usgsSiteId) {
        choice = {
          id: `${star.usgsSiteId}|`, siteId: star.usgsSiteId, gaugeId: star.entityId,
          riverId: null, riverSlug: null, riverName: star.name,
          stationName: gaugePlaceLabel(star.name), primaryForRiver: false, defaultForGauge: true,
        };
        if (!choices.some(item => item.id === choice!.id)) choices.push(choice);
      }
    }
    if (choice && !favorites.some(item => item.id === choice.id)) favorites.push(choice);
  }
  return { version: 1, catalog: choices, favorites: favorites.slice(0, 3) };
}
