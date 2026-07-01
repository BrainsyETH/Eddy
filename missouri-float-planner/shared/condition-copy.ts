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
 * crossed into; `riverName` is the display name (e.g. "Current River").
 */
export function warningCopy(code: string, riverName: string): WarningCopy {
  if (code === 'dangerous') {
    return {
      severityLabel: 'DANGEROUS',
      cta: 'Do not float until levels drop',
      quote: `${riverName} is now dangerous — do not float until levels drop.`,
    };
  }
  if (code === 'high') {
    return {
      severityLabel: 'HIGH WATER',
      cta: 'Experienced paddlers only',
      quote: `${riverName} has risen into high water — experienced paddlers only.`,
    };
  }
  return {
    severityLabel: 'CAUTION',
    cta: 'Check the live gauge before you go',
    quote: `${riverName} conditions have changed — check the live gauge before you go.`,
  };
}
