import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import {
  banMatchFilter,
  hashAppleSubject,
  isSubmitterBanned,
  SubmitterBanLookupError,
  submitterKeys,
} from './submitter-ban';

const USER = '11111111-1111-4111-8111-111111111111';

test('an Apple account yields both keys, and the subject is stored only as a hash', () => {
  const keys = submitterKeys({
    id: USER,
    identities: [
      { provider: 'anonymous', id: 'anon' },
      { provider: 'apple', id: 'fallback', identity_data: { sub: '001234.abcd.0001' } },
    ],
  });
  assert.equal(keys.userId, USER);
  assert.equal(keys.appleSubjectHash, hashAppleSubject('001234.abcd.0001'));
  assert.match(keys.appleSubjectHash ?? '', /^[0-9a-f]{64}$/);
  assert.ok(!banMatchFilter(keys).includes('001234'));
});

test('the identity id stands in when identity_data carries no subject', () => {
  const keys = submitterKeys({ id: USER, identities: [{ provider: 'apple', id: '001234.abcd.0001' }] });
  assert.equal(keys.appleSubjectHash, hashAppleSubject('001234.abcd.0001'));
});

test('an account without Apple is banned by user id alone', () => {
  const keys = submitterKeys({ id: USER, identities: [{ provider: 'anonymous', id: 'x' }] });
  assert.equal(keys.appleSubjectHash, null);
  assert.equal(banMatchFilter(keys), `user_id.eq.${USER}`);
});

test('a ban on either key matches', async () => {
  const keys = { userId: USER, appleSubjectHash: 'ab'.repeat(32) };
  assert.equal(banMatchFilter(keys), `user_id.eq.${USER},apple_subject_hash.eq.${'ab'.repeat(32)}`);
  assert.equal(await isSubmitterBanned(keys, async () => ({ data: [{ id: 'ban' }], error: null })), true);
  assert.equal(await isSubmitterBanned(keys, async () => ({ data: [], error: null })), false);
});

test('a failed lookup is an error, never "not banned"', async () => {
  const keys = { userId: USER, appleSubjectHash: null };
  const failure = { code: '42P01', message: 'relation does not exist' };
  await assert.rejects(isSubmitterBanned(keys, async () => ({ data: null, error: failure })),
    (error: unknown) => error instanceof SubmitterBanLookupError && error.cause === failure);
  const network = new Error('connection reset');
  await assert.rejects(isSubmitterBanned(keys, async () => { throw network; }),
    (error: unknown) => error instanceof SubmitterBanLookupError && error.cause === network);
});

test('the ban table is server-only and enforces one row per key', async () => {
  const dir = new URL('../../../supabase/migrations/', import.meta.url);
  const [file] = readdirSync(dir).filter((name) => name.endsWith('_banned_submitters.sql'));
  assert.ok(file, 'banned_submitters migration exists');
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
      GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
      ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated;
    `);
    const sql = readFileSync(new URL(file, dir), 'utf8');
    await db.exec(sql);
    await db.exec(sql); // idempotent on a retried deploy

    for (const role of ['anon', 'authenticated']) {
      const { rows } = await db.query<{ ok: boolean }>(
        `SELECT has_table_privilege('${role}', 'public.banned_submitters', 'SELECT,INSERT,UPDATE,DELETE') AS ok`,
      );
      assert.equal(rows[0].ok, false, `${role} has no access`);
    }

    await db.exec('SET ROLE service_role');
    await db.exec(`INSERT INTO public.banned_submitters (user_id) VALUES ('${USER}')`);
    await assert.rejects(db.exec(`INSERT INTO public.banned_submitters (user_id) VALUES ('${USER}')`));
    await db.exec(`INSERT INTO public.banned_submitters (apple_subject_hash) VALUES ('h1')`);
    await assert.rejects(db.exec(`INSERT INTO public.banned_submitters (apple_subject_hash) VALUES ('h1')`));
    await assert.rejects(db.exec('INSERT INTO public.banned_submitters (reason) VALUES (\'no key\')'));
    await db.exec('RESET ROLE');
  } finally {
    await db.close();
  }
});
