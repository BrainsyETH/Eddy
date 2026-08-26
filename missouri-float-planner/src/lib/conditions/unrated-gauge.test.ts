import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { classifyReading, hasLadder, type ConditionThresholds } from '@shared/condition-ladder';

// An UNRATED gauge must not be given an opinion.
//
// classifyReading() grades from the top of the ladder down and ends in a bare
// fall-through, so a gauge with six null levels skips every band and lands on
// `too_low`. That is not a bug in the ladder — it is why hasLadder() exists —
// but it means EVERY path that grades a reading has to call the guard, and two
// of them did not:
//
//   * both condition RPCs (SQL), which the river hub page, both OG image
//     routes, /plan, /api/conditions, /api/rivers/[slug]/visuals,
//     /api/rivers/[slug]/outlook and /api/og/float all call
//   * /api/cron/update-gauges, which PERSISTS its answer
//
// It cost the three tailwaters that 20260824232949 landed with a null ladder on
// purpose, because no agency publishes a rating for them. Measured on
// production 2026-08-26, before the fix: the White read "Too Low - Not
// Recommended" at 9,100 cfs, and the Norfork tailwater read it at 3,310 cfs —
// a generating unit in a channel that wades at 204.
//
// These tests pin the two guards. The SQL one is checked by reading the
// migration, because there is no Postgres in this suite — and the absence of
// one is exactly how the fall-through survived every test in the repo.

const REPO = join(__dirname, '..', '..', '..');

const EMPTY_LADDER: ConditionThresholds = {
  levelTooLow: null,
  levelLow: null,
  levelOptimalMin: null,
  levelOptimalMax: null,
  levelHigh: null,
  levelDangerous: null,
  thresholdUnit: 'cfs',
};

test('the trap itself: a null ladder grades a flooding river as too_low', () => {
  // Pinned so nobody "fixes" this in the ladder instead of at the call sites.
  // classifyReading is deliberately total — it answers for any input — and the
  // decision about what an unrated gauge SHOWS belongs to the caller.
  assert.equal(hasLadder(EMPTY_LADDER), false);
  assert.equal(classifyReading(null, EMPTY_LADDER, 9100), 'too_low');
  assert.equal(classifyReading(null, EMPTY_LADDER, 20707), 'too_low');
});

test('a single level is enough to grade — the guard must not swallow 00150 ladders', () => {
  // 00150 exists so a "Good begins at 400 cfs" rating with only optimal_min set
  // still classifies. Widening the guard to "a COMPLETE ladder" would silently
  // blank the Gasconade and the Black.
  const partial: ConditionThresholds = { ...EMPTY_LADDER, levelOptimalMin: 400 };
  assert.equal(hasLadder(partial), true);
  assert.equal(classifyReading(null, partial, 600), 'good');
});

test('update-gauges refuses to classify a gauge nobody has rated', () => {
  const source = readFileSync(
    join(REPO, 'src/app/api/cron/update-gauges/route.ts'),
    'utf8',
  );

  assert.match(
    source,
    /import \{ hasLadder \} from '@shared\/condition-ladder'/,
    'update-gauges must import the guard',
  );

  const guardAt = source.indexOf('if (!hasLadder(thresholds))');
  const classifyAt = source.indexOf('const newCondition = computeCondition(');
  assert.ok(guardAt > 0, 'update-gauges must guard on hasLadder before classifying');
  assert.ok(
    guardAt < classifyAt,
    'the hasLadder guard must run BEFORE computeCondition, or the fiction is already computed',
  );
});

test('both condition RPCs return unknown for a gauge with no ladder', () => {
  // Read the newest migration that defines each function, so this follows the
  // definition forward instead of pinning one filename that a later
  // CREATE OR REPLACE would quietly supersede.
  const dir = join(REPO, 'supabase/migrations');
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();

  for (const fn of ['get_river_condition', 'get_river_condition_segment'] as const) {
    // The segment function's name is a prefix of nothing, but
    // get_river_condition IS a prefix of get_river_condition_segment — so match
    // the open paren too, and for the bare one require it is not the segment.
    const defines = files.filter((f) => {
      const body = readFileSync(join(dir, f), 'utf8');
      const re = new RegExp(`create\\s+or\\s+replace\\s+function\\s+(public\\.)?${fn}\\s*\\(`, 'i');
      return re.test(body);
    });
    const latest = defines
      .filter((f) => {
        if (fn !== 'get_river_condition') return true;
        // A file that only defines the segment variant matched the prefix rule
        // above; exclude it.
        const body = readFileSync(join(dir, f), 'utf8');
        return /create\s+or\s+replace\s+function\s+(public\.)?get_river_condition\s*\(\s*p_river_id/i.test(body);
      })
      .pop();

    assert.ok(latest, `no migration defines ${fn}`);
    const body = readFileSync(join(dir, latest), 'utf8');

    assert.match(
      body,
      /AS has_ladder/,
      `${latest} defines ${fn} without a has_ladder term — an unrated gauge will fall through to too_low`,
    );
    assert.match(
      body,
      /WHEN cv\.has_ladder IS NOT TRUE THEN 'unknown'/,
      `${latest} must return the unknown CODE for an unrated gauge`,
    );
    assert.match(
      body,
      /WHEN cv\.has_ladder IS NOT TRUE THEN 'Unknown'/,
      `${latest} must return the unknown LABEL for an unrated gauge`,
    );

    // Flood stage is a fact about the water, not an opinion about floating it,
    // and it must still outrank the new guard.
    const floodAt = body.indexOf("WHEN cv.is_flood THEN 'Dangerous - Do Not Float'");
    const guardAt = body.indexOf("WHEN cv.has_ladder IS NOT TRUE THEN 'Unknown'");
    assert.ok(floodAt > 0 && floodAt < guardAt, `${latest}: flood stage must be checked first`);
  }
});
