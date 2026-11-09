import { getLake, type LakeEntry } from './registry';

// Add a slug only after the release checklist in LAKES_DAMS_EXPERIENCE_PLAN
// records the migration, real history and approved launch coverage. This is
// an editorial release decision, never a transient database-health check.
const APPROVED_LAKE_PAGES: readonly string[] = [];

export function publishedLakes(): LakeEntry[] {
  return APPROVED_LAKE_PAGES.flatMap((slug) => { const lake = getLake(slug); return lake ? [lake] : []; });
}

export function lakePageHref(slug: string): string | undefined {
  return APPROVED_LAKE_PAGES.includes(slug) && getLake(slug) ? `/lakes/${slug}` : undefined;
}
