import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createEmbedBranding } from './cards';

test('branding accepts name-only, logo-only, and both without allowing empty or unsafe registrations', async (t) => {
  const oldUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const oldKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://branding-test.invalid';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-only-key';
  t.after(() => {
    if (oldUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = oldUrl;
    if (oldKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = oldKey;
  });
  const rows: Record<string, unknown>[] = [];
  t.mock.method(globalThis, 'fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    assert.match(String(input), /^https:\/\/branding-test\.invalid\/rest\/v1\/embed_widgets\?/);
    assert.equal(init?.method, 'POST');
    const row = JSON.parse(String(init?.body));
    rows.push(row);
    return Response.json({ embed_id: row.embed_id });
  });

  assert.ok(await createEmbedBranding({ businessName: '  River Camp  ' }));
  assert.equal(rows[0].business_name, 'River Camp');
  assert.equal(rows[0].logo_url, null);

  assert.ok(await createEmbedBranding({ logoUrl: ' https://example.com/logo.png ' }));
  assert.equal(rows[1].business_name, null);
  assert.equal(rows[1].logo_url, 'https://example.com/logo.png');

  assert.ok(await createEmbedBranding({ businessName: 'River Camp', logoUrl: 'https://example.com/logo.svg' }));
  assert.equal(rows[2].business_name, 'River Camp');
  assert.equal(rows[2].logo_url, 'https://example.com/logo.svg');

  assert.equal(await createEmbedBranding({}), null);
  assert.equal(await createEmbedBranding({ businessName: '  ' }), null);
  assert.equal(await createEmbedBranding({ logoUrl: 'javascript:alert(1)' }), null);
  assert.equal(await createEmbedBranding({ businessName: 'River Camp', logoUrl: 'not-a-url' }), null);
  assert.equal(rows.length, 3, 'invalid branding never reaches the database');
});
