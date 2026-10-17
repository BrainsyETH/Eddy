import assert from 'node:assert/strict';
import test from 'node:test';
import { listFavoriteFloats } from './favorite-floats';
import { reviewedPhotos } from '@/lib/photos/reviewed';

const photo = (name: string) => `https://photos.example/${name}.jpg`;
const access = (slug: string, mile: number, images: string[] = [], river = 'river') => ({
  id: `${river}:${slug}`, river_id: river, slug, name: slug,
  river_mile_downstream: mile, image_urls: images, type: 'boat_ramp', types: [],
});
const section = (from: string, to: string, image?: string) => ({
  name: `${from} to ${to}`, from_slug: from, to_slug: to, photo: image, best: 'Everyone',
});
function fixture(sections: ReturnType<typeof section>[], points: ReturnType<typeof access>[]) {
  const tables: Record<string, Record<string, unknown>[]> = {
    blog_posts: [{ slug: 'guide', river_slug: 'river', category: 'River Guides', status: 'published',
      published_at: '2026-01-01', guide_data: { sections } }],
    rivers: [{ id: 'river', slug: 'river', name: 'River' }],
    access_points: points,
  };
  const calls: string[] = [];
  const db = {
    from(table: string) {
      calls.push(table);
      let rows = tables[table];
      let columns: string[] = [];
      const query = {
        select(value: string) { columns = value.split(',').map(s => s.trim()); return query; },
        eq(key: string, value: unknown) { rows = rows.filter(row => row[key] === value); return query; },
        in(key: string, values: unknown[]) { rows = rows.filter(row => values.includes(row[key])); return query; },
        lte(key: string, value: string) { rows = rows.filter(row => String(row[key]) <= value); return query; },
        not(key: string, _operator: string, value: unknown) { rows = rows.filter(row => row[key] !== value); return query; },
        then(resolve: (result: { data: Record<string, unknown>[]; error: null }) => unknown) {
          return Promise.resolve(resolve({ data: rows.map(row => Object.fromEntries(columns.map(key => [key, row[key]]))), error: null }));
        },
      };
      return query;
    },
  };
  return { db, tables, calls };
}

test('featured photos vary using only the section and its own endpoints, with route-specific fallbacks', async () => {
  const f = fixture([section('b', 'c'), section('a', 'b', photo('editorial')), section('d', 'c')], [
    access('a', 0, [photo('shared')]), access('b', 5, [photo('shared'), photo('b')]),
    access('c', 10, [photo('shared'), photo('c')]), access('d', 15, [photo('d')]),
  ]);
  const floats = await listFavoriteFloats(f.db);
  assert.deepEqual(floats.map(float => float.photoUrl), [photo('editorial'), photo('shared'), photo('c')]);
  assert.deepEqual(floats[0].photoFallbackUrls, [photo('shared'), photo('b')]);
  assert.deepEqual(floats[1].photoFallbackUrls, [photo('b'), photo('c')]);
  assert.deepEqual(floats[2].photoFallbackUrls, [photo('shared'), photo('d')]);
  assert.equal(floats[2].putInId, 'river:c', 'reversed guide endpoints still select the correct route');
  assert.deepEqual(f.calls, ['blog_posts', 'rivers', 'access_points'], 'photo selection adds no per-card query');
  f.tables.access_points.reverse();
  f.tables.blog_posts[0].guide_data = { sections: [section('d', 'c'), section('a', 'b', photo('editorial')), section('b', 'c')] };
  assert.deepEqual(await listFavoriteFloats(f.db), floats, 'database row order cannot reshuffle route photos');
});

test('missing or invalid photos stay missing, take-out photos work, and duplicate slugs never cross rivers', async () => {
  const f = fixture([section('a', 'b', ''), section('b', 'c'), section('c', 'd')], [
    access('a', 0, ['http://photos.example/insecure.jpg']), access('b', 5),
    access('c', 10), access('d', 15, [photo('take-out')]), access('a', 0, [photo('other-river')], 'other'),
  ]);
  f.tables.rivers.push({ id: 'other', slug: 'other', name: 'Other River' });
  f.tables.blog_posts.push({ ...f.tables.blog_posts[0], slug: 'other-guide', river_slug: 'other', guide_data: { sections: [] } });
  const floats = await listFavoriteFloats(f.db);
  assert.deepEqual(floats.map(float => float.photoUrl), [undefined, undefined, photo('take-out')]);
  assert.ok(floats.every(float => float.photoFallbackUrls?.length === 0));
});

test('reviewed access photos are available without a database backfill', async () => {
  const reviewed = reviewedPhotos.find(entry => entry.table === 'access_points')!;
  const point = { ...access('a', 0), id: reviewed.id, name: reviewed.name };
  const f = fixture([section('a', 'b')], [point, access('b', 5)]);
  assert.equal((await listFavoriteFloats(f.db))[0].photoUrl, reviewed.image.url);
});

test('a repeated image is retained when the route has no other relevant photo', async () => {
  const f = fixture([section('a', 'b'), section('b', 'c')], [
    access('a', 0, [photo('only')]), access('b', 5, [photo('only')]), access('c', 10),
  ]);
  assert.deepEqual((await listFavoriteFloats(f.db)).map(float => float.photoUrl), [photo('only'), photo('only')]);
});
