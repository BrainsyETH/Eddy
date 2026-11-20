import assert from 'node:assert/strict';
import test from 'node:test';
import { damReadReport, tallyDamReads, type StoredDamRead } from './dam-read-report';
import type { DamReadFacts } from '../../src/lib/eddy/dam-read-facts';

// Thursday 2026-11-19, 6:47 AM Central.
const MORNING = Date.parse('2026-11-19T12:47:00Z');

/** Facts as dam_updates stores them, for one posted window and a recent typical day. */
function facts(window: [number, number] | null, typicalHours: number, now = MORNING): DamReadFacts {
  return {
    damId: 'swl-norfork-dam',
    damName: 'Norfork Dam',
    reference: null,
    todayGroup: 'weekday',
    now,
    posted: {
      mayBeOutdated: false,
      days: [{
        scheduleDate: '2026-11-19',
        dayOffset: 0,
        windows: window ? [{ fromHour: window[0], toHour: window[1], label: '' }] : [],
        firstStartHour: window ? window[0] : null,
        minimumFlowOnly: false,
        generatingHours: window ? window[1] - window[0] : 0,
        morningGeneration: window ? window[0] < 12 : false,
      }],
    },
    weekday: null,
    weekend: null,
    reliability: null,
    shape: {
      earliest: null, morningsKnown: 14, morningsOff: 2, generatingDays: 13, typicalHours, typicalRuns: 1,
      daysPastMidnight: 0, typicalEndHour: 20, typicalPeakCfs: null, peakDays: 0,
    },
  };
}

const row = (damId: string, generatedAt: string, f: unknown): StoredDamRead => ({ damId, generatedAt, facts: f });

test('each stored Read is rendered once and counted under its headline, per dam', () => {
  const rows = [
    row('swl-norfork-dam', '2026-11-18T12:47:00Z', facts([5, 8], 12)),
    row('swl-norfork-dam', '2026-11-19T12:47:00Z', facts([5, 8], 12)),
    row('swl-norfork-dam', '2026-11-17T12:47:00Z', facts([5, 17], 12)),
    row('swl-table-rock-dam', '2026-11-19T12:47:00Z', facts(null, 9)),
  ];
  const [norfork, tableRock] = tallyDamReads(rows);
  assert.equal(norfork.damId, 'swl-norfork-dam');
  assert.equal(norfork.reads, 3);
  assert.deepEqual(norfork.headlines.map((h) => [h.headline, h.count]), [
    ['A short day of generation', 2],
    ['Generation is on the schedule now', 1],
  ]);
  assert.equal(norfork.headlines[0].exampleAt, '2026-11-19T12:47:00Z', 'the newest example is kept');
  assert.match(norfork.headlines[0].example, /3 hours posted for the whole day, against about 12/);
  assert.equal(norfork.oneSentence, 1, 'the ordinary day had nothing to add');
  assert.equal(tableRock.reads, 1);
  assert.equal(tableRock.headlines[0].headline, 'No generation scheduled today');
});

test('a row today\'s code cannot render is counted apart, not dropped silently', () => {
  const [tally] = tallyDamReads([row('swl-beaver-dam', '2026-11-19T12:47:00Z', { nothing: true }), row('swl-beaver-dam', '2026-11-19T18:47:00Z', facts([5, 8], 12))]);
  assert.equal(tally.reads, 1);
  assert.equal(tally.unrenderable, 1);
});

test('the printed report gives a share and a count per headline, and quotes the newest summaries', () => {
  const report = damReadReport([
    row('swl-norfork-dam', '2026-11-18T12:47:00Z', facts([5, 8], 12)),
    row('swl-norfork-dam', '2026-11-19T12:47:00Z', facts([5, 8], 12)),
    row('swl-norfork-dam', '2026-11-17T12:47:00Z', facts([5, 17], 12)),
  ], { examples: 1 });
  assert.match(report, /swl-norfork-dam: 3 Reads, 2 different headlines/);
  assert.match(report, / 67% {5}2 {2}A short day of generation$/m);
  assert.match(report, /2026-11-19T12:47Z {2}Generation is posted until 8 AM/);
  assert.match(report, /one sentence only: 1 of 3 \(33%\)/);
  assert.equal(report.split('\n').filter((l) => /^\s+2026-/.test(l)).length, 1, 'one example, as asked');
  assert.equal(damReadReport([], { examples: 3 }), '  No stored dam Reads in this window.');
});
