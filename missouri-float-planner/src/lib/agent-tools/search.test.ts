import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { screeningGauge, screenCandidates, type Reach } from './search';
import type { Access, GaugeLink } from './data';

const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const links = [0, 10, 25, 50].map((mile, i) => ({
  gauge_station_id: id(i + 1),
  river_mile: mile,
  is_primary: i === 0,
  gauge_stations: { id: id(i + 1), active: i !== 3 },
})) as GaugeLink[];
const reaches: Reach[] = [
  {
    id: id(20),
    sort_order: 0,
    river_mile_start: 15,
    river_mile_end: 25,
    primary_gauge_station_id: id(3),
  },
  {
    id: id(21),
    sort_order: 1,
    river_mile_start: 40,
    river_mile_end: 60,
    primary_gauge_station_id: id(4),
  },
];
const points = Array.from({ length: 24 }, (_, i) => ({
  id: id(i + 100),
  approved: true,
  is_float_endpoint: true,
  is_public: true,
  river_mile_downstream: i * 2,
})) as Access[];

test('screening matches the latest migration’s actual mile-selection SQL including reach overrides', async () => {
  const folder = 'supabase/migrations';
  const file = readdirSync(folder)
    .sort()
    .reverse()
    .find(
      (name) =>
        name.endsWith('.sql') &&
        /CREATE OR REPLACE FUNCTION get_river_condition_segment\(/.test(
          readFileSync(`${folder}/${name}`, 'utf8'),
        ),
    )!;
  const migration = readFileSync(`${folder}/${file}`, 'utf8');
  const definition = migration.slice(
    migration.indexOf(
      'CREATE OR REPLACE FUNCTION get_river_condition_segment(',
    ),
  );
  // Execute the actual selection CTEs. This test supplies a verified mile, so
  // the unrelated nearest-coordinate branch (which needs PostGIS) is omitted.
  const ctes = definition
    .slice(
      definition.indexOf('section_gauge AS ('),
      definition.indexOf('gauge_info AS ('),
    )
    .replace(/,\s*$/, '')
    .replace(
      /WHEN p_put_in_point IS NOT NULL THEN \([\s\S]*?\n\s*\)\n\s*ELSE/,
      'WHEN FALSE THEN NULL ELSE',
    )
    .replaceAll('p_river_id', '$1::uuid')
    .replaceAll('p_put_in_mile', '$2::numeric');
  assert.doesNotMatch(ctes, /p_put_in_point|ST_Distance/);
  const db = new PGlite();
  try {
    await db.exec(`create table gauge_stations(id uuid, active boolean);
      create table river_gauges(river_id uuid, gauge_station_id uuid, river_mile numeric, is_primary boolean);
      create table river_sections(id uuid, river_id uuid, sort_order int, river_mile_start numeric, river_mile_end numeric, primary_gauge_station_id uuid);`);
    for (const link of links) {
      await db.query('insert into gauge_stations values ($1,$2)', [
        link.gauge_station_id,
        link.gauge_station_id !== id(4),
      ]);
      await db.query('insert into river_gauges values ($1,$2,$3,$4)', [
        id(99),
        link.gauge_station_id,
        link.river_mile,
        link.is_primary,
      ]);
    }
    for (const r of reaches)
      await db.query('insert into river_sections values ($1,$2,$3,$4,$5,$6)', [
        r.id,
        id(99),
        r.sort_order,
        r.river_mile_start,
        r.river_mile_end,
        r.primary_gauge_station_id,
      ]);
    for (const mile of [-5, 0, 12, 15, 20, 24.9, 25, 39, 40, 55, 60]) {
      const result = await db.query<{ gauge_id: string }>(
        `with resolved_mile as (select $2::numeric as mile), ${ctes}
        select fg.gauge_id from fallback_gauge fg join gauge_stations gs on gs.id=fg.gauge_id where gs.active`,
        [id(99), mile],
      );
      assert.equal(
        screeningGauge(mile, links, reaches)?.gauge_station_id ?? null,
        result.rows[0]?.gauge_id ?? null,
        `mile ${mile}`,
      );
    }
  } finally {
    await db.close();
  }
});

test('dry upper reaches do not consume the shortlist; unknowns survive and candidates span put-ins', () => {
  const screen = {
    links,
    reaches: [],
    ratings: new Map([
      [id(1), 'too_low'],
      [id(2), 'good'],
      [id(3), 'unknown'],
    ]),
  };
  const result = screenCandidates(points, 3, 2.5, true, screen);
  assert.equal(result.candidates.length, 6);
  assert.ok(
    result.candidates.every((c) => Number(c.putIn.river_mile_downstream) >= 10),
  );
  assert.ok(new Set(result.candidates.map((c) => c.putIn.id)).size >= 3);
  assert.ok(result.coverage.unknownPutIns > 0);
  assert.ok(result.coverage.screenedOutPairs > 0);
  const unknown = screenCandidates(points, 3, 2.5, true, {
    ...screen,
    ratings: new Map(),
  });
  assert.equal(unknown.candidates.length, 6);
  assert.equal(unknown.coverage.screenedOutPairs, 0);
});

test('fresh unsuitable in-span gauges exclude crossing pairs and inactive gauges do not', () => {
  const result = screenCandidates(points, 3, 2.5, true, {
    links,
    reaches: [],
    ratings: new Map([
      [id(1), 'good'],
      [id(2), 'good'],
      [id(3), 'high'],
      [id(4), 'dangerous'],
    ]),
  });
  assert.ok(result.candidates.length > 0);
  assert.ok(
    result.candidates.every(
      (c) => Number(c.takeOut.river_mile_downstream) < 25,
    ),
  );
});

test('coverage excludes put-ins without any strictly downstream endpoint', () => {
  const duplicateMiles = points.slice(0, 4).map((p, index) => ({
    ...p,
    river_mile_downstream: index === 0 ? 0 : 4,
  }));
  const result = screenCandidates(duplicateMiles, 3, 2.5, true);
  assert.equal(result.coverage.eligiblePutIns, 1);
  assert.equal(result.coverage.unknownPutIns, 1);
  assert.equal(result.coverage.eligiblePairs, 3);
});
