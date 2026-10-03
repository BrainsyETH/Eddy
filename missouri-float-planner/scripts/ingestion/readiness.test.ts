import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { READINESS_CRITERIA, readinessProblems } from './readiness';

const reviews = Object.fromEntries(READINESS_CRITERIA.map(key => [key, {
  status: 'verified', evidence: ['https://example.org/source'], reviewedBy: 'test reviewer', reviewedAt: '2026-10-03', notes: 'test',
}]));

test('launch evidence must be reviewed, attributed, and present for every criterion', () => {
  assert.equal(readinessProblems(undefined).length, 6);
  assert.deepEqual(readinessProblems(reviews), []);
  assert.deepEqual(readinessProblems({ ...reviews, hazards: { status: 'verified', evidence: [] } }), ['hazards: missing evidence']);
  assert.deepEqual(readinessProblems({ ...reviews, routing: { ...reviews.routing, reviewedBy: null } }), ['routing: missing reviewer/date']);
});

test('all dossiers explicitly track the launch review without implying historical sign-off', () => {
  for (const name of readdirSync('scripts/ingestion/dossiers').filter(n => n.endsWith('.json'))) {
    const d = JSON.parse(readFileSync(`scripts/ingestion/dossiers/${name}`, 'utf8'));
    for (const key of READINESS_CRITERIA) assert.ok(d.readiness?.[key], `${name}: ${key}`);
  }
});

test('activation is atomic, previews validate inactive candidates, and audit distinguishes missing data', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE TABLE rivers(id uuid PRIMARY KEY, slug text UNIQUE, active boolean, river_type text);
      CREATE TABLE gauge_stations(id uuid PRIMARY KEY, name text, active boolean);
      CREATE TABLE river_gauges(id uuid PRIMARY KEY, river_id uuid, gauge_station_id uuid, is_primary boolean,
        threshold_unit text, level_too_low numeric, level_low numeric, level_optimal_min numeric,
        level_optimal_max numeric, level_high numeric, level_dangerous numeric,
        threshold_source text, threshold_source_url text,
        alt_level_too_low numeric, alt_level_low numeric, alt_level_optimal_min numeric,
        alt_level_optimal_max numeric, alt_level_high numeric, alt_level_dangerous numeric);
      CREATE TABLE river_hazards(river_id uuid, active boolean);
      CREATE TABLE gauge_latest(gauge_station_id uuid, reading_timestamp timestamptz, gauge_height_ft numeric, discharge_cfs numeric);
      CREATE TABLE gauge_readings(LIKE gauge_latest);
      CREATE TABLE validator_state(fail boolean, missing_id boolean DEFAULT false);
      INSERT INTO validator_state(fail) VALUES(false);
      CREATE FUNCTION validate_river_data() RETURNS TABLE(river_slug text,check_name text,severity text,detail text)
      LANGUAGE plpgsql AS $$ BEGIN
        IF (SELECT fail FROM validator_state) THEN RAISE EXCEPTION 'validator unavailable'; END IF;
        RETURN QUERY SELECT slug, 'core_error', 'error', 'fixture defect' FROM rivers WHERE active AND slug = 'bad';
        IF (SELECT missing_id FROM validator_state) THEN
          RETURN QUERY SELECT id::text, 'gauge_missing_site_id', 'error', 'fixture missing provider id' FROM gauge_stations;
        END IF;
      END $$;
      INSERT INTO rivers VALUES
        ('00000000-0000-0000-0000-000000000001','candidate',false,'rain_flashy'),
        ('00000000-0000-0000-0000-000000000002','live',true,'rain_flashy'),
        ('00000000-0000-0000-0000-000000000003','bad',false,'rain_flashy');
      INSERT INTO gauge_stations VALUES ('10000000-0000-0000-0000-000000000001','primary',true);
      INSERT INTO river_gauges VALUES ('20000000-0000-0000-0000-000000000001',
        '00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',true,
        'cfs',1,2,3,4,5,6,'operator','https://example.org/key',NULL,NULL,NULL,NULL,NULL,NULL);
      INSERT INTO gauge_latest VALUES ('10000000-0000-0000-0000-000000000001',now(),5,100);
    `);
    await db.exec(readFileSync('supabase/migrations/20261003221648_river_readiness_activation.sql', 'utf8'));
    const run = (slugs: string[], apply: boolean, evidence: unknown = Object.fromEntries(slugs.map(s => [s, reviews]))) =>
      db.query<{ check_name: string; severity: string }>('SELECT * FROM review_river_activation($1::text[], $2::jsonb, $3)', [slugs, JSON.stringify(evidence), apply]);
    const active = async (slug = 'candidate') => (await db.query<{ active: boolean }>('SELECT active FROM rivers WHERE slug = $1', [slug])).rows[0].active;
    let result = await run(['candidate', 'live'], false);
    assert.equal(result.rows.some(r => r.severity === 'error'), false);
    assert.equal(await active(), false, 'preview must restore inactive status');
    assert.equal(await active('live'), true, 'preview must preserve existing live rows');
    result = await run(['candidate', 'bad'], true);
    assert.ok(result.rows.some(r => r.check_name === 'core_error'), 'inactive candidate must receive core validation');
    assert.equal(await active(), false, 'one failing candidate rolls back the whole batch');
    result = await run(['candidate'], true, {});
    assert.equal(result.rows.filter(r => r.check_name === 'readiness_incomplete').length, 6);
    assert.equal(await active(), false);
    await db.exec('UPDATE validator_state SET missing_id = true');
    result = await run(['candidate'], true);
    assert.ok(result.rows.some(r => r.check_name === 'gauge_missing_site_id'), 'station-keyed core findings are included for linked gauges');
    assert.equal(await active(), false);
    await db.exec('UPDATE validator_state SET missing_id = false');
    result = await run(['missing'], true);
    assert.ok(result.rows.some(r => r.check_name === 'unknown_river'));
    await db.exec('UPDATE validator_state SET fail = true');
    await assert.rejects(run(['candidate'], true), /validator unavailable/);
    assert.equal(await active(), false, 'a thrown database error cannot strand an active row');
    await db.exec('UPDATE validator_state SET fail = false; INSERT INTO gauge_readings SELECT * FROM gauge_latest; DELETE FROM gauge_latest');
    result = await run(['candidate'], false);
    assert.equal(result.rows.some(r => r.check_name === 'primary_gauge_unavailable'), false, 'NWS and other curated history readings also establish freshness');
    await db.exec('INSERT INTO gauge_latest SELECT * FROM gauge_readings; DELETE FROM gauge_readings; UPDATE gauge_latest SET discharge_cfs = NULL');
    result = await run(['candidate'], true);
    assert.ok(result.rows.some(r => r.check_name === 'primary_gauge_unavailable'), 'fresh stage cannot substitute for discharge');
    assert.equal(await active(), false);
    await db.exec('UPDATE gauge_latest SET discharge_cfs = 100; UPDATE river_gauges SET threshold_source_url = NULL');
    result = await run(['candidate'], true);
    assert.ok(result.rows.some(r => r.check_name === 'threshold_provenance_missing'));
    await db.exec("UPDATE river_gauges SET threshold_source_url = 'https://example.org/key'");
    result = await run(['candidate'], true);
    assert.ok(result.rows.some(r => r.check_name === 'no_structured_hazards'), 'reviewed empty inventory stays visible as a warning');
    assert.equal(await active(), true);
    const acl = await db.query<{ allowed: boolean }>("SELECT has_function_privilege('anon', 'review_river_activation(text[],jsonb,boolean)', 'EXECUTE') AS allowed");
    assert.equal(acl.rows[0].allowed, false);
    await db.exec(`INSERT INTO river_gauges SELECT '20000000-0000-0000-0000-000000000002',
      '00000000-0000-0000-0000-000000000002',gauge_station_id,false,threshold_unit,
      level_too_low,level_low,level_optimal_min,level_optimal_max,level_high,level_dangerous,threshold_source,threshold_source_url,
      NULL,NULL,NULL,NULL,NULL,NULL FROM river_gauges LIMIT 1`);
    let audit = await db.query<{ check_name: string }>('SELECT * FROM audit_river_readiness()');
    assert.equal(audit.rows.some(r => r.check_name === 'identical_threshold_set'), false, 'same physical gauge is not a copied ladder');
    await db.exec(`INSERT INTO gauge_stations VALUES ('10000000-0000-0000-0000-000000000002','other',true);
      UPDATE river_gauges SET gauge_station_id = '10000000-0000-0000-0000-000000000002' WHERE is_primary = false;`);
    audit = await db.query('SELECT * FROM audit_river_readiness()');
    assert.equal(audit.rows.some(r => r.check_name === 'identical_threshold_set'), true);
    await db.exec("UPDATE river_gauges SET threshold_unit = 'ft' WHERE is_primary = false");
    audit = await db.query('SELECT * FROM audit_river_readiness()');
    assert.equal(audit.rows.some(r => r.check_name === 'identical_threshold_set'), false, 'different units are not equal ladders');
    await db.exec('UPDATE river_gauges SET alt_level_too_low = 1, alt_level_low = 2, alt_level_optimal_min = 3, alt_level_optimal_max = 4, alt_level_high = 5, alt_level_dangerous = 6 WHERE is_primary = false');
    audit = await db.query("SELECT * FROM audit_river_readiness(ARRAY['live'])");
    assert.equal(audit.rows.some(r => r.check_name === 'identical_threshold_set'), true, 'alternate-unit ladders are also compared across the catalog');
    await db.exec("UPDATE rivers SET active = false WHERE slug = 'live'");
    audit = await db.query('SELECT * FROM audit_river_readiness()');
    assert.equal(audit.rows.some(r => r.check_name === 'identical_threshold_set'), true, 'live candidates must compare against inactive rivers');
    await db.exec('UPDATE river_gauges SET alt_level_too_low = 0.5 WHERE is_primary = false');
    audit = await db.query('SELECT * FROM audit_river_readiness()');
    assert.equal(audit.rows.some(r => r.check_name === 'identical_threshold_set'), false);
    assert.equal(audit.rows.some(r => r.check_name === 'identical_optimal_band'), true, 'an equal optimal band with different anchors gets its own finding');

  } finally { await db.close(); }
});
