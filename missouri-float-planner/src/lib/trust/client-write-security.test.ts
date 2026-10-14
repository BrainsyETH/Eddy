import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { CLIENT_ACCESS_SQL, parseClientAccessProblems } from '../../../scripts/lib/client-access-contract';

const migrations = new URL('../../../supabase/migrations/', import.meta.url);
function migration(suffix: string): string {
  const files = readdirSync(migrations).filter(name => name.endsWith(`_${suffix}.sql`));
  assert.equal(files.length, 1, `One migration must own ${suffix}`);
  return readFileSync(new URL(files[0], migrations), 'utf8');
}

const owner = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';

test('report writes require the server even after a client table privilege is re-granted', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
      CREATE SCHEMA auth;
      GRANT USAGE ON SCHEMA auth, public TO anon, authenticated, service_role;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
        $$ SELECT nullif(current_setting('test.uid', true), '')::uuid $$;
      CREATE FUNCTION public.is_admin() RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
      CREATE TABLE public.community_reports (
        id integer PRIMARY KEY, user_id uuid, status text NOT NULL DEFAULT 'pending', description text
      );
      ALTER TABLE public.community_reports ENABLE ROW LEVEL SECURITY;
      GRANT SELECT, INSERT, UPDATE ON public.community_reports TO anon, authenticated, service_role;
      GRANT INSERT (status), UPDATE (status) ON public.community_reports TO PUBLIC, authenticated;
      CREATE POLICY community_reports_select ON public.community_reports FOR SELECT
        USING (status = 'verified' OR auth.uid() = user_id OR is_admin());
      CREATE POLICY community_reports_insert ON public.community_reports FOR INSERT
        WITH CHECK (auth.uid() IS NOT NULL);
      CREATE POLICY community_reports_update ON public.community_reports FOR UPDATE
        USING (auth.uid() = user_id OR is_admin());
      INSERT INTO public.community_reports VALUES (1, '${owner}', 'pending', 'Own report');
      INSERT INTO public.community_reports VALUES (2, '${other}', 'verified', 'Published');
      SET test.uid = '${owner}';
    `);
    await db.exec(migration('community_reports_server_writes_only'));
    // Idempotence matters if deployment is retried after a transport failure.
    await db.exec(migration('community_reports_server_writes_only'));
    for (const role of ['anon', 'authenticated']) {
      const grants = await db.query<{ insert_ok: boolean; update_ok: boolean }>(`
        SELECT has_any_column_privilege('${role}', 'public.community_reports', 'INSERT') AS insert_ok,
               has_any_column_privilege('${role}', 'public.community_reports', 'UPDATE') AS update_ok
      `);
      assert.deepEqual(grants.rows[0], { insert_ok: false, update_ok: false });
      await db.exec(`SET ROLE ${role}`);
      await assert.rejects(db.exec(`INSERT INTO public.community_reports VALUES (3, '${other}', 'verified', 'Forged')`));
      await assert.rejects(db.exec(`UPDATE public.community_reports SET status = 'verified' WHERE id = 1`));
      await db.exec('RESET ROLE');
    }
    await db.exec('GRANT INSERT, UPDATE ON public.community_reports TO authenticated; SET ROLE authenticated');
    await assert.rejects(db.exec(`INSERT INTO public.community_reports VALUES (3, '${owner}', 'pending', 'Direct')`));
    await db.exec(`UPDATE public.community_reports SET status = 'verified' WHERE id = 1`);
    const own = await db.query<{ status: string }>('SELECT status FROM public.community_reports WHERE id = 1');
    assert.equal(own.rows[0].status, 'pending', 'No UPDATE policy: promotion affects no rows');
    await db.exec(`RESET ROLE; SET ROLE service_role;
      INSERT INTO public.community_reports VALUES (3, '${owner}', 'pending', 'Server submission');
      UPDATE public.community_reports SET status = 'verified' WHERE id = 3;
      RESET ROLE; RESET test.uid; SET ROLE anon;`);
    const published = await db.query<{ id: number }>('SELECT id FROM public.community_reports ORDER BY id');
    assert.deepEqual(published.rows.map(row => row.id), [2, 3], 'Public approved-report reads still work');
  } finally {
    await db.close();
  }
});

test('maintenance RPCs deny public roles and retain service-role access with safe search paths', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
      CREATE SCHEMA extensions;
      CREATE TABLE public.community_reports(id integer);
      ALTER TABLE public.community_reports ENABLE ROW LEVEL SECURITY;
      GRANT INSERT, UPDATE ON public.community_reports TO service_role;
      GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
      CREATE TABLE public.clip_library(id uuid PRIMARY KEY, posting_claimed_at timestamptz);
      INSERT INTO public.clip_library VALUES ('${owner}', NULL);
      CREATE FUNCTION public.link_jacks_fork_nps_campgrounds() RETURNS integer
        LANGUAGE sql SECURITY DEFINER AS $$ SELECT 0 $$;
      GRANT EXECUTE ON FUNCTION public.link_jacks_fork_nps_campgrounds() TO anon, authenticated;
    `);
    await db.exec(migration('claim_clip_for_posting'));
    await db.exec('GRANT EXECUTE ON FUNCTION public.claim_clip_for_posting(uuid, integer) TO anon, authenticated');
    await db.exec(migration('maintenance_rpcs_service_role_only'));
    const inspect = async () => parseClientAccessProblems((await db.query(CLIENT_ACCESS_SQL)).rows);
    assert.deepEqual(await inspect(), []);
    await db.exec(`CREATE FUNCTION public.accidental_public_definer() RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$ SELECT true $$`);
    assert.deepEqual(await inspect(), ['Unexpected public SECURITY DEFINER RPC: accidental_public_definer()']);
    await db.exec('REVOKE EXECUTE ON FUNCTION public.accidental_public_definer() FROM PUBLIC');
    assert.deepEqual(await inspect(), []);
    for (const role of ['anon', 'authenticated']) {
      await db.exec(`SET ROLE ${role}`);
      await assert.rejects(db.query('SELECT public.claim_clip_for_posting($1, 15)', [owner]));
      await assert.rejects(db.query('SELECT public.link_jacks_fork_nps_campgrounds()'));
      await db.exec('RESET ROLE');
    }
    await db.exec('SET ROLE service_role');
    const first = await db.query<{ claimed: boolean }>('SELECT public.claim_clip_for_posting($1, 15) AS claimed', [owner]);
    const second = await db.query<{ claimed: boolean }>('SELECT public.claim_clip_for_posting($1, 15) AS claimed', [owner]);
    assert.equal(first.rows[0].claimed, true);
    assert.equal(second.rows[0].claimed, false, 'Existing atomic claim semantics are preserved');
    await db.query('SELECT public.link_jacks_fork_nps_campgrounds()');
    await db.exec('RESET ROLE');
    const paths = await db.query<{ proname: string; proconfig: string[] }>(`
      SELECT proname, proconfig FROM pg_proc
      WHERE proname IN ('claim_clip_for_posting', 'link_jacks_fork_nps_campgrounds') ORDER BY proname
    `);
    assert.deepEqual(paths.rows.map(row => row.proconfig), [
      ['search_path=public, pg_temp'], ['search_path=public, extensions, pg_temp'],
    ]);
  } finally {
    await db.close();
  }
});

test('catalog result parser rejects missing output instead of claiming a pass', () => {
  assert.deepEqual(parseClientAccessProblems({result: [{client_access_problems: []}]}), []);
  assert.throws(() => parseClientAccessProblems({error: 'unavailable'}));
  assert.throws(() => parseClientAccessProblems([{client_access_problems: null}]));
});
