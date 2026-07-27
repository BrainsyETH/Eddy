// eddy-ios/src/theme/flow.ts
// How a REFERENCE gauge is coloured — the second visual language.
//
// Read the header of @eddy/conditions/flow-band first. The short version: a
// condition colour is a verdict ("float this" / "do not"), and Eddy only makes
// that claim about the ~46 gauges a human has rated against a river. The other
// ~14,000 get a comparison to their own history instead, and it must not be
// possible to mistake one for the other at a glance.
//
// ── Why one hue and not a red-to-green scale ────────────────────────────────
// Green and red are spoken for. A paddler who has learnt Eddy's green as "go"
// would read a green dot on an unrated creek as permission, which is exactly
// the claim we are declining to make. So this ramp stays inside the brand's
// teal, running dry-stone through to deep water, and carries NO hue that
// appears in CONDITION_SYSTEM.
//
// This is the same reasoning the palette already applies to rain
// (rainQuiet/rainLikely/rainHeavy): "a ramp inside ONE hue reads as more of the
// same thing", where a hue change reads as a different KIND of thing.
//
// ── The colour is never the whole message ───────────────────────────────────
// Every surface that paints a flow band must print its label beside it.
// Five steps of one hue are not reliably distinguishable — not on a phone in
// sunlight, not with a colour vision deficiency, and not against a basemap that
// is already teal-ish where there is water. The colour ranks; the words tell.

import {
  FLOW_BAND_SYSTEM,
  FLOW_BAND_UNKNOWN_SOLID,
  type FlowBand,
} from '@eddy/conditions/flow-band';
import { primary, type Palette } from '@/theme/palette';

export type { FlowBand };

/**
 * The colour for a band, or the neutral "no comparison" dot.
 *
 * Read through FLOW_BAND_SYSTEM, never redefined here — the same rule
 * conditions.ts follows for CONDITION_SYSTEM, and for the same reason: this
 * app already shipped a hardcoded copy of the condition hex once and it drifted
 * from the canonical value within one release.
 *
 * The ramp is scheme-independent. Unlike the rain ramp, these dots sit on the
 * outdoors basemap, which is light in BOTH appearances — the same fact that
 * forces gauge labels to use a white halo in both — so a per-scheme ramp would
 * be solving a problem this layer does not have.
 *
 * A null band is NOT an error and is the common case: most national gauges have
 * no day-of-year statistics. It gets its own stone so it reads as "we don't
 * know" rather than borrowing `normal`, which would be a claim.
 */
export function flowBandColor(band: FlowBand | null): string {
  return band ? FLOW_BAND_SYSTEM[band].solid : FLOW_BAND_UNKNOWN_SOLID;
}

/** Chip label. Always render this next to the colour, never the colour alone. */
export function flowBandLabel(band: FlowBand | null): string {
  return band ? FLOW_BAND_SYSTEM[band].label : 'No comparison';
}

/** The full sentence for a detail sheet, or the honest absence of one. */
export function flowBandSentence(band: FlowBand | null): string {
  return band
    ? FLOW_BAND_SYSTEM[band].sentence
    : 'No historical comparison published for this gauge';
}

/**
 * Chip colours for a reference gauge.
 *
 * Mirrors the shape conditionBg/conditionInk/conditionChipBorder return for
 * curated gauges so a shared row component can swap between them — but the
 * values come from here, and PinCallout must branch rather than defaulting to
 * the condition versions. A reference gauge wearing a condition-coloured chip
 * is the bug this whole file exists to prevent.
 */
export function flowBandChip(
  band: FlowBand | null,
  colors: Palette,
): { bg: string; ink: string; border: string } {
  const solid = flowBandColor(band);
  return {
    // Tint rather than a solid fill: the chip sits on card and sheet surfaces
    // in both schemes, and a tint composites over either.
    bg: colors.scheme === 'dark' ? `${solid}33` : `${solid}22`,
    ink: colors.scheme === 'dark' ? colors.text : primary[900],
    border: solid,
  };
}
