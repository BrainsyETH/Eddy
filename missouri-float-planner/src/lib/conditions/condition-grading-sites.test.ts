// Grading a reading against a river_gauges row has ONE server-side entry
// point: gradeReading() in src/lib/conditions.ts. These tests pin what it does
// and ratchet the files that still grade by hand, so the list can only shrink.

import assert from 'node:assert/strict';
import test from 'node:test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { gradeReading } from '@/lib/conditions';

const ROW = {
  level_too_low: '1.0',
  level_low: '1.5',
  level_optimal_min: '2.0',
  level_optimal_max: '4.0',
  level_high: '5.0',
  level_dangerous: '8.0',
  threshold_unit: 'ft',
  flood_stage_ft: '6.5',
};

test('the flood stage outranks the ladder on every surface', () => {
  // 7 ft is "high" on this ladder but above flood stage: the embed, the route
  // estimate, the access-point card and llms-full.txt used to say "High" here.
  assert.equal(gradeReading(ROW, 7, null).code, 'dangerous');
  assert.equal(gradeReading({ ...ROW, flood_stage_ft: null }, 7, null).code, 'high');
});

test('numeric columns arriving as strings are compared as numbers', () => {
  // "9.0" > "10.0" as strings; as numbers 3 ft sits in the optimal band.
  assert.equal(gradeReading(ROW, '3', null).code, gradeReading(ROW, 3, null).code);
  assert.notEqual(gradeReading(ROW, 3, null).code, 'unknown');
});

test('a cfs-rated gauge grades discharge, not stage', () => {
  const cfsRow = { ...ROW, threshold_unit: 'cfs', level_optimal_min: 200, level_optimal_max: 900, level_high: 1500, level_dangerous: 4000, flood_stage_ft: null };
  assert.equal(gradeReading(cfsRow, 3, 5000).code, 'dangerous');
});

/**
 * Files that still call computeCondition / computeConditionFromDbRow /
 * applyFloodStageOverride directly. The goal is to move each onto
 * gradeReading (or, for client components, a shared read model) as it is next
 * touched. REMOVE an entry when its file stops grading by hand; never add one
 * — new code grades through gradeReading.
 */
const STILL_GRADING_BY_HAND = new Set([
  'src/app/api/conditions/[riverId]/route.ts',
  'src/app/api/cron/update-gauges/route.ts',
  'src/components/gauge/GaugeDetailView.tsx',
  'src/components/gauge/RiverGaugeDetail.tsx',
  'src/components/map/GaugeStationMarkers.tsx',
  'src/components/river/GaugeOverview.tsx',
  'src/components/river/RiverVisualSubmitForm.tsx',
  'src/lib/agent-tools/sources.ts',
  'src/lib/gauge/get-gauge-conditions.ts',
  'src/lib/planner-markers.ts',
  'src/lib/river-groups.ts',
  'src/lib/river-outlook.ts',
  'src/lib/river-visuals.ts',
  'src/lib/social/condition-alerts.ts',
  'src/lib/social/live-conditions.ts',
  'src/lib/trust/severity.ts',
  'src/lib/usgs/mo-statewide-data.ts',
]);

const GRADES_BY_HAND = /\b(computeCondition|computeConditionFromDbRow|applyFloodStageOverride)\(/;

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...sourceFiles(path));
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(path);
  }
  return out;
}

test('no new file grades readings by hand (ratchet)', () => {
  const offenders = sourceFiles('src')
    .map((path) => relative('.', path).split('\\').join('/'))
    .filter((path) => path !== 'src/lib/conditions.ts')
    .filter((path) => GRADES_BY_HAND.test(readFileSync(path, 'utf8')));

  const added = offenders.filter((path) => !STILL_GRADING_BY_HAND.has(path));
  assert.deepEqual(added, [], 'Grade through gradeReading() in src/lib/conditions.ts instead');

  const cleaned = [...STILL_GRADING_BY_HAND].filter((path) => !offenders.includes(path));
  assert.deepEqual(cleaned, [], 'These no longer grade by hand: remove them from STILL_GRADING_BY_HAND');
});
