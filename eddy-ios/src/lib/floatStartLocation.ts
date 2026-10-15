import type { StartLocationState } from './floatPermissions';
import { usableStartFix, type StartFix } from './floatStart';

/** Retry quietly while Ready is visible, without overlapping requests or prompt loops. */
export function shouldRefreshStartFix(state: StartLocationState, busy: boolean, fix: StartFix | null,
  now: number, lastAttemptAt: number): boolean {
  return state === 'ready' && !busy && !usableStartFix(fix, now) && now - lastAttemptAt >= 30_000;
}

/** Permission is checked first. OS cache may speed up preview, never seed recording. */
export async function readStartPreview(input: {
  state: StartLocationState;
  previous: StartFix | null;
  force: boolean;
  now: () => number;
  lastKnown: () => Promise<StartFix | null>;
  current: () => Promise<StartFix>;
}): Promise<StartFix | null> {
  if (input.state !== 'ready') return null;
  if (!input.force) {
    if (usableStartFix(input.previous, input.now())) return input.previous;
    const cached = await input.lastKnown().catch(() => null);
    if (usableStartFix(cached, input.now())) return cached;
  }
  const fix = await input.current();
  if (!usableStartFix(fix, input.now())) throw new Error('Location is not precise yet');
  return fix;
}
