import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { campsitePhotos, fetchFacilityPhotos } from './photos';

const image = (extra = {}) => ({ MediaType: 'Image', EntityType: 'Site', EntityID: '11',
  URL: 'https://cdn.recreation.gov/site.jpg', Title: 'Site 11', Credits: 'NPS', ...extra });
const site = (extra = {}) => ({ FacilityID: '22', CampsiteID: '11', ENTITYMEDIA: [image()], ...extra });

test('accepts only images explicitly belonging to the exact site', () => {
  assert.equal(campsitePhotos([image(), image({ EntityID: '12' }), image({ EntityType: 'Facility' }),
    image({ MediaType: 'Video' }), null], '11').length, 1);
  assert.deepEqual(campsitePhotos(null, '11'), []);
});

test('requires safe HTTPS URLs, deduplicates and preserves photo credits', () => {
  assert.deepEqual(campsitePhotos([image(), image(), image({ URL: 'http://example.com/a' }),
    image({ URL: 'javascript:alert(1)' }), image({ URL: 'https://user:pass@example.com/a' })], '11'),
  [{ url: 'https://cdn.recreation.gov/site.jpg', title: 'Site 11', credit: 'NPS' }]);
});

test('primary image leads; captions are plain text and gallery is bounded', () => {
  const media = Array.from({ length: 12 }, (_, n) => image({ URL: `https://cdn.recreation.gov/${n}.jpg` }));
  const photos = campsitePhotos([...media, image({ URL: 'https://cdn.recreation.gov/primary.jpg', IsPrimary: true, Title: '<b>Site</b>' })], '11');
  assert.equal(photos.length, 8);
  assert.equal(photos[0].title, 'Site');
  assert.match(photos[0].url, /primary/);
});

test('paginates provider inventory and excludes photos from another facility', async () => {
  const urls: string[] = [];
  const request: typeof fetch = async (input, init) => {
    urls.push(String(input));
    assert.equal(new Headers(init?.headers).get('apikey'), 'test-key');
    assert.equal((init as RequestInit & { next: { revalidate: number } }).next.revalidate, 86400);
    return Response.json({ RECDATA: urls.length === 1
      ? Array.from({ length: 100 }, () => site())
      : [site({ CampsiteID: '12', ENTITYMEDIA: [image({ EntityID: '12' })] }),
        site({ FacilityID: '99', CampsiteID: '13', ENTITYMEDIA: [image({ EntityID: '13' })] })] });
  };
  const photos = await fetchFacilityPhotos('22', 'test-key', request);
  assert.deepEqual(Object.keys(photos), ['11', '12']);
  assert.match(urls[1], /offset=100/);
  assert.ok(urls.every((url) => !url.includes('test-key')));
});

test('successful missing media is empty; malformed/error payloads remain failures', async () => {
  assert.deepEqual(await fetchFacilityPhotos('22', 'key', async () => Response.json({ RECDATA: [site({ ENTITYMEDIA: [] })] })), {});
  await assert.rejects(fetchFacilityPhotos('22', 'key', async () => new Response('', { status: 429 })), /429/);
  await assert.rejects(fetchFacilityPhotos('22', 'key', async () => Response.json({})), /Invalid RIDB/);
  await assert.rejects(fetchFacilityPhotos('../bad', 'key', async () => { throw new Error('should not fetch'); }), /Invalid RIDB facility/);
});

test('refuses a provider that repeats full pages forever', async () => {
  let calls = 0;
  await assert.rejects(fetchFacilityPhotos('22', 'key', async () => {
    calls++;
    return Response.json({ RECDATA: Array.from({ length: 100 }, () => site()) });
  }), /pagination limit/);
  assert.equal(calls, 20);
});
