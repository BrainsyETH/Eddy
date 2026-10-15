import assert from 'node:assert/strict';
import test from 'node:test';
import { riverGuideSeeds } from '../../scripts/content/river-guides';
import { guideInsertRow, planRiverGuideSeeds, type RiverGuideSeed } from '../../scripts/lib/river-guide-seeds';
import { favoriteFloatMeta } from '../../../eddy-ios/src/lib/favoriteFloatCopy';
import { selectRiverGuides, selectFeaturedRiverGuide, riverGuideUrl, type RiverGuideSummary } from '../../../eddy-ios/src/lib/riverGuides';
import { optimizeBlogImage, guidePhotoCredit } from './blog-image';

const sample = riverGuideSeeds.find(seed => seed.river_slug === 'black')!;
const rivers = [{ id: 'river', slug: 'black', active: true }];
const accesses = sample.guide_data.sections.flatMap((section, index) => [
  { river_id: 'river', slug: section.from_slug!, approved: true, is_float_endpoint: true, river_mile_downstream: index * 100 },
  { river_id: 'river', slug: section.to_slug!, approved: true, is_float_endpoint: true, river_mile_downstream: index * 100 + Number(section.miles) },
]);

test('all 18 missing active rivers have a distinct, typed guide with sources and FAQ', () => {
  assert.deepEqual(riverGuideSeeds.map(seed => seed.river_slug).sort(), [
    'big-piney', 'big-river', 'black', 'bourbeuse', 'bryant-creek', 'buffalo', 'caddo-river', 'crooked-creek', 'elk',
    'gasconade', 'james', 'kings-river', 'mulberry', 'north-fork-white', 'spring-river', 'spring-river-mo', 'st-francis', 'war-eagle-creek',
  ]);
  assert.equal(new Set(riverGuideSeeds.map(seed => seed.slug)).size, 18);
  for (const seed of riverGuideSeeds) {
    assert.ok(seed.guide_data.faq.length >= 3, seed.slug);
    assert.ok((seed.guide_data.sources?.length ?? 0) >= 3, seed.slug);
    assert.ok(seed.guide_data.intro_html.includes('<p>'), seed.slug);
    assert.ok(seed.guide_data.sources?.every(source => /^https:\/\//.test(source.url)), seed.slug);
  }
});

test('seed preview preserves all existing editorial work, including a different slug on the same river', () => {
  assert.deepEqual(planRiverGuideSeeds([sample], rivers, accesses, [{ slug: 'editor-draft', river_slug: 'black' }]),
    { additions: [], skipped: ['black'] });
  assert.equal(planRiverGuideSeeds([sample], rivers, accesses, []).additions.length, 1);
  assert.throws(() => planRiverGuideSeeds([sample, sample], rivers, accesses, []), /Duplicate guide/);
});

test('inactive rivers, withdrawn endpoints, reversed routes and mileage drift cannot be imported', () => {
  assert.throws(() => planRiverGuideSeeds([sample], [{ ...rivers[0], active: false }], accesses, []), /inactive/);
  assert.throws(() => planRiverGuideSeeds([sample], rivers, accesses.map(a => ({ ...a, approved: false })), []), /Unusable/);
  assert.throws(() => planRiverGuideSeeds([sample], rivers, accesses.map(a => ({ ...a, is_float_endpoint: false })), []), /Unusable/);
  assert.throws(() => planRiverGuideSeeds([sample], rivers, accesses.map(a => ({ ...a, river_mile_downstream: -a.river_mile_downstream })), []), /mileage/);
  const changed: RiverGuideSeed = structuredClone(sample);
  changed.guide_data.sections[0].miles = '99';
  assert.throws(() => planRiverGuideSeeds([changed], rivers, accesses, []), /mileage/);
});

test('new content is a draft by default, and publishing has a real publication time', () => {
  const now = '2026-10-11T18:00:00Z';
  assert.equal(guideInsertRow(sample, false, now).status, 'draft');
  assert.equal(guideInsertRow(sample, false, now).published_at, null);
  assert.equal(guideInsertRow(sample, true, now).published_at, now);
  assert.equal(guideInsertRow(sample, true, now).category, 'River Guides');
});

test('Elk does not turn unverified crossings or dam portages into planner routes', () => {
  const elk = riverGuideSeeds.find(seed => seed.river_slug === 'elk')!;
  assert.deepEqual(elk.guide_data.sections, []);
  assert.equal(elk.guide_data.hero.photo_url, '');
  assert.ok(JSON.stringify(elk.guide_data).includes('has not been verified'));
});

test('guide browser filters and sorts river articles, and treats search as literal text', () => {
  const summaries = riverGuideSeeds.map(seed => ({ slug: seed.slug, title: seed.title, description: seed.description,
    category: 'River Guides', riverSlug: seed.river_slug, featuredImageUrl: seed.featured_image_url, readTimeMinutes: seed.read_time_minutes }));
  const articles = [...summaries, { ...summaries[0], slug: 'general', category: 'Guides' }];
  assert.equal(selectRiverGuides(articles).length, 18);
  assert.equal(selectRiverGuides(articles, '  caddo  ').length, 1);
  assert.equal(selectRiverGuides(articles, '[').length, 0);
  assert.equal(selectRiverGuides(articles)[0].riverSlug, 'big-piney');
  assert.equal(selectRiverGuides(articles, 'Spring River (Missouri)')[0].riverSlug, 'spring-river-mo');
  assert.equal(riverGuideUrl('a/b?c'), 'https://eddy.guide/blog/a%2Fb%3Fc');
});

const featureGuides: RiverGuideSummary[] = ['current', 'eleven-point', 'jacks-fork'].map(slug => ({
  slug, title: slug, category: 'River Guides', description: null,
  featuredImageUrl: null, readTimeMinutes: null,
}));

test('daily feature stays stable through refresh ordering and changes at local midnight', () => {
  const morning = new Date(2026, 9, 14, 0, 0).getTime();
  const evening = new Date(2026, 9, 14, 23, 59, 59).getTime();
  const tomorrow = new Date(2026, 9, 15, 0, 0).getTime();
  const originalOrder = featureGuides.map(guide => guide.slug);
  const first = selectFeaturedRiverGuide(featureGuides, morning);
  assert.ok(first);
  assert.equal(selectFeaturedRiverGuide([...featureGuides].reverse(), evening)?.slug, first.slug);
  assert.notEqual(selectFeaturedRiverGuide(featureGuides, tomorrow)?.slug, first.slug);
  assert.deepEqual(featureGuides.map(guide => guide.slug), originalOrder);
});

test('daily feature cycles every guide once across DST and year boundaries', () => {
  // Construct LOCAL calendar days; also run under America/Chicago to exercise
  // 23- and 25-hour days rather than assuming every day is 86,400,000 ms long.
  for (const [year, month, day] of [[2026, 2, 7], [2026, 9, 31], [2026, 11, 31]]) {
    const picks = Array.from({ length: 4 }, (_, offset) =>
      selectFeaturedRiverGuide(featureGuides, new Date(year, month, day + offset, 12).getTime())?.slug);
    assert.equal(new Set(picks.slice(0, 3)).size, 3);
    assert.equal(picks[0], picks[3]);
  }
});

test('daily feature handles empty or single-guide catalogs and excludes other articles', () => {
  const now = new Date(2026, 9, 14).getTime();
  const generalArticle = { ...featureGuides[0], slug: 'general', category: 'News' };
  assert.equal(selectFeaturedRiverGuide([], now), null);
  assert.equal(selectFeaturedRiverGuide([generalArticle], now), null);
  assert.equal(selectFeaturedRiverGuide([generalArticle, featureGuides[0]], now), featureGuides[0]);
  assert.equal(selectFeaturedRiverGuide([featureGuides[0]], new Date(2026, 9, 15).getTime()), featureGuides[0]);
});

test('agency scenery outside the optimizer allowlist renders directly; approved sources stay optimized', () => {
  assert.equal(optimizeBlogImage('https://mdc.mo.gov/photo.jpg'), false);
  assert.equal(optimizeBlogImage('https://commons.wikimedia.org/wiki/Special:FilePath/photo.jpg'), false);
  assert.equal(optimizeBlogImage('https://www.nps.gov/photo.jpg'), true);
  assert.equal(optimizeBlogImage('https://upload.wikimedia.org/wikipedia/commons/a/photo.jpg'), true);
  assert.equal(optimizeBlogImage('https://www.nps.gov.attacker.example/photo.jpg'), false);
  assert.equal(optimizeBlogImage('https://www.fws.gov/sites/default/files/photo.jpg'), true);
  assert.equal(optimizeBlogImage('https://www.fws.gov/private/photo.jpg'), false);
});


test('reviewed content retains provenance in the saved JSON and binds credits to the exact hero', () => {
  for (const seed of riverGuideSeeds) {
    const saved = guideInsertRow(seed, false, '2026-10-11T00:00:00Z');
    assert.equal(saved.guide_data.checked_at, '2026-10-11');
    assert.ok(saved.guide_data.sources?.length);
    assert.equal(saved.guide_data.use_access_photos, false);
    assert.notEqual(seed.description, seed.guide_data.hero.lede);
    if (seed.guide_data.hero.photo_url) {
      const credit = guidePhotoCredit(seed.guide_data.hero);
      assert.ok(credit?.source_url && credit.license_url, seed.slug);
      assert.equal(guidePhotoCredit({ ...seed.guide_data.hero, photo_url: 'https://example.com/replacement.jpg' }), undefined);
      if (credit.license.startsWith('CC BY')) assert.notEqual(seed.featured_image_url, seed.guide_data.hero.photo_url);
    }
    assert.notEqual(saved.og_image_url, seed.guide_data.hero.photo_url);
  }
});

test('Spring Missouri is an access overview until the upstream launch is verified', () => {
  const guide = riverGuideSeeds.find(seed => seed.river_slug === 'spring-river-mo')!;
  assert.equal(guide.slug, 'spring-river-float-trips-missouri');
  assert.deepEqual(guide.guide_data.sections, []);
  assert.ok(JSON.stringify(guide.guide_data).includes('1040 Bridge'));
});

test('nearby whitewater, historical dam status, and the Twin Bridges creek are explicit', () => {
  const st = riverGuideSeeds.find(seed => seed.river_slug === 'st-francis')!.guide_data;
  assert.match(st.sections[0].body, /0.5 mile/);
  assert.match(st.sections[0].body, /whitewater/);
  assert.match(st.sections[0].body, /Silver Mine Dam/);
  const nf = riverGuideSeeds.find(seed => seed.river_slug === 'north-fork-white')!.guide_data;
  assert.match(nf.sections[0].body, /Spring Creek/);
  assert.match(nf.sections[1].body, /removed in 2017/);
});


test('favorite-float copy omits an unverified difficulty instead of inventing a class', () => {
  const text = favoriteFloatMeta({ distanceMiles: 5, durationHours: null, durationFormatted: null, durationUnavailableReason: null, difficulty: '' });
  assert.equal(text, '5.0 mi · Open plan for float time');
});

test('reviewed guide photos replace only known placeholders on the exact guide', async () => {
  const { guidePhotos, guideCover, resolveGuideHero, publicGuideImage } = await import('./photos/guides');
  for (const photo of guidePhotos) {
    const post = { slug: photo.postSlug, river_slug: photo.riverSlug, featured_image_url: sample.featured_image_url };
    const cover = guideCover(post);
    assert.equal(cover.src, photo.cardUrl);
    assert.equal(cover.photo, photo);
    assert.equal(publicGuideImage(cover.src), `https://eddy.guide${photo.cardUrl}`);
    assert.equal(guideCover({ ...post, slug: 'another-article' }).photo, undefined);
    assert.equal(guideCover({ ...post, river_slug: 'another-river' }).photo, undefined);
    assert.equal(guideCover({ ...post, featured_image_url: 'https://example.com/editor.jpg' }).src, 'https://example.com/editor.jpg');
    assert.equal(guideCover({ ...post, featured_image_url: 'https://example.com/editor.jpg' }).photo, undefined);
    const hero = resolveGuideHero(post, { ...sample.guide_data.hero, photo_url: '' });
    assert.equal(hero.photo_url, photo.imageUrl);
    assert.equal(guidePhotoCredit(hero)?.source_url, photo.sourceUrl);
    const edited = { ...hero, photo_url: 'https://example.com/editor.jpg' };
    assert.equal(resolveGuideHero(post, edited), edited);
    assert.equal(guidePhotoCredit(edited), undefined);
  }
  assert.equal(publicGuideImage('https://example.com/editor.jpg'), 'https://example.com/editor.jpg');
  assert.equal(publicGuideImage(null), null);
  assert.equal(guideCover({ slug: 'unknown', featured_image_url: null }).src, null);
});

test('every reviewed guide photo ships compact, readable images with source and license links', async () => {
  const { guidePhotos } = await import('./photos/guides');
  const { readFileSync } = await import('node:fs');
  const sharp = (await import('sharp')).default;
  assert.equal(new Set(guidePhotos.map(photo => photo.postSlug)).size, guidePhotos.length);
  for (const photo of guidePhotos) {
    assert.ok(photo.alt && photo.caption && photo.author && photo.license && photo.changes);
    for (const url of [photo.originalUrl, photo.sourceUrl, photo.licenseUrl]) assert.equal(new URL(url).protocol, 'https:');
    for (const [url, maxWidth, maxBytes] of [[photo.cardUrl, 640, 160000], [photo.imageUrl, 1400, 600000]] as const) {
      assert.match(url, /^\/images\/river-guides\/[a-z-]+(?:-card)?\.webp$/);
      const bytes = readFileSync(new URL(`../../public${url}`, import.meta.url));
      const meta = await sharp(bytes).metadata();
      assert.equal(meta.format, 'webp');
      assert.ok(meta.width! <= maxWidth && meta.width! >= 300, photo.riverSlug);
      assert.ok(bytes.length <= maxBytes, `${photo.riverSlug}: ${bytes.length} bytes`);
    }
  }
});
