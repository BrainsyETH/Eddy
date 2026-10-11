import type { FloatPlan } from '@eddy/types';

/** Explicit units, including a singular hour and half-hour search steps. */
export function floatDurationLabel(minutes: number): string {
  const rounded = Math.round(minutes);
  const hours = Math.floor(rounded / 60);
  const remainder = rounded % 60;
  if (!hours) return `${remainder} min`;
  return `${hours}${remainder === 30 ? '½' : ''} ${hours === 1 && remainder !== 30 ? 'hour' : 'hours'}${remainder && remainder !== 30 ? ` ${remainder} min` : ''}`;
}

/** Persist only a real endpoint photo, never live readings or an estimate. */
export function savedFloatPhoto(
  plan: Pick<FloatPlan, 'putIn' | 'takeOut'>,
  previous?: string,
): string | undefined {
  return (
    [...(plan.putIn.imageUrls ?? []), ...(plan.takeOut.imageUrls ?? [])].find((url) =>
      /^https?:\/\//.test(url),
    ) ?? previous
  );
}
