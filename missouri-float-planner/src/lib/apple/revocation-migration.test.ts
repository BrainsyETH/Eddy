import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

test('auth deletion atomically preserves the token, with private queue permissions', async () => {
  const db = new PGlite();
  const user = '11111111-1111-1111-1111-111111111111';
  const guest = '22222222-2222-2222-2222-222222222222';
  try {
    await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated;
      CREATE ROLE service_role BYPASSRLS; CREATE ROLE supabase_auth_admin;
      CREATE SCHEMA auth;
      GRANT USAGE ON SCHEMA auth TO supabase_auth_admin;
      CREATE TABLE auth.users (id uuid PRIMARY KEY);
      GRANT SELECT, DELETE ON auth.users TO supabase_auth_admin;
      CREATE TABLE public.apple_refresh_tokens (
        user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
        refresh_token text NOT NULL
      );
      INSERT INTO auth.users VALUES ('${user}'), ('${guest}');
      INSERT INTO public.apple_refresh_tokens VALUES ('${user}', 'test-token');
    `);
    const migrations = new URL('../../../supabase/migrations/', import.meta.url);
    const file = readdirSync(migrations).find(name => name.endsWith('_apple_revocation_outbox.sql'));
    assert.ok(file);
    await db.exec(readFileSync(new URL(file, migrations), 'utf8'));

    // A queue failure must roll back auth deletion and retain the original token.
    await db.exec('ALTER TABLE public.apple_token_revocations ADD CONSTRAINT reject_queue CHECK (false);');
    await assert.rejects(db.exec(`SET ROLE supabase_auth_admin; DELETE FROM auth.users WHERE id='${user}';`));
    await db.exec('RESET ROLE;');
    assert.equal((await db.query('SELECT * FROM auth.users')).rows.length, 2);
    assert.equal((await db.query('SELECT * FROM public.apple_refresh_tokens')).rows.length, 1);
    await db.exec('ALTER TABLE public.apple_token_revocations DROP CONSTRAINT reject_queue;');

    // Auth's own role can delete, although it has no direct queue privileges.
    await db.exec(`SET ROLE supabase_auth_admin; DELETE FROM auth.users; RESET ROLE;`);
    assert.equal((await db.query('SELECT * FROM auth.users')).rows.length, 0);
    assert.equal((await db.query('SELECT * FROM public.apple_refresh_tokens')).rows.length, 0);
    const rows = (await db.query<{ id: string; refresh_token: string }>('SELECT id, refresh_token FROM public.apple_token_revocations')).rows;
    assert.deepEqual(rows, [{ id: user, refresh_token: 'test-token' }]);

    for (const role of ['anon', 'authenticated', 'supabase_auth_admin']) {
      const acl = await db.query<{ allowed: boolean }>(`SELECT has_table_privilege('${role}', 'public.apple_token_revocations', 'SELECT') AS allowed`);
      assert.equal(acl.rows[0].allowed, false);
    }
    const fn = await db.query<{ allowed: boolean }>("SELECT has_function_privilege('authenticated', 'eddy_private.queue_apple_revocation()', 'EXECUTE') AS allowed");
    assert.equal(fn.rows[0].allowed, false);
    await db.exec('SET ROLE service_role; DELETE FROM public.apple_token_revocations; RESET ROLE;');
    assert.equal((await db.query('SELECT * FROM public.apple_token_revocations')).rows.length, 0);
  } finally {
    await db.close();
  }
});
