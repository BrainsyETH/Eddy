// eddy-ios/src/components/map-sheet/sheetGeometry.ts
// Where the sheet is allowed to rest, and which resting place a release lands
// on. Pure arithmetic on purpose: no React, no Reanimated, no worklets — the
// snap rules are the part most likely to be argued about, and they should be
// readable and testable without a device in the loop.
//
// ── The constants are borrowed, not invented ──────────────────────────────
// The website already ships two hand-rolled sheets whose physics have been
// tuned against real thumbs:
//   missouri-float-planner/src/components/mo-surface-water/chrome/rail.tsx
//   missouri-float-planner/src/components/plan/FloatPlanCard.tsx
// Their thresholds are carried over here. What is NOT carried over is their
// machinery: both hand-roll a velocity window (rail.tsx samples six times over
// ~100ms; FloatPlanCard smooths with v = v*0.4 + vNew*0.6) and project momentum
// forward by a fixed PROJECTION_MS. react-native-gesture-handler already hands
// us a natively-smoothed velocity, and withSpring({ velocity }) already carries
// momentum properly, so re-implementing either would be worse and slower.
//
// Velocities here are px/SECOND because that is what gesture-handler reports.
// The web constants are px/ms, hence the ×1000.

/** A resting height. Not every sheet offers all three — see resolveDetents. */
export type Detent = 'peek' | 'half' | 'full';

/** Movement below this is a tap, not a drag. rail.tsx:230. */
export const DRAG_DEAD_ZONE = 8;

/** Commit to the drag's direction regardless of position. rail.tsx:231, 0.45 px/ms. */
export const FLICK_VELOCITY = 450;

/** Travel the whole way rather than one detent. FloatPlanCard, 0.6 px/ms. */
export const STRONG_FLICK_VELOCITY = 600;

/** How much of a drag past the tallest detent actually moves the sheet. */
export const RUBBER_BAND = 0.35;

/**
 * Released below this fraction of the smallest detent, the sheet closes.
 *
 * rail.tsx:280. Downward travel is NOT rubber-banded, unlike upward: dismissal
 * has to feel like a real direction you can throw the sheet in, and resisting
 * it would make closing feel like fighting the sheet.
 */
export const DISMISS_FRACTION = 0.6;

/** Settle after release. Velocity is passed in separately, per gesture. */
export const SETTLE_SPRING = { damping: 30, stiffness: 260, mass: 0.9 } as const;

/** Instant, for Reduce Motion. Dragging stays 1:1 — that is not an animation. */
export const REDUCED_SETTLE = { duration: 0 } as const;

/**
 * Peek's target, before the content gets a say.
 *
 * 0.32 rather than rail.tsx's exported 0.44 because that fraction is tuned for
 * a TWO-detent sheet, where peek is the only thing between closed and open and
 * has to carry a whole headline card. With three, peek is the glance and `half`
 * lands roughly where the web's peek did.
 */
export const PEEK_FRACTION = 0.32;
export const HALF_FRACTION = 0.55;
export const FULL_FRACTION = 0.92;

/**
 * Peek is never taller than this, however big the phone.
 *
 * A glance that occupies half a tall screen is not a glance.
 */
export const PEEK_MAX = 340;

/**
 * Two detents closer together than this are the same detent.
 *
 * Without a floor, a sheet whose content happens to land near a fraction
 * boundary offers two snap points a few pixels apart — which reads as the
 * sheet refusing to settle rather than as a choice.
 */
export const MIN_DETENT_GAP = 56;

export interface SheetDetents {
  /** Height the sheet may occupy at most — the map area, less any top inset. */
  available: number;
  /** Offered detents, ascending. Always at least one. */
  order: Detent[];
  /** Pixel height of every detent in `order`. */
  height: Record<Detent, number>;
}

/**
 * Which detents this sheet actually offers.
 *
 * DRIVEN BY THE CONTENT, not by the layer or the phone. A hazard callout is
 * ~115pt and a gauge callout with a qualifier note is ~251pt (see the note
 * above the bottom stack in the map screen), so a sheet that always offered
 * three heights would spend two of them showing blank card below the content.
 *
 * The rule: never taller than the content, never two detents within
 * MIN_DETENT_GAP of each other, always at least `peek`. A sheet whose content
 * fits inside peek is a one-detent sheet that can still be dragged shut — which
 * is exactly how the callout behaves today, and is why adopting this does not
 * change how a short pin looks at rest.
 */
export function resolveDetents(
  available: number,
  contentHeight: number,
  /**
   * The measured height of the sheet's peek slot, when it has one.
   *
   * PREFERRED OVER THE FRACTION, because a glance should be as tall as the
   * thing being glanced at and no taller. The fraction lands wherever it lands
   * — on a typical phone that was ~224pt, which is just past the header and
   * straight into the tab bar, so the sheet opened showing half a control
   * strip. Measuring means peek ends exactly where the primary action does.
   */
  peekHeight?: number,
): SheetDetents {
  const safeAvailable = Math.max(0, available);
  // A content height of 0 means "not measured yet". Fall back to the peek
  // target so the first frame is not a zero-height sheet that then jumps.
  const content =
    contentHeight > 0 ? Math.min(contentHeight, safeAvailable) : peekTarget(safeAvailable);

  const measured = peekHeight && peekHeight > 0 ? Math.min(peekHeight, safeAvailable) : null;
  const peek = Math.min(content, measured ?? peekTarget(safeAvailable));
  const height: Record<Detent, number> = {
    peek,
    half: Math.min(content, Math.round(safeAvailable * HALF_FRACTION)),
    full: Math.min(content, Math.round(safeAvailable * FULL_FRACTION)),
  };

  const order: Detent[] = ['peek'];
  for (const detent of ['half', 'full'] as const) {
    const previous = height[order[order.length - 1]];
    if (height[detent] - previous >= MIN_DETENT_GAP) order.push(detent);
  }

  return { available: safeAvailable, order, height };
}

function peekTarget(available: number): number {
  return Math.min(PEEK_MAX, Math.round(available * PEEK_FRACTION));
}

/**
 * Where a release lands.
 *
 * `height` is where the sheet is at the moment the finger lifts; `velocity` is
 * px/s, positive DOWNWARD (gesture-handler's sign, and the opposite of height's
 * direction — hence the negations).
 *
 * Order matters. A strong flick wins outright, because a deliberate throw
 * should never be second-guessed by where it happened to start. A soft flick
 * moves exactly one detent, so a gentle nudge is a step rather than a leap.
 * Everything else falls to whichever detent is nearest.
 *
 * Returns null to mean CLOSE.
 */
export function settleTarget(
  detents: SheetDetents,
  height: number,
  velocity: number,
): Detent | null {
  'worklet';
  const { order, height: heights } = detents;
  const smallest = heights[order[0]];
  const largest = heights[order[order.length - 1]];

  // A deliberate throw is never second-guessed by where it started.
  if (velocity <= -STRONG_FLICK_VELOCITY) return order[order.length - 1];
  if (velocity >= STRONG_FLICK_VELOCITY) {
    // Thrown down from the smallest detent there is nowhere left to go but
    // shut. Thrown down from higher up it collapses, the way Maps does — a
    // hard flick should not skip past the glance straight to dismissal.
    return height <= smallest + 1 ? null : order[0];
  }

  // Released well below the glance, with or without speed.
  if (height < smallest * DISMISS_FRACTION) return null;
  if (velocity >= FLICK_VELOCITY && height <= smallest + 1) return null;

  // A soft flick steps exactly one detent, so a nudge is a step not a leap.
  if (velocity <= -FLICK_VELOCITY) {
    return stepFrom(order, heights, height, 1) ?? order[order.length - 1];
  }
  if (velocity >= FLICK_VELOCITY) {
    return stepFrom(order, heights, height, -1) ?? order[0];
  }

  // Above the tallest detent is the rubber-band zone; it always falls back.
  if (height > largest) return order[order.length - 1];

  return order[nearest(order, heights, height)];
}

function nearest(order: Detent[], heights: Record<Detent, number>, height: number): number {
  'worklet';
  let best = 0;
  let bestDistance = Infinity;
  for (let i = 0; i < order.length; i += 1) {
    const distance = Math.abs(heights[order[i]] - height);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = i;
    }
  }
  return best;
}

/**
 * One detent up (+1) or down (-1) from wherever the sheet currently sits.
 *
 * Deliberately NOT "nearest, then step": a flick that starts a few pixels above
 * a detent and travels upward should reach the next one, and nearest-then-step
 * would skip it. Steps from the detent the sheet has actually passed.
 */
function stepFrom(
  order: Detent[],
  heights: Record<Detent, number>,
  height: number,
  direction: 1 | -1,
): Detent | null {
  'worklet';
  if (direction === 1) {
    for (const detent of order) {
      if (heights[detent] > height + 1) return detent;
    }
    return null;
  }
  for (let i = order.length - 1; i >= 0; i -= 1) {
    if (heights[order[i]] < height - 1) return order[i];
  }
  return null;
}

/**
 * How far a drag past the tallest detent actually moves the sheet.
 *
 * Only upward resists. See DISMISS_FRACTION for why downward does not.
 */
export function applyRubberBand(height: number, largest: number): number {
  'worklet';
  if (height <= largest) return height;
  return largest + (height - largest) * RUBBER_BAND;
}
