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

export type ConditionStyle = {
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

export type GaugeAnimationProps = {
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

/** Glanceable weather chip rendered on forecast / trend graphics. */
export type WeatherChipProps = {
  highF: number | null;
  lowF: number | null;
  condition: string;
  precipChance: number;
}

/** Compact one-line weather label: "78°/55° · Clear · 40% rain". Rain is
 *  omitted below the threshold. Mirrors formatWeatherChip() in the app's
 *  openweather.ts — kept in sync because Remotion can't import the app alias. */
export function formatWeatherChipLabel(
  chip?: WeatherChipProps | null,
  rainThreshold = 40,
): string {
  if (!chip) return "";
  const temp =
    chip.highF !== null && chip.lowF !== null
      ? `${chip.highF}°/${chip.lowF}°`
      : chip.highF !== null
        ? `${chip.highF}°`
        : "";
  const parts = [temp, chip.condition].filter(Boolean);
  if (chip.precipChance >= rainThreshold) parts.push(`${chip.precipChance}% rain`);
  return parts.join(" · ");
}

export type DigestReelProps = {
  rivers: Array<{
    riverName: string;
    conditionCode: ConditionCode;
    gaugeHeightFt: number | null;
    /** Forecast chip for the Weekend Forecast variant (null/absent otherwise). */
    weather?: WeatherChipProps | null;
  }>;
  dateLabel: string;
  globalQuote?: string;
  /** Optional title override. Defaults to "River Report"; the weekly
   *  forecast variant passes "Weekend Forecast" or similar. */
  title?: string;
  /** Weekend Forecast only: true when every floatable river has rain coming, so
   *  these are "best available" picks rather than dry ones. Renders a note. */
  rainNote?: boolean;
  format: "square" | "portrait";
}

export type BrandedLoopProps = {
  riverName: string;
  conditionCode: ConditionCode;
  summaryText: string;
}

export type SectionGuideProps = {
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
  /** Springs on the run (between put-in and take-out), drawn as dots on the
   *  RouteDraw route at their mile fraction. */
  springs?: Array<{ name: string; mile: number; side: string | null }>;
  dateLabel?: string;
  format: "square" | "portrait";
}

/**
 * Self-drawing route reel. Same data as the Section Guide — a route is just a
 * section visualized as an animated put-in → take-out line with the current
 * float time stamped on it. Motion reads as a live instrument.
 *
 * The optional fields let the SAME composition serve "Eddy's Favorite Floats":
 * a relabeled eyebrow, an editorial tagline under the river name, and an
 * evergreen mode (neutral accent, no live faster/slower delta, difficulty shown
 * instead of the live condition).
 */
export type RouteDrawProps = SectionGuideProps & {
  /** Eyebrow label. Defaults to "Float of the Day"; favorites pass "Eddy's Favorite Float". */
  label?: string;
  /** Editorial hook shown under the river name (replaces the date for favorites). */
  tagline?: string;
  /** Evergreen mode: neutral accent + no live float-time delta + difficulty stat. */
  evergreen?: boolean;
  /** Difficulty class label (e.g. "Class I–II"), shown in evergreen mode. */
  difficulty?: string;
}

export type TrendReelProps = {
  riverName: string;
  conditionCode: ConditionCode;
  currentHeightFt: number | null;
  sevenDayFirstFt: number | null;
  sevenDayMinFt: number | null;
  sevenDayMaxFt: number | null;
  deltaFt: number;
  direction: "rising" | "falling" | "flat";
  series: Array<{ hoursAgo: number; gaugeHeightFt: number | null }>;
  /** Forecast chip shown under the river name. */
  weather?: WeatherChipProps | null;
  dateLabel?: string;
  format: "square" | "portrait";
}

/** One timed on-screen caption phrase; times in seconds relative to clip start. */
export type Caption = {
  start: number;
  end: number;
  text: string;
};

export type ClipReelProps = {
  /** Public URL of the raw (unbranded) downloaded clip to wrap. */
  videoUrl: string;
  /** River display name, e.g. "Current River". */
  riverName: string;
  /** Creator attribution shown bottom (channel name or @handle). */
  creatorCredit?: string;
  /** Clip length in seconds — drives composition duration. */
  durationSecs: number;
  /** Timed transcript captions rendered over the clip (optional). */
  captions?: Caption[];
  /**
   * Orientation of the SOURCE video. Vertical sources fill the frame; landscape
   * (default) sit in the centered 16:9 band. The output is always portrait.
   */
  sourceOrientation?: "portrait" | "landscape";
}
