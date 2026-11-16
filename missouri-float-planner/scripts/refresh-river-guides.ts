/** Preview by default. --apply writes reviewed editorial fields only; --river=slug
 * limits a release batch. Requires EXPECTED_SUPABASE_REF for writes. */
import { getScriptClient } from './lib/db';
import { reviewedRiverGuides } from './content/river-guides/reviewed';
import baseline from './content/river-guides/refresh-baseline.json';
import { editorialFingerprint, planGuideRefresh, type CurrentGuide } from './lib/guide-refresh';
import { planRiverGuideSeeds } from './lib/river-guide-seeds';

async function main() {
  const args = process.argv.slice(2);
  if (args.some(arg => arg !== '--apply' && !/^--river=[a-z-]+$/.test(arg))) throw new Error('Use --apply and/or --river=slug');
  const selected = args.filter(arg => arg.startsWith('--river=')).map(arg => arg.slice(8));
  if (selected.some(slug => !reviewedRiverGuides.some(seed => seed.river_slug === slug))) throw new Error('Unknown river selection');
  const seeds = reviewedRiverGuides.filter(seed => !selected.length || selected.includes(seed.river_slug));
  const apply = args.includes('--apply');
  const db = getScriptClient({ script: 'refresh-river-guides', write: apply });
  const [posts, rivers, accesses] = await Promise.all([
    db.from('blog_posts').select('slug, river_slug, title, description, guide_data, read_time_minutes, updated_at').in('slug', seeds.map(s => s.slug)),
    db.from('rivers').select('id, slug, active').in('slug', seeds.map(s => s.river_slug)),
    db.from('access_points').select('river_id, slug, approved, is_float_endpoint, river_mile_downstream').in('slug',
      [...new Set(seeds.flatMap(s => s.guide_data.sections.flatMap(route => [route.from_slug!, route.to_slug!])))]),
  ]);
  for (const result of [posts, rivers, accesses]) if (result.error) throw result.error;
  // Existing seed validation checks endpoint permissions, direction and mileage.
  planRiverGuideSeeds(seeds, rivers.data ?? [], accesses.data ?? [], []);
  const updates = planGuideRefresh(seeds, (posts.data ?? []) as CurrentGuide[], baseline);
  console.log(JSON.stringify({ mode: apply ? 'apply' : 'preview', updates, unchanged: seeds.length - updates.length }, null, 2));
  if (!apply) return;
  for (const update of updates) {
    const result = await db.from('blog_posts').update(update.after).eq('slug', update.slug)
      .eq('updated_at', update.expectedUpdatedAt).select('slug');
    if (result.error) throw result.error;
    if (result.data?.length !== 1) throw new Error(`Concurrent change; stopped before overwriting ${update.slug}. Earlier rows may have completed; rerun the preview.`);
    const verified = await db.from('blog_posts').select('title, description, guide_data, read_time_minutes').eq('slug', update.slug).single();
    if (verified.error) throw verified.error;
    if (editorialFingerprint(verified.data) !== editorialFingerprint(update.after)) throw new Error(`Read-back mismatch: ${update.slug}`);
    console.log(`Verified ${update.slug}`);
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
