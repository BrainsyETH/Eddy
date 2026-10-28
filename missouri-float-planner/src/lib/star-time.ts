// src/lib/star-time.ts
// The time a star was made, as the device that made it says.
//
// Stars reconcile last-write-wins (packages/eddy-sync mergeStars): a local
// unstar beats the server row when it is newer than the row's created_at.
// When created_at was the SERVER's clock, a star followed quickly by an
// unstar on the same phone could lose: the POST lands after the unstar was
// tapped, the row is "newer", and the star the paddler just turned off came
// back. A phone clock running a few seconds slow made every such unstar lose.
//
// So a star POST may carry `starredAt`, the device's own edit time, and that
// is what the row stores. This device's later unstar is then compared with its
// own clock. Comparing two devices' edits is still two clocks, which is
// inherent to last-write-wins and unchanged.
//
// Bounded: never in the future of the server (a fast device clock is pulled
// back to now, which only ever favours a later local unstar), and never before
// stars existed. Anything else falls back to the server's own now().

/** No star predates the feature; older values are a broken clock. */
const EARLIEST = Date.parse('2026-01-01T00:00:00.000Z');

export function clientStarredAt(raw: unknown, now: number = Date.now()): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const at = Date.parse(raw);
  if (!Number.isFinite(at) || at < EARLIEST) return undefined;
  return new Date(Math.min(at, now)).toISOString();
}
