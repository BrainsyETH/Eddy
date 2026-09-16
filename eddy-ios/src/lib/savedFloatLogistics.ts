import type { FloatPlan, Hazard, MapAccessPoint } from '@eddy/types';

/** Deliberately excludes live readings, float-time estimates and shuttle times. */
export interface SavedFloatLogistics {
  savedAt: string;
  putIn: Pick<MapAccessPoint, 'id' | 'name' | 'riverMile' | 'coordinates' | 'isPublic' | 'feeRequired' | 'description'>;
  takeOut: SavedFloatLogistics['putIn'];
  hazards: Hazard[];
  warnings: string[];
}

export function savedFloatLogistics(plan: FloatPlan, now = new Date().toISOString()): SavedFloatLogistics {
  const point = (value: MapAccessPoint): SavedFloatLogistics['putIn'] => ({
    id: value.id, name: value.name, riverMile: value.riverMile,
    coordinates: { ...value.coordinates }, isPublic: value.isPublic,
    feeRequired: value.feeRequired, description: value.description,
  });
  return {
    savedAt: now,
    putIn: point(plan.putIn), takeOut: point(plan.takeOut),
    hazards: plan.hazards.map((hazard) => ({ ...hazard })),
    warnings: logisticsWarnings(plan.warnings, plan.putIn.name, plan.takeOut.name),
  };
}

export function logisticsWarnings(warnings: readonly string[], putInName: string, takeOutName: string): string[] {
  const allowed = new Set([`${putInName} does not have direct road access`, `${takeOutName} does not have direct road access`]);
  return warnings.filter(warning => allowed.has(warning));
}
