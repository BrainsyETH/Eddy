// src/lib/display/home-base.ts
// The home-base river board (/embed/board/<id>): a portrait wall display for
// a lodging partner that shows the rivers around one place. Pine Valley at
// Dillard Mill is the first board. docs/home-base-board.md owns the design.
//
// Everything here is pure so it can be tested: the partner configuration,
// the map projection, the rows the board shows, the self-running loop, and
// the parsing of the network payloads it reads. The component only draws.

import { classifyReading, type ConditionThresholds } from '@shared/condition-ladder';
import { conditionDef, type ConditionCode } from '@shared/condition-system';
import { flowBand, type FlowBand } from '@shared/flow-band';
import { conditionSnapshotMatches } from '@/lib/condition-snapshot';
import type { RiverListItem } from '@/types/api';
import { toWindowSign, type RiverWindowSign } from './river-window';
import { PINE_VALLEY_LINES } from './home-base-geometry';

export type LngLat = [lng: number, lat: number];

/** A flat projection, scaled in x by the cosine of a reference latitude. */
export type MapFrame = {
  lng0: number; // west edge
  lat1: number; // north edge
  refLat: number;
  scale: number; // px per degree of latitude
  width: number;
  height: number;
};

export type HomeBaseRiver = {
  slug: string;
  /** Road time from the place to the river's nearest Eddy access, minutes. */
  driveMinutes: number;
  /** One factual line about this river as seen from the place. */
  tip: string;
};

export type HomeBaseConfig = {
  id: string;
  name: string;
  /** URL segment of the rivers' state on eddy.guide, e.g. /rivers/missouri/… */
  state: string;
  home: { lat: number; lng: number };
  logo: { src: string; width: number; height: number; alt: string };
  /** The river at the door: the hero, read on the mill sign. */
  doorstep: string;
  /** Mill scene from mill-scenes.ts whose board carries the doorstep reading. */
  millScene: string;
  /**
   * Water in that painting, as CSS polygons in % of the artwork: the board
   * animates only inside them, so rocks, banks, the mill and its sign stay
   * still. Kept here, not in mill-scenes.ts, because the Mills display uses
   * its own subtler water region.
   */
  water: { pool: string; falls: string | null };
  rivers: HomeBaseRiver[];
  /** App Store campaign token for installs from this board. */
  campaign: string;
  map: MapFrame;
  /**
   * Relief and geometry extend this many px above and below the map frame,
   * so the map can grow on a screen taller than 9:16 (see boardLayout).
   */
  reliefPad: number;
  lines: Record<string, LngLat[]>;
  /** USGS site → position and which side of the dot its reading tag sits. */
  gauges: Record<string, { at: LngLat; side: 'left' | 'right' }>;
  labels: Record<string, [lng: number, lat: number, anchor: 'start' | 'middle' | 'end']>;
  /** Hand-drawn approximation of the drainage divide; labelled as such. */
  divide: LngLat[];
  divideLabels: { north: string; south: string };
};

// Drive times: OSRM road routing (router.project-osrm.org, car profile) from
// the place to the closest approved access point Eddy lists for each river,
// rounded to 5 minutes, checked 2026-11-04. Static on purpose: road time does
// not change with the river, and the board should not call a router.
export const PINE_VALLEY: HomeBaseConfig = {
  id: 'pine-valley',
  name: 'Pine Valley at Dillard Mill',
  state: 'missouri',
  // Placeholder: Dillard Mill State Historic Site. Replace with the cabin's
  // own coordinates when the owners supply them (docs/home-base-board.md).
  home: { lat: 37.7216, lng: -91.2148 },
  logo: { src: '/display/pine-valley/logo.png', width: 500, height: 175, alt: 'Pine Valley · Lodging, Camping, & Events' },
  doorstep: 'huzzah',
  millScene: 'dillard',
  water: {
    // The millpond above the foreground rocks, stopping short of the sign post.
    pool: 'polygon(4% 66.5%, 27% 67%, 40% 68%, 77% 68%, 77% 82%, 28% 84%, 27% 71%, 4% 70%)',
    // The cascade over the dam, left of the mill.
    falls: 'polygon(7.5% 52.5%, 15% 51.5%, 20% 54%, 20% 65%, 10% 66%, 7% 60%)',
  },
  rivers: [
    { slug: 'huzzah', driveMinutes: 5, tip: 'The Dillard access is about half a mile from the cabin.' },
    { slug: 'courtois', driveMinutes: 50, tip: 'Joins the Huzzah just above the Meramec.' },
    { slug: 'meramec', driveMinutes: 50, tip: 'The nearest access is on the upper river, west of the cabin.' },
    { slug: 'black', driveMinutes: 80, tip: 'The nearest access is on the Lesterville stretch.' },
    { slug: 'current', driveMinutes: 110, tip: 'The upper river below Montauk is the closest put-in.' },
    { slug: 'jacks-fork', driveMinutes: 135, tip: 'The lower river near Eminence is the closest put-in.' },
  ],
  campaign: 'pine_valley',
  map: { lng0: -92.34, lat1: 38.06, refLat: 37.52, scale: 528, width: 978, height: 586 },
  reliefPad: 260,
  lines: PINE_VALLEY_LINES,
  gauges: {
    '07013000': { at: [-91.3609, 37.9985], side: 'left' }, // Meramec River near Steelville
    '07014000': { at: [-91.204, 37.9748], side: 'right' }, // Huzzah Creek near Steelville
    '07061500': { at: [-90.7888, 37.3381], side: 'right' }, // Black River near Annapolis
    '07065495': { at: [-91.4431, 37.1482], side: 'right' }, // Jacks Fork at Alley Spring
    '07067000': { at: [-91.0135, 36.9914], side: 'right' }, // Current River at Van Buren
  },
  labels: {
    huzzah: [-91.18, 37.715, 'start'],
    courtois: [-91.03, 37.8, 'start'],
    meramec: [-91.47, 37.62, 'end'],
    black: [-90.74, 37.24, 'start'],
    current: [-91.45, 37.4, 'start'],
    'jacks-fork': [-91.6, 37.13, 'end'],
  },
  // Passes south of where the Meramec, Huzzah and Courtois rise and north of
  // where the Current and Black rise. Not a surveyed watershed boundary.
  divide: [[-92.0, 37.47], [-91.69, 37.49], [-91.33, 37.48], [-91.1, 37.56], [-90.95, 37.56], [-90.83, 37.5], [-90.6, 37.52], [-90.35, 37.55]],
  divideLabels: { north: 'Flows north to St. Louis ↑', south: 'Flows south to Arkansas ↓' },
};

export const HOME_BASES: Record<string, HomeBaseConfig> = { [PINE_VALLEY.id]: PINE_VALLEY };

export function homeBaseFor(id: string): HomeBaseConfig | null {
  return Object.hasOwn(HOME_BASES, id) ? HOME_BASES[id] : null;
}

// ── Projection ───────────────────────────────────────────────────────────────

export function project(frame: MapFrame, lng: number, lat: number): [number, number] {
  const cos = Math.cos((frame.refLat * Math.PI) / 180);
  return [(lng - frame.lng0) * cos * frame.scale, (frame.lat1 - lat) * frame.scale];
}

export function unproject(frame: MapFrame, x: number, y: number): { lng: number; lat: number } {
  const cos = Math.cos((frame.refLat * Math.PI) / 180);
  return { lng: frame.lng0 + x / (cos * frame.scale), lat: frame.lat1 - y / frame.scale };
}

export function linePath(frame: MapFrame, coords: LngLat[]): string {
  return coords
    .map(([lng, lat], i) => {
      const [x, y] = project(frame, lng, lat);
      return `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join('');
}

// ── Layout ───────────────────────────────────────────────────────────────────

export const BOARD_WIDTH = 1080;
export const BOARD_HEIGHT = 1920; // the 9:16 design height
/** The forecast card and the gap above it. */
export const FORECAST_BLOCK = 150 + 24;

export type BoardLayout = { scale: number; x: number; y: number; height: number; forecast: boolean; mapGrow: number };

/**
 * Fit the board to a screen. On 9:16 or wider it is the 1080 x 1920 design,
 * letterboxed at the sides. On a taller screen (a 21:9 monitor on its side)
 * the board grows to fill the height instead of leaving bars: first room for
 * the forecast, then the map, up to what the relief and geometry cover.
 */
export function boardLayout(viewportW: number, viewportH: number, config: HomeBaseConfig, hasForecast: boolean): BoardLayout {
  if (viewportW <= 0 || viewportH <= 0) return { scale: 0, x: 0, y: 0, height: BOARD_HEIGHT, forecast: false, mapGrow: 0 };
  if (viewportH / viewportW <= BOARD_HEIGHT / BOARD_WIDTH) {
    const scale = viewportH / BOARD_HEIGHT;
    return { scale, x: (viewportW - BOARD_WIDTH * scale) / 2, y: 0, height: BOARD_HEIGHT, forecast: false, mapGrow: 0 };
  }
  const scale = viewportW / BOARD_WIDTH;
  const room = Math.floor(viewportH / scale) - BOARD_HEIGHT;
  const forecast = hasForecast && room >= FORECAST_BLOCK;
  const mapGrow = Math.min(Math.max(0, room - (forecast ? FORECAST_BLOCK : 0)), 2 * config.reliefPad);
  const height = BOARD_HEIGHT + (forecast ? FORECAST_BLOCK : 0) + mapGrow;
  return { scale, x: 0, y: (viewportH - height * scale) / 2, height, forecast, mapGrow };
}

/** The map frame grown by `grow` px, half above and half below. */
export function growFrame(frame: MapFrame, grow: number): MapFrame {
  return { ...frame, lat1: frame.lat1 + grow / 2 / frame.scale, height: frame.height + grow };
}

// ── Forecast ─────────────────────────────────────────────────────────────────

/**
 * A rain chance at or above this reads as "rain coming" across Eddy. Equal to
 * RAIN_CHANCE_THRESHOLD in src/lib/weather/openweather.ts (a server module the
 * board must not import); home-base.test.ts holds them equal.
 */
export const RAIN_EMPHASIS = 40;

export type ForecastDay = { date: string; day: string; high: number; low: number; icon: string; rain: number };

const CENTRAL_DATE = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' });

/**
 * /api/weather/<slug>/forecast → up to `count` days from today (Central).
 * Malformed days are dropped; no days is "no forecast", not an error card.
 */
export function parseForecast(value: unknown, now: number, count = 4): { place: string | null; days: ForecastDay[] } {
  const v = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const today = CENTRAL_DATE.format(new Date(now));
  const days = (Array.isArray(v.forecast) ? v.forecast : []).flatMap((d): ForecastDay[] => {
    if (!d || typeof d !== 'object') return [];
    const { date, dayOfWeek, tempHigh, tempLow, conditionIcon, precipitation } = d as Record<string, unknown>;
    if (typeof date !== 'string' || date < today || typeof dayOfWeek !== 'string' || !finite(tempHigh) || !finite(tempLow)) return [];
    return [{ date, day: date === today ? 'Today' : dayOfWeek, high: Math.round(tempHigh), low: Math.round(tempLow), icon: typeof conditionIcon === 'string' ? conditionIcon : '', rain: finite(precipitation) ? Math.round(precipitation) : 0 }];
  });
  return { place: typeof v.location === 'string' ? v.location : null, days: days.slice(0, count) };
}

// ── Artwork ──────────────────────────────────────────────────────────────────

export type ArtRegion = { left: number; top: number; width: number; height: number; clipPath: string };

/**
 * A CSS polygon in % of the artwork, as a box in board pixels (the art drawn
 * `width` wide, shifted up by `offsetY`) plus the same polygon in px relative
 * to that box. Filtering only the box keeps the animated area small.
 */
export function artRegion(polygon: string, art: { width: number; height: number; offsetY: number }): ArtRegion {
  const points = [...polygon.matchAll(/(-?[\d.]+)%\s+(-?[\d.]+)%/g)].map(([, x, y]) => [
    (Number(x) / 100) * art.width,
    (Number(y) / 100) * art.height - art.offsetY,
  ]);
  if (points.length < 3) throw new Error(`Not a polygon: ${polygon}`);
  const xs = points.map(([x]) => x), ys = points.map(([, y]) => y);
  const left = Math.floor(Math.min(...xs)), top = Math.floor(Math.min(...ys));
  const width = Math.ceil(Math.max(...xs)) - left, height = Math.ceil(Math.max(...ys)) - top;
  const clipPath = `polygon(${points.map(([x, y]) => `${(x - left).toFixed(1)}px ${(y - top).toFixed(1)}px`).join(', ')})`;
  return { left, top, width, height, clipPath };
}

// ── Rows ─────────────────────────────────────────────────────────────────────

export type BoardRow = RiverWindowSign & {
  driveMinutes: number;
  tip: string;
  siteId: string | null;
  /** Name of an earlier river on this board rated from the same gauge. */
  sharesGaugeWith: string | null;
  href: string;
};

export function riverPageUrl(config: HomeBaseConfig, slug: string): string {
  return `https://eddy.guide/rivers/${config.state}/${slug}`;
}

/**
 * The board's rivers, in configuration order, with the same staleness and
 * rated-unit rules as the River Window. A river missing from the snapshot is
 * left out; another river's reading is never shown in its place.
 */
export function boardRows(config: HomeBaseConfig, rivers: RiverListItem[], fetchedAt: number, now: number): BoardRow[] {
  const bySlug = new Map(rivers.map((r) => [r.slug, r]));
  const rows: BoardRow[] = [];
  for (const entry of config.rivers) {
    const river = bySlug.get(entry.slug);
    if (!river) continue;
    const siteId = river.primaryGaugeSiteId ?? null;
    const twin = siteId ? rows.find((r) => r.siteId === siteId) : undefined;
    rows.push({
      ...toWindowSign(river, fetchedAt, now),
      driveMinutes: entry.driveMinutes,
      tip: entry.tip,
      siteId,
      sharesGaugeWith: twin?.name ?? null,
      href: riverPageUrl(config, entry.slug),
    });
  }
  return rows;
}

/** Spotlight order: nearest first. */
export function spotlightOrder(config: HomeBaseConfig): string[] {
  return [...config.rivers].sort((a, b) => a.driveMinutes - b.driveMinutes).map((r) => r.slug);
}

// ── The self-running loop ────────────────────────────────────────────────────

export const SPOT_MS = 9_000;
export const REPLAY_STEP_MS = 260;
export const HOLD_MS = 6_000;
/** Reduced motion: no replay animation, and a slower spotlight. */
export const REDUCED_SPOT_MS = 12_000;

export type LoopState = { phase: 'spot' | 'replay' | 'hold'; index: number };

/**
 * Spotlight each river in turn, replay the week, hold on the present, repeat.
 * With reduced motion, or with no history to replay, the replay is skipped.
 */
export function advanceLoop(state: LoopState, spots: number, steps: number, reduceMotion: boolean): LoopState {
  const replay = !reduceMotion && steps > 1;
  if (state.phase === 'spot') {
    if (state.index + 1 < spots) return { phase: 'spot', index: state.index + 1 };
    return replay ? { phase: 'replay', index: 0 } : { phase: 'hold', index: 0 };
  }
  if (state.phase === 'replay' && state.index + 1 < steps) return { phase: 'replay', index: state.index + 1 };
  if (state.phase === 'replay') return { phase: 'hold', index: 0 };
  return { phase: 'spot', index: 0 };
}

export function loopDelay(state: LoopState, reduceMotion: boolean): number {
  if (state.phase === 'replay') return REPLAY_STEP_MS;
  if (state.phase === 'hold') return HOLD_MS;
  return reduceMotion ? REDUCED_SPOT_MS : SPOT_MS;
}

// ── Seven days of flow ───────────────────────────────────────────────────────

export const SERIES_STEP_MS = 3 * 3_600_000;
export const SERIES_POINTS = 57; // 7 days at 3-hour steps, both ends included

export type HistoryReading = { t: number; ft: number | null; cfs: number | null };

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** /api/gauges/<site>/history, oldest first. Malformed payloads are rejected. */
export function parseGaugeHistory(value: unknown): HistoryReading[] {
  if (!value || typeof value !== 'object' || !Array.isArray((value as { readings?: unknown }).readings)) {
    throw new Error('Invalid gauge history');
  }
  const out: HistoryReading[] = [];
  for (const r of (value as { readings: unknown[] }).readings) {
    if (!r || typeof r !== 'object') continue;
    const { timestamp, gaugeHeightFt, dischargeCfs } = r as Record<string, unknown>;
    const t = typeof timestamp === 'string' ? Date.parse(timestamp) : NaN;
    if (!Number.isFinite(t)) continue;
    out.push({ t, ft: finite(gaugeHeightFt) ? gaugeHeightFt : null, cfs: finite(dischargeCfs) ? dischargeCfs : null });
  }
  return out.sort((a, b) => a.t - b.t);
}

/**
 * Resample to SERIES_POINTS values ending at `end`: each point is the latest
 * reading in the 3 hours up to it, in the river's rated unit, or null for a
 * gap. Gaps stay gaps — the board never draws a line through missing data.
 */
export function sevenDaySeries(readings: HistoryReading[], unit: string, end: number): (number | null)[] {
  const key = unit === 'ft' ? 'ft' : 'cfs';
  const out: (number | null)[] = [];
  let j = 0;
  let last: HistoryReading | null = null;
  for (let k = 0; k < SERIES_POINTS; k++) {
    const at = end - (SERIES_POINTS - 1 - k) * SERIES_STEP_MS;
    while (j < readings.length && readings[j].t <= at) last = readings[j++];
    const v = last && at - last.t < SERIES_STEP_MS ? last[key] : null;
    out.push(v);
  }
  return out;
}

/** 0–1 position of a value within the series' own range (the replay's line width). */
export function relativeLevel(series: (number | null)[], value: number | null): number {
  const vals = series.filter(finite);
  if (value == null || !vals.length) return 0;
  const min = Math.min(...vals), max = Math.max(...vals);
  return max > min ? (value - min) / (max - min) : 0.5;
}

export function seriesTime(end: number, index: number): number {
  return end - (SERIES_POINTS - 1 - index) * SERIES_STEP_MS;
}

const STEP_LABEL = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', weekday: 'short', hour: 'numeric' });

/** "Tue 3 PM" → "Tue 3 pm", in Central time (the rivers' time). */
export function stepLabel(time: number): string {
  return STEP_LABEL.format(new Date(time)).replace(/\s?([AP])M$/, (_, m: string) => ` ${m.toLowerCase()}m`);
}

export function formatReading(value: number | null, unit: string): string {
  if (value == null) return '—';
  return unit === 'ft' ? value.toFixed(2) : value >= 100 ? Math.round(value).toLocaleString('en-US') : value.toFixed(1);
}

// ── Sun ──────────────────────────────────────────────────────────────────────

/**
 * Sunrise and sunset (UTC ms) on the UTC calendar day of `date`, from the
 * standard NOAA approximation (zenith 90.833°). Within a couple of minutes at
 * Ozark latitudes, which is all a wall display needs to know when to dim.
 */
export function sunTimes(date: Date, lat: number, lng: number): { sunrise: number; sunset: number } {
  const rad = Math.PI / 180;
  const dayStart = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  const n = Math.floor((dayStart - Date.UTC(date.getUTCFullYear(), 0, 0)) / 86_400_000);
  const lngHour = lng / 15;
  const at = (rising: boolean) => {
    const t = n + ((rising ? 6 : 18) - lngHour) / 24;
    const m = 0.9856 * t - 3.289;
    const l = (((m + 1.916 * Math.sin(m * rad) + 0.02 * Math.sin(2 * m * rad) + 282.634) % 360) + 360) % 360;
    let ra = ((Math.atan(0.91764 * Math.tan(l * rad)) / rad) % 360 + 360) % 360;
    ra = (ra + (Math.floor(l / 90) * 90 - Math.floor(ra / 90) * 90)) / 15;
    const sinDec = 0.39782 * Math.sin(l * rad);
    const cosDec = Math.cos(Math.asin(sinDec));
    const cosH = (Math.cos(90.833 * rad) - sinDec * Math.sin(lat * rad)) / (cosDec * Math.cos(lat * rad));
    const h = (rising ? 360 - Math.acos(cosH) / rad : Math.acos(cosH) / rad) / 15;
    const ut = (((h + ra - 0.06571 * t - 6.622 - lngHour) % 24) + 24) % 24;
    return dayStart + ut * 3_600_000;
  };
  return { sunrise: at(true), sunset: at(false) };
}

/** Dark outside at the place: after sunset or before sunrise, in its own day. */
export function isNight(now: number, lat: number, lng: number): boolean {
  // The place's local day, approximated from longitude, picks the right date.
  const local = new Date(now + (lng / 15) * 3_600_000);
  const { sunrise, sunset } = sunTimes(local, lat, lng);
  const rise = sunrise, set = sunset < sunrise ? sunset + 86_400_000 : sunset;
  return now < rise || now > set;
}

const CLOCK = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', hour: 'numeric', minute: '2-digit' });
export const clockLabel = (time: number) => CLOCK.format(new Date(time)).replace(/\s?([AP])M$/, (_, m: string) => ` ${m.toLowerCase()}m`);

// ── Eddy's take ──────────────────────────────────────────────────────────────

/**
 * /api/eddy-update/<slug>. The take is shown only beside the exact condition
 * and reading it was written from (the rule RiverCard applies); otherwise the
 * otter stays quiet rather than contradict the number on the sign.
 */
export function eddyTakeFor(value: unknown, river: RiverListItem | undefined): string | null {
  if (!value || typeof value !== 'object' || !river?.currentCondition) return null;
  const update = (value as { update?: unknown }).update;
  if (!update || typeof update !== 'object') return null;
  const u = update as Record<string, unknown>;
  if (typeof u.summaryText !== 'string' || typeof u.conditionCode !== 'string') return null;
  const c = river.currentCondition;
  const matches = conditionSnapshotMatches(
    { conditionCode: u.conditionCode, gaugeHeightFt: finite(u.gaugeHeightFt) ? u.gaugeHeightFt : null, dischargeCfs: finite(u.dischargeCfs) ? u.dischargeCfs : null },
    { conditionCode: c.code, gaugeHeightFt: c.gaugeHeightFt ?? null, dischargeCfs: c.dischargeCfs ?? null },
    c.thresholdUnit,
  );
  const text = u.summaryText.trim().replace(/^["“]|["”]$/g, '');
  return matches && text ? text : null;
}

// ── The week, rated ──────────────────────────────────────────────────────────

/**
 * /api/gauge-thresholds → each board river's primary-gauge ladder, keyed by
 * river slug. Two rivers on one gauge can still carry their own ladders.
 */
export function parseRiverLadders(value: unknown, slugs: string[]): Map<string, ConditionThresholds> {
  const out = new Map<string, ConditionThresholds>();
  const rivers = value && typeof value === 'object' ? (value as { rivers?: unknown }).rivers : null;
  if (!Array.isArray(rivers)) return out;
  for (const river of rivers) {
    if (!river || typeof river !== 'object') continue;
    const { riverSlug, gauges } = river as { riverSlug?: unknown; gauges?: unknown };
    if (typeof riverSlug !== 'string' || !slugs.includes(riverSlug) || !Array.isArray(gauges)) continue;
    const primary = gauges.find((g) => g && typeof g === 'object' && (g as { isPrimary?: unknown }).isPrimary === true) as
      | { unit?: unknown; thresholds?: Record<string, unknown> }
      | undefined;
    if (!primary || (primary.unit !== 'ft' && primary.unit !== 'cfs') || !primary.thresholds) continue;
    const t = primary.thresholds;
    const n = (v: unknown) => (finite(v) ? v : null);
    out.set(riverSlug, {
      levelTooLow: n(t.tooLow),
      levelLow: n(t.low),
      levelOptimalMin: n(t.optimalMin),
      levelOptimalMax: n(t.optimalMax),
      levelHigh: n(t.high),
      levelDangerous: n(t.dangerous),
      thresholdUnit: primary.unit,
    });
  }
  return out;
}

/**
 * Each point of a series rated with Eddy's own ladder (the shared classifier
 * the app and the phone use), so the replay can colour the past honestly. A
 * series in a different unit from its ladder is not rated (null throughout).
 */
export function rateSeries(series: (number | null)[], unit: string, ladder: ConditionThresholds | undefined): (ConditionCode | null)[] {
  if (!ladder || ladder.thresholdUnit !== unit) return series.map(() => null);
  return series.map((v) => {
    if (v == null) return null;
    const code = unit === 'cfs' ? classifyReading(null, ladder, v, { strictUnit: true }) : classifyReading(v, ladder, null, { strictUnit: true });
    return code === 'unknown' ? null : code;
  });
}

export type StoryEvent = { index: number; slug: string; text: string; weight: number };
export type WeekStory = { events: StoryEvent[]; summary: string | null };

export const shortName = (name: string) => name.replace(/ (River|Creek)$/, '');
/** A rise worth a caption: 15% or more in six hours. */
export const STORY_RISE = 0.15;
/** A rise worth a pulse down the river: 3% or more in one step. */
export const PULSE_RISE = 0.03;

/**
 * The week's moments, from the data: each river's sharpest six-hour rise and
 * its latest change of condition, plus one summary line. Rivers that share
 * another row's gauge are skipped so a moment is never told twice.
 */
export function weekStory(
  rivers: { slug: string; name: string; sharesGaugeWith: string | null }[],
  series: Map<string, (number | null)[]>,
  ratings: Map<string, (ConditionCode | null)[]>,
  end: number,
): WeekStory {
  const events: StoryEvent[] = [];
  let biggest: { name: string; change: number } | null = null;
  for (const river of rivers) {
    if (river.sharesGaugeWith) continue;
    const v = series.get(river.slug) ?? [];
    const name = shortName(river.name);
    let rise: StoryEvent | null = null;
    for (let i = 2; i < v.length; i++) {
      const a = v[i - 2], b = v[i];
      if (a == null || b == null || a <= 0) continue;
      const pct = (b - a) / a;
      if (pct >= STORY_RISE && (!rise || pct > rise.weight)) {
        rise = { index: i, slug: river.slug, weight: pct, text: `${stepLabel(seriesTime(end, i))}: ${name} up ${Math.round(pct * 100)}% in 6 hours` };
      }
    }
    if (rise) events.push(rise);
    const c = ratings.get(river.slug) ?? [];
    for (let i = c.length - 1; i > 0; i--) {
      if (c[i] && c[i - 1] && c[i] !== c[i - 1]) {
        events.push({ index: i, slug: river.slug, weight: 2, text: `${stepLabel(seriesTime(end, i))}: ${name} turned ${conditionDef(c[i]!).label}` });
        break;
      }
    }
    const nums = v.filter(finite);
    if (nums.length >= 2 && nums[0] > 0) {
      const change = (nums[nums.length - 1] - nums[0]) / nums[0];
      if (!biggest || Math.abs(change) > Math.abs(biggest.change)) biggest = { name, change };
    }
  }
  // One caption per moment: at a shared step the heavier event wins.
  const byIndex = new Map<number, StoryEvent>();
  for (const e of events) if ((byIndex.get(e.index)?.weight ?? -1) < e.weight) byIndex.set(e.index, e);
  const summary = !biggest
    ? null
    : Math.abs(biggest.change) < 0.05
      ? 'A quiet week: every river within 5% of where it started.'
      : `This week: ${biggest.name} ${biggest.change > 0 ? 'rose' : 'fell'} ${Math.round(Math.abs(biggest.change) * 100)}%, the most on the board.`;
  return { events: [...byIndex.values()].sort((a, b) => a.index - b.index), summary };
}

export const STORY_DEFAULT = 'Each river is colored by its condition at that hour, rated by Eddy.';
/** How long a moment stays up, in replay steps. */
export const CAPTION_STEPS = 10;

/**
 * The caption at a replay step: the latest moment still within its window.
 * The week's summary is not a caption; the board shows it during the hold
 * that follows the replay, so it never hides the moments at the end.
 */
export function storyCaption(story: WeekStory, index: number): string {
  const current = [...story.events].reverse().find((e) => e.index <= index && index - e.index < CAPTION_STEPS);
  return current?.text ?? STORY_DEFAULT;
}

/** Did this river rise enough at this step to send a pulse downstream? */
export function risingAt(series: (number | null)[], index: number): boolean {
  const a = series[index - 1], b = series[index];
  return a != null && b != null && a > 0 && (b - a) / a >= PULSE_RISE;
}

// ── Compared with usual, and water temperature ───────────────────────────────

export type GaugeExtras = { band: FlowBand | null; waterF: number | null };

/** Water temperature older than this is not shown. */
export const WATER_TEMP_MAX_AGE_MS = 6 * 3_600_000;

/**
 * /api/gauges/<site>: the seasonal band (today's flow against the same date
 * in past years) and the latest water temperature, if fresh.
 */
export function parseGaugeExtras(value: unknown, now: number): GaugeExtras {
  const gauge = value && typeof value === 'object' ? (value as { gauge?: unknown }).gauge : null;
  if (!gauge || typeof gauge !== 'object') return { band: null, waterF: null };
  const g = gauge as Record<string, unknown>;
  const seasonal = g.seasonalContext && typeof g.seasonalContext === 'object' ? (g.seasonalContext as Record<string, unknown>) : null;
  const band = seasonal && finite(seasonal.percentile) ? flowBand(seasonal.percentile) : null;
  const water = g.waterTemperature && typeof g.waterTemperature === 'object' ? (g.waterTemperature as Record<string, unknown>) : null;
  const observed = water && typeof water.observedAt === 'string' ? Date.parse(water.observedAt) : NaN;
  const waterF = water && finite(water.valueF) && Number.isFinite(observed) && now - observed <= WATER_TEMP_MAX_AGE_MS ? Math.round(water.valueF) : null;
  return { band, waterF };
}
