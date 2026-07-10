// shared/condition-copy.ts
//
// Canonical safety-warning copy for condition-change ("rapid-rise") alerts.
// ONE source for the severity label, the short CTA, and the one-line quote, so
// the social CAPTION, the OG COVER image, and the Remotion REEL all say the same
// thing about the same event. Previously each of those three surfaces authored
// its own wording, which drifted.
//
// Pure TypeScript (no React/Next/Remotion) so both the app (via the "@shared/*"
// tsconfig path) and the isolated video project (relative import) can consume it.

export interface WarningCopy {
  /** Eyebrow / headline severity, uppercase. e.g. "HIGH WATER". */
  severityLabel: string;
  /** Short imperative call-to-action. e.g. "Experienced paddlers only". */
  cta: string;
  /** One-line spoken/quoted summary that names the river. */
  quote: string;
}

/** Growth CTA appended as a secondary line on alert reels + captions. */
export const FOLLOW_CTA = 'Follow for live Ozark river alerts';

/** Which way the water is moving — drives trend-aware wording. */
export type TrendDir = 'rising' | 'falling' | 'steady';

// Severity ordering used as a fallback trend signal: a move to a LESS severe
// state (e.g. dangerous → high) means the river is coming down, even when the
// 6h gauge delta is unavailable.
const SEVERITY_RANK: Record<string, number> = {
  too_low: 0,
  low: 1,
  flowing: 2,
  good: 2,
  high: 3,
  dangerous: 4,
};

/**
 * Resolve the trend for trend-aware copy. The 6h gauge delta is the primary
 * signal (what the water is actually doing right now); when it's negligible or
 * unknown we fall back to the DIRECTION of the condition change — so a river
 * receding from dangerous into high reads as falling, never "risen into high
 * water." `deltaFt` is (now − 6h-ago).
 */
export function resolveTrend(
  deltaFt: number | null | undefined,
  oldCondition?: string,
  newCondition?: string,
): TrendDir {
  if (deltaFt != null && Number.isFinite(deltaFt) && Math.abs(deltaFt) >= 0.1) {
    return deltaFt > 0 ? 'rising' : 'falling';
  }
  if (oldCondition && newCondition) {
    const o = SEVERITY_RANK[oldCondition] ?? 2;
    const n = SEVERITY_RANK[newCondition] ?? 2;
    if (n < o) return 'falling';
    if (n > o) return 'rising';
  }
  return 'steady';
}

/**
 * Human "rate of rise/fall" phrase for an alert — e.g. "up 2.4 ft in 6h".
 * Returns null when the change over the window is negligible (<0.1 ft), so we
 * never print a misleading "up 0.0 ft". `deltaFt` is (now − thenValue).
 */
export function formatRise(deltaFt: number | null | undefined, hours: number): string | null {
  if (deltaFt == null || !Number.isFinite(deltaFt) || Math.abs(deltaFt) < 0.1) return null;
  const dir = deltaFt > 0 ? 'up' : 'down';
  return `${dir} ${Math.abs(deltaFt).toFixed(1)} ft in ${Math.round(hours)}h`;
}

/**
 * Copy for the "all-clear" post when a river drops back OUT of elevated water
 * into a floatable state (dangerous/high → flowing/good/low). Closes the loop
 * the warning caption promises ("wait for the all-clear").
 */
export function recoveryCopy(code: string, riverName: string): WarningCopy {
  const floatable =
    code === 'flowing'
      ? 'running clear'
      : code === 'good'
        ? 'floatable again'
        : 'dropping back';
  return {
    severityLabel: 'ALL CLEAR',
    cta: 'Back to floatable — still check the gauge before you go',
    quote: `${riverName} has dropped back to floatable levels — ${floatable}. Always confirm the live gauge before you launch.`,
  };
}

/**
 * Warning copy for a condition. `code` is the NEW (elevated) condition the river
 * crossed into; `riverName` is the display name (e.g. "Current River"). `trend`
 * makes the wording match reality — a river receding from dangerous into high is
 * FALLING, so it must not read as "risen into high water." Defaults to 'steady'
 * (a neutral "is running high") so an un-threaded caller is never wrong.
 */
export function warningCopy(code: string, riverName: string, trend: TrendDir = 'steady'): WarningCopy {
  if (code === 'dangerous') {
    // A crossing INTO dangerous is a rise by definition; if it's easing we say so
    // but the imperative stays the same — dangerous is dangerous either way.
    const quote =
      trend === 'falling'
        ? `${riverName} is still dangerous but starting to drop — do not float until levels drop.`
        : `${riverName} is now dangerous — do not float until levels drop.`;
    return { severityLabel: 'DANGEROUS', cta: 'Do not float until levels drop', quote };
  }
  if (code === 'high') {
    const lead =
      trend === 'rising'
        ? 'has risen into high water'
        : trend === 'falling'
          ? 'is dropping but still running high'
          : 'is running high';
    return {
      severityLabel: 'HIGH WATER',
      cta: 'Experienced paddlers only',
      quote: `${riverName} ${lead} — experienced paddlers only.`,
    };
  }
  return {
    severityLabel: 'CAUTION',
    cta: 'Check the live gauge before you go',
    quote: `${riverName} conditions have changed — check the live gauge before you go.`,
  };
}
