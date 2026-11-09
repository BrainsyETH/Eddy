import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  COVER_PHOTOS,
  artParam,
  chooseCoverArt,
  conditionHeadline,
  coverNotes,
  endpointsSubline,
  floatPickHeadline,
  headlineFits,
  headlinePlaceName,
  isRenderableImageType,
  noteHeadline,
  parseArtParam,
  readCoverHistory,
  withPhotoCredit,
  type CoverPhoto,
} from './cover-plan';
import { pickByRiver, dayIndex } from './section-picker';
import { RIVER_DISPLAY_LONG } from './river-display';
import { coverGeometry } from '../og/social-cover';

const day = (n: number) => new Date(n * 24 * 60 * 60 * 1000 + 13 * 60 * 60 * 1000);
const photo = (id: string, riverSlug = 'buffalo'): CoverPhoto => ({
  id, riverSlug, title: id, url: `https://upload.wikimedia.org/${id}.jpg`, sourceUrl: `https://commons.wikimedia.org/wiki/File:${id}.jpg`,
  author: 'NPS', license: 'Public domain', textZone: 'lower',
});

// ─── River selection ───────────────────────────────────────────────────────

test('every eligible river gets a turn regardless of how many sections it has', () => {
  const items = [
    ...Array.from({ length: 40 }, (_, i) => ({ riverSlug: 'current', id: `c${i}` })),
    { riverSlug: 'buffalo', id: 'b0' },
    { riverSlug: 'meramec', id: 'm0' },
  ];
  const rivers = Array.from({ length: 30 }, (_, i) => pickByRiver(items, day(20400 + i))!.riverSlug);
  for (const slug of ['current', 'buffalo', 'meramec']) {
    assert.equal(rivers.filter((r) => r === slug).length, 10, `${slug} gets an equal share`);
  }
  // Successive Current turns advance through its sections instead of repeating one.
  const currentPicks = Array.from({ length: 30 }, (_, i) => pickByRiver(items, day(20400 + i))!)
    .filter((p) => p.riverSlug === 'current').map((p) => p.id);
  assert.equal(new Set(currentPicks).size, currentPicks.length);
});

test('the previous Float Pick river is skipped only when another eligible river exists', () => {
  const items = [{ riverSlug: 'current', id: 'c' }, { riverSlug: 'buffalo', id: 'b' }];
  for (let i = 0; i < 10; i++) {
    assert.equal(pickByRiver(items, day(20400 + i), 'current')!.riverSlug, 'buffalo');
  }
  // The only floatable river still posts: variety never outranks suitability.
  assert.equal(pickByRiver([{ riverSlug: 'current', id: 'c' }], day(20400), 'current')!.riverSlug, 'current');
  assert.equal(pickByRiver([], day(20400), 'current'), null);
});

test('re-running the same day produces the same river, section and cover art', () => {
  const items = [
    { riverSlug: 'current', id: 'c1' }, { riverSlug: 'current', id: 'c2' },
    { riverSlug: 'buffalo', id: 'b1' }, { riverSlug: 'jacks-fork', id: 'j1' },
  ];
  const photos = [photo('a'), photo('b'), photo('c')];
  const run = (at: Date) => {
    const pick = pickByRiver(items, at, 'jacks-fork')!;
    return { pick, art: artParam(chooseCoverArt('buffalo', ['photo.a'], dayIndex(at), photos)) };
  };
  // 13:00 and 23:59 UTC are the same posting day.
  const morning = run(day(20401));
  const late = run(new Date(day(20401).getTime() + 10 * 60 * 60 * 1000 + 59 * 60 * 1000));
  assert.deepEqual(late, morning);
});

// ─── History ───────────────────────────────────────────────────────────────

test('history is best effort: legacy, malformed and missing URLs never break selection', () => {
  const history = readCoverHistory([
    { post_type: 'condition_change', river_slug: 'current', image_url: 'https://eddy.guide/api/og/social?type=warning&river=current' },
    { post_type: 'section_guide', river_slug: 'buffalo', image_url: 'https://eddy.guide/api/og/social?type=section&art=photo.buffalo-steel-creek' },
    { post_type: 'section_guide', river_slug: 'current', image_url: 'not a url' },
    { post_type: 'river_highlight', river_slug: null, image_url: null },
    { post_type: 'daily_digest', river_slug: null, image_url: 'https://eddy.guide/api/og/social?type=digest&art=<script>' },
    { post_type: 'daily_digest', river_slug: null, image_url: 'https://eddy.guide/api/og/social?type=digest&art=eddy.2' },
  ]);
  // A warning about the Current does not count against the Current's next Float Pick.
  assert.equal(history.previousFloatPickRiver, 'buffalo');
  assert.deepEqual(history.recentArt, ['photo.buffalo-steel-creek', 'eddy.2']);
  assert.deepEqual(readCoverHistory(null), { previousFloatPickRiver: null, recentArt: [] });
  // @ts-expect-error — a malformed row from an unexpected query shape
  assert.doesNotThrow(() => readCoverHistory([null, { image_url: 42 }]));
});

// ─── Art ───────────────────────────────────────────────────────────────────

test('a photo not in the recent grid wins; if all were used, the oldest is reused', () => {
  const photos = [photo('a'), photo('b'), photo('c')];
  const fresh = chooseCoverArt('buffalo', ['photo.a', 'photo.b'], 5, photos);
  assert.equal(artParam(fresh), 'photo.c');
  // Newest first: c was used most recently, a longest ago.
  const reused = chooseCoverArt('buffalo', ['photo.c', 'photo.b', 'photo.a'], 5, photos);
  assert.equal(artParam(reused), 'photo.a');
});

test('a river without a catalogued photo falls back to the Eddy illustration', () => {
  const art = chooseCoverArt('huzzah', [], 7, []);
  assert.equal(art.kind, 'eddy');
  assert.match(artParam(art), /^eddy\.\d$/);
});

test('pinned art resolves only to a catalogued photo of the same river', () => {
  assert.deepEqual(parseArtParam('eddy.4'), { kind: 'eddy', variant: 1 });
  assert.equal(parseArtParam('photo.does-not-exist'), null);
  assert.equal(parseArtParam('https://evil.example/x.jpg'), null);
  const first = COVER_PHOTOS[0];
  if (first) {
    assert.equal(parseArtParam(`photo.${first.id}`, first.riverSlug)?.kind, 'photo');
    assert.equal(parseArtParam(`photo.${first.id}`, 'not-that-river'), null);
  }
});

test('only PNG and JPEG reach the renderer; anything else takes the illustration path', () => {
  assert.equal(isRenderableImageType('image/jpeg'), true);
  assert.equal(isRenderableImageType('image/png; charset=binary'), true);
  assert.equal(isRenderableImageType('image/webp'), false);
  assert.equal(isRenderableImageType('text/html'), false);
  assert.equal(isRenderableImageType(null), false);
});

test('the cover photo catalog is public domain, attributed, and on Wikimedia', () => {
  const ids = new Set<string>();
  for (const p of COVER_PHOTOS) {
    assert.ok(!ids.has(p.id), `duplicate id ${p.id}`);
    ids.add(p.id);
    assert.match(p.id, /^[a-z0-9-]+$/);
    assert.ok(RIVER_DISPLAY_LONG[p.riverSlug], `${p.id}: unknown river ${p.riverSlug}`);
    assert.match(p.license, /^Public domain/, `${p.id} must be public domain`);
    assert.match(p.url, /^https:\/\/upload\.wikimedia\.org\/.+\.(jpe?g|png)$/i, `${p.id}: bounded JPEG/PNG on upload.wikimedia.org`);
    assert.match(p.sourceUrl, /^https:\/\/commons\.wikimedia\.org\/wiki\/File:/);
    assert.ok(p.author.trim() && p.title.trim(), `${p.id}: author and title`);
    assert.ok(p.textZone === 'upper' || p.textZone === 'lower');
  }
});

// ─── Headlines ─────────────────────────────────────────────────────────────

const facts = {
  riverSlug: 'current', putInName: 'Big Tree', takeOutName: 'Gooseneck', putInMile: 160, takeOutMile: 166,
  springs: [{ name: 'Welch Spring', mile: 163 }],
};

test('Float Pick headlines name real places first', () => {
  assert.deepEqual(floatPickHeadline(facts), { text: 'Big Tree to Gooseneck', kind: 'endpoints' });
  assert.equal(endpointsSubline(facts, 'endpoints'), undefined);
});

test('a spring headlines only when it is well inside the route', () => {
  const long = { ...facts, putInName: 'Highway 95 / Bell School low-water bridge crossing', takeOutName: 'Sam A. Baker State Park boat launch' };
  assert.deepEqual(floatPickHeadline(long), { text: 'Past Welch Spring', kind: 'spring' });
  assert.ok(endpointsSubline(long, 'spring') === undefined, 'long endpoints are dropped rather than shrunk');
  // Within the guidebook's mile-scale error of an endpoint → not claimed.
  const nearEnd = { ...long, springs: [{ name: 'Welch Spring', mile: 160.8 }] };
  assert.deepEqual(floatPickHeadline(nearEnd), { text: 'Float the Current', kind: 'river' });
});

test('evergreen picks may use the guide’s own section name; the river is the last resort', () => {
  const evergreen = { ...facts, putInName: 'Highway 95 / Bell School low-water bridge crossing', springs: [], tagline: 'The bluff-and-cave middle' };
  assert.deepEqual(floatPickHeadline(evergreen), { text: 'The bluff-and-cave middle', kind: 'tagline' });
  assert.equal(floatPickHeadline({ ...evergreen, tagline: '' }).text, 'Float the Current');
});

test('headlines never infer time of day or quality', () => {
  const texts = [
    floatPickHeadline(facts).text,
    floatPickHeadline({ ...facts, putInName: 'X'.repeat(60) }).text,
    conditionHeadline({ riverSlug: 'caddo-river', to: 'high', from: 'flowing' }),
  ];
  for (const text of texts) assert.doesNotMatch(text, /morning|afternoon|full day|perfect|best|ideal/i);
});

test('access names are cleaned without renaming the place', () => {
  assert.equal(headlinePlaceName('Hwy 97 Access'), 'Hwy 97');
  assert.equal(headlinePlaceName('Syenite Access (Hwy H bridge)'), 'Syenite');
  assert.equal(headlinePlaceName('Akers'), 'Akers');
  assert.equal(headlinePlaceName('Gooseneck Campground'), 'Gooseneck');
  assert.equal(headlinePlaceName('Van Buren Riverfront Park'), 'Van Buren Riverfront Park');
});

test('condition headlines state only the observed transition', () => {
  assert.equal(conditionHeadline({ riverSlug: 'caddo-river', to: 'high', from: 'flowing' }), 'The Caddo is running high');
  assert.equal(conditionHeadline({ riverSlug: 'caddo-river', to: 'high', from: 'dangerous' }), 'The Caddo is coming down');
  assert.equal(conditionHeadline({ riverSlug: 'big-river', to: 'dangerous', from: 'flowing' }), 'Big River is at flood level');
  assert.equal(conditionHeadline({ riverSlug: 'current', to: 'good', recovery: true }), 'The Current is floatable again');
});

test('every generated headline fits the fixed headline size', () => {
  for (const slug of Object.keys(RIVER_DISPLAY_LONG)) {
    assert.ok(headlineFits(floatPickHeadline({ ...facts, riverSlug: slug, putInName: 'X'.repeat(80), springs: [] }).text), slug);
    for (const to of ['high', 'dangerous']) assert.ok(headlineFits(conditionHeadline({ riverSlug: slug, to })), `${slug} ${to}`);
  }
  assert.equal(noteHeadline('Always check the gauge before you launch. Then pack water.', 'tip'), 'Always check the gauge before you launch');
  assert.equal(noteHeadline('A very long first sentence that goes on and on well past seven words.', 'tip'), 'A float tip from Eddy');
});

// ─── Attribution and notes ─────────────────────────────────────────────────

test('a photo cover’s credit reaches the published caption, once', () => {
  const art = { kind: 'photo' as const, photo: photo('steel-creek') };
  const once = withPhotoCredit('Today’s Float Pick — Buffalo\n\nPlan this float → https://eddy.guide', art);
  assert.match(once, /📷 Cover photo: NPS \(public domain, via Wikimedia Commons\)$/);
  assert.equal(withPhotoCredit(once, art), once);
  assert.equal(withPhotoCredit('Caption', { kind: 'eddy', variant: 1 }), 'Caption');
  assert.ok(coverNotes({ headline: 'Steel Creek to Kyles Landing', art }).some((n) => n.includes('NPS')));
  assert.ok(coverNotes({ headline: 'Float the Current', fallback: 'no-catalogued-photo' }).some((n) => n.startsWith('Illustration')));
});

// ─── Crops ─────────────────────────────────────────────────────────────────

test('editorial cover content survives the 3:4 grid crop, the 9:16 view and the Facebook square', () => {
  const portrait = coverGeometry({ width: 1080, height: 1920 }, 'light', 'instagram');
  const visible34 = 1080 / (3 / 4);
  const top34 = (1920 - visible34) / 2;
  assert.ok(portrait.top >= top34 && portrait.top + portrait.height <= top34 + visible34);
  assert.ok(portrait.left >= 0 && portrait.left + portrait.width <= 1080);
  const square = coverGeometry({ width: 1080, height: 1080 }, 'light', 'facebook');
  assert.ok(square.top >= 0 && square.top + square.height <= 1080);
});

test('the illustration fallback does not repeat a recent composition', () => {
  // Newest first: 0 was just used, then 1 → 2 is the only unused scene.
  assert.equal(artParam(chooseCoverArt('current', ['eddy.0', 'eddy.1'], 3, [])), 'eddy.2');
  // All used: the one used longest ago returns.
  assert.equal(artParam(chooseCoverArt('current', ['eddy.2', 'eddy.0', 'eddy.1'], 3, [])), 'eddy.1');
  // A run of photo-less picks never stacks the same scene twice in a row.
  const recent: string[] = [];
  for (let i = 0; i < 12; i++) {
    const art = artParam(chooseCoverArt('current', recent, 20400 + i * 3, []));
    assert.notEqual(art, recent[0]);
    recent.unshift(art);
  }
});
