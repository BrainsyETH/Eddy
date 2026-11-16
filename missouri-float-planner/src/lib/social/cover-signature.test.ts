import assert from 'node:assert/strict';
import test from 'node:test';
import { coverTrust, signCoverUrl, storedCoverCandidates } from './cover-signature';

const ENV = { CRON_SECRET: 'cron-secret', NODE_ENV: 'production' };
const PINNED = 'https://eddy.guide/api/og/social?type=forecast&platform=instagram&river=current&condition=good&ft=3.2';

const query = (url: string) => new URL(url).searchParams;

test('a URL Eddy signed is trusted', () => {
  assert.equal(coverTrust(query(signCoverUrl(PINNED, ENV)), ENV), 'signed');
});

test('the same pins without a signature are not', () => {
  // The whole point: anyone could write this URL.
  assert.equal(coverTrust(query(PINNED), ENV), 'unsigned');
});

test('changing a pinned value breaks the signature', () => {
  const forged = signCoverUrl(PINNED, ENV).replace('condition=good', 'condition=dangerous');
  assert.equal(coverTrust(query(forged), ENV), 'unsigned');
});

test('adding a pin to a signed URL breaks the signature', () => {
  assert.equal(coverTrust(query(`${signCoverUrl(PINNED, ENV)}&rain=1`), ENV), 'unsigned');
});

test('a signature from another secret is not trusted', () => {
  const other = signCoverUrl(PINNED, { CRON_SECRET: 'someone-else' });
  assert.equal(coverTrust(query(other), ENV), 'unsigned');
});

test('reordering the query does not break a cover', () => {
  const signed = new URL(signCoverUrl(PINNED, ENV));
  const reordered = new URLSearchParams([...signed.searchParams.entries()].reverse());
  assert.equal(coverTrust(reordered, ENV), 'signed');
});

test('a URL that states no facts needs no signature', () => {
  for (const search of [
    'type=digest',
    'type=forecast&platform=instagram',
    'type=tip&id=6f1c1a0e-0000-4000-8000-000000000000',
    'type=highlight&river=current&id=abc&art=photo.current-river',
    'type=favorite&river=current&fromSlug=akers&toSlug=pulltite',
    'type=trend&river=current&asOf=2026-11-01T12:00:00Z',
  ]) {
    assert.equal(coverTrust(new URLSearchParams(search), ENV), 'unpinned', search);
  }
});

test('every parameter that states a fact needs one', () => {
  for (const search of [
    'type=highlight&river=current&ft=18',
    'type=highlight&river=current&condition=dangerous',
    'type=highlight&river=current&at=2026-11-01',
    'type=forecast&wx=90|70|0|Sunny',
    'type=forecast&bets=3',
    'type=forecast&rain=1',
    'type=section&river=current&time=anything',
    'type=section&river=current&putInMile=1&takeOutMile=9',
    'type=clip&id=x&creator=someone',
    'type=storm&rivers=current:dangerous',
    'type=weekend-read&rivers=current:good:3.2,meramec:good:',
    'type=warning&river=current&from=good&to=dangerous',
    'type=warning&river=current&rise=up+six+feet',
    'type=warning&river=current&kind=recovery',
    'type=digest&anything=else',
  ]) {
    assert.equal(coverTrust(new URLSearchParams(search), ENV), 'unsigned', search);
  }
});

test('signing covers the encoding the builder chose', () => {
  const url = 'https://eddy.guide/api/og/social?type=warning&river=current&rise=up%206%20ft&platform=facebook';
  const signed = signCoverUrl(url, ENV);
  assert.ok(signed.startsWith(`${url}&sig=v1.`), 'the original string is kept, the signature appended');
  assert.equal(coverTrust(query(signed), ENV), 'signed');
});

test('signing twice gives the same URL', () => {
  const once = signCoverUrl(PINNED, ENV);
  assert.equal(signCoverUrl(once, ENV), once);
});

test('the dedicated secret takes over from CRON_SECRET', () => {
  const env = { ...ENV, SOCIAL_COVER_SIGNING_SECRET: 'cover-secret' };
  assert.notEqual(signCoverUrl(PINNED, env), signCoverUrl(PINNED, ENV));
  assert.equal(coverTrust(query(signCoverUrl(PINNED, env)), env), 'signed');
  assert.equal(coverTrust(query(signCoverUrl(PINNED, ENV)), env), 'unsigned');
});

test('with no secret, nothing is signed', () => {
  assert.equal(signCoverUrl(PINNED, {}), PINNED);
});

test('with no secret, production fails closed and development stays usable', () => {
  assert.equal(coverTrust(query(PINNED), { NODE_ENV: 'production' }), 'unsigned');
  assert.equal(coverTrust(query(PINNED), { NODE_ENV: 'development' }), 'signed');
});

test('a stored cover is looked up under the hosts it was stored with', () => {
  assert.deepEqual(
    storedCoverCandidates('/api/og/social', '?type=storm&rivers=current:high', 'https://preview.example.com'),
    [
      'https://eddy.guide/api/og/social?type=storm&rivers=current:high',
      'https://www.eddy.guide/api/og/social?type=storm&rivers=current:high',
      'https://preview.example.com/api/og/social?type=storm&rivers=current:high',
    ],
  );
});

test('an absurdly long query is not looked up at all', () => {
  assert.deepEqual(storedCoverCandidates('/api/og/social', `?type=storm&rivers=${'x'.repeat(3000)}`), []);
  assert.deepEqual(storedCoverCandidates('/api/og/social', ''), []);
});
