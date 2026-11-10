import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { assertPublicUrl, BlockedUrlError, fetchPublicUrl, isNonPublicAddress } from './public-url';

const PUBLIC = async () => ['93.184.216.34'];

describe('address classification', () => {
  it('blocks loopback, private, link-local and metadata addresses', () => {
    for (const address of [
      '127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254',
      '0.0.0.0', '100.64.0.1', '::1', '::', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1', '::ffff:7f00:1', 'not-an-ip',
    ]) {
      assert.equal(isNonPublicAddress(address), true, address);
    }
  });

  it('allows ordinary public addresses, including ones next to private ranges', () => {
    for (const address of ['93.184.216.34', '8.8.8.8', '172.15.0.1', '172.32.0.1', '2606:4700:4700::1111']) {
      assert.equal(isNonPublicAddress(address), false, address);
    }
  });
});

describe('assertPublicUrl', () => {
  it('refuses non-https, credentials, literal private IPs and names that resolve inward', async () => {
    await assert.rejects(assertPublicUrl('http://example.com/', { resolve: PUBLIC }), BlockedUrlError);
    await assert.rejects(assertPublicUrl('file:///etc/passwd'), BlockedUrlError);
    await assert.rejects(assertPublicUrl('https://user:pw@example.com/', { resolve: PUBLIC }), BlockedUrlError);
    await assert.rejects(assertPublicUrl('https://169.254.169.254/latest/meta-data/'), BlockedUrlError);
    await assert.rejects(assertPublicUrl('https://[::1]/'), BlockedUrlError);
    await assert.rejects(
      assertPublicUrl('https://internal.example/', { resolve: async () => ['93.184.216.34', '10.0.0.5'] }),
      BlockedUrlError,
    );
    await assert.rejects(assertPublicUrl('https://nowhere.example/', { resolve: async () => [] }), BlockedUrlError);
  });

  it('accepts a public https URL', async () => {
    assert.equal((await assertPublicUrl('https://example.com/a', { resolve: PUBLIC })).hostname, 'example.com');
  });
});

describe('fetchPublicUrl', () => {
  const redirect = (location: string) => new Response(null, { status: 302, headers: { location } });

  it('follows public redirects and reports where it ended', async () => {
    const seen: string[] = [];
    const fetchImpl = (async (url: URL) => {
      seen.push(url.toString());
      return seen.length === 1 ? redirect('https://www.google.com/maps/place/x') : new Response('ok');
    }) as unknown as typeof fetch;
    const result = await fetchPublicUrl('https://maps.app.goo.gl/abc', { resolve: PUBLIC, fetchImpl });
    assert.equal(result.finalUrl, 'https://www.google.com/maps/place/x');
    assert.equal(seen.length, 2);
  });

  it('stops at a redirect that points inside, without requesting it', async () => {
    const seen: string[] = [];
    const fetchImpl = (async (url: URL) => {
      seen.push(url.toString());
      return redirect('https://169.254.169.254/latest/meta-data/');
    }) as unknown as typeof fetch;
    await assert.rejects(fetchPublicUrl('https://goo.gl/x', { resolve: PUBLIC, fetchImpl }), BlockedUrlError);
    assert.deepEqual(seen, ['https://goo.gl/x']);
  });

  it('gives up on a redirect loop', async () => {
    const fetchImpl = (async () => redirect('https://example.com/again')) as unknown as typeof fetch;
    await assert.rejects(fetchPublicUrl('https://example.com/', { resolve: PUBLIC, fetchImpl, maxRedirects: 3 }), /Too many redirects/);
  });
});
