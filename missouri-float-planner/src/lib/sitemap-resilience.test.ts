import assert from 'node:assert/strict';
import test from 'node:test';
import sitemap from '../app/sitemap';

test('a database outage preserves static pages and other successful sitemap groups', async (t) => {
  const previousUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const previousKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://sitemap-test.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-only-key';
  t.after(() => {
    if (previousUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL; else process.env.NEXT_PUBLIC_SUPABASE_URL = previousUrl;
    if (previousKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = previousKey;
  });
  t.mock.method(console, 'error', () => {});
  t.mock.method(globalThis, 'fetch', async (input: RequestInfo | URL) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    if (url.pathname.endsWith('/rivers')) return new Response(JSON.stringify({ message: 'database unavailable' }), { status: 400 });
    if (url.pathname.endsWith('/blog_posts')) return Response.json([{ slug: 'current-guide', published_at: '2026-07-01T00:00:00Z', updated_at: '2026-09-01T00:00:00Z' }]);
    return Response.json([{ slug: 'akers-ferry', updated_at: null, rivers: { slug: 'current', state: 'MO' } }]);
  });
  const entries = await sitemap();
  for (const path of ['/app', '/rivers', '/dams', '/blog/current-guide', '/rivers/missouri/current/access/akers-ferry']) {
    assert.ok(entries.some(entry => new URL(entry.url).pathname === path), path);
  }
  assert.ok(entries.every(entry => !/add-photo|llms\.txt|openapi\.json/.test(entry.url)));
  assert.equal(entries.find(entry => entry.url.endsWith('/app'))?.lastModified, undefined);
});

test('rivers with no modification date still contribute their state index', async (t) => {
  const previousUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const previousKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://sitemap-test.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-only-key';
  t.after(() => {
    if (previousUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL; else process.env.NEXT_PUBLIC_SUPABASE_URL = previousUrl;
    if (previousKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = previousKey;
  });
  t.mock.method(globalThis, 'fetch', async (input: RequestInfo | URL) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    return Response.json(url.pathname.endsWith('/rivers') ? [{ slug: 'current', state: 'MO', updated_at: null }] : []);
  });
  const entries = await sitemap();
  assert.ok(entries.some(entry => entry.url.endsWith('/rivers/missouri')));
  assert.ok(entries.some(entry => entry.url.endsWith('/rivers/missouri/current')));
  assert.ok(!entries.some(entry => entry.url.endsWith('/add-photo')));
});
