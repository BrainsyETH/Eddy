/** Fixed dams close below the landing are context, never in-route portages. */
export const DOWNSTREAM_DAM_BUFFER_MILES = 0.5;

export interface DamBelowTakeOut {
  id: string;
  name: string;
  type: 'low_water_dam';
  riverMile: number;
  distanceBelowTakeOutMiles: number;
}

interface HazardRow {
  id: string;
  name: string;
  type: string;
  river_mile_downstream: number | string | null;
}

/** Mile tolerance for "the same place": access and hazard miles come from the
 * same river geometry, so only rounding separates a dam from the access at it. */
export const ENDPOINT_HAZARD_TOLERANCE_MILES = 0.01;

/** Where a located hazard sits relative to a route. A hazard at the put-in is
 * launched below, and one at the take-out is landed above, so neither is
 * floated through or portaged on that route. */
export function hazardRoutePosition(mile: number, startMile: number, takeOutMile: number): 'put_in' | 'take_out' | 'inside' | 'outside' {
  if (Math.abs(mile - startMile) <= ENDPOINT_HAZARD_TOLERANCE_MILES) return 'put_in';
  if (Math.abs(mile - takeOutMile) <= ENDPOINT_HAZARD_TOLERANCE_MILES) return 'take_out';
  return mile > startMile && mile < takeOutMile ? 'inside' : 'outside';
}

/** Callers query active hazards on this river through take-out + the buffer. */
export function splitRouteHazards<T extends HazardRow>(rows: readonly T[], startMile: number, takeOutMile: number) {
  const hazards: T[] = [];
  const damsBelowTakeOut: DamBelowTakeOut[] = [];
  if (!Number.isFinite(startMile) || !Number.isFinite(takeOutMile) || takeOutMile < startMile) {
    throw new Error('Route hazard bounds must be finite and downstream');
  }
  for (const row of rows) {
    if (row.river_mile_downstream == null || row.river_mile_downstream === '') continue;
    const mile = Number(row.river_mile_downstream);
    if (!Number.isFinite(mile) || mile < startMile) continue;
    if (mile <= takeOutMile) {
      hazards.push(row);
    } else if (row.type === 'low_water_dam' && mile <= takeOutMile + DOWNSTREAM_DAM_BUFFER_MILES) {
      damsBelowTakeOut.push({
        id: row.id, name: row.name, type: 'low_water_dam', riverMile: mile,
        distanceBelowTakeOutMiles: Math.round((mile - takeOutMile) * 1000) / 1000,
      });
    }
  }
  damsBelowTakeOut.sort((a, b) => a.distanceBelowTakeOutMiles - b.distanceBelowTakeOutMiles);
  return { hazards, damsBelowTakeOut };
}

export function damBelowTakeOutLabel(dam: DamBelowTakeOut): string {
  const distance = dam.distanceBelowTakeOutMiles;
  return `${distance < 0.1 ? 'Less than 0.1' : distance.toFixed(1)} mi below your take-out`;
}
