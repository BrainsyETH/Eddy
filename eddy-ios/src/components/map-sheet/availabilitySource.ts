// eddy-ios/src/components/map-sheet/availabilitySource.ts
// Where availability comes from — the ONE place that knows.
//
// ── Why this is a function and not a field access ─────────────────────────
//
// The server used to nest `availability` inside `npsCampground`, which meant a
// Missouri State Park's live inventory was not merely absent but
// UNREPRESENTABLE: Meramec, Onondaga Cave and Washington have no
// nps_campgrounds row, and campsite_facilities carries their availability
// through a different foreign key entirely. It is a sibling now.
//
// Both are populated during the overlap, and the order below matters in each
// direction:
//
//   sibling first   an OLD app against a new deploy reads the nested copy,
//                   which is why the nested one is still sent
//   nested second   a NEW app against an older deploy finds only the nested
//                   one, which is why this falls back rather than assuming
//
// Every surface reads through here so that when the nested copy is finally
// removed, this file is the only edit — and so no call site can quietly go on
// reading `npsCampground.availability` and re-break state parks.

import type { AccessPointDetail, CampsiteAvailabilitySummary } from '@eddy/types';

export function accessAvailability(
  point: AccessPointDetail | null | undefined,
): CampsiteAvailabilitySummary | null {
  return point?.availability ?? point?.npsCampground?.availability ?? null;
}

/**
 * The name the backcountry-district wording needs.
 *
 * `campsiteAvailabilityLine` and `availabilityHero` interpolate this only for
 * `kind === 'backcountry_district'` — which is eighteen of the roughly thirty
 * enabled federal facilities, every Ozark gravel-bar loop. Omitting it turns
 * "12 backcountry sites open · Upper Current District" into a number with
 * nowhere attached, so it is resolved here rather than remembered per call.
 */
export function accessAvailabilityName(
  point: AccessPointDetail | null | undefined,
  fallback?: string,
): string | undefined {
  return point?.npsCampground?.name ?? point?.name ?? fallback;
}
