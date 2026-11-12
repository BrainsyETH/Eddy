/** Fixed dams close below the landing are context, never in-route portages. */
export const DOWNSTREAM_DAM_BUFFER_MILES = 0.5;

/**
 * A danger just upstream of the put-in is launched below, not floated through,
 * but it still shapes the trip: a tailwater put-in sits a few hundred yards
 * under the dam whose releases and closure zone the route inherits (Beaver at
 * 0.33 mi, Norfork at 0.44). Context, never an in-route portage.
 */
export const UPSTREAM_DANGER_BUFFER_MILES = 0.5;

export interface HazardAbovePutIn {
  id: string;
  name: string;
  type: string;
  riverMile: number;
  distanceAbovePutInMiles: number;
}

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
  severity?: string | null;
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

/** Callers query active hazards on this river from put-in − the upstream buffer
 * through take-out + the downstream buffer. */
export function splitRouteHazards<T extends HazardRow>(rows: readonly T[], startMile: number, takeOutMile: number) {
  const hazards: T[] = [];
  const damsBelowTakeOut: DamBelowTakeOut[] = [];
  const hazardsAbovePutIn: HazardAbovePutIn[] = [];
  if (!Number.isFinite(startMile) || !Number.isFinite(takeOutMile) || takeOutMile < startMile) {
    throw new Error('Route hazard bounds must be finite and downstream');
  }
  for (const row of rows) {
    if (row.river_mile_downstream == null || row.river_mile_downstream === '') continue;
    const mile = Number(row.river_mile_downstream);
    if (!Number.isFinite(mile)) continue;
    // Within the endpoint tolerance a hazard IS at the put-in (hazardRoutePosition
    // says 'put_in'), so it stays in the route list once, never in both.
    if (mile < startMile - ENDPOINT_HAZARD_TOLERANCE_MILES) {
      if (row.severity === 'danger' && startMile - mile <= UPSTREAM_DANGER_BUFFER_MILES) {
        hazardsAbovePutIn.push({
          id: row.id, name: row.name, type: row.type, riverMile: mile,
          distanceAbovePutInMiles: Math.round((startMile - mile) * 1000) / 1000,
        });
      }
      continue;
    }
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
  hazardsAbovePutIn.sort((a, b) => a.distanceAbovePutInMiles - b.distanceAbovePutInMiles);
  return { hazards, damsBelowTakeOut, hazardsAbovePutIn };
}

function milesLabel(distance: number): string {
  return `${distance < 0.1 ? 'Less than 0.1' : distance.toFixed(1)} mi`;
}

/** Visible row text. The section heading already says put-in or take-out. */
export function hazardDistanceLabel(hazard: HazardAbovePutIn | DamBelowTakeOut): string {
  return 'distanceAbovePutInMiles' in hazard
    ? `${milesLabel(hazard.distanceAbovePutInMiles)} upstream`
    : `${milesLabel(hazard.distanceBelowTakeOutMiles)} downstream`;
}

/** Full phrase for screen readers and agents, which read a row without its heading. */
export function damBelowTakeOutLabel(dam: DamBelowTakeOut): string {
  const distance = dam.distanceBelowTakeOutMiles;
  return `${distance < 0.1 ? 'Less than 0.1' : distance.toFixed(1)} mi below your take-out`;
}

export function hazardAbovePutInLabel(hazard: HazardAbovePutIn): string {
  const distance = hazard.distanceAbovePutInMiles;
  return `${distance < 0.1 ? 'Less than 0.1' : distance.toFixed(1)} mi above your put-in`;
}
