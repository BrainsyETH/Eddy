import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { unratedGaugePlan } from './unrated-gauges';
import type { RiverReadiness } from './readiness';
import type { GaugeCandidate, RiverSectionDossier } from './dossier';
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
      CREATE SCHEMA extensions;
      CREATE DOMAIN extensions.geography AS text;
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
        PERFORM NULL::geography;
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
    await db.exec(readFileSync('supabase/migrations/20261004002112_river_readiness_activation.sql', 'utf8'));
    const run = (slugs: string[], apply: boolean, evidence: unknown = Object.fromEntries(slugs.map(s => [s, reviews]))) =>
      db.query<{ check_name: string; severity: string }>('SELECT * FROM review_river_activation($1::text[], $2::jsonb, $3)', [slugs, JSON.stringify(evidence), apply]);
    const active = async (slug = 'candidate') => (await db.query<{ active: boolean }>('SELECT active FROM rivers WHERE slug = $1', [slug])).rows[0].active;
    await assert.rejects(run(['candidate'], false), /type "geography" does not exist/);
    assert.equal(await active(), false, 'a missing extension type must also roll back activation');
    await db.exec(readFileSync('supabase/migrations/20261004002532_river_activation_postgis_search_path.sql', 'utf8'));
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

test('explicit unrated activation keeps freshness, review and threshold-conflict gates', async () => {
  const db = new PGlite();
  try {
    // Spatial functions are test doubles; these assertions cover the rating
    // policy and real activation transaction, not PostGIS route correctness.
    await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE DOMAIN geography AS text; CREATE DOMAIN geometry AS text;
      CREATE FUNCTION st_distance(text,text) RETURNS float LANGUAGE sql AS 'SELECT 0::float';
      CREATE FUNCTION st_linemerge(text) RETURNS text LANGUAGE sql AS 'SELECT $1';
      CREATE FUNCTION st_linelocatepoint(text,text) RETURNS float LANGUAGE sql AS 'SELECT 0::float';
      CREATE FUNCTION geometrytype(text) RETURNS text LANGUAGE sql AS 'SELECT ''LINESTRING''::text';
      CREATE TABLE rivers(id uuid PRIMARY KEY, slug text UNIQUE, active boolean, river_type text,
        timezone text DEFAULT 'America/Chicago', state text DEFAULT 'MO', geom text DEFAULT 'line',
        weather_lat numeric, weather_lon numeric, alert_search_terms text[], length_miles numeric);
      CREATE TABLE river_characteristics(river_id uuid);
      CREATE TABLE access_points(river_id uuid, name text, approved boolean, is_float_endpoint boolean,
        off_channel_reason text, location_snap text, location_orig text, river_mile_downstream numeric);
      CREATE TABLE gauge_stations(id uuid PRIMARY KEY, name text, active boolean, usgs_site_id text, site_id_external text);
      CREATE TABLE river_gauges(id uuid PRIMARY KEY, river_id uuid, gauge_station_id uuid, is_primary boolean,
        threshold_unit text, level_too_low numeric, level_low numeric, level_optimal_min numeric,
        level_optimal_max numeric, level_high numeric, level_dangerous numeric,
        threshold_source text, threshold_source_url text,
        alt_level_too_low numeric, alt_level_low numeric, alt_level_optimal_min numeric,
        alt_level_optimal_max numeric, alt_level_high numeric, alt_level_dangerous numeric);
      CREATE TABLE river_hazards(river_id uuid, active boolean);
      CREATE TABLE gauge_latest(gauge_station_id uuid, reading_timestamp timestamptz, gauge_height_ft numeric, discharge_cfs numeric);
      CREATE TABLE gauge_readings(LIKE gauge_latest);
      CREATE FUNCTION validate_river_data() RETURNS TABLE(river_slug text,check_name text,severity text,detail text)
        LANGUAGE sql AS 'SELECT NULL::text,NULL::text,NULL::text,NULL::text WHERE false';
      INSERT INTO rivers(id,slug,active,river_type) VALUES
        ('00000000-0000-0000-0000-000000000001','unrated',false,'rain_flashy');
      INSERT INTO gauge_stations VALUES ('10000000-0000-0000-0000-000000000001','Noel fixture',true,'fixture','fixture');
      INSERT INTO river_gauges(id,river_id,gauge_station_id,is_primary,threshold_unit) VALUES
        ('20000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001',
         '10000000-0000-0000-0000-000000000001',true,'ft');
      INSERT INTO gauge_latest VALUES ('10000000-0000-0000-0000-000000000001',now(),5.8,NULL);
    `);
    await db.exec(readFileSync('supabase/migrations/20261004002112_river_readiness_activation.sql', 'utf8'));
    await db.exec(readFileSync('supabase/migrations/20261004030128_explicit_unrated_river_release.sql', 'utf8'));
    const evidence = { ...reviews, conditions: { ...reviews.conditions, ratingMode: 'unrated' } };
    const run = (apply = false, review: unknown = evidence) => db.query<{ check_name: string; severity: string }>(
      "SELECT * FROM review_river_activation(ARRAY['unrated'], $1::jsonb, $2)", [JSON.stringify({ unrated: review }), apply]);
    const active = async () => (await db.query<{ active: boolean }>('SELECT active FROM rivers')).rows[0].active;
    let result = await run();
    assert.ok(result.rows.some(r => r.check_name === 'missing_thresholds'), 'empty ladder alone cannot opt in');
    await db.exec("UPDATE rivers SET condition_rating_mode = 'unrated'");
    result = await run(false, reviews);
    assert.ok(result.rows.some(r => r.check_name === 'condition_mode_review_mismatch'));
    result = await run();
    assert.equal(result.rows.some(r => r.severity === 'error'), false);
    assert.equal(await active(), false, 'successful preview stays private');
    for (const column of ['level_dangerous', 'alt_level_low']) {
      await db.exec(`UPDATE river_gauges SET ${column} = 10`);
      result = await run(true);
      assert.ok(result.rows.some(r => r.check_name === 'unrated_has_thresholds'));
      assert.equal(await active(), false);
      await db.exec(`UPDATE river_gauges SET ${column} = NULL`);
    }
    await db.exec("UPDATE gauge_latest SET reading_timestamp = now() - interval '3 hours'");
    result = await run(true);
    assert.ok(result.rows.some(r => r.check_name === 'primary_gauge_unavailable'));
    assert.equal(await active(), false);
    await db.exec('UPDATE gauge_latest SET reading_timestamp = now()');
    result = await run(true, { ...evidence, routing: { ...reviews.routing, status: 'pending' } });
    assert.ok(result.rows.some(r => r.check_name === 'readiness_incomplete'));
    await db.exec("UPDATE rivers SET river_type = 'dam_tailwater'");
    result = await run(true);
    assert.ok(result.rows.some(r => r.check_name === 'tailwater_pilot_review'));
    await db.exec("UPDATE rivers SET river_type = 'rain_flashy'");
    result = await run(true);
    assert.equal(result.rows.some(r => r.severity === 'error'), false);
    assert.equal(await active(), true);
    assert.equal((await db.query<{ allowed: boolean }>("SELECT has_function_privilege('anon','review_river_activation(text[],jsonb,boolean)','EXECUTE') AS allowed")).rows[0].allowed, false);
  } finally { await db.close(); }
});


test('unrated ingestion requires a reviewed mode and an available explicit measurement unit', () => {
  const fixture = {
    conditionRatingMode: 'unrated', primaryGaugeSiteId: 'noel',
    readiness: { ...reviews, conditions: { ...reviews.conditions, ratingMode: 'unrated' } } as RiverReadiness,
    gauges: [{ siteId: 'noel', lat: 36.5, lon: -94.4, measurementUnit: 'ft', paramsAvailable: ['00065'] }] as GaugeCandidate[],
    sections: [{ representativeGauge: { siteId: 'noel' }, thresholds: [] }] as unknown as RiverSectionDossier[],
  };
  assert.deepEqual(unratedGaugePlan(fixture), { problems: [], links: [{ siteId: 'noel', unit: 'ft' }] });
  assert.ok(unratedGaugePlan({ ...fixture, primaryGaugeSiteId: undefined }).problems.length);
  assert.ok(unratedGaugePlan({ ...fixture, readiness: undefined }).problems.length);
  assert.ok(unratedGaugePlan({ ...fixture, gauges: [{ ...fixture.gauges[0], measurementUnit: 'cfs' }] }).problems.length);
  assert.ok(unratedGaugePlan({ ...fixture, sections: [{ ...fixture.sections[0], thresholds: [{}] } as RiverSectionDossier] }).problems.length);
  assert.deepEqual(unratedGaugePlan({ ...fixture, conditionRatingMode: undefined }), { problems: [], links: [] });
});


test('Elk staging switches polling and retires cross-dam endpoints without activating or deleting history', async () => {
  const db = new PGlite();
  const migration = readFileSync('supabase/migrations/20261004035848_stage_elk_noel_unrated_release.sql', 'utf8');
  try {
    await db.exec(`
      CREATE SCHEMA extensions;
      CREATE DOMAIN extensions.geometry AS text;
      CREATE FUNCTION extensions.st_linemerge(text) RETURNS text LANGUAGE sql AS 'SELECT $1';
      CREATE FUNCTION extensions.st_linelocatepoint(text,text) RETURNS float LANGUAGE sql AS 'SELECT 0.32::float';
      CREATE TABLE rivers(id uuid PRIMARY KEY, slug text, active boolean, condition_rating_mode text,
        geom text, length_miles numeric, float_summary text, float_tip text, updated_at timestamptz);
      CREATE TABLE gauge_stations(id uuid PRIMARY KEY, usgs_site_id text, provider text, active boolean,
        parameter_codes text[], curated boolean, location text);
      CREATE TABLE gauge_readings(gauge_station_id uuid REFERENCES gauge_stations, gauge_height_ft numeric);
      CREATE TABLE river_gauges(id uuid DEFAULT gen_random_uuid(), river_id uuid, gauge_station_id uuid,
        is_primary boolean, threshold_unit text, river_mile numeric, threshold_source text, threshold_source_url text,
        level_too_low numeric, level_low numeric, level_optimal_min numeric, level_optimal_max numeric,
        level_high numeric, level_dangerous numeric, alt_level_too_low numeric, alt_level_low numeric,
        alt_level_optimal_min numeric, alt_level_optimal_max numeric, alt_level_high numeric, alt_level_dangerous numeric);
      CREATE TABLE access_points(river_id uuid, slug text, approved boolean, is_float_endpoint boolean,
        river_mile_downstream numeric, updated_at timestamptz);
      CREATE TABLE river_sections(river_id uuid, section_slug text, name text, description text,
        primary_gauge_station_id uuid, river_mile_start numeric, river_mile_end numeric);
      INSERT INTO rivers VALUES ('00000000-0000-0000-0000-000000000001','elk',false,'rated','line',35,NULL,NULL,NULL);
      INSERT INTO gauge_stations VALUES
        ('10000000-0000-0000-0000-000000000001','07189000','usgs',false,ARRAY['00065'],true,'point'),
        ('10000000-0000-0000-0000-000000000002','07188925','usgs',true,ARRAY['00065'],false,'point');
      INSERT INTO gauge_readings VALUES ('10000000-0000-0000-0000-000000000001',3.5);
      INSERT INTO river_gauges(id,river_id,gauge_station_id,is_primary,threshold_unit,threshold_source,
        level_too_low,level_optimal_min,level_optimal_max,level_dangerous)
      VALUES ('30b8d27f-ab4b-441a-bcf2-5b8fc5d188b7','00000000-0000-0000-0000-000000000001',
        '10000000-0000-0000-0000-000000000001',true,'ft','outfitter',2.5,3.5,5,6);
      INSERT INTO access_points VALUES
        ('00000000-0000-0000-0000-000000000001','us-71-bridge-i-49-access',true,true,0.96,NULL),
        ('00000000-0000-0000-0000-000000000001','cowskin-access',true,true,21.17,NULL),
        ('00000000-0000-0000-0000-000000000001','city-of-pineville-elk-river-access',true,true,0.26,NULL);
      INSERT INTO river_sections(river_id,section_slug) VALUES ('00000000-0000-0000-0000-000000000001','elk-main');
    `);
    await assert.rejects(db.exec(migration), /Apply Elk data cleanup/);
    await db.exec("UPDATE access_points SET approved=false,is_float_endpoint=false WHERE slug='us-71-bridge-i-49-access'");
    await db.exec("UPDATE river_gauges SET level_dangerous=7");
    await assert.rejects(db.exec(migration), /reviewed historical Tiff link/);
    await db.exec('UPDATE river_gauges SET level_dangerous=6; UPDATE rivers SET active=true');
    await assert.rejects(db.exec(migration));
    await db.exec('UPDATE rivers SET active=false');
    // A late failure must roll back link deletion and curation too.
    await db.exec("UPDATE access_points SET river_mile_downstream=12 WHERE slug='city-of-pineville-elk-river-access'");
    await assert.rejects(db.exec(migration), /unexpected endpoint/);
    assert.equal((await db.query<{curated:boolean}>("SELECT curated FROM gauge_stations WHERE usgs_site_id='07188925'")).rows[0].curated, false);
    assert.equal((await db.query<{count:number}>('SELECT count(*)::int AS count FROM river_gauges')).rows[0].count, 1);
    await db.exec("UPDATE access_points SET river_mile_downstream=0.26 WHERE slug='city-of-pineville-elk-river-access'");
    await db.exec(migration);
    assert.deepEqual((await db.query('SELECT active,condition_rating_mode FROM rivers')).rows, [{active:false,condition_rating_mode:'unrated'}]);
    assert.deepEqual((await db.query('SELECT g.usgs_site_id,g.curated,rg.is_primary,rg.threshold_unit,rg.level_optimal_min FROM river_gauges rg JOIN gauge_stations g ON g.id=rg.gauge_station_id')).rows,
      [{usgs_site_id:'07188925',curated:true,is_primary:true,threshold_unit:'ft',level_optimal_min:null}]);
    assert.deepEqual((await db.query("SELECT approved,is_float_endpoint FROM access_points WHERE slug='cowskin-access'")).rows, [{approved:true,is_float_endpoint:false}]);
    assert.equal((await db.query<{count:number}>('SELECT count(*)::int AS count FROM gauge_readings')).rows[0].count, 1);
  } finally { await db.close(); }
});
