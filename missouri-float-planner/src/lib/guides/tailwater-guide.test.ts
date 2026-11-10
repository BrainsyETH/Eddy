import assert from 'node:assert/strict';
import test from 'node:test';
import { tailwaterGuideSeeds, insertableGuideSeeds } from '../../../scripts/content/river-guides';
import { guideDam } from './dam';

test('a tailwater guide leads with the dam and never clears the water', () => {
  assert.equal(new Set(insertableGuideSeeds.map(seed => seed.slug)).size, insertableGuideSeeds.length);
  for (const seed of tailwaterGuideSeeds) {
    const g = seed.guide_data;
    // The dam section is drawn from the registry, so the river must have a dam with a schedule.
    assert.equal(guideDam(seed.river_slug)?.hydro, true, seed.slug);
    // Speed depends on the release: no fixed float time, and the planner withholds one too.
    for (const route of g.sections) {
      assert.equal(route.time, undefined, `${seed.slug} route ${route.id}`);
      assert.ok(route.from_slug && route.to_slug && Number(route.miles) > 0);
    }
    const text = JSON.stringify(g);
    assert.match(text, /does not tell you the water is safe/);
    assert.doesNotMatch(text, /safe to wade (?:when|at|below)|good to go|you(?:'|’)re cleared|wadeable (?:at|below|under)/i);
    assert.ok((g.sources?.length ?? 0) >= 3 && g.checked_at && g.editorial_updated_at, seed.slug);
    assert.notEqual(seed.description, g.hero.lede);
  }
});
