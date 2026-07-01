// shared/condition-system.ts
//
// CANONICAL condition system — the single source of truth for Eddy's river
// condition taxonomy, shared by BOTH the Next.js app (src/) and the otherwise
// isolated Remotion video project (remotion/).
//
// This file is intentionally pure TypeScript: no React, no Next, no Remotion,
// no runtime imports. That is what lets both build pipelines consume it
// (the app via the "@shared/*" tsconfig path, Remotion via a relative import).
//
// THE BRAND RULE: a follower who learns "Eddy green" on the website must see the
// exact same green in the Reel. Level colors are fixed and learnable — flowing is
// always this green, dangerous is always this red — so conditions are glanceable
// before a single word is read. Do not hardcode condition hex anywhere else;
// derive from CONDITION_SYSTEM.

export type ConditionCode =
  | "too_low"
  | "low"
  | "good"
  | "flowing"
  | "high"
  | "dangerous"
  | "unknown";

/**
 * Canonical Eddy "host" face per condition. The otter is the host, not the hero —
 * the same mood maps to the same condition everywhere. Each environment resolves
 * this mood to its own asset inventory (app → Vercel Blob URLs, Remotion → local
 * PNGs under remotion/public/eddy).
 */
export type OtterMood = "green" | "yellow" | "flag" | "red" | "flood" | "favicon";

export interface ConditionDef {
  code: ConditionCode;
  /** Canonical brand hex — IDENTICAL in app and video. */
  solid: string;
  /** Translucent fill for chips/cards/badges (rgba). */
  bg: string;
  /** Glow used on dark video backgrounds (rgba) to read as a live instrument. */
  glow: string;
  /**
   * Accessible dark "ink" for text/icons on the light `bg` tint (and on white).
   * Chosen to clear WCAG 2.2 AA (>=4.5:1). NEVER print white text on the light
   * condition fills — use tint + ink. IDENTICAL in app and video.
   */
  ink: string;
  /** Border hex for tinted chips/badges (a mid tint of the same hue). */
  chipBorder: string;
  /** Short label for compact displays, e.g. "Flowing". */
  label: string;
  /** Long label with guidance, e.g. "Flowing - Ideal Conditions". */
  longLabel: string;
  /** One-line plain-language description of what the level means on the water. */
  description: string;
  /** Canonical otter mood for this condition. */
  otter: OtterMood;
  /**
   * Notability order for alert-style sorting (digests, highlight picking):
   * most notable / most alarming first. NOTE: this is distinct from the
   * "best for the weekend" ordering in src/lib/social/post-scheduler.ts, which
   * deliberately ranks floatable conditions first — do not conflate them.
   */
  severity: number;
}

export const CONDITION_SYSTEM: Record<ConditionCode, ConditionDef> = {
  dangerous: {
    code: "dangerous",
    solid: "#ef4444", // red-500
    bg: "rgba(239,68,68,0.15)",
    glow: "rgba(239,68,68,0.6)",
    ink: "#991B1B", // red-800
    chipBorder: "#FCA5A5", // red-300
    label: "Flood",
    longLabel: "Flood - Do Not Float",
    description:
      "Dangerous. High water, heavy debris, and flood warnings usually in effect.",
    otter: "flood",
    severity: 0,
  },
  flowing: {
    code: "flowing",
    // Canonical "Eddy green". Brighter emerald-500 (was emerald-600 #059669 in
    // the app) so it reads identically on dark video and light UI alike.
    solid: "#10b981", // emerald-500
    bg: "rgba(16,185,129,0.15)",
    glow: "rgba(16,185,129,0.5)",
    ink: "#065F46", // emerald-800
    chipBorder: "#6EE7B7", // emerald-300
    label: "Flowing",
    longLabel: "Flowing - Ideal Conditions",
    description:
      "Ideal conditions. All boats clear, gentle current, crystal clear water.",
    otter: "green",
    severity: 1,
  },
  good: {
    code: "good",
    solid: "#84cc16", // lime-500
    bg: "rgba(132,204,22,0.15)",
    glow: "rgba(132,204,22,0.4)",
    ink: "#3F6212", // lime-800
    chipBorder: "#BEF264", // lime-300
    label: "Good",
    longLabel: "Good - Floatable",
    description: "Floatable conditions. Some shallow spots possible.",
    otter: "green",
    severity: 2,
  },
  high: {
    code: "high",
    solid: "#f97316", // orange-500
    bg: "rgba(249,115,22,0.2)",
    glow: "rgba(249,115,22,0.4)",
    ink: "#9A3412", // orange-800
    chipBorder: "#FDBA74", // orange-300
    label: "High",
    longLabel: "High Water - Use Caution",
    description:
      "Moving quick. Experienced paddlers only; expect submerged obstacles and root-balls.",
    otter: "red",
    severity: 3,
  },
  low: {
    code: "low",
    solid: "#eab308", // yellow-500
    bg: "rgba(234,179,8,0.15)",
    glow: "rgba(234,179,8,0.3)",
    ink: "#854D0E", // yellow-800
    chipBorder: "#FCD34D", // yellow-300
    label: "Low",
    longLabel: "Low - Scraping Likely",
    description:
      "Floatable but expect occasional scraping. Lighter boats recommended.",
    otter: "yellow",
    severity: 4,
  },
  too_low: {
    code: "too_low",
    solid: "#78716c", // stone-500
    bg: "rgba(120,113,108,0.15)",
    glow: "rgba(120,113,108,0.2)",
    ink: "#44403C", // stone-700
    chipBorder: "#D6D3D1", // stone-300
    label: "Too Low",
    longLabel: "Too Low - Not Recommended",
    description:
      "Expect frequent dragging on gravel bars. Recommended for wading only.",
    otter: "flag",
    severity: 5,
  },
  unknown: {
    code: "unknown",
    solid: "#9ca3af", // gray-400
    bg: "rgba(156,163,175,0.15)",
    glow: "transparent",
    ink: "#374151", // gray-700
    chipBorder: "#D1D5DB", // gray-300
    label: "Unknown",
    longLabel: "Unknown",
    description: "No gauge data available.",
    otter: "flag",
    severity: 6,
  },
};

/** Ordered worst-to-best for legends / threshold tables. */
export const CONDITION_ORDER: ConditionCode[] = [
  "too_low",
  "low",
  "good",
  "flowing",
  "high",
  "dangerous",
];

/** Hex color for a condition (falls back to unknown). */
export function conditionColor(code: string): string {
  return (CONDITION_SYSTEM[code as ConditionCode] ?? CONDITION_SYSTEM.unknown)
    .solid;
}

/** Canonical otter mood for a condition (falls back to unknown). */
export function conditionOtterMood(code: string): OtterMood {
  return (CONDITION_SYSTEM[code as ConditionCode] ?? CONDITION_SYSTEM.unknown)
    .otter;
}

/** Resolve a (possibly unknown) code to its canonical definition. */
export function conditionDef(code: string): ConditionDef {
  return CONDITION_SYSTEM[code as ConditionCode] ?? CONDITION_SYSTEM.unknown;
}

/**
 * Accessible chip/badge styling for a condition — tint background + dark ink +
 * mid-tint border. This is the ONLY approved way to render a condition pill:
 * it guarantees WCAG AA contrast (no white-on-light-fill) and a single learnable
 * hue per level. Returns plain CSS values so it works in React inline styles,
 * embeds (no Tailwind), and Remotion alike.
 */
export function conditionChip(code: string): {
  background: string;
  color: string;
  borderColor: string;
  solid: string;
  label: string;
  longLabel: string;
} {
  const def = conditionDef(code);
  return {
    background: def.bg,
    color: def.ink,
    borderColor: def.chipBorder,
    solid: def.solid,
    label: def.label,
    longLabel: def.longLabel,
  };
}

/**
 * "Best for the weekend" ordering — floatable conditions first. This is
 * DELIBERATELY different from `severity` above (which ranks most-alarming first
 * for alerts/digests). Used to pick the top rivers to feature in the Weekend
 * Forecast and to gate which rivers are worth highlighting. Single source of
 * truth — previously duplicated as WEEKLY_/WEEKEND_/FORECAST_SEVERITY across
 * quick-post, the cron, the scheduler, and the OG image route.
 */
export const WEEKEND_SEVERITY: Record<string, number> = {
  flowing: 0,
  good: 1,
  high: 2,
  low: 3,
  dangerous: 4,
  too_low: 5,
  unknown: 6,
};

/** Conditions worth featuring on a weekend — floatable only. */
export const WEEKEND_FLOATABLE: ReadonlySet<string> = new Set([
  "flowing",
  "good",
  "high",
]);
