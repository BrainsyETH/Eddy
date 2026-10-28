import type { MapGaugeLite } from './gauges/map-index';
import type { EddyIconName } from '@/components/ui/EddyIcon';
import type { PlannerMapPlace } from './planner-map-catalog';
import type { PointOfInterest } from '@/types/nps';
import type { GaugeStation } from '@/hooks/useGaugeStations';
import { plannerPlaceSymbol, plannerPoiSymbol } from './planner-place';
import { pickPrimaryRiverLink } from '@shared/primary-river-link';
import { computeCondition } from './conditions';
import type { ConditionCode } from '@/types/api';

export type PlannerMarker = {
  key: string;
  id: string;
  name: string;
  coordinates: { lng: number; lat: number };
  symbol: EddyIconName;
  role?: 'put-in' | 'take-out';
} & (
  | { kind: 'access'; place: PlannerMapPlace }
  | { kind: 'poi'; poi: PointOfInterest }
  | { kind: 'gauge'; gauge: GaugeStation; condition: ConditionCode }
  | { kind: 'referenceGauge'; gauge: MapGaugeLite }
);

export function plannerGaugeCondition(gauge: GaugeStation): ConditionCode {
  const threshold = pickPrimaryRiverLink(gauge.thresholds ?? []) ?? gauge.thresholds?.[0];
  return threshold ? computeCondition(gauge.gaugeHeightFt, threshold, gauge.dischargeCfs).code : 'unknown';
}

/** One record per physical place; detailed access data replaces catalogue data. */
export function plannerMarkers(places: PlannerMapPlace[], pois: PointOfInterest[], gauges: GaugeStation[],
  route: { riverSlug: string | null; putIn: string | null; takeOut: string | null }): PlannerMarker[] {
  const access = new Map(places.map(place => [place.id, place]));
  return [
    ...Array.from(access.values(), (place): PlannerMarker => ({
      kind: 'access', key: `access:${place.id}`, id: place.id, name: place.name, coordinates: place.coordinates,
      symbol: plannerPlaceSymbol(place), place,
      role: place.riverSlug !== route.riverSlug ? undefined : place.id === route.putIn ? 'put-in' : place.id === route.takeOut ? 'take-out' : undefined,
    })),
    ...pois.map((poi): PlannerMarker => ({ kind: 'poi', key: `poi:${poi.id}`, id: poi.id, name: poi.name,
      coordinates: { lng: poi.longitude, lat: poi.latitude }, symbol: plannerPoiSymbol(poi.type), poi })),
    ...gauges.map((gauge): PlannerMarker => ({ kind: 'gauge', key: `gauge:${gauge.id}`, id: gauge.id,
      name: gauge.name, coordinates: gauge.coordinates, symbol: 'gauge', gauge, condition: plannerGaugeCondition(gauge) })),
  ];
}

export function referenceGaugeMarkers(gauges: MapGaugeLite[]): PlannerMarker[] {
  return gauges.map(gauge => ({ kind: 'referenceGauge', key: `reference:${gauge.siteId}`, id: gauge.siteId,
    name: gauge.name, coordinates: gauge.coordinates, symbol: 'gauge', gauge }));
}
