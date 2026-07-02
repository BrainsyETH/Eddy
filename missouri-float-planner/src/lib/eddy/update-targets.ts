// src/lib/eddy/update-targets.ts
// DB-driven Eddy update targets: one whole-river target per active river,
// plus one per row in river_sections. Replaces the hardcoded RIVER_SECTIONS
// array in src/data/river-sections.ts (kept as a fallback for environments
// that predate migration 00143).

import { createAdminClient } from '@/lib/supabase/admin';
import {
  getUpdateTargets as getLegacyUpdateTargets,
  type UpdateTarget,
} from '@/data/river-sections';

export type { UpdateTarget };

const CACHE_TTL_MS = 5 * 60 * 1000;
let cached: { targets: UpdateTarget[]; loadedAt: number } | null = null;

/**
 * Update targets for all active rivers, from the database.
 * Falls back to the legacy hardcoded list if the query fails or the
 * river_sections migration hasn't run yet (rivers with zero rows still get
 * their whole-river target from the rivers table itself).
 */
export async function getUpdateTargetsFromDb(): Promise<UpdateTarget[]> {
  if (cached && Date.now() - cached.loadedAt < CACHE_TTL_MS) {
    return cached.targets;
  }

  try {
    const supabase = createAdminClient();
    const [riversResult, sectionsResult] = await Promise.all([
      supabase.from('rivers').select('slug, name').eq('active', true).order('name'),
      supabase
        .from('river_sections')
        .select('section_slug, name, description, sort_order, rivers!inner(slug, name, active)')
        .eq('rivers.active', true)
        .order('sort_order'),
    ]);

    if (riversResult.error || !riversResult.data || riversResult.data.length === 0) {
      console.warn('[UpdateTargets] rivers query failed; using legacy hardcoded list:', riversResult.error);
      return getLegacyUpdateTargets();
    }

    const targets: UpdateTarget[] = [];

    // Whole-river target for every active river (frontend default fetch).
    for (const river of riversResult.data) {
      targets.push({
        riverSlug: river.slug,
        riverName: river.name,
        sectionSlug: null,
        sectionName: null,
        sectionDescription: null,
      });
    }

    // Per-section targets where sections are defined.
    if (!sectionsResult.error && sectionsResult.data) {
      for (const rawSection of sectionsResult.data) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const section = rawSection as any;
        const river = section.rivers;
        if (!river?.slug) continue;
        targets.push({
          riverSlug: river.slug,
          riverName: river.name,
          sectionSlug: section.section_slug,
          sectionName: section.name,
          sectionDescription: section.description,
        });
      }
    } else if (sectionsResult.error) {
      console.warn('[UpdateTargets] river_sections query failed (pre-migration DB?):', sectionsResult.error);
    }

    cached = { targets, loadedAt: Date.now() };
    return targets;
  } catch (e) {
    console.error('[UpdateTargets] Failed to load targets from DB; using legacy list:', e);
    return getLegacyUpdateTargets();
  }
}
