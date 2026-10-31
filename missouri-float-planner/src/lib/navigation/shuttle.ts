// src/lib/navigation/shuttle.ts
// The shuttle hand-off to Google and Apple Maps, kept pure so it can be tested.

import { getNavCoordinates } from './deepLinks';

/** What a shuttle endpoint needs: a name, a waterline point, and maybe parking. */
export interface ShuttlePoint {
  name: string;
  coordinates: { lat: number; lng: number };
  drivingLat?: number | null;
  drivingLng?: number | null;
}

/**
 * The shuttle runs TAKE-OUT → PUT-IN: from the car left downstream back to the
 * launch. Same direction as /api/shuttle and the iOS plan card
 * (driveBetweenUrl(takeOut, putIn) in eddy-ios/src/lib/directionsChoices.ts).
 * The web card once ran the other way.
 */
export function shuttleLeg<T>(plan: { putIn: T; takeOut: T }): { from: T; to: T } {
  return { from: plan.takeOut, to: plan.putIn };
}

/**
 * Point-to-point driving links. Routes to COORDINATES, never names — a free-text
 * place name is ambiguous to a geocoder ("Cedar Grove Campground, MO" once
 * routed a 30-mile shuttle 85 miles) — preferring each point's curated parking
 * pair over its waterline position, as iOS does.
 */
export function shuttleDriveLinks(from: ShuttlePoint, to: ShuttlePoint): { google: string; apple: string } {
  const start = getNavCoordinates(from);
  const end = getNavCoordinates(to);
  const source = `${start.lat},${start.lng}`;
  const destination = `${end.lat},${end.lng}`;
  return {
    google: `https://www.google.com/maps/dir/?${new URLSearchParams({ api: '1', origin: source, destination, travelmode: 'driving' })}`,
    apple: `https://maps.apple.com/?${new URLSearchParams({ saddr: source, daddr: destination, dirflg: 'd' })}`,
  };
}
