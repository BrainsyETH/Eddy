import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import fixture from './fixtures/recgov-campsite-6506.json';
import { fetchRecreationSitePhotos, recreationSitePhotos } from './photos';

// Captured from the public campsite media endpoint on 2026-09-23, unmodified.
test('real Buffalo Point B31 response yields eight exact-site photos with credits', () => {
  const photos = recreationSitePhotos(fixture, '6506');
  assert.equal(photos.length, 8);
  assert.ok(photos.every(photo => photo.credit === 'NPS' && photo.source === 'Recreation.gov'));
  assert.ok(photos.every(photo => photo.url.startsWith('https://cdn.recreation.gov/')));
  assert.ok(photos.every(photo => photo.title));
  assert.equal(photos[0].url, fixture.result.find(item => item.position === 0)!.url);
  assert.deepEqual(recreationSitePhotos(fixture, '6507'), []);
});

test('rejects unrelated, private, inactive, non-image and unsafe media', () => {
  const valid = fixture.result[0];
  const invalid = [
    { entity_type: 'facility' }, { entity_id: '99' }, { is_public: false },
    { is_deactivated: true }, { is_virtual_tour: true }, { mime_type: 'video/mp4' },
    { url: 'http://cdn.recreation.gov/a.jpg' }, { url: 'https://example.com/a.jpg' },
    { url: 'https://cdn.recreation.gov.evil.test/a.jpg' },
    { url: 'https://user:pass@cdn.recreation.gov/a.jpg' }, { url: 'not a url' },
  ].map(extra => ({ ...valid, ...extra }));
  assert.deepEqual(recreationSitePhotos({ result: invalid }, '6506'), []);
  assert.equal(recreationSitePhotos({ result: [valid, valid, null] }, '6506').length, 1);
});

test('prioritizes primary photos, strips markup and caps gallery length', () => {
  const valid = fixture.result[0];
  const items = Array.from({ length: 12 }, (_, i) => ({ ...valid,
    url: `https://cdn.recreation.gov/${i}.webp`, position: i,
    is_primary: i === 11, title: '<b>Site B31</b>', credits: '<i>NPS</i>' }));
  const photos = recreationSitePhotos({ result: items }, '6506');
  assert.equal(photos.length, 8);
  assert.equal(photos[0].url, items[11].url);
  assert.equal(photos[0].title, 'Site B31');
  assert.equal(photos[0].credit, 'NPS');
});

test('fetches one site without credentials, with bounded time and daily caching', async () => {
  let calls = 0;
  const photos = await fetchRecreationSitePhotos('6506', async (url, init) => {
    calls++;
    assert.equal(url, 'https://www.recreation.gov/api/media/public/campsite/6506');
    assert.equal(new Headers(init?.headers).get('apikey'), null);
    assert.ok(init?.signal);
    assert.equal((init as RequestInit & { next: { revalidate: number } }).next.revalidate, 86400);
    return Response.json(fixture);
  });
  assert.equal(calls, 1);
  assert.equal(photos.length, 8);
});

test('empty success stays distinct from HTTP, malformed and network failures', async () => {
  assert.deepEqual(await fetchRecreationSitePhotos('6506', async () => Response.json({ result: [] })), []);
  for (const status of [403, 429, 500]) {
    await assert.rejects(fetchRecreationSitePhotos('6506', async () => new Response('', { status })), /media status/);
  }
  await assert.rejects(fetchRecreationSitePhotos('6506', async () => Response.json({})), /Invalid/);
  await assert.rejects(fetchRecreationSitePhotos('6506', async () => { throw new Error('timeout'); }), /timeout/);
  await assert.rejects(fetchRecreationSitePhotos('../6506', async () => { throw new Error('must not fetch'); }), /Invalid Recreation/);
});
