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
    warnings: [...plan.warnings],
  };
}
