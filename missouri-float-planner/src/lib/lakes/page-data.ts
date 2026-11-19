// src/lib/lakes/page-data.ts
// Everything a lake destination shows, read once: the level section the dam
// page already builds, plus the wind and the lake's neighbours.
//
// One loader on purpose. /lakes/[slug] and /api/lakes/[slug] both call it, so
// the web page and the iOS screen cannot disagree about a lake (the wire
// promotion LAKES_AND_LAUNCHES_PLAN_2026-11-09.md §3 planned for the day a
// lake earned a page). The dam page keeps calling loadLakeSection directly:
// its preview has the dam above it and pays for neither weather nor rivers.
//
// The optional parts fail to "absent", each on its own. Only an unpublished or
// unknown lake returns null.

import type { DamSnapshot } from '@shared/dam-types';
import type { LakeSection } from '@shared/lake-types';
import { loadDamPageSnapshot } from '@/lib/data/dam-page-snapshot';
import { pageDamSummaries, pageRivers } from '@/lib/data/public-pages';
import { logger } from '@/lib/logger';
import { lakePageHref } from './public-pages';
import { getLake, poolDamFor, type LakeEntry } from './registry';
import { loadLakeSection } from './section';
import { buildLakeSystem } from './system';
import { loadLakeWeather } from './weather';

export interface LakePageData {
  entry: LakeEntry;
  dam: { id: string; name: string };
  section: LakeSection;
}

async function optional<T>(what: string, slug: string, read: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await read();
  } catch (error) {
    logger.warn(`lake ${what} unavailable`, { lake: slug, error: error instanceof Error ? error.message : String(error) });
    return fallback;
  }
}

export async function loadLakePage(slug: string, now = Date.now()): Promise<LakePageData | null> {
  const entry = getLake(slug);
  if (!entry || !lakePageHref(slug)) return null;
  const damEntry = poolDamFor(entry);
  if (!damEntry) return null;

  const dam: DamSnapshot | null = await loadDamPageSnapshot(damEntry.id, now);
  const [section, weather, rivers, dams] = await Promise.all([
    loadLakeSection(damEntry.id, dam?.metrics.poolElevation, now),
    loadLakeWeather(entry),
    optional('rivers', slug, pageRivers, []),
    optional('neighbouring dams', slug, pageDamSummaries, []),
  ]);
  if (!section) return null;

  section.dam = { id: damEntry.id, name: damEntry.name };
  if (weather) section.weather = weather;
  section.system = buildLakeSystem({
    lake: entry,
    dam,
    dams: new Map(dams.map((d) => [d.id, d])),
    rivers: new Map(rivers.map((r) => [r.slug, r])),
  });
  return { entry, dam: section.dam, section };
}
