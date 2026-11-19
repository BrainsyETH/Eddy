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
import { directorySnapshotsFromRows, readDirectoryRows } from '@/lib/data/dam-directory-source';
import { loadDamPageSnapshot } from '@/lib/data/dam-page-snapshot';
import { getRivers } from '@/lib/data/rivers';
import { logger } from '@/lib/logger';
import { createBoundedReader } from './bounded-reader';
import { lakePageHref } from './public-pages';
import { getLake, poolDamFor, type LakeEntry } from './registry';
import { loadLakeSection } from './section';
import { buildLakeSystem } from './system';
import { loadLakeWeather } from './weather';

/**
 * The neighbours' readings, never older than a minute on this instance.
 *
 * Not the public pages' `unstable_cache` loaders: those hand an expired entry
 * of any age to the request that finds it, and a lake page is quiet enough
 * that the first reader of the morning would be shown last night's rivers
 * (see bounded-reader.ts). The dams come through the dam directory's reader,
 * which is bounded the same way, has a deadline, and re-bands every reading
 * on the request's clock.
 */
export const NEIGHBOUR_RIVERS_TTL_MS = 60_000;
const readNeighbourRivers = createBoundedReader(getRivers, NEIGHBOUR_RIVERS_TTL_MS);

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
    loadLakeWeather(entry, { now }),
    optional('rivers', slug, readNeighbourRivers, []),
    optional('neighbouring dams', slug, async () => directorySnapshotsFromRows(await readDirectoryRows(), now), []),
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
