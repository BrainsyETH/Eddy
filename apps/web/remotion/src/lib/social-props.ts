// Shared prop types and condition utilities for social video compositions
// NOTE: Remotion project is isolated — cannot import from src/, so we duplicate condition data here.

export type ConditionCode =
  | "flowing"
  | "good"
  | "low"
  | "too_low"
  | "high"
  | "dangerous"
  | "unknown";

export interface ConditionStyle {
  solid: string;
  bg: string;
  label: string;
  glow: string;
}

export const CONDITION_COLORS: Record<ConditionCode, ConditionStyle> = {
  flowing: {
    solid: "#10b981",
    bg: "rgba(16,185,129,0.15)",
    label: "Flowing",
    glow: "rgba(16,185,129,0.5)",
  },
  good: {
    solid: "#84cc16",
    bg: "rgba(132,204,22,0.15)",
    label: "Good",
    glow: "rgba(132,204,22,0.4)",
  },
  low: {
    solid: "#eab308",
    bg: "rgba(234,179,8,0.15)",
    label: "Low",
    glow: "rgba(234,179,8,0.3)",
  },
  too_low: {
    solid: "#78716c",
    bg: "rgba(120,113,108,0.15)",
    label: "Too Low",
    glow: "rgba(120,113,108,0.2)",
  },
  high: {
    solid: "#f97316",
    bg: "rgba(249,115,22,0.2)",
    label: "High",
    glow: "rgba(249,115,22,0.4)",
  },
  dangerous: {
    solid: "#ef4444",
    bg: "rgba(239,68,68,0.15)",
    label: "Dangerous",
    glow: "rgba(239,68,68,0.6)",
  },
  unknown: {
    solid: "#9ca3af",
    bg: "rgba(156,163,175,0.15)",
    label: "N/A",
    glow: "transparent",
  },
};

/** Severity order for sorting rivers in digest (most notable first) */
export const SEVERITY_ORDER: Record<ConditionCode, number> = {
  dangerous: 0,
  flowing: 1,
  good: 2,
  high: 3,
  low: 4,
  too_low: 5,
  unknown: 6,
};

type OtterVariant = "standard" | "canoe" | "flag" | "green" | "favicon";

/** Map condition code to the Eddy otter variant */
export function getOtterVariant(conditionCode: ConditionCode): OtterVariant {
  switch (conditionCode) {
    case "flowing":
    case "good":
      return "green";
    case "low":
    case "too_low":
      return "flag";
    case "high":
    case "dangerous":
      return "standard";
    default:
      return "green";
  }
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
  hoursCanoe: number;
  dateLabel?: string;
  format: "square" | "portrait";
}

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
