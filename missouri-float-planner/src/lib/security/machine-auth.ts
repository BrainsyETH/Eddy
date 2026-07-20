import { timingSafeEqual } from 'node:crypto';

/** Fail-closed bearer authentication for cron jobs and machine callbacks. */
export function hasValidMachineBearer(authorization: string | null, secret: string | undefined): boolean {
  if (!authorization || !secret) return false;

  const expected = Buffer.from(`Bearer ${secret}`);
  const received = Buffer.from(authorization);
  return received.length === expected.length && timingSafeEqual(received, expected);
}
