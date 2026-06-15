// Shared prop types and condition utilities for social video compositions.
//
// Condition colors / labels / otter moods / severity are derived from the
// CANONICAL condition system in shared/condition-system.ts — the single source
// of truth shared with the Next.js app. It is imported with a relative path
// because the Remotion subproject is isolated from the app's "@/" alias; the
// shared file is pure TypeScript so both build pipelines can consume it.
import {
  CONDITION_SYSTEM,
  conditionOtterMood,
  type ConditionCode as SharedConditionCode,
  type OtterMood,
} from "../../../shared/condition-system";

export type ConditionCode = SharedConditionCode;

export interface ConditionStyle {
  solid: string;
  bg: string;
  label: string;
  glow: string;
}

export const CONDITION_COLORS: Record<ConditionCode, ConditionStyle> =
  Object.fromEntries(
    Object.entries(CONDITION_SYSTEM).map(([code, def]) => [
      code,
      { solid: def.solid, bg: def.bg, label: def.label, glow: def.glow },
    ])
  ) as Record<ConditionCode, ConditionStyle>;

/** Severity order for sorting rivers in digest (most notable first) */
export const SEVERITY_ORDER: Record<ConditionCode, number> = Object.fromEntries(
  Object.entries(CONDITION_SYSTEM).map(([code, def]) => [code, def.severity])
) as Record<ConditionCode, number>;

/**
 * Canonical Eddy otter mood for a condition. Resolved to a local PNG by
 * EddyMascot (which falls back gracefully for moods whose dedicated asset has
 * not been downloaded yet — see remotion/public/eddy/DOWNLOAD_ASSETS.md).
 */
export function getOtterVariant(conditionCode: ConditionCode): OtterMood {
  return conditionOtterMood(conditionCode);
}

// ─── Composition Input Props ──────────────────────────────────────

export interface GaugeAnimationProps {
  riverName: string;
  conditionCode: ConditionCode;
  gaugeHeightFt: number;
  optimalMin: number;
  optimalMax: number;
  quoteText: string;
  /** Optional date label rendered under the river name to match the
   *  OG thumbnail's timestamp. Format free — callers typically use
   *  toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }). */
  dateLabel?: string;
  /** When true, render the reel in safety-warning mode: eyebrow banner,
   *  transition arrow (previousCondition → conditionCode), red/orange accent,
   *  and a "DO NOT FLOAT" / "USE EXTREME CAUTION" CTA instead of the default
   *  "Full report below" copy. Used by condition-change alerts. */
  warningMode?: boolean;
  /** The condition the river was previously in. Only used when
   *  warningMode=true to render the transition arrow. */
  previousCondition?: ConditionCode;
  format: "square" | "portrait";
}

export interface DigestReelProps {
  rivers: Array<{
    riverName: string;
    conditionCode: ConditionCode;
    gaugeHeightFt: number | null;
  }>;
  dateLabel: string;
  globalQuote?: string;
  /** Optional title override. Defaults to "River Report"; the weekly
   *  forecast variant passes "Weekend Forecast" or similar. */
  title?: string;
  format: "square" | "portrait";
}

export interface BrandedLoopProps {
  riverName: string;
  conditionCode: ConditionCode;
  summaryText: string;
}

export interface SectionGuideProps {
  riverName: string;
  conditionCode: ConditionCode;
  putInName: string;
  putInMile: number;
  takeOutName: string;
  takeOutMile: number;
  distanceMi: number;
  /** Estimated canoe float time at TODAY's flow (condition-adjusted), in hours. */
  hoursToday: number;
  /** Typical canoe float time at normal "flowing" flow, in hours — the baseline
   *  the hero graphic diffs against ("3.5 hrs today, not the usual 4.5"). */
  hoursTypical: number;
  dateLabel?: string;
  format: "square" | "portrait";
}

/**
 * Self-drawing route reel. Same data as the Section Guide — a route is just a
 * section visualized as an animated put-in → take-out line with the current
 * float time stamped on it. Motion reads as a live instrument.
 */
export type RouteDrawProps = SectionGuideProps;

export interface TrendReelProps {
  riverName: string;
  conditionCode: ConditionCode;
  currentHeightFt: number | null;
  sevenDayFirstFt: number | null;
  sevenDayMinFt: number | null;
  sevenDayMaxFt: number | null;
  deltaFt: number;
  direction: "rising" | "falling" | "flat";
  series: Array<{ hoursAgo: number; gaugeHeightFt: number | null }>;
  dateLabel?: string;
  format: "square" | "portrait";
}
