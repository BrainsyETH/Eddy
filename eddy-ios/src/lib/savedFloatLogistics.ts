import type { FloatPlan, Hazard, MapAccessPoint } from '@eddy/types';

/** Deliberately excludes live readings, float-time estimates and shuttle times. */
export interface SavedFloatLogistics {
  savedAt: string;
  putIn: Pick<MapAccessPoint, 'id' | 'name' | 'riverMile' | 'coordinates' | 'isPublic' | 'feeRequired' | 'description'>;
  takeOut: SavedFloatLogistics['putIn'];
  hazards: Hazard[];
  damsBelowTakeOut?: FloatPlan['damsBelowTakeOut'];
  hazardsUnavailable?: boolean;
  /** When the retained hazard list was last loaded successfully. */
  hazardsSavedAt?: string;
  warnings: string[];
}

export function savedFloatLogistics(plan: FloatPlan, now = new Date().toISOString(), previous?: SavedFloatLogistics): SavedFloatLogistics {
  const point = (value: MapAccessPoint): SavedFloatLogistics['putIn'] => ({
    id: value.id, name: value.name, riverMile: value.riverMile,
    coordinates: { ...value.coordinates }, isPublic: value.isPublic,
    feeRequired: value.feeRequired, description: value.description,
  });
  const sameRoute = previous?.putIn.id === plan.putIn.id && previous?.takeOut.id === plan.takeOut.id;
  const retained = sameRoute ? previous : undefined;
  const hazardsUnavailable = plan.hazardsUnavailable === true;
  return {
    savedAt: now,
    putIn: point(plan.putIn), takeOut: point(plan.takeOut),
    hazards: (hazardsUnavailable ? retained?.hazards ?? [] : plan.hazards).map((hazard) => ({ ...hazard })),
    damsBelowTakeOut: (hazardsUnavailable ? retained?.damsBelowTakeOut ?? [] : plan.damsBelowTakeOut ?? []).map(dam => ({ ...dam })),
    hazardsUnavailable,
    hazardsSavedAt: hazardsUnavailable
      ? retained?.hazardsSavedAt ?? (retained && !retained.hazardsUnavailable ? retained.savedAt : undefined)
      : now,
    warnings: logisticsWarnings(plan.warnings, plan.putIn.name, plan.takeOut.name),
  };
}

export function logisticsWarnings(warnings: readonly string[], putInName: string, takeOutName: string): string[] {
  const allowed = new Set([`${putInName} does not have direct road access`, `${takeOutName} does not have direct road access`]);
  return warnings.filter(warning => allowed.has(warning));
}
