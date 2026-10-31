// packages/eddy-geo/sun.ts
// Sunset at a place, for River Mode's "you'd reach the take-out after dark".
//
// The standard sunrise equation (NOAA's simplified form): good to a minute or
// two at Ozark latitudes, which is far tighter than any float-time estimate it
// is compared with. Pure, and covered by
// missouri-float-planner/src/lib/river-progress.test.ts.

const J1970 = 2_440_587.5;
const J2000 = 2_451_545;
const MS_PER_DAY = 86_400_000;
const RAD = Math.PI / 180;

/**
 * Sunset, in epoch milliseconds, on the solar day nearest `at` at this place.
 * Null when the sun does not set that day (polar summer or winter).
 */
export function sunsetAt(lat: number, lng: number, at: number): number | null {
  return sunEventAt(lat, lng, at, 1);
}

/** Sunrise on the same solar day as sunsetAt; null during polar day/night. */
export function sunriseAt(lat: number, lng: number, at: number): number | null {
  return sunEventAt(lat, lng, at, -1);
}

function sunEventAt(lat: number, lng: number, at: number, direction: 1 | -1): number | null {
  const julian = at / MS_PER_DAY + J1970;
  // The day whose solar noon is nearest `at` here; longitude is east-positive.
  const day = Math.round(julian - J2000 + lng / 360);
  const meanSolarNoon = day - lng / 360;
  const anomaly = (357.5291 + 0.98560028 * meanSolarNoon) % 360;
  const m = anomaly * RAD;
  const center = 1.9148 * Math.sin(m) + 0.02 * Math.sin(2 * m) + 0.0003 * Math.sin(3 * m);
  const longitude = ((anomaly + center + 180 + 102.9372) % 360) * RAD;
  const transit = J2000 + meanSolarNoon + 0.0053 * Math.sin(m) - 0.0069 * Math.sin(2 * longitude);
  const declination = Math.asin(Math.sin(longitude) * Math.sin(23.4397 * RAD));
  // -0.833°: refraction plus the sun's radius, the usual definition of sunset.
  const cosHour =
    (Math.sin(-0.833 * RAD) - Math.sin(lat * RAD) * Math.sin(declination)) / (Math.cos(lat * RAD) * Math.cos(declination));
  if (cosHour < -1 || cosHour > 1) return null;
  const event = transit + direction * Math.acos(cosHour) / RAD / 360;
  return Math.round((event - J1970) * MS_PER_DAY);
}
