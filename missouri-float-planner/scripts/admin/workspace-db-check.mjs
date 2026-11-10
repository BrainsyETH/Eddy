// Runs the new migration in ephemeral PostgreSQL; no remote credentials or writes.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const db = new PGlite();
await db.exec(`create role anon; create role authenticated; create role service_role bypassrls; create schema auth;
create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,deleted_at timestamptz);
create table public.rivers(id uuid primary key,name text);
create table public.river_hazards(id uuid primary key,name text);
create table public.community_reports(id uuid primary key,status text,created_at timestamptz,river_id uuid,hazard_id uuid,type text,description text);
insert into auth.users values('00000000-0000-4000-8000-000000000001','owner@example.invalid',now(),null),('00000000-0000-4000-8000-000000000002','second@example.invalid',now(),null),('00000000-0000-4000-8000-000000000003','unverified@example.invalid',null,null);`);
await db.exec(
  readFileSync(
    'supabase/migrations/20261110222453_admin_workspace.sql',
    'utf8',
  ),
);
async function member(email, name, role, active = true, version = null) {
  return (
    await db.query(
      'select public.set_admin_membership($1,$2,$3,$4,$5) result',
      [email, name, role, active, version],
    )
  ).rows[0].result;
}
await assert.rejects(
  member('second@example.invalid', 'Editor', 'editor'),
  /active owner first/,
);
await assert.rejects(
  member('unverified@example.invalid', 'Owner', 'owner'),
  /verified Eddy/,
);
const owner = await member('owner@example.invalid', 'Owner', 'owner');
await assert.rejects(
  member(
    'owner@example.invalid',
    'Owner',
    'editor',
    true,
    owner.after.updated_at,
  ),
  /at least one active owner/,
);
await assert.rejects(
  member('owner@example.invalid', 'Owner', 'owner', true, '2020-01-01'),
  /Access changed/,
);
await member('second@example.invalid', 'Second', 'owner');
await member(
  'owner@example.invalid',
  'Editor',
  'editor',
  true,
  owner.after.updated_at,
);
for (const ok of [false, false, true, false])
  await db.query('select public.record_admin_incident($1,$2,$3)', [
    'sync-gauges',
    ok,
    'Test failure',
  ]);
const incidents = (
  await db.query('select * from admin_incidents order by started_at')
).rows;
assert.equal(incidents.length, 2);
assert.equal(incidents[0].occurrences, 2);
assert.ok(incidents[0].recovered_at);
assert.equal(incidents[1].recovered_at, null);
await db.exec(
  `insert into rivers values('00000000-0000-4000-8000-000000000010','Buffalo'); insert into community_reports select gen_random_uuid(),'pending',now(),'00000000-0000-4000-8000-000000000010',null,'hazard',case when i=75 then 'Bridge 50% _blocked' else 'Routine report' end from generate_series(1,75) i;`,
);
assert.equal(
  (
    await db.query(
      "select * from admin_report_matches('50% _blocked','pending','hazard')",
    )
  ).rows.length,
  1,
);
assert.equal(
  (
    await db.query(
      "select * from admin_report_matches('Buffalo','pending','hazard')",
    )
  ).rows.length,
  75,
);
for (const role of ['anon', 'authenticated']) {
  await db.exec(`set role ${role}`);
  await assert.rejects(
    db.query('select * from public.admin_memberships'),
    /permission denied/,
  );
  await assert.rejects(
    db.query(
      "select public.set_admin_membership('owner@example.invalid','Owner','owner',true,null)",
    ),
    /permission denied/,
  );
  await assert.rejects(
    db.query('select * from public.admin_report_matches()'),
    /permission denied/,
  );
  await db.exec('reset role');
}
console.log(
  'PASS: migration SQL, owner safeguards, stale membership rejection, incident lifecycle, full-queue literal search, and public-role denial.',
);
await db.close();
