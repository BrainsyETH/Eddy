/** Run from missouri-float-planner:
 *   npx tsx scripts/seed-river-guides.ts                 # read-only preview
 *   npx tsx scripts/seed-river-guides.ts --apply         # insert missing drafts
 *   npx tsx scripts/seed-river-guides.ts --apply --publish # insert published
 * Existing posts are never overwritten or republished. Review/publish existing
 * drafts through /admin/blog. Writes require the shared project-ref guard.
 */
import { getScriptClient } from './lib/db';
import { riverGuideSeeds } from './content/river-guides';
import { guideInsertRow, planRiverGuideSeeds } from './lib/river-guide-seeds';

async function main() {
  const flags = process.argv.slice(2);
  if (flags.some(flag => !['--apply', '--publish'].includes(flag))) throw new Error('Use --apply and/or --publish; no other flags are supported.');
  const apply = flags.includes('--apply');
  const publish = flags.includes('--publish');
  const db = getScriptClient({ script: 'seed-river-guides', write: apply });
  const [rivers, accesses, posts] = await Promise.all([
    db.from('rivers').select('id, slug, active').in('slug', riverGuideSeeds.map(seed => seed.river_slug)),
    db.from('access_points').select('river_id, slug, approved, is_float_endpoint, river_mile_downstream')
      .in('slug', [...new Set(riverGuideSeeds.flatMap(seed => seed.guide_data.sections.flatMap(section => [section.from_slug, section.to_slug])))]),
    db.from('blog_posts').select('slug, river_slug'),
  ]);
  for (const result of [rivers, accesses, posts]) if (result.error) throw result.error;
  const plan = planRiverGuideSeeds(riverGuideSeeds, rivers.data ?? [], accesses.data ?? [], posts.data ?? []);
  console.log(JSON.stringify({ mode: apply ? 'apply' : 'preview', status: publish ? 'published' : 'draft',
    add: plan.additions.map(seed => seed.slug), preserve: plan.skipped }, null, 2));
  if (!apply || !plan.additions.length) return;

  // One insert, no upsert: a concurrent insertion of any same-slug post fails
  // the statement rather than replacing content or partially importing a batch.
  const rows = plan.additions.map(seed => guideInsertRow(seed, publish, new Date().toISOString()));
  const inserted = await db.from('blog_posts').insert(rows).select('slug');
  if (inserted.error) throw inserted.error;
  if (inserted.data?.length !== rows.length) throw new Error('Inserted count did not match the preview.');
  const verified = await db.from('blog_posts').select('slug, status, river_slug, guide_data')
    .in('slug', rows.map(row => row.slug));
  if (verified.error) throw verified.error;
  for (const row of rows) {
    const saved = verified.data?.find(post => post.slug === row.slug);
    if (!saved || saved.status !== row.status || saved.river_slug !== row.river_slug || !saved.guide_data) {
      throw new Error(`Read-back failed: ${row.slug}`);
    }
  }
  console.log(`Verified ${rows.length} ${publish ? 'published guides' : 'drafts'}.`);
}

main().catch(error => { console.error(error); process.exitCode = 1; });
