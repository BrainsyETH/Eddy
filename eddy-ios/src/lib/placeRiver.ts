// eddy-ios/src/lib/placeRiver.ts
// Which river a statewide hazard or spring belongs to, carried beside it.
//
// ── Why this is tagged on rather than looked up ─────────────────────────────
// Neither type says so in a form the sheet can use: a Hazard carries a river
// uuid and a MapSpring carries nothing at all. But every one of them reaches
// the phone filed under its river — the launch bundle and the on-disk cache are
// both keyed by slug, and the live hazard request is made for one — so the
// river is known at the moment the item is loaded and lost only when the lists
// are flattened for the statewide map. Tagging it there keeps the pin builders
// pure functions of the item, which is what lets a search result and a tap
// build the same sheet.
//
// Optional on purpose. An item from a source that never tagged it (an older
// cache read, a future caller) still draws; its sheet just cannot name the
// river or offer a way to it, which is what it did before.
//
// Pure, so the web suite can run it.

export interface PlaceRiver {
  riverSlug?: string | null;
  riverName?: string | null;
}

/** Tag every item with the river it was filed under. */
export function withPlaceRiver<T extends object>(
  items: readonly T[] | null | undefined,
  riverSlug: string,
  riverName: string | null | undefined,
): (T & PlaceRiver)[] {
  return (items ?? []).map((item) => ({ ...item, riverSlug, riverName: riverName ?? null }));
}
