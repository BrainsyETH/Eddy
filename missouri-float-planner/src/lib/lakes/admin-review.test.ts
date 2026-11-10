import assert from 'node:assert/strict';
import test from 'node:test';
import { NextRequest } from 'next/server';
import { PATCH } from '@/app/api/admin/lake-launches/[id]/route';
import { createAdminToken } from '@/lib/admin-auth';

const id = '00000000-0000-4000-8000-000000000001';
const pointId = '00000000-0000-4000-8000-000000000002';
const current = { id, name: 'Test launch', approved: true, launch_methods: ['trailer'], sources: [{ provider: 'Agency' }], longitude: -93.4, latitude: 38.2 };

test('admin edits validate the resulting approval and return useful, sanitized database errors', async (t) => {
  const env = { NEXT_PUBLIC_SUPABASE_URL: 'https://lake-review-test.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'test-only-service-key', ADMIN_API_SECRET: 'test-only-admin-key' };
  const original = Object.fromEntries(Object.keys(env).map(key => [key, process.env[key]]));
  Object.assign(process.env, env);
  t.after(() => { for (const [key, value] of Object.entries(original)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } });
  t.mock.method(console, 'error', () => {});
  let row: typeof current | null = current;
  let writeError: string | undefined;
  let writes: Record<string, unknown>[] = [];
  t.mock.method(globalThis, 'fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input : input.url);
    assert.equal(url.hostname, 'lake-review-test.supabase.co', 'no production requests');
    if (url.pathname.endsWith('/access_points')) return Response.json([{ id: pointId }]);
    if (url.pathname.endsWith('/admin_activity_log')) return new Response(null, { status: 201 });
    assert.ok(url.pathname.endsWith('/lake_launches'), url.pathname);
    if (init?.method === 'PATCH') {
      const update = JSON.parse(String(init.body)) as Record<string, unknown>;
      writes.push(update);
      if (writeError) return Response.json({ code: writeError, message: 'PRIVATE database details must not leak' }, { status: 400 });
      return Response.json({ ...row, ...update });
    }
    return Response.json(row ? [row] : []);
  });
  async function patch(body: Record<string, unknown>) {
    return PATCH(new NextRequest(`https://eddy.guide/api/admin/lake-launches/${id}`, {
      method: 'PATCH', headers: { authorization: `Bearer ${createAdminToken()}`, 'content-type': 'application/json' }, body: JSON.stringify(body),
    }), { params: Promise.resolve({ id }) });
  }

  let response = await patch({ launch_methods: [] });
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /unpublish/);
  assert.equal(writes.length, 0, 'reject before attempting a constraint-breaking write');

  response = await patch({ approved: false, launch_methods: [] });
  assert.equal(response.status, 200);
  assert.equal(writes[0].approved, false);
  assert.equal(writes[0].approved_at, null);

  row = { ...current, approved: false, launch_methods: [] };
  writes = [];
  response = await patch({ approved: true });
  assert.equal(response.status, 400);
  assert.equal(writes.length, 0);
  response = await patch({ approved: true, launch_methods: ['trailer'] });
  assert.equal(response.status, 200, 'human can approve after choosing a method');

  row = current;
  for (const [code, status] of [['23505', 409], ['23514', 400], ['23503', 400], ['XX000', 500]] as const) {
    writeError = code;
    response = await patch({ access_point_id: pointId });
    assert.equal(response.status, status, code);
    assert.doesNotMatch(JSON.stringify(await response.json()), /PRIVATE|database details/);
  }
  writeError = undefined;
  row = null;
  response = await patch({ review_note: 'Reviewed' });
  assert.equal(response.status, 404);
});
