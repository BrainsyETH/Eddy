import { centralDayKey } from '@eddy/conditions/dam-schedule-copy';

export const DAM_REFRESH_MS = 5 * 60_000;
export const damRefreshSlot = (now: number) => Math.floor(now / DAM_REFRESH_MS);

/** A non-pilot dam has no Read endpoint; it is not a retryable outage. */
export function damReadFailure(status: number | undefined): 'unavailable' | 'revoked' | 'retry' {
  if (status === 404) return 'unavailable';
  return status != null && [401, 402, 403].includes(status) ? 'revoked' : 'retry';
}

/** Server prose can refer to ended hourly windows; never carry it past that hour. */
export function damReadStillCurrent(generatedAt: string, renderedAt: number, now: number): boolean {
  const generated = Date.parse(generatedAt);
  return Number.isFinite(generated) && generated <= now && renderedAt <= now &&
    centralDayKey(generated) === centralDayKey(now) &&
    Math.floor(renderedAt / 3_600_000) === Math.floor(now / 3_600_000);
}
