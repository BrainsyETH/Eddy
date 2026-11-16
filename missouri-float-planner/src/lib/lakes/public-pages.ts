import { getLake, lakeForDam, type LakeEntry } from './registry';

// Add a slug only after the release checklist in LAKES_DAMS_EXPERIENCE_PLAN
// records the migration, real history and approved launch coverage. This is
// an editorial release decision, never a transient database-health check.
const APPROVED_LAKE_PAGES: readonly string[] = ['table-rock', 'truman'];

// Existing dam pages are public already. Their lake preview needs a separate
// release decision; registry membership is not approval. The shared photo header
// and measurement styling are independent of lake publication (ADR 0019).
// Background collection can run while both public UI gates remain closed.
const APPROVED_DAM_LAKE_EXPERIENCES: readonly string[] = ['table-rock', 'truman'];

export function damLakeExperienceEnabled(damId: string): boolean {
  const lake = lakeForDam(damId);
  return Boolean(lake && APPROVED_DAM_LAKE_EXPERIENCES.includes(lake.slug));
}

export function publishedLakes(): LakeEntry[] {
  return APPROVED_LAKE_PAGES.flatMap((slug) => { const lake = getLake(slug); return lake ? [lake] : []; });
}

export function lakePageHref(slug: string): string | undefined {
  return APPROVED_LAKE_PAGES.includes(slug) && getLake(slug) ? `/lakes/${slug}` : undefined;
}
