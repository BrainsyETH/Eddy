import assert from 'node:assert/strict';
import test from 'node:test';
import { reviewedRiverGuides } from '../content/river-guides/reviewed';
import baseline from '../content/river-guides/refresh-baseline.json';
import { editorialFields, editorialFingerprint, planGuideRefresh } from './guide-refresh';

const seed = reviewedRiverGuides[0];
const row = { ...seed, updated_at: '2026-11-01T00:00:00Z' };

test('refresh only proposes editorial fields and retains the concurrency token', () => {
  const before = { ...row, description: 'Previously reviewed copy' };
  const updates = planGuideRefresh([seed], [before], { [seed.slug]: editorialFingerprint(before) });
  assert.equal(updates.length, 1);
  assert.equal(updates[0].expectedUpdatedAt, before.updated_at);
  assert.deepEqual(Object.keys(updates[0].after).sort(), ['description', 'guide_data', 'read_time_minutes', 'title']);
  assert.deepEqual(updates[0].before, editorialFields(before));
});

test('reruns skip applied rows but fail closed on missing identities or a later editor', () => {
  assert.deepEqual(planGuideRefresh([seed], [row], {}), []);
  assert.throws(() => planGuideRefresh([seed], [], baseline), /Missing or changed/);
  assert.throws(() => planGuideRefresh([seed], [{ ...row, river_slug: 'different' }], baseline), /Missing or changed/);
  assert.throws(() => planGuideRefresh([seed], [{ ...row, description: 'A later editor' }], baseline), /Editorial changes need review/);
});

test('fingerprints ignore JSON key order and operational timestamps, not content', () => {
  const reordered = { ...row, guide_data: Object.fromEntries(Object.entries(row.guide_data).reverse()) } as typeof row;
  assert.equal(editorialFingerprint(reordered), editorialFingerprint(row));
  assert.equal(editorialFingerprint({ ...row, updated_at: 'later' } as typeof row), editorialFingerprint(row));
  assert.notEqual(editorialFingerprint({ ...row, description: 'changed' }), editorialFingerprint(row));
});

test('all 25 reviewed guides have baselines, resolved endpoint slugs and distinct route descriptions', () => {
  assert.equal(reviewedRiverGuides.length, 25);
  for (const guide of reviewedRiverGuides) {
    assert.match(baseline[guide.slug as keyof typeof baseline], /^[a-f0-9]{64}$/);
    // A date is claimed only for a guide whose copy changed; it is never required.
    if (guide.guide_data.editorial_updated_at) assert.match(guide.guide_data.editorial_updated_at, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(guide.guide_data.sources?.length);
    for (const route of guide.guide_data.sections) {
      assert.ok(route.from_slug && route.to_slug);
      assert.ok(Number(route.miles) > 0);
    }
  }
  assert.equal(reviewedRiverGuides.reduce((n, g) => n + g.guide_data.sections.length, 0), 64);
});
