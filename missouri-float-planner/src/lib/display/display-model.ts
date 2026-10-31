// src/lib/display/display-model.ts
// Everything the wall display (/embed/display) shows, decided in one pure pass.
//
// ── What the display is ─────────────────────────────────────────────────────
// An always-on screen for a guest house, outfitter or campground lobby. Nobody
// touches it and nobody reads it from closer than a few metres, so every
// decision here is about what a passer-by can trust at a glance: one count, one
// suggestion, the rivers around the property, and the warnings that matter.
//
// ── The rules it must not bend ──────────────────────────────────────────────
// It is the same product as the app, so it answers the same way:
//   * "Best float today" uses the iOS Today rule (eddy-ios/src/lib/
//     todayRecommendation.ts): a FRESH reading in the strict floatable bucket,
//     ranked by WEEKEND_SEVERITY, then distance to the nearest float access,
//     then reading age. A stale reading never earns a suggestion, and when
//     nothing qualifies the screen says so rather than promoting a lesser river.
//   * The floatable count is summarizeConditionCounts — the number the app and
//     the website print — so the lobby can't disagree with the phone in a
//     guest's hand.
//   * A float time comes only from /api/favorite-floats, which runs the real
//     estimate and carries the withholding reason. Nothing here computes one.
//
// Pure on purpose: no fetch, no React, no clock of its own (the caller passes
// `now`), so the web suite can hold it.

import {
  FLOATABLE_NOW,
  RUNNING_HIGH,
  WEEKEND_SEVERITY,
  conditionDef,
  summarizeConditionCounts,
  type ConditionCode,
} from '@shared/condition-system';
import { DAM_TAILWATER_TYPE, floatableHeadlineParts } from '@shared/floatable-headline';
import { isReadingStale } from '@shared/reading-staleness';
import { ratedUnit } from '@shared/reading-unit';
import type { EddyUpdateEntry, RiverAlert, RiverListItem } from '@/types/api';

/** Same radius the app's Today tab uses for "nearby". */
export const DISPLAY_RADIUS_MILES = 100;
/** Rows the river list can hold on a 1080p screen at TV reading size. */
export const DISPLAY_LIST_LIMIT = 6;

export interface DisplayCoords {
  lat: number;
  lng: number;
}

/** The subset of a /api/favorite-floats?v=2 row the display reads. */
export interface DisplayFavoriteFloat {
  riverSlug: string;
  putInId: string;
  putInName: string;
  takeOutId: string;
  takeOutName: string;
  distanceMiles: number | null;
  durationFormatted: string | null;
  durationUnavailableReason?: string | null;
}

export interface DisplayInput {
  rivers: RiverListItem[];
  updates?: Record<string, EddyUpdateEntry> | null;
  statewide?: { prose: string; generatedAt: string } | null;
  alerts?: RiverAlert[] | null;
  floats?: DisplayFavoriteFloat[] | null;
  coords?: DisplayCoords | null;
  /** Slugs the host chose, in their order. Overrides distance ordering. */
  pinned?: string[] | null;
}

export interface DisplayRiver {
  slug: string;
  name: string;
  code: ConditionCode;
  label: string;
  /** "2.57 ft" or "756 cfs"; null when the rated unit has no reading. */
  reading: string | null;
  ageHours: number | null;
  stale: boolean;
  trend: 'rising' | 'falling' | 'steady' | null;
  distanceMiles: number | null;
  riverType: string | null;
}

export interface DisplayBest {
  river: DisplayRiver;
  trip: {
    putInId: string;
    putInName: string;
    takeOutId: string;
    takeOutName: string;
    distanceMiles: number | null;
    /** Formatted float time, or null when withheld or unavailable. */
    duration: string | null;
    /** Why there is no time, in reader-facing words. */
    withheld: string | null;
  } | null;
}

export interface DisplayRead {
  slug: string;
  name: string;
  code: ConditionCode;
  text: string;
}

export interface DisplayNotice {
  key: string;
  tone: 'danger' | 'caution';
  title: string;
  detail: string;
}

export interface DisplayModel {
  headline: string | null;
  /** Caveat for the dam tailwaters held out of the count, as the app shows it. */
  headlineNote: string | null;
  /** Floatable free-flowing rivers; dam tailwaters are never counted. */
  floatable: number;
  /** Free-flowing rivers, the headline's denominator. */
  total: number;
  mix: Array<{ code: ConditionCode; count: number }>;
  best: DisplayBest | null;
  /** Shown in place of the best card when nothing qualifies. */
  emptyBest: string;
  rivers: DisplayRiver[];
  reads: DisplayRead[];
  notices: DisplayNotice[];
  /** Age of the freshest reading on screen, for the header's freshness line. */
  freshestAgeHours: number | null;
}

const MIX_ORDER: ConditionCode[] = ['flowing', 'good', 'low', 'too_low', 'high', 'dangerous', 'unknown'];

/** Great-circle miles. Local rather than @eddy/geo: Vercel cannot resolve packages/. */
export function milesBetween(a: DisplayCoords, b: DisplayCoords): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 3958.8 * 2 * Math.asin(Math.sqrt(h));
}

/** No gauge fallback: a gauge can sit far from every usable launch. */
export function nearestAccessMiles(river: RiverListItem, coords: DisplayCoords): number | null {
  let nearest = Infinity;
  for (const point of river.floatAccessCoordinates ?? []) {
    if (!Number.isFinite(point.lat) || !Number.isFinite(point.lng)) continue;
    if (Math.abs(point.lat) > 90 || Math.abs(point.lng) > 180 || (point.lat === 0 && point.lng === 0)) continue;
    nearest = Math.min(nearest, milesBetween(coords, point));
  }
  return Number.isFinite(nearest) ? nearest : null;
}

/** The rated unit's reading only. A declared unit with no value shows nothing. */
export function formatReading(condition: RiverListItem['currentCondition']): string | null {
  if (!condition) return null;
  const unit = ratedUnit(condition);
  if (unit === 'cfs') return condition.dischargeCfs != null ? `${Math.round(condition.dischargeCfs).toLocaleString('en-US')} cfs` : null;
  if (unit === 'ft') return condition.gaugeHeightFt != null ? `${condition.gaugeHeightFt.toFixed(2)} ft` : null;
  return null;
}

function toDisplayRiver(river: RiverListItem, coords: DisplayCoords | null): DisplayRiver {
  const condition = river.currentCondition;
  const code = (condition?.code ?? 'unknown') as ConditionCode;
  const ageHours = condition?.readingAgeHours ?? null;
  return {
    slug: river.slug,
    name: river.name,
    code,
    label: conditionDef(code).label,
    reading: formatReading(condition),
    ageHours,
    stale: isReadingStale(ageHours),
    trend: condition?.trend?.direction ?? null,
    distanceMiles: coords ? nearestAccessMiles(river, coords) : null,
    riverType: river.riverType ?? null,
  };
}

/** Positive guidance needs a fresh, usable reading in the strict floatable bucket. */
export function isBestEligible(river: DisplayRiver): boolean {
  return FLOATABLE_NOW.has(river.code) && river.reading != null && !river.stale;
}

const rank = (code: string) => WEEKEND_SEVERITY[code] ?? WEEKEND_SEVERITY.unknown;

function withheldCopy(reason: string | null | undefined, riverType: string | null): string | null {
  if (reason === 'regulated' || riverType === 'dam_tailwater') return 'Dam releases can change mid-float, so there is no single time.';
  if (reason === 'dangerous') return 'No float time in flood.';
  if (reason) return 'Float time unavailable right now.';
  return null;
}

function pickTrip(best: DisplayRiver, floats: DisplayFavoriteFloat[]): DisplayBest['trip'] {
  const options = floats.filter((f) => f.riverSlug === best.slug);
  if (options.length === 0) return null;
  // Prefer a stretch with a real estimate; otherwise show the stretch with its reason.
  const chosen = options.find((f) => f.durationFormatted) ?? options[0];
  const withheld = withheldCopy(chosen.durationUnavailableReason, best.riverType);
  return {
    putInId: chosen.putInId,
    putInName: chosen.putInName,
    takeOutId: chosen.takeOutId,
    takeOutName: chosen.takeOutName,
    distanceMiles: chosen.distanceMiles,
    duration: withheld ? null : chosen.durationFormatted,
    withheld: withheld ?? (chosen.durationFormatted ? null : 'Float time unavailable right now.'),
  };
}

function agePhrase(hours: number | null): string {
  if (hours == null) return 'no recent reading';
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} min ago`;
  return `${Math.round(hours)} h ago`;
}

export function displayAgeLabel(hours: number | null): string {
  return agePhrase(hours);
}

export function buildDisplayModel(input: DisplayInput): DisplayModel {
  const coords = input.coords ?? null;
  const all = input.rivers.map((r) => toDisplayRiver(r, coords));

  const counts = summarizeConditionCounts(input.rivers.map((r) => r.currentCondition?.code));
  // The headline tally leaves dam tailwaters out, exactly as the app's Ozarks
  // pulse does; `mix` below still shows every river on the wall.
  const headlineParts = floatableHeadlineParts(
    input.rivers.map((r) => ({ code: r.currentCondition?.code, riverType: r.riverType })),
  );
  const freeCounts = summarizeConditionCounts(
    input.rivers.filter((r) => r.riverType !== DAM_TAILWATER_TYPE).map((r) => r.currentCondition?.code),
  );
  const mix = MIX_ORDER.map((code) => ({ code, count: counts.byCode[code] })).filter((m) => m.count > 0);

  // The rivers on screen: the host's pins in their order, else the nearest
  // within range, else (no location) floatable first statewide.
  let local: DisplayRiver[];
  const pinned = (input.pinned ?? []).filter(Boolean);
  if (pinned.length > 0) {
    const bySlug = new Map(all.map((r) => [r.slug, r]));
    local = pinned.map((s) => bySlug.get(s)).filter((r): r is DisplayRiver => Boolean(r));
  } else if (coords) {
    local = all
      .filter((r) => r.distanceMiles != null && r.distanceMiles <= DISPLAY_RADIUS_MILES)
      .sort((a, b) => (a.distanceMiles ?? Infinity) - (b.distanceMiles ?? Infinity));
  } else {
    local = [...all].sort((a, b) => rank(a.code) - rank(b.code) || a.name.localeCompare(b.name));
  }

  const best = [...local]
    .filter(isBestEligible)
    .sort((a, b) =>
      rank(a.code) - rank(b.code) ||
      (a.distanceMiles ?? Infinity) - (b.distanceMiles ?? Infinity) ||
      (a.ageHours ?? Infinity) - (b.ageHours ?? Infinity) ||
      a.name.localeCompare(b.name))[0] ?? null;

  const shown = local.slice(0, DISPLAY_LIST_LIMIT);
  const updates = input.updates ?? {};
  const reads: DisplayRead[] = [];
  for (const r of shown) {
    const text = updates[r.slug]?.summaryText?.trim();
    if (text) reads.push({ slug: r.slug, name: r.name, code: r.code, text });
  }
  if (reads.length === 0 && input.statewide?.prose) {
    reads.push({ slug: 'statewide', name: 'Across the Ozarks', code: 'unknown', text: input.statewide.prose });
  }

  // Warnings that concern the rivers on screen: high water Eddy measured,
  // then agency warnings and watches. Notices (closures, info) stay on the
  // river pages — a lobby screen is not the place for a road-work bulletin.
  const onScreen = new Set(local.map((r) => r.slug));
  const notices: DisplayNotice[] = [];
  for (const r of local) {
    if (RUNNING_HIGH.has(r.code) && !r.stale) {
      notices.push({
        key: `high:${r.slug}`,
        tone: r.code === 'dangerous' ? 'danger' : 'caution',
        title: r.code === 'dangerous' ? `${r.name} is in flood` : `${r.name} is running high`,
        detail: r.code === 'dangerous' ? 'Stay off the water.' : 'Faster, pushier water. Check the gauge before you launch.',
      });
    }
  }
  for (const a of input.alerts ?? []) {
    if (!onScreen.has(a.riverSlug) || a.severity === 'notice') continue;
    notices.push({ key: `alert:${a.id}`, tone: a.severity === 'warning' ? 'danger' : 'caution', title: a.title, detail: a.riverName });
  }

  const ages = shown.map((r) => r.ageHours).filter((h): h is number => h != null);
  const emptyBest = coords
    ? `No river within ${DISPLAY_RADIUS_MILES} miles has a fresh floatable reading right now.`
    : 'No river has a fresh floatable reading right now.';

  return {
    headline: headlineParts.headline,
    headlineNote: headlineParts.tailwaterNote,
    floatable: freeCounts.floatableNow,
    total: freeCounts.total,
    mix,
    best: best ? { river: best, trip: pickTrip(best, input.floats ?? []) } : null,
    emptyBest,
    rivers: shown,
    reads,
    notices,
    freshestAgeHours: ages.length ? Math.min(...ages) : null,
  };
}

/** Parse the host's ?lat=&lng= pair; anything malformed means "no location". */
export function parseCoords(lat: string | null, lng: string | null): DisplayCoords | null {
  if (lat == null || lng == null || lat.trim() === '' || lng.trim() === '') return null;
  const la = Number(lat);
  const ln = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(ln) || Math.abs(la) > 90 || Math.abs(ln) > 180) return null;
  return { lat: la, lng: ln };
}
