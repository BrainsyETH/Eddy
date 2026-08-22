// src/lib/eddy/update-targets.ts
// DB-driven Eddy update targets: one whole-river target per active river,
// plus one per row in river_sections. Canonical metadata is required: a
// deployment without migrations 00145/00146 must fail observably rather than
// quietly generating updates from an obsolete, partial river list.

import { createAdminClient } from '@/lib/supabase/admin';
import type { RiverType } from '@/lib/rivers/context';

export interface UpdateTarget {
  riverSlug: string;
  riverName: string;
  sectionSlug: string | null;
  sectionName: string | null;
  sectionDescription: string | null;
  sectionRiverType: RiverType | null;
  sectionLowWaterMeaning: string | null;
  sectionRisingWaterHazards: string | null;
}

const CACHE_TTL_MS = 5 * 60 * 1000;
let cached: { targets: UpdateTarget[]; loadedAt: number } | null = null;

/**
 * Update targets for all active rivers, from the database.
 * Rivers with zero section rows still get a whole-river target. Query failures
 * throw so monitoring records the failed generation pass.
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
        .select('section_slug, name, description, sort_order, river_type, low_water_meaning, rising_water_hazards, rivers!inner(slug, name, active)')
        .eq('rivers.active', true)
        .order('sort_order'),
    ]);

    if (riversResult.error || !riversResult.data || riversResult.data.length === 0) {
      throw new Error(`[UpdateTargets] active rivers unavailable: ${riversResult.error?.message ?? 'query returned no rows'}`);
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
        sectionRiverType: null,
        sectionLowWaterMeaning: null,
        sectionRisingWaterHazards: null,
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
          // Null on every section except a reach that genuinely differs, e.g.
          // the Black below Clearwater Dam (migration 00204).
          sectionRiverType: section.river_type ?? null,
          sectionLowWaterMeaning: section.low_water_meaning ?? null,
          sectionRisingWaterHazards: section.rising_water_hazards ?? null,
        });
      }
    } else if (sectionsResult.error) {
      throw new Error(`[UpdateTargets] river_sections unavailable: ${sectionsResult.error.message}`);
    }

    cached = { targets, loadedAt: Date.now() };
    return targets;
  } catch (e) {
    console.error('[UpdateTargets] Failed to load canonical targets:', e);
    throw e;
  }
}
