import { conditionDef, type ConditionCode } from '@shared/condition-system';
import { isReadingStale } from '@shared/reading-staleness';
import { ratedUnit } from '@shared/reading-unit';
import type { RiverListItem } from '@/types/api';

export const WINDOW_FPS = 30;
export const WINDOW_WIDTH = 1920;
export const WINDOW_HEIGHT = 1080;
// One frame = one scenery pixel. Six slots close both the 1x scenery and
// 1.5x foreground loops. Assets overlap 80px; no mirrored buildings.
export const SCENE_STRIDE = 3160;
export const WINDOW_FRAMES = SCENE_STRIDE * 6;
export const REFRESH_INTERVAL = 5 * 60 * 1000;
export const DEFAULT_RIVERS = ['current', 'jacks-fork', 'eleven-point'];

export type RiverWindowSign = {
  slug: string;
  name: string;
  value: string;
  unit: string;
  condition: string;
  code: ConditionCode;
  age: string;
  trend: string | null;
  stale: boolean;
};

export function parseRiverSelection(value: string | null): string[] {
  return [
    ...new Set(
      (value ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter((s) => /^[a-z0-9-]{1,80}$/.test(s))
    ),
  ].slice(0, 6);
}

export function selectWindowRivers(rivers: RiverListItem[], requested: string[]): RiverListItem[] {
  const bySlug = new Map(rivers.map((r) => [r.slug, r]));
  if (requested.length)
    return requested.flatMap((slug) => (bySlug.has(slug) ? [bySlug.get(slug)!] : []));
  const defaults = DEFAULT_RIVERS.flatMap((slug) => (bySlug.has(slug) ? [bySlug.get(slug)!] : []));
  return defaults.length ? defaults : rivers.filter((r) => r.state === 'MO').slice(0, 6);
}

export function readingAge(hours: number | null): string {
  if (hours === null) return 'Reading time unavailable';
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} min ago`;
  return `${Math.floor(hours)} hr ago`;
}

export function toWindowSign(
  river: RiverListItem,
  fetchedAt: number,
  now: number
): RiverWindowSign {
  const c = river.currentCondition;
  // readingAgeHours is relative to the API snapshot. Keep aging it even when
  // polling fails or the animation is paused; fetch time is not reading time.
  const rawAge = c?.readingAgeHours;
  const hours =
    rawAge != null && Number.isFinite(rawAge) && rawAge >= 0
      ? rawAge + Math.max(0, now - fetchedAt) / 3_600_000
      : null;
  const unit = c ? ratedUnit(c) : null;
  const raw = unit === 'ft' ? c?.gaugeHeightFt : unit === 'cfs' ? c?.dischargeCfs : null;
  const available = raw != null && Number.isFinite(raw);
  const stale = isReadingStale(hours) || !available;
  const code = stale ? 'unknown' : conditionDef(c?.code ?? 'unknown').code;
  return {
    slug: river.slug,
    name: river.name,
    value: available
      ? unit === 'ft'
        ? raw.toFixed(2)
        : Math.round(raw).toLocaleString('en-US')
      : '—',
    unit: available ? (unit ?? '') : '',
    condition: !available
      ? 'Reading unavailable'
      : stale
        ? 'Last reported reading'
        : conditionDef(code).label,
    code,
    age: readingAge(hours),
    stale,
    trend: !stale && c?.trend ? c.trend.label : null,
  };
}

export function scenePosition(frame: number, slot: number, tileWidth = 3240): number {
  const camera = ((frame % WINDOW_FRAMES) + WINDOW_FRAMES) % WINDOW_FRAMES;
  // Recycle only once a complete 3240px tile has exited left.
  return ((slot * SCENE_STRIDE - camera + tileWidth + WINDOW_FRAMES) % WINDOW_FRAMES) - tileWidth;
}

/** Network payloads are not trusted TypeScript values. Reject malformed snapshots. */
export function parseRiverSnapshot(value: unknown): RiverListItem[] {
  if (!value || typeof value !== 'object' || !('rivers' in value) || !Array.isArray(value.rivers)) {
    throw new Error('River conditions unavailable');
  }
  for (const river of value.rivers) {
    if (
      !river ||
      typeof river !== 'object' ||
      typeof river.slug !== 'string' ||
      typeof river.name !== 'string'
    ) {
      throw new Error('Invalid river response');
    }
    const c = river.currentCondition;
    if (
      c != null &&
      (typeof c !== 'object' ||
        typeof c.code !== 'string' ||
        !['ft', 'cfs', null].includes(c.thresholdUnit) ||
        ['readingAgeHours', 'gaugeHeightFt', 'dischargeCfs'].some(
          (key) => c[key] != null && (typeof c[key] !== 'number' || !Number.isFinite(c[key]))
        ) ||
        (c.trend != null && (typeof c.trend !== 'object' || typeof c.trend.label !== 'string')))
    ) {
      throw new Error('Invalid condition response');
    }
  }
  return value.rivers as RiverListItem[];
}
