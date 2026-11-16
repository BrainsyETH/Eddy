import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';

// The trial's tables are only evidence if a logged estimate cannot be revised
// and cannot be back-dated. Those are properties of the migration, so they are
// tested against the migration itself.

const MIGRATION = 'supabase/migrations/20261113033326_release_arrival_trial.sql';

const COLUMNS =
  'dam_id, gauge_site_id, onset_hour, rule_version, decision, reason, all_reasons, predicted_arrival_at, range_early_at, range_late_at, flags, inputs';

function prediction(hoursAgo: number, decision: 'issued' | 'withheld') {
  const onset = `date_trunc('hour', now()) - interval '${hoursAgo} hours'`;
  const estimate =
    decision === 'issued'
      ? `${onset} + interval '13 hours', ${onset} + interval '11 hours 30 minutes', ${onset} + interval '14 hours 15 minutes'`
      : 'null, null, null';
  const reason = decision === 'issued' ? "null, '{}'" : "'river high', '{river high}'";
  return `insert into release_arrival_predictions (${COLUMNS})
    values ('swl-bull-shoals-dam', '07057370', ${onset}, 'norfork-v1', '${decision}', ${reason}, ${estimate}, '{}', '{}'::jsonb)
    returning id`;
}

test('the trial log is append-only, server-stamped and closed to clients', async () => {
  const db = new PGlite();
  try {
    await db.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;');
    await db.exec(readFileSync(MIGRATION, 'utf8'));
    await db.exec('SET ROLE service_role');

    const issued = await db.query<{ id: string }>(prediction(3, 'issued'));
    const id = issued.rows[0].id;
    await db.query(prediction(9, 'withheld'));

    // An estimate for an increase whose window has already opened is refused.
    await assert.rejects(() => db.query(prediction(6, 'issued')), /written_before_window/);
    // One row per increase and rule version.
    await assert.rejects(() => db.query(prediction(3, 'issued')), /one_per_increase/);
    // An issued row carries its whole estimate; a withheld one carries none.
    await assert.rejects(
      () =>
        db.query(
          `insert into release_arrival_predictions (${COLUMNS}) values ('d', '07057370', date_trunc('hour', now()), 'v', 'issued', null, '{}', null, null, null, '{}', '{}'::jsonb)`
        ),
      /issued_is_complete/
    );
    await assert.rejects(
      () =>
        db.query(
          `insert into release_arrival_predictions (${COLUMNS}) values ('d', '07057370', now(), 'v', 'withheld', 'river high', '{river high}', null, null, null, '{}', '{}'::jsonb)`
        ),
      /hour_truncated/
    );

    // The application cannot choose the time a decision was recorded.
    await assert.rejects(
      () =>
        db.query(
          `insert into release_arrival_predictions (${COLUMNS}, decided_at) values ('d', '07057370', date_trunc('hour', now()) - interval '9 hours', 'v', 'withheld', 'river high', '{river high}', null, null, null, '{}', '{}'::jsonb, now() - interval '8 hours')`
        ),
      /permission denied/
    );
    // Nor revise or remove a row once it exists.
    await assert.rejects(() => db.query(`update release_arrival_predictions set decision = 'withheld'`), /permission denied/);
    await assert.rejects(() => db.query('delete from release_arrival_predictions'), /permission denied/);

    const outcome = `insert into release_arrival_outcomes
      (prediction_id, status, first_rise_at, matched_rise_at, rise_candidates, competing_increases, details)
      values ($1, 'matched', now(), now(), 1, 1, '{}'::jsonb)`;
    await db.query(outcome, [id]);
    await assert.rejects(() => db.query(outcome, [id]), /duplicate key/);
    await assert.rejects(() => db.query(`update release_arrival_outcomes set status = 'ambiguous'`), /permission denied/);
    await assert.rejects(
      () =>
        db.query(
          `insert into release_arrival_outcomes (prediction_id, status, rise_candidates, competing_increases, details, evaluated_at) values ($1, 'no rise found', 0, 0, '{}'::jsonb, now())`,
          [id]
        ),
      /permission denied/
    );

    // What is noticed while water travels, and that a pass ran, are logged the same way.
    const watch = `insert into release_arrival_watch_events (prediction_id, kind, details) values ($1, 'tributaries moving', '{}'::jsonb)`;
    await db.query(watch, [id]);
    await assert.rejects(() => db.query(watch, [id]), /first_sighting_only/);
    await assert.rejects(
      () => db.query(`insert into release_arrival_watch_events (prediction_id, kind, details, observed_at) values ($1, 'tributaries moving', '{}'::jsonb, now() - interval '5 hours')`, [id]),
      /permission denied/
    );
    await assert.rejects(() => db.query('delete from release_arrival_watch_events'), /permission denied/);
    await db.query(`insert into release_arrival_passes (rule_version, state, release_through, summary) values ('norfork-v1', 'active', now(), '{"issued":1}'::jsonb)`);
    await db.query(`insert into release_arrival_passes (rule_version, state, summary) values ('norfork-v1', 'paused', '{}'::jsonb)`);
    await assert.rejects(
      () => db.query(`insert into release_arrival_passes (rule_version, state, summary, ran_at) values ('norfork-v1', 'active', '{}'::jsonb, now() - interval '2 days')`),
      /permission denied/
    );
    await assert.rejects(() => db.query(`update release_arrival_passes set state = 'active'`), /permission denied/);
    await assert.rejects(() => db.query('delete from release_arrival_passes'), /permission denied/);
    const passes = await db.query<{ n: number }>('select count(*)::int n from release_arrival_passes');
    assert.equal(passes.rows[0].n, 2);

    // The runbook's own queries run against these tables as written.
    const queries = Array.from(
      readFileSync('../docs/release-arrival-trial.md', 'utf8').matchAll(/```sql\n([\s\S]*?)```/g),
      (m) => m[1]
    );
    assert.equal(queries.length, 3);
    const breakdown = await db.query<{ decision: string; reason: string; status: string | null }>(queries[0]);
    assert.deepEqual(
      breakdown.rows.map((r) => `${r.decision}/${r.reason}/${r.status}`).sort(),
      ['issued/issued/matched', 'withheld/river high/null']
    );
    const marks = await db.query<{ scored: number; within_2h: string }>(queries[1]);
    assert.equal(Number(marks.rows[0].scored), 1);
    assert.ok(marks.rows[0].within_2h !== null);

    const cover = await db.query<{ state: string; passes: number }>(queries[2]);
    assert.deepEqual(cover.rows.map((r) => `${r.state}:${r.passes}`).sort(), ['active:1', 'paused:1']);

    const stamped = await db.query<{ ok: boolean }>(
      `select bool_and(decided_at between now() - interval '1 minute' and now()) ok from release_arrival_predictions`
    );
    assert.equal(stamped.rows[0].ok, true);

    for (const role of ['anon', 'authenticated']) {
      await db.exec(`SET ROLE ${role}`);
      await assert.rejects(() => db.query('select * from release_arrival_predictions'), /permission denied/);
      await assert.rejects(() => db.query('select * from release_arrival_outcomes'), /permission denied/);
      await assert.rejects(() => db.query('select * from release_arrival_watch_events'), /permission denied/);
      await assert.rejects(() => db.query('select * from release_arrival_passes'), /permission denied/);
    }
  } finally {
    await db.close();
  }
});
