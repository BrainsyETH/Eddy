// src/lib/embed/options.ts
// The embed family's shared vocabulary — pure TypeScript, no React, no Next,
// no DOM — so the server pages, the image routes, the workbench and the tests
// all agree on what a size, a theme and an impression type are called.
//
// ── The family ──────────────────────────────────────────────────────────────
// One river (or dam) widget, in four sizes, instead of eight products that
// mostly overlapped:
//
//   badge  an inline pill: name + live condition. Sidebars, footers, prose.
//   strip  one line: condition, the rated reading, trend arrow, observation
//          age. A multi-river overview is a stack of these.
//   card   the hero: condition, the rated reading with a range meter showing
//          where it sits on the ladder, Eddy's one-line take, weather, credit.
//   full   card + the trend chart + secondary gauges.
//
// The legacy routes (/embed/widget, /embed/eddy-quote, /embed/gauge-report,
// /embed/badge, /embed/rivers) keep working — each is now a fixed size of this
// family, so a partner's pasted iframe never breaks.
//
// ── Theme ───────────────────────────────────────────────────────────────────
// `light` and `dark` are the iframe palettes partners already chose. `auto`
// follows the visitor's prefers-color-scheme. `bg=transparent` drops the panel
// background so the widget sits on the host's own surface, and `accent=#hex`
// recolors links and the CTA only — never a condition color, which stays
// learnable everywhere (shared/condition-system.ts).

export const EMBED_SIZES = ['badge', 'strip', 'card', 'full'] as const;
export type EmbedSize = (typeof EMBED_SIZES)[number];

export const EMBED_THEME_MODES = ['light', 'dark', 'auto'] as const;
export type EmbedThemeMode = (typeof EMBED_THEME_MODES)[number];

export const EMBED_CHART_DAYS = [7, 14, 30] as const;
export type EmbedChartDays = (typeof EMBED_CHART_DAYS)[number];

export const EMBED_ID_RE = /^emb_[0-9a-f]{8}$/;
const HEX_COLOR_RE = /^#?([0-9a-fA-F]{6})$/;

export interface EmbedOptions {
  size: EmbedSize;
  theme: EmbedThemeMode;
  /** Drop the panel background so the widget sits on the host's surface. */
  transparent: boolean;
  /** Validated `#rrggbb` for links + CTA, or null for the brand teal/coral. */
  accent: string | null;
  days: EmbedChartDays;
  /** Zero-setup text credit (`?partner=`). */
  partner: string;
  /** Registered co-branding id (`?e=emb_xxxxxxxx`). */
  embedId: string | null;
}

type ParamSource =
  | Record<string, string | string[] | undefined>
  | { get(name: string): string | null };

function read(source: ParamSource, name: string): string {
  if (typeof (source as { get?: unknown }).get === 'function') {
    return (source as { get(name: string): string | null }).get(name) ?? '';
  }
  const value = (source as Record<string, string | string[] | undefined>)[name];
  return Array.isArray(value) ? value[0] ?? '' : value ?? '';
}

export function parseEmbedSize(raw: string | null | undefined, fallback: EmbedSize = 'card'): EmbedSize {
  return (EMBED_SIZES as readonly string[]).includes(raw ?? '') ? (raw as EmbedSize) : fallback;
}

export function parseEmbedTheme(raw: string | null | undefined): EmbedThemeMode {
  return (EMBED_THEME_MODES as readonly string[]).includes(raw ?? '') ? (raw as EmbedThemeMode) : 'light';
}

/** `#2d7889`, `2D7889` → `#2D7889`; anything else → null. */
export function parseAccentColor(raw: string | null | undefined): string | null {
  const match = (raw ?? '').trim().match(HEX_COLOR_RE);
  return match ? `#${match[1].toUpperCase()}` : null;
}

export function parseChartDays(raw: string | null | undefined, fallback: EmbedChartDays = 14): EmbedChartDays {
  const n = Number.parseInt(raw ?? '', 10);
  return (EMBED_CHART_DAYS as readonly number[]).includes(n) ? (n as EmbedChartDays) : fallback;
}

export function parseEmbedOptions(source: ParamSource, defaults: Partial<EmbedOptions> = {}): EmbedOptions {
  const embedIdRaw = read(source, 'e');
  return {
    size: parseEmbedSize(read(source, 'size'), defaults.size ?? 'card'),
    theme: parseEmbedTheme(read(source, 'theme') || defaults.theme),
    transparent: read(source, 'bg') === 'transparent' || defaults.transparent === true,
    accent: parseAccentColor(read(source, 'accent')) ?? defaults.accent ?? null,
    days: parseChartDays(read(source, 'days'), defaults.days ?? 14),
    partner: read(source, 'partner').slice(0, 60),
    embedId: EMBED_ID_RE.test(embedIdRaw) ? embedIdRaw : null,
  };
}

// ── Theme tokens ────────────────────────────────────────────────────────────
// The Organic Brutalist palette (.stitch/DESIGN.md) as CSS custom properties.
// Components reference `var(--ew-*)` only, so `auto` is a media query rather
// than a second render path.

export interface EmbedTokens {
  bg: string;
  surface: string;
  border: string;
  text: string;
  muted: string;
  link: string;
  accent: string;
  focus: string;
  shadow: string;
  skeleton: string;
}

export const EMBED_LIGHT_TOKENS: EmbedTokens = {
  bg: '#FFFFFF',
  surface: '#F7F6F3', // warm stone, not cool gray
  border: '#DBD5CA',
  text: '#2D2A24',
  muted: '#6B665C',
  link: '#2D7889', // Deep River Teal 500
  accent: '#F07052', // Sunset Coral — CTAs only
  focus: '#2D7889',
  shadow: '#C2BAAC',
  skeleton: '#DBD5CA',
};

export const EMBED_DARK_TOKENS: EmbedTokens = {
  bg: '#0F2D35', // deep river teal night, never generic #1a1a1a
  surface: '#163F4A',
  border: '#2D5660',
  text: '#E8F1F2',
  muted: '#9DBAC1',
  link: '#7FC4D4',
  accent: '#F07052',
  focus: '#A3D1DB',
  shadow: 'rgba(0, 0, 0, 0.45)',
  skeleton: '#2D5660',
};

function declarations(tokens: EmbedTokens, options: Pick<EmbedOptions, 'transparent' | 'accent'>): string {
  const dark = tokens === EMBED_DARK_TOKENS;
  const t = { ...tokens };
  if (options.accent) {
    t.link = options.accent;
    t.accent = options.accent;
    t.focus = options.accent;
  }
  return [
    `--ew-bg:${options.transparent ? 'transparent' : t.bg}`,
    `--ew-surface:${t.surface}`,
    `--ew-border:${t.border}`,
    `--ew-text:${t.text}`,
    `--ew-muted:${t.muted}`,
    `--ew-link:${t.link}`,
    `--ew-accent:${t.accent}`,
    `--ew-focus:${t.focus}`,
    `--ew-shadow:${t.shadow}`,
    `--ew-skeleton:${t.skeleton}`,
    `--ew-logo-bg:${dark ? 'rgba(255,255,255,0.92)' : '#FFFFFF'}`,
    `color-scheme:${dark ? 'dark' : 'light'}`,
  ].join(';');
}

/**
 * The stylesheet one embed frame carries. `auto` emits the light set and a
 * prefers-color-scheme override; the other two emit one set. Scoped to the
 * frame's own id so two widgets on one host page cannot restyle each other —
 * they are separate iframes anyway, but the preview page renders several.
 */
export function embedThemeCss(frameId: string, options: Pick<EmbedOptions, 'theme' | 'transparent' | 'accent'>): string {
  const selector = `#${frameId}`;
  if (options.theme === 'dark') return `${selector}{${declarations(EMBED_DARK_TOKENS, options)}}`;
  const light = `${selector}{${declarations(EMBED_LIGHT_TOKENS, options)}}`;
  if (options.theme === 'light') return light;
  return `${light}@media (prefers-color-scheme:dark){${selector}{${declarations(EMBED_DARK_TOKENS, options)}}}`;
}

/** Which tokens the image routes (no media queries) should paint with. */
export function embedTokensFor(options: Pick<EmbedOptions, 'theme' | 'accent'>): EmbedTokens {
  const base = options.theme === 'dark' ? EMBED_DARK_TOKENS : EMBED_LIGHT_TOKENS;
  return options.accent ? { ...base, link: options.accent, accent: options.accent, focus: options.accent } : base;
}

// ── Impressions ─────────────────────────────────────────────────────────────
// One daily counter per (type, key, host). The size rides in the type so the
// admin dashboard can say which sizes get used without a schema change.

export const EMBED_KINDS = ['river', 'dam'] as const;
export type EmbedKind = (typeof EMBED_KINDS)[number];

export const LEGACY_IMPRESSION_TYPES = [
  'card',
  'widget',
  'eddy-quote',
  'planner',
  'services',
  'gauge-report',
  'badge',
  'rivers',
] as const;

export const IMPRESSION_WIDGET_TYPES: ReadonlySet<string> = new Set<string>([
  ...LEGACY_IMPRESSION_TYPES,
  ...EMBED_KINDS.flatMap((kind) => EMBED_SIZES.map((size) => `${kind}-${size}`)),
  ...EMBED_KINDS.flatMap((kind) => ['badge', 'strip'].map((size) => `${kind}-${size}-image`)),
]);

export function impressionType(kind: EmbedKind, size: EmbedSize, image = false): string {
  return `${kind}-${size}${image ? '-image' : ''}`;
}

// ── Presentation helpers shared by the HTML and image renderers ─────────────

export type ReadingUnit = 'ft' | 'cfs';

export function formatReading(value: number | null | undefined, unit: ReadingUnit): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return unit === 'cfs' ? Math.round(value).toLocaleString('en-US') : value.toFixed(1);
}

export function formatRange(min: number | null, max: number | null, unit: ReadingUnit): string | null {
  if (min == null || max == null) return null;
  return `${formatReading(min, unit)}–${formatReading(max, unit)} ${unit}`;
}

/** "Observed 12 min ago" style ages. Null timestamp → "time unavailable". */
export function formatObservedAge(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return 'Observation time unavailable';
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return 'Observation time unavailable';
  const minutes = Math.max(0, (now - at) / 60_000);
  if (minutes < 2) return 'Observed just now';
  if (minutes < 60) return `Observed ${Math.round(minutes)} min ago`;
  const hours = minutes / 60;
  if (hours < 1.5) return 'Observed 1 hr ago';
  if (hours < 24) return `Observed ${Math.round(hours)} hrs ago`;
  const days = Math.floor(hours / 24);
  return `Observed ${days}d ago`;
}

/** Short relative age with no verb, for the strip and images: "12m", "3h", "2d". */
export function shortAge(iso: string | null | undefined, now = Date.now()): string | null {
  if (!iso) return null;
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return null;
  const minutes = Math.max(0, Math.round((now - at) / 60_000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

export const TREND_GLYPH: Record<'rising' | 'falling' | 'steady', string> = {
  rising: '↑',
  falling: '↓',
  steady: '→',
};

/**
 * Which of the two gauge values is THE reading for this river: the unit its
 * ladder is graded in. The other unit is context, shown small. A ladder in
 * cfs with a 2.8 ft tile up front was the widget's most-read mistake.
 */
/** The live, headline reading the badge/strip/card print: rated unit first. */
export function headlineReading(data: {
  river: { thresholdUnit: ReadingUnit | null };
  primary: { unit: ReadingUnit; gaugeHeightFt: number | null; dischargeCfs: number | null } | null;
}): ReturnType<typeof ratedReading> {
  const primary = data.primary;
  if (!primary) return { unit: data.river.thresholdUnit ?? 'cfs', value: null, secondary: null };
  return ratedReading({
    thresholdUnit: primary.unit,
    gaugeHeightFt: primary.gaugeHeightFt,
    dischargeCfs: primary.dischargeCfs,
  });
}

export function ratedReading(input: {
  thresholdUnit: ReadingUnit | null | undefined;
  gaugeHeightFt: number | null;
  dischargeCfs: number | null;
}): { unit: ReadingUnit; value: number | null; secondary: { unit: ReadingUnit; value: number } | null } {
  const unit: ReadingUnit = input.thresholdUnit ?? (input.dischargeCfs != null ? 'cfs' : 'ft');
  const value = unit === 'cfs' ? input.dischargeCfs : input.gaugeHeightFt;
  const otherUnit: ReadingUnit = unit === 'cfs' ? 'ft' : 'cfs';
  const otherValue = otherUnit === 'cfs' ? input.dischargeCfs : input.gaugeHeightFt;
  return {
    unit,
    value,
    secondary: otherValue != null ? { unit: otherUnit, value: otherValue } : null,
  };
}
