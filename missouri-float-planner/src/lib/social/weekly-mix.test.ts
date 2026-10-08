import test from 'node:test';
import assert from 'node:assert/strict';
import { blogHighlights } from './blog-highlights';
import { buildBlogCaption } from './blog-poster';
import { selectWeekendReads, weekendReadDue, weekendReadExclusion, weekendReadCaption, weekendReadText, type WeekendReadSource } from './weekend-read';
import { buildPostContext } from './post-context';
import { POST_TYPES } from './post-types';

const now = new Date('2026-10-08T22:00:00Z');
function river(slug: string, overrides: Partial<WeekendReadSource> = {}): WeekendReadSource {
  return { river_slug: slug, condition_code: 'good', gauge_height_ft: 3,
    summary_text: 'A steady reading at the local gauge; check your chosen stretch before leaving.',
    generated_at: '2026-10-08T11:00:00Z', reading_timestamp: '2026-10-08T21:00:00Z',
    snapshot_id: 'snapshot', ...overrides };
}

test('Blog posts reuse complete published highlights and preserve qualifications', () => {
  const data = { why_different: [{ strong: 'Caves along the river.', body: 'Visit the public cave tour before your float.' }],
    pro_tips: [{ strong: 'Pick the right gauge.', body: 'Conditions differ by stretch; a lower reading does not describe the upper river.' }],
    pre_launch_notes: [{ strong: 'Book your shuttle.', body: 'Reserve ahead on busy summer weekends.' }] };
  const highlights = blogHighlights(data);
  assert.equal(highlights.length, 3);
  assert.match(highlights[1], /does not describe the upper river\.$/);
  const caption = buildBlogCaption({ id: 'id', slug: 'guide', title: 'River guide', description: 'Teaser.',
    og_image_url: null, featured_image_url: null, river_slug: 'current', last_shared_at: null, guide_data: data });
  assert.ok(highlights.every(point => caption.includes(point)));
  assert.ok(caption.indexOf('•') < caption.indexOf('Read the full guide'));
  assert.ok(!caption.includes('Teaser.'));
});

test('Blog highlights support general articles and skip malformed or oversized points without cutting them', () => {
  assert.deepEqual(blogHighlights(null), []);
  assert.deepEqual(blogHighlights({ pro_tips: [null, { strong: 'No', body: 'x'.repeat(500) }] }), []);
  assert.deepEqual(blogHighlights({ kind: 'article', blocks: [{ type: 'bullets', bullets: [
    { strong: '<b>Before leaving.</b>', body: 'Confirm your take-out and arrange the shuttle.' },
  ] }] }), ['Before leaving. Confirm your take-out and arrange the shuttle.']);
});

test('weekly Read needs 2–3 distinct reconciled fresh rivers and never revives blanked prose', () => {
  const valid = [river('current'), river('meramec'), river('eleven-point'), river('jacks-fork')];
  const invalid = [river('stale', { reading_timestamp: '2026-10-08T12:00:00Z' }),
    river('missing', { reading_timestamp: null }), river('unknown', { condition_code: 'unknown' }),
    river('dangerous', { condition_code: 'dangerous' }),
    river('drifted', { condition_code: 'good', stored_condition_code: 'low' }),
    river('blanked', { summary_text: null, quote_text: 'Old favorable report.' })];
  const selected = selectWeekendReads([...invalid, ...valid, valid[0]], now);
  assert.equal(selected.length, 3);
  assert.equal(new Set(selected.map(r => r.river_slug)).size, 3);
  assert.ok(selected.every(r => valid.includes(r)));
  assert.deepEqual(selectWeekendReads([valid[0], ...invalid], now), []);
});

test('a summary written for another condition is excluded with a logged reason', () => {
  assert.equal(weekendReadExclusion(river('a', { stored_condition_code: 'low' }), now), 'condition drift low→good');
  assert.equal(weekendReadExclusion(river('a', { stored_condition_code: 'good' }), now), null);
  assert.equal(weekendReadExclusion(river('a', { condition_code: 'dangerous' }), now), 'dangerous');
  assert.equal(weekendReadExclusion(river('a', { reading_timestamp: null }), now), 'stale gauge');
});

test('equal candidates rotate weekly while floatable options stay ahead of high water', () => {
  const rows = [river('current'), river('meramec'), river('eleven-point'), river('jacks-fork'), river('high', { condition_code: 'high' })];
  const first = selectWeekendReads(rows, now).map(r => r.river_slug);
  const next = new Date(now.getTime() + 7 * 86_400_000);
  const second = selectWeekendReads(rows.map(r => ({ ...r, reading_timestamp: next.toISOString() })), next).map(r => r.river_slug);
  assert.ok(!first.includes('high'));
  assert.notDeepEqual(first, second);
});

test('Read distinguishes current water and weekend forecast and omits missing weather', () => {
  const day = (date: string) => ({ date, dayOfWeek: 'Sat', highF: 73, lowF: 52, condition: 'Clear', icon: '01d', precipChance: 10 });
  const rows = [river('current', { weather: { current: null, forecast: [day('2026-10-10'), day('2026-10-11')], todayPrecipChance: 10, maxPrecipChance: 10 } }), river('meramec')];
  const text = weekendReadText(rows, now);
  assert.match(text, /Good now/);
  assert.match(text, /Weekend weather: 73°\/52°/);
  assert.match(text, /Weekend weather unavailable/);
  assert.match(weekendReadCaption(rows, now), /Current water conditions; weekend weather is a forecast/);
});

test('manual and scheduled context produces one pinned multi-river Read, respecting exclusions', async () => {
  const timestamp = new Date().toISOString();
  const rows = ['current', 'meramec', 'eleven-point'].map(slug => river(slug, { generated_at: timestamp, reading_timestamp: timestamp }));
  const seen: string[] = [];
  const db = { from(table: string) {
    seen.push(table);
    const response = table === 'social_config' ? { data: { enabled_rivers: null, disabled_rivers: ['meramec'] }, error: null }
      : { data: table === 'eddy_updates' ? rows : [], error: null };
    const q: Record<string, unknown> = { then(resolve: (r: unknown) => unknown) { return Promise.resolve(response).then(resolve); } };
    for (const key of ['select', 'neq', 'is', 'gt', 'order', 'limit', 'maybeSingle', 'eq']) q[key] = () => q;
    return q;
  } };
  const ctx = await buildPostContext(db, { postType: 'river_highlight' });
  assert.ok(ctx);
  assert.equal(ctx.riverSlug, null);
  assert.equal(ctx.renderData.riverName, 'This weekend');
  assert.match(ctx.caption('instagram', []).caption, /Current River/);
  assert.ok(!ctx.caption('instagram', []).caption.includes('Meramec'));
  const url = new URL(ctx.imageUrl('instagram'));
  assert.equal(url.searchParams.get('type'), 'weekend-read');
  assert.equal(url.searchParams.get('rivers')?.split(',').length, 2);
  assert.ok(url.searchParams.get('at'));
  assert.ok(!seen.includes('blog_posts'));
  assert.equal(POST_TYPES.river_highlight.needs, 'none');
  assert.equal(POST_TYPES.section_guide.composition, 'social-route-portrait');
});


test('Thursday Read runs once in its Central-time window, handles DST and respects off', () => {
  assert.equal(weekendReadDue('video', new Date('2026-10-08T22:00:00Z')), true);
  assert.equal(weekendReadDue('video', new Date('2026-10-08T22:30:00Z')), true);
  assert.equal(weekendReadDue('video', new Date('2026-10-08T22:35:00Z')), false);
  assert.equal(weekendReadDue('video', new Date('2026-10-09T22:00:00Z')), false);
  assert.equal(weekendReadDue(null, new Date('2026-10-08T22:00:00Z'), true), false);
  assert.equal(weekendReadDue('video', new Date('2026-12-10T23:00:00Z')), true);
  assert.equal(weekendReadDue('video', new Date('2026-12-10T22:00:00Z')), false);
});
