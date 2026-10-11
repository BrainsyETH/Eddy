import type { GuideData } from '../../src/types/blog';

export interface RiverGuideSeed {
  slug: string;
  title: string;
  description: string;
  river_slug: string;
  featured_image_url: string;
  read_time_minutes: number;
  guide_data: GuideData;
  og_image_url?: string;
}

export interface GuideRiver { id: string; slug: string; active: boolean }
export interface GuideAccess {
  river_id: string;
  slug: string;
  approved: boolean;
  is_float_endpoint: boolean | null;
  river_mile_downstream: number | null;
}
export interface ExistingGuide { slug: string; river_slug: string | null }

/** Fail the whole preview before writing if route facts have drifted. Existing
 * editorial work always wins, including a draft or scheduled guide. */
export function planRiverGuideSeeds(
  seeds: readonly RiverGuideSeed[], rivers: GuideRiver[], accesses: GuideAccess[], existing: ExistingGuide[],
): { additions: RiverGuideSeed[]; skipped: string[] } {
  const additions: RiverGuideSeed[] = [];
  const skipped: string[] = [];
  const slugs = new Set<string>();
  const riverSlugs = new Set<string>();
  for (const seed of seeds) {
    if (slugs.has(seed.slug) || riverSlugs.has(seed.river_slug)) throw new Error(`Duplicate guide: ${seed.slug}`);
    slugs.add(seed.slug); riverSlugs.add(seed.river_slug);
    if (existing.some(post => post.slug === seed.slug || post.river_slug === seed.river_slug)) {
      skipped.push(seed.river_slug); continue;
    }
    const river = rivers.find(row => row.slug === seed.river_slug);
    if (!river?.active) throw new Error(`Missing or inactive river: ${seed.river_slug}`);
    for (const section of seed.guide_data.sections) {
      const from = accesses.find(row => row.river_id === river.id && row.slug === section.from_slug);
      const to = accesses.find(row => row.river_id === river.id && row.slug === section.to_slug);
      if (!from?.approved || !to?.approved || from.is_float_endpoint === false || to.is_float_endpoint === false ||
        from.river_mile_downstream == null || to.river_mile_downstream == null) {
        throw new Error(`Unusable guide endpoints: ${seed.river_slug} / ${section.name}`);
      }
      const distance = to.river_mile_downstream - from.river_mile_downstream;
      if (distance <= 0 || !Number.isFinite(Number(section.miles)) || Math.abs(distance - Number(section.miles)) > 0.15) {
        throw new Error(`Guide mileage needs review: ${seed.river_slug} / ${section.name}`);
      }
    }
    additions.push(seed);
  }
  return { additions, skipped };
}

export function guideInsertRow(seed: RiverGuideSeed, published: boolean, now: string) {
  return {
    slug: seed.slug, title: seed.title, description: seed.description,
    river_slug: seed.river_slug, category: 'River Guides',
    featured_image_url: seed.featured_image_url, og_image_url: seed.og_image_url ?? seed.featured_image_url,
    read_time_minutes: seed.read_time_minutes, guide_data: seed.guide_data,
    meta_keywords: [seed.guide_data.hero.title_top, 'float trip guide', 'river access', 'Eddy'],
    status: published ? 'published' : 'draft', published_at: published ? now : null,
  };
}
