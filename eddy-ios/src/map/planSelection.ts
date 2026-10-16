import type { MapAccessPoint } from '@eddy/types';

/** Resolve by access identity, including campground/ramp marks for the same place. */
export function mapPlanSelection({ active, riverSlug, step, putIn, putInOptions, takeOutOptions, pin }: {
  active: boolean;
  riverSlug: string | null;
  step: 'put-in' | 'take-out' | 'result';
  putIn: MapAccessPoint | null;
  putInOptions: readonly MapAccessPoint[];
  takeOutOptions: readonly MapAccessPoint[];
  pin: { id: string; riverSlug?: string | null };
}): { step: 'put-in' | 'take-out'; point: MapAccessPoint } | null {
  if (!active || !riverSlug || pin.riverSlug !== riverSlug || step === 'result' || !pin.id.startsWith('access:')) return null;
  const options = step === 'put-in' ? putInOptions : takeOutOptions;
  const point = options.find(option => `access:${option.id}` === pin.id);
  if (!point || point.isFloatEndpoint === false) return null;
  if (step === 'take-out' && (!putIn || !(point.riverMile > putIn.riverMile))) return null;
  return { step, point };
}
