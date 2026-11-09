import assert from 'node:assert/strict';
import test from 'node:test';
import { LAKES, getLake, lakeForDam, poolDamFor } from './registry';
import { USACE_DAMS } from '@/lib/flow-providers/usace-registry';
import { NWK_LAKE_POOLS } from '../../../scripts/lakes/nwk-ramps';

// Structural invariants only. A lake is wired to dams the registry carries, in
// a datum its thresholds share, with a range that is ordered when it is given.

test('every lake has an id matching its key and at least one controlling dam the dam registry knows', () => {
  for (const [key, lake] of Object.entries(LAKES)) {
    assert.equal(lake.slug, key);
    assert.ok(lake.controllingDams.length >= 1, `${key} names no controlling dam`);
    for (const { damId } of lake.controllingDams) assert.ok(USACE_DAMS[damId], `${key} names unknown dam ${damId}`);
    assert.ok(poolDamFor(lake), `${key} reads its pool from an unknown dam`);
    assert.ok(lake.states.length >= 1);
    assert.ok(lake.sources.usaceRecreationProjects.length >= 1 && lake.sources.hydrography3dhp.length >= 1);
    for (const project of lake.sources.usaceRecreationProjects) assert.equal(project, project.toUpperCase(), 'Corps project names are upper case in the layer');
  }
});

test('an operating range is ordered and the Kansas City pools agree with the ramp dossier references', () => {
  for (const lake of Object.values(LAKES)) {
    if (!lake.operatingRange) continue;
    assert.ok(lake.operatingRange.floodFt > lake.operatingRange.conservationFt, `${lake.slug} range is not ordered`);
    assert.match(lake.operatingRange.asOf, /^\d{4}-\d{2}-\d{2}$/);
    if (lake.sources.nwkRampLake) {
      const reference = NWK_LAKE_POOLS.find((p) => p.lake_name === lake.sources.nwkRampLake);
      assert.ok(reference, `${lake.slug} names an NWK lake the ramp dossier has no pools for`);
      assert.equal(reference.multipurpose_pool_ft, lake.operatingRange.conservationFt);
      assert.equal(reference.flood_pool_ft, lake.operatingRange.floodFt);
      assert.equal(reference.datum, lake.datum);
    }
  }
});

test('cautions stay off until a person has verified the thresholds, and lookups resolve', () => {
  for (const lake of Object.values(LAKES)) assert.equal(lake.rampCautionsVerified, false, `${lake.slug}: flip this only with the Phase 0 item 2 check recorded`);
  assert.equal(LAKES.truman.poolCadence, 'daily', 'Ameren publishes one Truman value a day; the section must say so');
  assert.equal(LAKES['table-rock'].poolCadence, 'hourly');
  assert.equal(lakeForDam('swl-table-rock-dam')?.slug, 'table-rock');
  assert.equal(lakeForDam('nwk-truman-dam')?.slug, 'truman');
  assert.equal(lakeForDam('swl-bull-shoals-dam'), undefined);
  assert.equal(getLake('nowhere'), undefined);
});
