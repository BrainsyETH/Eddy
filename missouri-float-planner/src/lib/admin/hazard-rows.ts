// Database row → API shape for the admin Hazards routes (list, create, update).
import { getCoordinates, getRiverData } from '@/lib/api-utils';

export const HAZARD_COLUMNS = `
  id, river_id, name, type, location, river_mile_downstream, description,
  severity, portage_required, portage_side, active, seasonal_notes,
  min_safe_level, max_safe_level, created_at, updated_at,
  rivers(id, name, slug)`;

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function formatHazardRow(row: any) {
  const river = getRiverData(row.rivers);
  const coords = getCoordinates(row.location);
  return {
    id: row.id as string,
    riverId: row.river_id as string | null,
    riverName: river?.name ?? null,
    riverSlug: river?.slug ?? null,
    name: row.name as string,
    type: row.type as string,
    // Null when the hazard has no location; 0 is a real coordinate and a real mile.
    latitude: coords ? coords.lat : null,
    longitude: coords ? coords.lng : null,
    riverMileDownstream: num(row.river_mile_downstream),
    description: row.description as string | null,
    severity: row.severity as string | null,
    portageRequired: !!row.portage_required,
    portageSide: row.portage_side as string | null,
    active: !!row.active,
    seasonalNotes: row.seasonal_notes as string | null,
    minSafeLevel: num(row.min_safe_level),
    maxSafeLevel: num(row.max_safe_level),
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}
