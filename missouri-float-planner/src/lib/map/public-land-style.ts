// src/lib/map/public-land-style.ts
// How the public-land layer is painted, and what its access codes are called.
//
// ── Why this is a copy ─────────────────────────────────────────────────────
// The canonical table is PUBLIC_LAND_ACCESS_STYLE in packages/eddy-types, so
// that the phone and the website cannot teach a reader two different meanings
// for the same shade off the same dataset. Shippable web code cannot import
// @eddy/* (Vercel installs only missouri-float-planner/), so this mirrors it and
// src/lib/map/public-land-parity.test.ts asserts the two are identical.
//
// ── Why these colours and not a traffic light ──────────────────────────────
// Every value is an earth tone from the brand's sandbar/stone families and NONE
// appears in CONDITION_SYSTEM or the flow ramp. That is a hard rule. Red, amber
// and green already mean "do not float", "use caution" and "go" on this map —
// about the water, from a gauge reading Eddy stands behind. Spending them on a
// federal ownership classification would make a safety-shaped promise about
// somewhere a person might drive to, out of a field that reads 'UK' on 296 of
// the 1,753 parcels loaded.
//
// The encoding is therefore one family for "this is public ground", with WEIGHT
// carrying confidence — open the most solid, unknown the faintest — and the
// popup carrying the actual classification in words.

/** PAD-US `Pub_Access`, verbatim: OA open · RA restricted · XA closed · UK unknown. */
export type PublicLandAccess = 'OA' | 'RA' | 'XA' | 'UK';

export interface PublicLandAccessStyle {
  /** Interior, with alpha baked in: the fill is data-driven by colour. */
  fill: string;
  /** Boundary. Opaque — an edge is what makes a parcel readable at all. */
  line: string;
  /** False for every class but OA, which is the only one drawn solid. */
  solid: boolean;
}

export const PUBLIC_LAND_ACCESS_STYLE: Record<PublicLandAccess, PublicLandAccessStyle> = {
  OA: { fill: 'rgba(122,104,75,0.26)', line: '#5C4E38', solid: true },
  RA: { fill: 'rgba(122,104,75,0.13)', line: '#7A684B', solid: false },
  XA: { fill: 'rgba(61,52,37,0.16)', line: '#3D3425', solid: false },
  UK: { fill: 'rgba(164,156,142,0.09)', line: '#A49C8E', solid: false },
};

export const PUBLIC_LAND_ACCESS_LABELS: Record<PublicLandAccess, string> = {
  OA: 'Open access',
  RA: 'Restricted access',
  XA: 'Closed to the public',
  UK: 'Access unknown',
};

/**
 * What a public-land boundary does not mean, in one sentence.
 *
 * Shown wherever the layer is switched on — not buried in a popup someone has
 * to open. This is the whole reason the layer is allowed to exist.
 */
export const PUBLIC_LAND_OWNERSHIP_NOTE =
  'Ownership, not permission. Boundaries are the agency’s own and do not imply a right to land, camp or portage — check the managing agency before you count on it.';

/**
 * The style for an access code, tolerating a code PAD-US added after us.
 *
 * Falls back to UK rather than throwing or drawing nothing: an unrecognised
 * classification is, definitionally, one we do not know the meaning of.
 */
export function publicLandAccessStyle(access: string | null | undefined): PublicLandAccessStyle {
  const key = (access ?? '').toUpperCase();
  return PUBLIC_LAND_ACCESS_STYLE[key as PublicLandAccess] ?? PUBLIC_LAND_ACCESS_STYLE.UK;
}

/** The label for an access code, tolerating a code PAD-US added after us. */
export function publicLandAccessLabel(access: string | null | undefined): string {
  const key = (access ?? '').toUpperCase();
  return PUBLIC_LAND_ACCESS_LABELS[key as PublicLandAccess] ?? PUBLIC_LAND_ACCESS_LABELS.UK;
}

/** The four codes, in the order a legend should read them. */
export const PUBLIC_LAND_ACCESS_ORDER: PublicLandAccess[] = ['OA', 'RA', 'XA', 'UK'];
