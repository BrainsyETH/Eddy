import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { NextRequest } from 'next/server';
import { PUT } from '@/app/api/admin/blog/[id]/route';
import { createAdminToken } from '@/lib/admin-auth';

const id = '00000000-0000-4000-8000-000000000001';
const version = '2026-11-10T12:00:00Z';

test('blog updates preserve content, publish with a date, and reject stale or incompatible guide edits', async (t) => {
  const env = {
    NEXT_PUBLIC_SUPABASE_URL: 'https://blog-test.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'test-service-key',
    ADMIN_API_SECRET: 'test-admin-secret',
  };
  const original = Object.fromEntries(
    Object.keys(env).map((key) => [key, process.env[key]]),
  );
  Object.assign(process.env, env);
  t.after(() => {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
  const cache = createRequire(`${process.cwd()}/package.json`)('next/cache');
  const paths: string[] = [];
  t.mock.method(cache, 'revalidatePath', (path: string) => paths.push(path));
  t.mock.method(console, 'error', () => {});
  let current: Record<string, unknown> = {
    id,
    title: 'River story',
    slug: 'river-story',
    category: 'Guides',
    content: '<p>Keep this body.</p>',
    status: 'draft',
    published_at: null,
    updated_at: version,
    guide_data: null,
  };
  const writes: Record<string, unknown>[] = [];
  let raced = false;
  t.mock.method(
    globalThis,
    'fetch',
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input
            : input.url,
      );
      assert.equal(
        url.hostname,
        'blog-test.supabase.co',
        'no production requests',
      );
      if (url.pathname.endsWith('/admin_activity_log'))
        return new Response(null, { status: 201 });
      assert.ok(url.pathname.endsWith('/blog_posts'), url.pathname);
      if (init?.method === 'PATCH') {
        assert.equal(url.searchParams.get('updated_at'), `eq.${version}`);
        const update = JSON.parse(String(init.body));
        writes.push(update);
        if (raced)
          return Response.json(
            { code: 'PGRST116', message: 'No matching version' },
            { status: 406 },
          );
        return Response.json({ ...current, ...update });
      }
      return Response.json([current]);
    },
  );
  const put = (body: Record<string, unknown>) =>
    PUT(
      new NextRequest(`https://eddy.guide/api/admin/blog/${id}`, {
        method: 'PUT',
        headers: {
          authorization: `Bearer ${createAdminToken()}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ expectedUpdatedAt: version, ...body }),
      }),
      { params: Promise.resolve({ id }) },
    );

  const published = await put({
    status: 'published',
    publishedAt: null,
    title: 'Updated title',
  });
  assert.equal(published.status, 200);
  const post = (await published.json()).post;
  assert.equal(post.content, '<p>Keep this body.</p>');
  assert.ok(
    Date.parse(post.publishedAt) <= Date.now(),
    'the public <= now query can find the post',
  );
  assert.equal(
    Object.hasOwn(writes[0], 'content'),
    false,
    'an untouched editor body is not written',
  );
  assert.ok(paths.includes('/blog/river-story'));

  const count = writes.length;
  assert.equal(
    (await put({ expectedUpdatedAt: 'stale', title: 'Overwrite' })).status,
    409,
  );
  assert.equal(
    (await put({ status: 'scheduled', publishedAt: null })).status,
    400,
  );
  assert.equal(writes.length, count);

  current = {
    ...current,
    category: 'River Guides',
    content: null,
    guide_data: { kind: 'river' },
  };
  assert.equal(
    (await put({ title: 'Guide metadata', category: 'River Guides' })).status,
    200,
  );
  assert.equal(Object.hasOwn(writes.at(-1)!, 'guide_data'), false);
  assert.equal((await put({ category: 'Tips' })).status, 400);
  raced = true;
  assert.equal((await put({ title: 'Concurrent change' })).status, 409);
});
