// Renamed access-point URLs are public links. Keep their permanent redirects
// in Next's route table so they resolve before page metadata or database reads.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { NextRequest } from 'next/server';
import { legacyRiverRedirect } from './legacy-river-redirect';

const config = readFileSync(join(process.cwd(), 'next.config.mjs'), 'utf8');
const redirectSection = config.slice(config.indexOf('async redirects()'), config.indexOf('async headers()'));
const configured = [...redirectSection.matchAll(
  /\{\s*source:\s*'([^']+)',\s*destination:\s*'([^']+)',\s*permanent:\s*(true|false),?\s*\}/g,
)].map(([, source, destination, permanent]) => ({ source, destination, permanent: permanent === 'true' }));

test('renamed Buffalo access links permanently redirect to approved production slugs', () => {
  for (const [legacy, canonical] of [
    ['hasty-launch', 'hasty'],
    ['maumee-north', 'north-maumee'],
  ]) {
    const source = `/rivers/arkansas/buffalo/access/${legacy}`;
    const destination = `/rivers/arkansas/buffalo/access/${canonical}`;
    assert.deepEqual(configured.filter((entry) => entry.source === source), [
      { source, destination, permanent: true },
    ], `Missing or incorrect permanent redirect for ${legacy}`);
  }
});

test('do not guess a destination for unverified Buffalo access URLs', () => {
  for (const slug of ['ozark-campground', 'mt-hersey']) {
    assert.ok(!configured.some((entry) => entry.source === `/rivers/arkansas/buffalo/access/${slug}`));
  }
});

const resolveRiver = async (slug: string) => ({
  current: '/rivers/missouri/current',
  buffalo: '/rivers/arkansas/buffalo',
  meramec: '/rivers/missouri/meramec',
}[slug] ?? null);

test('legacy river and access links return HTTP 308 with query strings intact, for visitors and crawlers', async () => {
  for (const agent of ['Mozilla/5.0', 'Googlebot']) {
    for (const [source, destination] of [
      ['/rivers/current', '/rivers/missouri/current'],
      ['/rivers/current/access/akers-ferry', '/rivers/missouri/current/access/akers-ferry'],
      ['/rivers/buffalo/access/steel-creek', '/rivers/arkansas/buffalo/access/steel-creek'],
      ['/rivers/current/access/van-buren', '/rivers/missouri/current/access/van-buren-riverfront-park'],
      ['/rivers/buffalo/access/hasty-launch', '/rivers/arkansas/buffalo/access/hasty'],
      ['/rivers/buffalo/access/maumee-north', '/rivers/arkansas/buffalo/access/north-maumee'],
      ['/rivers/meramec/access/onondaga-cave-sp', '/rivers/missouri/meramec/access/onondaga-cave-state-park'],
    ]) {
      const response = await legacyRiverRedirect(new NextRequest(`https://eddy.guide${source}?utm_source=widget&section=lower`, {
        headers: { 'user-agent': agent },
      }), resolveRiver);
      assert.equal(response?.status, 308, source);
      assert.equal(response?.headers.get('location'), `https://eddy.guide${destination}?utm_source=widget&section=lower`);
      assert.equal(await response?.text(), '', 'redirects must precede HTML streaming');
    }
  }
});

test('canonical pages, state indexes, images, and unrelated pages do not look up redirect data', async () => {
  for (const path of ['/rivers', '/rivers/missouri', '/rivers/arkansas', '/rivers/missouri/current',
    '/rivers/arkansas/buffalo/access/steel-creek', '/rivers/current/opengraph-image', '/plan', '/api/rivers/current']) {
    const response = await legacyRiverRedirect(new NextRequest(`https://eddy.guide${path}`), async () => {
      assert.fail(`Unexpected catalog read for ${path}`);
    });
    assert.equal(response, null, path);
  }
});

test('unknown rivers fall through; catalog outages return a retryable error, not a guessed redirect', async () => {
  const request = new NextRequest('https://eddy.guide/rivers/unknown/access/unknown');
  assert.equal(await legacyRiverRedirect(request, resolveRiver), null);
  const response = await legacyRiverRedirect(request, async () => { throw new Error('catalog unavailable'); });
  assert.equal(response?.status, 503);
  assert.equal(response?.headers.get('location'), null);
  assert.equal(response?.headers.get('retry-after'), '30');
  assert.equal(response?.headers.get('cache-control'), 'no-store');
});
