// eddy-ios/src/map/mappable.ts
// Whether a service may be drawn as a pin.
//
// ── A pin is a claim, and a wrong one is worse than none ──────────────────
//
// Eddy lists eleven private campgrounds with no coordinates at all. The obvious
// way to fix that is to run their names through a geocoder, and it was measured
// before being trusted — every near-miss was a real, DIFFERENT campground:
//
//   Camp River Campground, Alton       -> Two Rivers Campground     35 mi away
//   Story's Creek Campground, Eminence -> Brazil Creek Campground   60 mi away
//   Ruby's Landing, Jerome             -> Twin Rivers Landing       71 mi away
//
// Somebody plans a two-hour drive around a pin. Sending them to the wrong
// campground is a worse failure than leaving theirs off the map, and it is the
// same rule the availability line already follows when it renders nothing
// rather than "unknown".
//
// So coordinates now carry a precision, and this is the one place that decides
// what that means for the map. Pure, and run from the web suite.

import type { RiverService } from '@eddy/types';

/**
 * A service with coordinates good enough to point at.
 *
 * There is deliberately no looser sibling for "good enough to search around" —
 * a ten-mile stays box really would tolerate a town centroid, but no surface
 * asks for that yet and an exported function nothing calls is a claim the
 * codebase cannot keep. The precision column supports it the day a caller
 * exists; the threshold belongs in that commit, not this one.
 *
 * Permissive by design: everything EXCEPT a known town centroid. The thirteen
 * services already on the map were entered before provenance was recorded and
 * carry no precision at all, and demanding `exact` would silently un-pin every
 * one of them to make a point about a column that did not exist when they were
 * added. Null means "from before this was tracked", which is a different claim
 * from "known to be a guess".
 */
export function mappableService(
  service: Pick<RiverService, 'latitude' | 'longitude' | 'geocodePrecision'>,
): boolean {
  if (service.latitude == null || service.longitude == null) return false;
  return service.geocodePrecision !== 'centroid';
}
