// shared/lake-launch-order.ts
// The order a launch list is read in, and the words for how far a launch is.
// Shared so the web list and the iOS list sort and label the same way.
//
// Distances are straight-line from the reader to the ramp's reviewed
// coordinate. On a lake the drive round an arm can be several times that, so
// the label says "straight line" and the list never calls anything "closest
// drive". Directions are the map app's job.

import type { LaunchMethod } from './lake-types';

interface Point { lat: number; lon: number }

const EARTH_RADIUS_MILES = 3958.8;
const rad = (deg: number) => (deg * Math.PI) / 180;

export function launchDistanceMiles(from: Point, to: Point): number {
  const dLat = rad(to.lat - from.lat);
  const dLon = rad(to.lon - from.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(from.lat)) * Math.cos(rad(to.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_MILES * Math.asin(Math.min(1, Math.sqrt(h)));
}

export interface OrderedLaunch<T> {
  launch: T;
  /** Straight-line miles from the reader. Absent when no location was given. */
  miles?: number;
}

/**
 * Nearest first when the reader's location is known, the given order (by name,
 * from the server) when it is not. A location that is not a finite coordinate
 * is treated as unknown; a bad fix must not shuffle the list.
 */
export function orderLaunches<T extends Point>(launches: readonly T[], from: Point | null): OrderedLaunch<T>[] {
  if (!from || !Number.isFinite(from.lat) || !Number.isFinite(from.lon)) return launches.map((launch) => ({ launch }));
  return launches
    .map((launch) => ({ launch, miles: launchDistanceMiles(from, launch) }))
    .sort((a, b) => a.miles - b.miles);
}

export function launchDistanceLabel(miles: number): string {
  if (miles < 1) return 'Under 1 mi, straight line';
  return `${miles < 10 ? miles.toFixed(1) : Math.round(miles).toLocaleString('en-US')} mi, straight line`;
}

/**
 * Whether a method filter has anything to separate. With only trailer ramps
 * reviewed, a "Hand launch" tab is a dead end that reads as "none exist".
 */
export function launchMethodFilterUseful(launches: ReadonlyArray<{ launchMethods: readonly LaunchMethod[] }>): boolean {
  const offered = new Set(launches.flatMap((launch) => launch.launchMethods));
  return offered.has('trailer') && offered.has('hand');
}
