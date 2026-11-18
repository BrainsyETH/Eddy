import assert from 'node:assert/strict';
import test from 'node:test';
import { NextRequest } from 'next/server';
import { createAdminToken } from '@/lib/admin-auth';
import { GET } from '@/app/api/admin/ai-models/test/route';
import { WORKLOAD_SPECS } from './model-registry';

test('the test panel baseline follows production config, including its safe defaults', async (t) => {
  const fixtureEnv = {
    ADMIN_API_SECRET: 'model-test-fixture',
    ADMIN_ALLOW_RECOVERY_ACCESS: 'true',
    NEXT_PUBLIC_SUPABASE_URL: 'https://model-test-fixture.invalid',
    SUPABASE_SERVICE_ROLE_KEY: 'fixture-service-key',
  };
  const previousEnv = Object.fromEntries(Object.keys(fixtureEnv).map((key) => [key, process.env[key]]));
  Object.assign(process.env, fixtureEnv);
  t.after(() => {
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  let stored: string | null = null;
  let configError = false;
  let samplesError = false;
  const paths: string[] = [];
  // Exercise the real route, auth and Supabase client against fixture replies.
  // No database or model request can leave this test.
  t.mock.method(globalThis, 'fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    assert.equal(url.origin, fixtureEnv.NEXT_PUBLIC_SUPABASE_URL);
    assert.equal(init?.method ?? 'GET', 'GET');
    paths.push(url.pathname);
    if (url.pathname === '/rest/v1/llm_config') {
      return configError
        ? Response.json({ message: 'Fixture config unavailable' }, { status: 503 })
        : Response.json(stored == null ? [] : [{ river_update: stored }]);
    }
    assert.equal(url.pathname, '/rest/v1/eddy_generation_log');
    return samplesError
      ? Response.json({ message: 'Fixture samples unavailable' }, { status: 503 })
      : Response.json([]);
  });

  const defaultId = WORKLOAD_SPECS.river_update.default;
  for (const [selection, expected] of [
    [null, defaultId],
    ['claude-sonnet-5', 'claude-sonnet-5'],
    ['claude-haiku-4-5-20251001', 'claude-haiku-4-5-20251001'],
    ['unrecognised-model', defaultId],
    // An OpenAI selection is the production model, so it is the baseline.
    ['gpt-6.2-sol', 'gpt-6.2-sol'],
  ]) {
    stored = selection;
    const response = await GET(new NextRequest('http://localhost/api/admin/ai-models/test', {
      headers: { authorization: `Bearer ${createAdminToken()}` },
    }));
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.baseline.id, expected, `stored: ${selection}`);
    assert.deepEqual(payload.baseline, payload.models.find((model: { id: string }) => model.id === expected));
  }

  stored = 'claude-sonnet-5';
  for (const unavailable of ['config', 'samples']) {
    configError = unavailable === 'config';
    samplesError = unavailable === 'samples';
    const response = await GET(new NextRequest('http://localhost/api/admin/ai-models/test', {
      headers: { authorization: `Bearer ${createAdminToken()}` },
    }));
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.baseline.id, configError ? defaultId : stored);
    assert.equal(Boolean(payload.samplesError), samplesError);
  }
  assert.equal(paths.filter((path) => path === '/rest/v1/llm_config').length, 7);
});
