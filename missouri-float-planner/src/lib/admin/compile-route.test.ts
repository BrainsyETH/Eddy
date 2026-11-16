import assert from 'node:assert/strict';
import test from 'node:test';
import { NextRequest } from 'next/server';
import { POST } from '@/app/api/admin/clips/compile/route';
import { createAdminToken } from '@/lib/admin-auth';

test('compilation dispatch is idempotent and ambiguous provider outcomes stay unknown', async (t) => {
  const env = {
    NEXT_PUBLIC_SUPABASE_URL: 'https://compile-test.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'test-service-key',
    ADMIN_API_SECRET: 'test-admin-key',
    GH_ACTIONS_TOKEN: 'test-github-token',
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
  t.mock.method(console, 'error', () => {});
  t.mock.method(console, 'log', () => {});
  const jobs = new Map<string, Record<string, unknown>>();
  let dispatches = 0;
  let provider: number | 'network' = 204;
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
      if (url.hostname === 'api.github.com') {
        dispatches++;
        if (provider === 'network') throw new TypeError('Connection lost');
        return new Response(null, { status: provider });
      }
      assert.equal(
        url.hostname,
        'compile-test.supabase.co',
        'no production requests',
      );
      if (url.pathname.endsWith('/admin_activity_log'))
        return new Response(null, { status: 201 });
      assert.ok(url.pathname.endsWith('/admin_jobs'), url.pathname);
      if (init?.method === 'POST') {
        const row = JSON.parse(String(init.body));
        if (jobs.has(row.id))
          return Response.json(
            { code: '23505', message: 'Duplicate job' },
            { status: 409 },
          );
        jobs.set(row.id, row);
        return new Response(null, { status: 201 });
      }
      const id = url.searchParams.get('id')!.slice(3);
      if (init?.method === 'PATCH') {
        jobs.set(id, { ...jobs.get(id), ...JSON.parse(String(init.body)) });
        return new Response(null, { status: 204 });
      }
      return Response.json(jobs.get(id));
    },
  );
  const request = (jobId: string, title = 'River highlights') =>
    POST(
      new NextRequest('https://eddy.guide/api/admin/clips/compile', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${createAdminToken()}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          jobId,
          clipIds: [
            '00000000-0000-4000-8000-000000000010',
            '00000000-0000-4000-8000-000000000011',
          ],
          title,
        }),
      }),
    );
  const first = crypto.randomUUID();
  assert.equal((await request(first)).status, 202);
  assert.equal(jobs.get(first)?.state, 'queued');
  assert.equal((await request(first)).status, 200);
  assert.equal(dispatches, 1, 'same request never dispatches twice');
  assert.equal((await request(first, 'Different compilation')).status, 409);
  assert.equal(dispatches, 1);
  for (const [outcome, expected] of [
    [422, 'failed'],
    [503, 'unknown'],
    ['network', 'unknown'],
  ] as const) {
    provider = outcome;
    const id = crypto.randomUUID();
    const response = await request(id);
    assert.equal(response.status, 202);
    assert.equal((await response.json()).job.state, expected);
  }
});
