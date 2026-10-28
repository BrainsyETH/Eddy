// src/lib/nps/campground-amenities.ts
// Read one NPS campground amenity as offered or not.
//
// The NPS API reports each amenity as a list of strings, and "not offered" is
// spelled several ways: showers say "None", potable water says "No water",
// other fields say "No". The services directory used to decide showers by
// reading the potable-water field and treating everything except the exact
// string "No" as yes, so "No water" counted. 24 primitive campgrounds on the
// Current, Jacks Fork and Buffalo advertised showers they do not have, which a
// floater finds out at the end of a day on the river.

const NEGATIVE = /^(none|no|not)\b/;

/** True when at least one reported value says the amenity is offered. */
export function npsAmenityOffered(values: unknown): boolean {
  const list = Array.isArray(values) ? values : typeof values === 'string' ? [values] : [];
  return list.some((value) => {
    if (typeof value !== 'string') return false;
    const normalized = value.trim().toLowerCase();
    return normalized !== '' && !NEGATIVE.test(normalized);
  });
}
