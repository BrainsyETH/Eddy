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
