import type { LngLat } from '@eddy/geo';
import type { FloatSession } from './floatSession';

/** Short local distances in metres; used only for launch proximity, not progress. */
export function startPointDistance(a: LngLat, b: LngLat): number {
  const radians = Math.PI / 180;
  const lat = (a[1] + b[1]) / 2 * radians;
  return Math.hypot((a[0] - b[0]) * Math.cos(lat), a[1] - b[1]) * radians * 6_371_000;
}

export function relativeStart(mile: number, putInMile: number, name: string): string {
  const delta = mile - putInMile;
  return Math.abs(delta) < 0.1 ? `On-river start near ${name}`
    : `${Math.abs(delta).toFixed(1)} mi ${delta > 0 ? 'below' : 'above'} ${name}`;
}

/** A planned access point is not evidence of a recorded launch there. */
export function recordedOrigin(session: FloatSession): { id: string | null; name: string | null; note: string | null } {
  const origin = session.recordedStart;
  if (origin?.atPutIn && session.putIn) return { id: session.putIn.id, name: session.putIn.name, note: null };
  // Legacy accounting retains a first mile, but no reliable launch coordinates.
  const mile = origin?.riverMile ?? session.totals?.firstMile;
  if (mile == null) return { id: null, name: null, note: null };
  const name = session.putIn ? relativeStart(mile, session.putIn.riverMile, session.putIn.name) : 'On-river start';
  return { id: null, name, note: name.startsWith('On-river') ? name : `Recording started ${name}` };
}
