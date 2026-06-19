// ─────────────────────────────────────────────────────────────────────────────
// Demo Walkthrough — Edit Decision List (single source of truth)
//
// A tightened cut of the raw eddy.guide screen recording. Every footage clip
// pulls a range out of one source file; `srcIn`/`srcOut` are SECONDS of the
// source. The accidental iOS share sheet and the messy Google Maps detour are
// simply never referenced here — that's how they get "trimmed".
//
// This is the only file you normally touch: nudge a timecode, flip a `ramp`,
// retune a `speed`, or move a clip between `variants`, and the composition's
// durations + total runtime are re-derived automatically.
//
// Ported from the standalone Remotion prototype and rewired to this project's
// brand tokens, fonts, mascot, and 30fps timing (see DEMO_WALKTHROUGH.md).
// ─────────────────────────────────────────────────────────────────────────────

import { FPS } from "./voiceover";
import type { EddyVariant } from "../components/EddyMascot";

/** Composition fps — shared with the rest of the render pipeline (no drift). */
export const DEMO_FPS = FPS; // 30

/** Drop the recording in /public under this name (or override `sourceSrc`). */
export const DEMO_SOURCE = "eddy-demo-source.mp4";

/** Brand outro length, in seconds. */
export const ENDCARD_SECONDS = 2.8;

/** Transition INTO a clip. Its matching exit is applied to the previous clip. */
export type Transition = "none" | "zoom" | "whip" | "dip";

/**
 * Length variants. `short` ≈ :30 (drops the stage-trend, threshold, and shuttle
 * beats); `full` ≈ :40 (every beat). A true :60 would come from easing the ramp
 * compression / adding holds rather than another clip set — a future EDL knob.
 */
export type Variant = "short" | "full";

type BaseClip = {
  id: string;
  /** Shows as the Remotion Studio timeline label. */
  label: string;
  /** Muted-safe lower third (keep ≤ 6 words). */
  caption: string;
  /** Transition INTO this clip. */
  entrance: Transition;
  /** Which length variants include this clip. */
  variants: Variant[];
  /** Optional Eddy pop-in over the clip (bottom-left), for brand connective tissue. */
  mascot?: EddyVariant;
};

export type FootageClip = BaseClip & {
  kind: "footage";
  /** Source in/out, in SECONDS of the recording. */
  srcIn: number;
  srcOut: number;
  /**
   * Playback rate. With `ramp` off this is a constant speed (1 = real-time,
   * >1 = faster scroll). With `ramp` on this is the PEAK speed of an eased
   * accelerate→decelerate scroll (see `footageSegments`).
   */
  speed: number;
  /** Eased speed-ramp: scroll eases from `rampMin`→`speed`→`rampMin`. */
  ramp?: boolean;
  /** Floor speed at the eased ends of a ramp (default 1.0 = lands real-time). */
  rampMin?: number;
};

export type EndCardClip = BaseClip & { kind: "endcard" };

export type Clip = FootageClip | EndCardClip;

// ─── The edit ────────────────────────────────────────────────────────────────
//
// Transitions read off the NEXT clip's `entrance`: S4.entrance="zoom" gives the
// S3→S4 zoom-punch, S8.entrance="whip" the read→do whip, and the end card's
// "dip" the dip-to-brand close. Source timecodes mirror the edit script.

export const DEMO_EDL: Clip[] = [
  { id: "S1",  kind: "footage", label: "Hero",               srcIn: 1.5,  srcOut: 4.0,  speed: 1.0,                caption: "Plan your next float.",       entrance: "none", variants: ["short", "full"], mascot: "canoe" },
  { id: "S2",  kind: "footage", label: "Eddy reads",         srcIn: 6.5,  srcOut: 13.0, speed: 3.2, ramp: true,    caption: "Eddy reads every gauge.",     entrance: "none", variants: ["short", "full"] },
  { id: "S3",  kind: "footage", label: "River Reports",      srcIn: 16.0, srcOut: 23.0, speed: 1.9, ramp: true,    caption: "Every river, rated.",         entrance: "none", variants: ["short", "full"] },
  { id: "S4",  kind: "footage", label: "River detail",       srcIn: 25.0, srcOut: 29.0, speed: 1.33,               caption: "Live USGS data, clear status.", entrance: "zoom", variants: ["short", "full"], mascot: "green" },
  { id: "S5",  kind: "footage", label: "Stage trend",        srcIn: 30.0, srcOut: 33.5, speed: 1.17,               caption: "14-day trends, your gauge.",  entrance: "none", variants: ["full"] },
  { id: "S6",  kind: "footage", label: "Weather + analysis", srcIn: 34.0, srcOut: 41.0, speed: 4.0, ramp: true,    caption: "Weather + forecast, built in.", entrance: "none", variants: ["short", "full"] },
  { id: "S7",  kind: "footage", label: "Threshold bar",      srcIn: 48.5, srcOut: 50.8, speed: 1.15,               caption: "Know what the level means.",  entrance: "none", variants: ["full"] },
  { id: "S8",  kind: "footage", label: "Float Builder",      srcIn: 51.8, srcOut: 58.5, speed: 1.0,                caption: "Build it — tap to tap.",      entrance: "whip", variants: ["short", "full"], mascot: "standard" },
  { id: "S9",  kind: "footage", label: "Float Plan",         srcIn: 59.5, srcOut: 63.5, speed: 1.33,               caption: "Camps, ramps & access, mapped.", entrance: "none", variants: ["short", "full"] },
  { id: "S10", kind: "footage", label: "Shuttle route",      srcIn: 66.5, srcOut: 68.0, speed: 1.0,                caption: "Auto-routed shuttle drive.",  entrance: "none", variants: ["full"] },
  { id: "S11", kind: "footage", label: "Conditions + share", srcIn: 74.0, srcOut: 76.5, speed: 1.0,                caption: "Check it before you float.",  entrance: "none", variants: ["short", "full"] },
  { id: "S12", kind: "endcard", label: "End card",                                                                 caption: "",                            entrance: "dip",  variants: ["short", "full"] },
];

// ─── Derived timing ──────────────────────────────────────────────────────────

/** A constant-rate slice of source footage. */
export type Segment = { srcIn: number; srcOut: number; speed: number };

/** How many constant-rate slices approximate an eased ramp. */
const RAMP_SEGMENTS = 8;

/** Raised-cosine bump: 0 at the ends, 1 in the middle — a smooth hump. */
function easeBump(u: number): number {
  return 0.5 - 0.5 * Math.cos(2 * Math.PI * u);
}

/**
 * Expand a footage clip into constant-rate slices. A non-ramp clip is a single
 * slice. A ramp clip is split into equal SOURCE slices whose individual speeds
 * follow an ease from `rampMin`→`speed`→`rampMin`, so the scroll accelerates
 * into the content and decelerates as it lands — without needing a per-frame
 * variable playbackRate (which OffthreadVideo can't do).
 */
export function footageSegments(clip: FootageClip): Segment[] {
  if (!clip.ramp) {
    return [{ srcIn: clip.srcIn, srcOut: clip.srcOut, speed: clip.speed }];
  }
  const min = clip.rampMin ?? 1.0;
  const peak = clip.speed;
  const span = clip.srcOut - clip.srcIn;
  const segs: Segment[] = [];
  for (let k = 0; k < RAMP_SEGMENTS; k++) {
    const u = (k + 0.5) / RAMP_SEGMENTS;
    segs.push({
      srcIn: clip.srcIn + (span * k) / RAMP_SEGMENTS,
      srcOut: clip.srcIn + (span * (k + 1)) / RAMP_SEGMENTS,
      speed: min + (peak - min) * easeBump(u),
    });
  }
  return segs;
}

/** Displayed length of a constant-rate slice, in composition frames. */
export function segmentFrames(seg: Segment): number {
  return Math.max(1, Math.round(((seg.srcOut - seg.srcIn) * DEMO_FPS) / seg.speed));
}

/** Displayed length of any clip, in composition frames. */
export function clipDurationInFrames(clip: Clip): number {
  if (clip.kind === "endcard") {
    return Math.round(ENDCARD_SECONDS * DEMO_FPS);
  }
  return footageSegments(clip).reduce((acc, seg) => acc + segmentFrames(seg), 0);
}

/** The clips included in a given length variant, in order. */
export function variantClips(variant: Variant): Clip[] {
  return DEMO_EDL.filter((c) => c.variants.includes(variant));
}

/** Total runtime of a variant, in composition frames. */
export function totalDurationInFrames(variant: Variant): number {
  return variantClips(variant).reduce((acc, c) => acc + clipDurationInFrames(c), 0);
}
