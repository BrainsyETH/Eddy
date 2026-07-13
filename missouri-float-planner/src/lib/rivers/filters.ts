// src/lib/rivers/filters.ts
// Taxonomy + pure helpers for the River Reports filter/sort UI.
//
// No React and no server-only imports live here on purpose: the server page
// (src/app/rivers/page.tsx) uses buildRiverFilterMeta to derive per-river
// metadata, and the client grid (RiverReportsGrid) uses the same helpers to
// filter and sort. Keeping the logic pure means both sides agree on exactly how
// a river is bucketed.

import { WEEKEND_SEVERITY, WEEKEND_FLOATABLE } from '@shared/condition-system';

// ─────────────────────────────────────────────────────────────────────────────
// River type (rivers.river_type)
// ─────────────────────────────────────────────────────────────────────────────

/** Hydrological archetype — mirrors the rivers.river_type CHECK constraint. */
export type RiverType =
  | 'spring_fed_float'
  | 'dam_tailwater'
  | 'rain_flashy'
  | 'snowmelt'
  | 'flatwater';

/**
 * User-facing label per river type, framed around what it means for planning:
 * spring-fed floats hold water for most of the season, rain-dependent rivers
 * need recent rain to come up.
 */
export const RIVER_TYPE_LABELS: Record<string, string> = {
  spring_fed_float: 'Spring-fed',
  rain_flashy: 'Rain-dependent',
  dam_tailwater: 'Dam-controlled',
  snowmelt: 'Snowmelt',
  flatwater: 'Flatwater',
};

export function riverTypeLabel(type: string | null | undefined): string | null {
  if (!type) return null;
  return RIVER_TYPE_LABELS[type] ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Difficulty tier (derived from the free-text rivers.difficulty_rating)
// ─────────────────────────────────────────────────────────────────────────────

/** Normalized paddling difficulty, derived from the free-text rating. */
export type DifficultyTier = 'beginner' | 'intermediate' | 'advanced';

export const DIFFICULTY_TIER_LABELS: Record<DifficultyTier, string> = {
  beginner: 'Beginner-friendly',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
};

/** Easiest-first ordering for stable option lists. */
export const DIFFICULTY_TIER_ORDER: DifficultyTier[] = ['beginner', 'intermediate', 'advanced'];

const ROMAN_CLASS: Record<string, number> = { i: 1, ii: 2, iii: 3, iv: 4, v: 5 };

/**
 * Bucket a free-text whitewater rating into a normalized tier by its hardest
 * graded rapid:
 *   max Class I  → beginner
 *   max Class II → intermediate
 *   Class III+   → advanced
 *
 * Only the leading "Class …" clause is parsed (everything up to the first '(' or
 * ';'), so descriptive prose like "Class I-II (Saddler Falls & High Falls
 * ledges)" or "Class II-IV (upper whitewater); calmer below Sam A. Baker SP"
 * can't skew the result. Returns null when no class numeral is present.
 */
export function difficultyTier(rating: string | null | undefined): DifficultyTier | null {
  if (!rating) return null;
  const head = rating.split(/[(;]/)[0].toLowerCase();
  // Match standalone roman numerals only (word boundaries) so letters inside
  // words like "class" or "river" are ignored. Longest-first alternation keeps
  // "iv"/"iii" from being read as "i" + "v" etc.
  const numerals = head.match(/\b(iv|iii|ii|i|v)\b/g);
  if (!numerals || numerals.length === 0) return null;
  const max = Math.max(...numerals.map((n) => ROMAN_CLASS[n] ?? 0));
  if (max <= 1) return 'beginner';
  if (max === 2) return 'intermediate';
  return 'advanced';
}

// ─────────────────────────────────────────────────────────────────────────────
// Length bucket (total river length — a rough proxy, not a single-trip distance)
// ─────────────────────────────────────────────────────────────────────────────

export type LengthBucket = 'short' | 'medium' | 'long';

export const LENGTH_BUCKET_LABELS: Record<LengthBucket, string> = {
  short: 'Short (< 60 mi)',
  medium: 'Medium (60–150 mi)',
  long: 'Long (150+ mi)',
};

export const LENGTH_BUCKET_ORDER: LengthBucket[] = ['short', 'medium', 'long'];

export function lengthBucket(miles: number | null | undefined): LengthBucket | null {
  if (miles == null || !Number.isFinite(miles)) return null;
  if (miles < 60) return 'short';
  if (miles < 150) return 'medium';
  return 'long';
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-river metadata + sort
// ─────────────────────────────────────────────────────────────────────────────

/** The metadata the grid needs to filter/sort, keyed by river id. */
export interface RiverFilterMeta {
  state: string | null;
  region: string | null;
  riverType: string | null;
  difficultyTier: DifficultyTier | null;
  lengthMiles: number | null;
}

/** Minimal shape buildRiverFilterMeta reads from (a subset of RiverListItem). */
interface RiverMetaSource {
  id: string;
  state?: string | null;
  region?: string | null;
  riverType?: string | null;
  difficultyRating?: string | null;
  lengthMiles?: number | null;
}

/** Build the id → RiverFilterMeta map the grid filters against. */
export function buildRiverFilterMeta(rivers: RiverMetaSource[]): Record<string, RiverFilterMeta> {
  const map: Record<string, RiverFilterMeta> = {};
  for (const river of rivers) {
    map[river.id] = {
      state: river.state ?? null,
      region: river.region ?? null,
      riverType: river.riverType ?? null,
      difficultyTier: difficultyTier(river.difficultyRating),
      lengthMiles:
        typeof river.lengthMiles === 'number' && Number.isFinite(river.lengthMiles)
          ? river.lengthMiles
          : null,
    };
  }
  return map;
}

/** Sort options for the river list. */
export type RiverSortKey = 'best' | 'name' | 'length_desc' | 'length_asc';

export const SORT_LABELS: Record<RiverSortKey, string> = {
  best: 'Best conditions',
  name: 'Name (A–Z)',
  length_desc: 'Longest',
  length_asc: 'Shortest',
};

export const SORT_ORDER: RiverSortKey[] = ['best', 'name', 'length_desc', 'length_asc'];

export const DEFAULT_SORT: RiverSortKey = 'best';

export function isRiverSortKey(value: string | null | undefined): value is RiverSortKey {
  return value === 'best' || value === 'name' || value === 'length_desc' || value === 'length_asc';
}

/**
 * "Best conditions first" rank — reuses the canonical weekend ordering
 * (floatable conditions first) so the report agrees with the Weekend Forecast.
 * Lower is better; unknown/unranked sink to the bottom.
 */
export function conditionSortRank(code: string): number {
  return WEEKEND_SEVERITY[code] ?? 99;
}

/** Whether a condition counts as floatable right now (canonical floatable set). */
export function isFloatableNow(code: string): boolean {
  return WEEKEND_FLOATABLE.has(code);
}
