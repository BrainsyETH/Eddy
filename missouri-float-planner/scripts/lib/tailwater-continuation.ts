import { distance, length, lineString, point } from '@turf/turf';

/** Append a reviewed downstream channel, never a straight shortcut to a ramp. */
export function appendReviewedContinuation(base: number[][], continuation: number[][]) {
  if (base.length < 2 || continuation.length < 2) throw new Error('Both channel lines need two points');
  const gap = distance(point(base.at(-1)!), point(continuation[0]), { units: 'meters' });
  const miles = length(lineString(continuation), { units: 'miles' });
  // The small tolerance accommodates rounding of the original NHD slice. A
  // changed confluence needs review, not the main-stem importer's broad bridge.
  if (gap > 10 || !Number.isFinite(gap)) throw new Error('Reviewed continuation does not join the downstream end');
  if (!(miles > 0 && miles < 0.3)) throw new Error('Unexpected continuation length');
  return { coordinates: [...base.slice(0, -1), ...continuation], addedMiles: miles };
}
