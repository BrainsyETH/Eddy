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

// Re-export the canonical warning copy so compositions can import it from this
// same module (avoids a deep relative path into ../../../../shared).
export { warningCopy, type WarningCopy } from "../../../shared/condition-copy";

// Recovery ("all-clear") copy — SAME {severityLabel, cta, quote} shape as
// warningCopy. Re-exported here so the reel can import it alongside warningCopy.
export { recoveryCopy } from "../../../shared/condition-copy";

// Canonical trend-direction styling ({rising|falling|flat}: {arrow, label,
// color}), shared with the app's OG cover. Re-exported here so TrendReel can
// import it from this module instead of duplicating the table.
export { DIRECTION_META, trendMeta, type TrendDirection, type TrendMeta } from "../../../shared/trend-meta";

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
  /** Ft bounds of the GOOD band. OPTIONAL: rivers without trustworthy ft
   *  thresholds (e.g. CFS-primary gauges with no ft mirror) omit them and the
   *  bar renders level-only — never a made-up band that can contradict the
   *  condition (a HIGH WATER reel once showed its reading inside "GOOD"). */
  optimalMin?: number;
  optimalMax?: number;
  /** High-water threshold — draws the orange high zone on the gauge bar (warning reels). */
  levelHigh?: number;
  /** Dangerous/flood threshold — draws the red danger zone on the gauge bar (warning reels). */
  levelDangerous?: number;
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
  /** Optional eyebrow label above the river name (e.g. "Eddy Says"). Absent →
   *  no eyebrow (the default river-highlight layout). */
  eyebrow?: string;
  /** Quote-forward mode: the quote becomes the centered hero (larger, no big
   *  gauge bar) — used by the "Eddy Says" reel, which reuses this composition to
   *  spotlight Eddy's local read instead of the live gauge instrument. */
  quoteForward?: boolean;
  /** Full-bleed background image (public URL). When set, it renders behind
   *  everything under a legibility scrim (red-leaning in warningMode, neutral
   *  teal otherwise). Absent → the solid brand background. */
  backgroundUrl?: string;
  /** Human rate-of-change phrase (e.g. "▲ up 2.4 ft in 6h") shown as an urgency
   *  pill near the gauge reading in warning/recovery mode. Absent → no pill. */
  riseText?: string;
  /** Real recent gauge readings (oldest→newest, same shape as TrendReel's
   *  series). When present (alert reels), the gauge fill ANIMATES THROUGH the
   *  series — time-compressed and eased — landing exactly on gaugeHeightFt.
   *  Absent → the classic single fill-up to gaugeHeightFt. */
  series?: Array<{ hoursAgo: number; gaugeHeightFt: number | null }>;
  /** USGS station's human name (e.g. "Meramec River near Sullivan, MO") —
   *  rendered as an instrument citation under the gauge. Absent → no citation. */
  stationLabel?: string;
  /** Discharge framing for CFS-primary rivers (e.g. "1,240 cfs · 3× normal
   *  flow") — surfaced under the reading so a "High" driven by FLOW rather than
   *  stage is self-explanatory (a shallow-looking gauge can still be moving a lot
   *  of water). Absent → not shown (ft-primary rivers tell the story in feet). */
  flowText?: string;
  /** Recovery ("all-clear") mode — mutually exclusive with warningMode. Uses
   *  recoveryCopy() + the condition's own calm (green/teal) color and positive
   *  framing instead of the red/orange alarmed warning chrome. */
  recovery?: boolean;
  /** Optional smaller secondary CTA line beneath the main CTA (growth prompt,
   *  e.g. "Follow for live Ozark river alerts"). Absent → not rendered. */
  followCta?: string;
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
  /** Optional smaller secondary CTA line beneath the main CTA (growth prompt,
   *  e.g. "Follow for daily Ozark river reports"). Absent → not rendered. */
  followCta?: string;
  format: "square" | "portrait";
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
  dateLabel?: string;
  /** Optional smaller secondary CTA line beneath the main CTA (growth prompt,
   *  e.g. "Follow for a new float every day"). Absent → not rendered. */
  followCta?: string;
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
  /** Favorites only: a real section photo (public URL) composited behind the
   *  graphic, dimmed for legibility. Absent → solid brand background. */
  photoUrl?: string;
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
  /** Optional smaller secondary CTA line beneath the main CTA (growth prompt,
   *  e.g. "Follow for live Ozark river trends"). Absent → not rendered. */
  followCta?: string;
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
