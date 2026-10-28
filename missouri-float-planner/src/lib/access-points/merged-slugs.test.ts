import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MERGED_ACCESS_SLUGS, mergedAccessSlug } from './merged-slugs';
import { parseSeedAccessPoints } from '../access-slugs';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

test('a merged access slug resolves to its canonical record, per river', () => {
  assert.equal(mergedAccessSlug('current', 'van-buren'), 'van-buren-riverfront-park');
  assert.equal(mergedAccessSlug('jacks-fork', 'van-buren'), null, 'slugs are unique per river only');
  assert.equal(mergedAccessSlug('current', 'van-buren-riverfront-park'), null);
});

test('no merge points at another retired slug, so a redirect never chains', () => {
  for (const m of MERGED_ACCESS_SLUGS) {
    assert.equal(mergedAccessSlug(m.river, m.mergedInto), null, `${m.river}/${m.mergedInto} is itself retired`);
    assert.notEqual(m.slug, m.mergedInto);
  }
});

test('the seed creates the canonical record and never the retired one', () => {
  // The seed upserts with approved = EXCLUDED.approved, so a retired slug left
  // in it would be re-approved by the next seed run.
  const { rows } = parseSeedAccessPoints(read('supabase/seed/access_points.sql'));
  const seeded = new Set(rows.map((r) => `${r.river} ${r.slug}`));
  for (const m of MERGED_ACCESS_SLUGS) {
    assert.equal(seeded.has(`${m.river} ${m.slug}`), false, `the seed still creates ${m.river}/${m.slug}`);
  }
  assert.ok(seeded.has('current van-buren-riverfront-park'));
});

test('the access detail page redirects a merged slug before it 404s', () => {
  const page = read('src/app/rivers/[state]/[slug]/access/[accessSlug]/page.tsx');
  const notFoundBranch = page.slice(page.indexOf('if (!result.ok)'), page.indexOf('notFound();'));
  assert.match(notFoundBranch, /mergedAccessSlug\(riverSlug, accessSlug\)/);
  assert.match(notFoundBranch, /permanentRedirect\(/);
});
