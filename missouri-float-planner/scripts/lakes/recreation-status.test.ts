import assert from 'node:assert/strict';
import test from 'node:test';
import {
  REPORTED_STATUS_LABELS, USACE_RECREATION_STATUS_SOURCE, classifyProjects, mergeLedger,
  normalizeStatusSnapshot, parseNoteDates, provenanceLine, reportedStatus, type StatusSnapshot,
} from './recreation-status';

const RETRIEVED = '2026-11-09T19:00:00.000Z';
const day = (n: number) => new Date(Date.parse(RETRIEVED) + n * 86_400_000).toISOString();

function feature(overrides: Record<string, unknown> = {}, geometry: { x: number; y: number } | null = { x: -93.2917, y: 36.4839 }) {
  return {
    attributes: {
      objectid: 1, district: 'SWL', recprojectsitename: 'TABLE ROCK LAKE', recreationboundaryidpk: '100',
      recprojectsiteareaname: 'CRICKET CREEK', primaryareasubtype: 'multipurposeArea', managingagency: 'Corps of Engineers',
      boat_ramp: '1', launch_lanes: 2, manmade_canoe_kayak_launch: 0,
      status: 'Open', boat: 'Open', camp: null, beach: null, notes: null, date_updated: Date.parse('2026-04-28T00:00:00Z'),
      ...overrides,
    },
    geometry,
  };
}

function snapshot(features = [feature()], retrievedAt = RETRIEVED): StatusSnapshot {
  return { url: USACE_RECREATION_STATUS_SOURCE.url, retrieved_at: retrievedAt, count: features.length, features };
}

test('normalization keeps the Corps vocabulary distinct and the agency date as the only source date', () => {
  const [record] = normalizeStatusSnapshot(snapshot([feature({ boat: 'Partial', status: 'Seasonal Closure' })]));
  assert.equal(record.boat_status, 'partial');
  assert.equal(record.area_status, 'seasonal_closure');
  assert.equal(record.source_updated_at, '2026-04-28T00:00:00.000Z');
  assert.equal(record.boat_ramps, 1);
  assert.deepEqual(record.entrance, { lon: -93.2917, lat: 36.4839 });
  assert.equal(REPORTED_STATUS_LABELS.partial, 'Limited access');
  assert.equal(provenanceLine(record), 'Corps of Engineers listing, updated 2026-04-28');
  assert.equal(provenanceLine({ source_updated_at: null }), 'Corps of Engineers listing · update date unavailable');
  assert.throws(() => reportedStatus('Mostly open'), /Unrecognized status/);
});

test('a partial snapshot, a duplicate identity, or a source date after retrieval is refused', () => {
  const short = snapshot(); short.count = 2;
  assert.throws(() => normalizeStatusSnapshot(short), /Incomplete/);
  assert.throws(() => normalizeStatusSnapshot(snapshot([feature(), feature()])), /Duplicate/);
  assert.throws(() => normalizeStatusSnapshot(snapshot([feature({ date_updated: Date.parse('2027-01-01T00:00:00Z') })])), /after retrieval/);
  const [noGeom] = normalizeStatusSnapshot(snapshot([feature({}, null)]));
  assert.equal(noGeom.entrance, null);
  const [fallback] = normalizeStatusSnapshot(snapshot([feature({ recreationboundaryidpk: '', recprojectsiteareaid: 502200050 })]));
  assert.equal(fallback.area_id, '502200050', 'an empty boundary id falls back to the area id the layer carries beside it');
  assert.throws(() => normalizeStatusSnapshot(snapshot([feature({ recreationboundaryidpk: '', recprojectsiteareaid: null })])), /missing identity/);
});

test('note dates are parsed conservatively and a past-dated note marks itself stale', () => {
  assert.deepEqual(parseNoteDates('Winter closure until 1 March 2022.'), ['2022-03-01']);
  assert.deepEqual(parseNoteDates('Campsites open May 15, 2022. Camping opens 5-20-2020'), ['2020-05-20', '2022-05-15']);
  assert.deepEqual(parseNoteDates('As of 3 DEC 2020: open for day use'), ['2020-12-03']);
  assert.deepEqual(parseNoteDates('Shoulder season camping Oct.-Nov.'), []);
  assert.deepEqual(parseNoteDates('Opened in 2022'), []);
  const [stale] = normalizeStatusSnapshot(snapshot([feature({ notes: 'Winter closure until 1 March 2022.' })]));
  assert.equal(stale.stale_note, true);
  const [future] = normalizeStatusSnapshot(snapshot([feature({ notes: 'Closed for renovation until 15 March 2027.' })]));
  assert.equal(future.stale_note, false);
});

test('a quiet run rewrites nothing per area: the day\'s diff is the areas that moved', () => {
  const run1 = mergeLedger(null, normalizeStatusSnapshot(snapshot()), RETRIEVED);
  const before = JSON.stringify(run1.ledger.areas);
  const run2 = mergeLedger(run1.ledger, normalizeStatusSnapshot(snapshot([feature()], day(1))), day(1));
  assert.equal(JSON.stringify(run2.ledger.areas), before, 'an unchanged area is byte-identical after the run');
  assert.equal(run2.ledger.last_recorded_at, day(1), 'the ledger, not the area, records when Eddy last checked');
  assert.equal(run2.ledger.runs, 2);
  assert.deepEqual([run2.added, run2.status_changed, run2.agency_touched, run2.missing], [0, 0, 0, 0]);
  assert.equal(run2.ledger.areas['100'].statuses.boat_status.source_updated_at, '2026-04-28T00:00:00.000Z', 'watching a value does not refresh its agency date');
});

test('each status field keeps its own first observation; a notes edit moves none and is no event', () => {
  const run1 = mergeLedger(null, normalizeStatusSnapshot(snapshot()), RETRIEVED);
  const noted = normalizeStatusSnapshot(snapshot([feature({ notes: 'Ramp lane 2 closed for repaving.' })], day(1)));
  const run2 = mergeLedger(run1.ledger, noted, day(1));
  const entry = run2.ledger.areas['100'];
  assert.equal(entry.record.notes, 'Ramp lane 2 closed for repaving.');
  assert.equal(entry.statuses.boat_status.first_observed_at, RETRIEVED);
  assert.equal(entry.statuses.area_status.first_observed_at, RETRIEVED);
  assert.deepEqual(entry.events, [], 'a notes edit is not a status event');
  const closed = normalizeStatusSnapshot(snapshot([feature({ notes: 'Ramp lane 2 closed for repaving.', boat: 'Closed', date_updated: Date.parse('2026-11-11T00:00:00Z') })], day(2)));
  const run3 = mergeLedger(run2.ledger, closed, day(2));
  const after = run3.ledger.areas['100'];
  assert.equal(after.statuses.boat_status.value, 'closed');
  assert.equal(after.statuses.boat_status.first_observed_at, day(2));
  assert.equal(after.statuses.boat_status.source_updated_at, '2026-11-11T00:00:00.000Z');
  assert.equal(after.statuses.area_status.first_observed_at, RETRIEVED, 'the area status did not change, so its observation stands');
  assert.deepEqual(after.events.map((e) => e.kind), ['status_change', 'agency_touch']);
  assert.equal(run3.status_changed, 1);
  assert.equal(run3.agency_touched, 0, 'a touch that came with a status change is counted as the change');
});

test('an agency re-date without a status change is a touch, and a vanished area is one event, not a daily one', () => {
  const run1 = mergeLedger(null, normalizeStatusSnapshot(snapshot()), RETRIEVED);
  const redated = normalizeStatusSnapshot(snapshot([feature({ date_updated: Date.parse('2026-11-10T00:00:00Z') })], day(1)));
  const run2 = mergeLedger(run1.ledger, redated, day(1));
  assert.equal(run2.agency_touched, 1);
  assert.deepEqual(run2.ledger.areas['100'].events, [{ at: day(1), kind: 'agency_touch', from: '2026-04-28T00:00:00.000Z', to: '2026-11-10T00:00:00.000Z' }]);
  assert.equal(run2.ledger.areas['100'].statuses.boat_status.first_observed_at, RETRIEVED, 'a re-date is not a new status value');
  const run3 = mergeLedger(run2.ledger, [], day(2));
  const run4 = mergeLedger(run3.ledger, [], day(3));
  assert.equal(run3.missing, 1);
  assert.equal(run4.ledger.areas['100'].missing_since, day(2));
  assert.equal(run4.ledger.areas['100'].events.filter((e) => e.kind === 'missing').length, 1, 'absence is recorded once');
  const run5 = mergeLedger(run4.ledger, redated, day(4));
  assert.equal(run5.returned, 1);
  assert.equal(run5.ledger.areas['100'].missing_since, null);
  assert.throws(() => mergeLedger(run5.ledger, redated, RETRIEVED), /older than the ledger/);
});

test('projects are classed by agency dates and by events inside a rolling window, never by a change seen long ago', () => {
  const recent = feature({ recprojectsitename: 'RECENT', recreationboundaryidpk: '1', date_updated: Date.parse('2026-10-16T00:00:00Z') });
  const old = feature({ recprojectsitename: 'OLD', recreationboundaryidpk: '2', date_updated: Date.parse('2026-04-28T00:00:00Z') });
  const ancient = feature({ recprojectsitename: 'ANCIENT', recreationboundaryidpk: '3', date_updated: Date.parse('2022-03-01T00:00:00Z'), notes: 'Winter closure until 1 March 2022.' });
  const none = feature({ recprojectsitename: 'NONE', recreationboundaryidpk: '4', status: null, boat: null, date_updated: null });
  const { ledger } = mergeLedger(null, normalizeStatusSnapshot(snapshot([recent, old, ancient, none])), RETRIEVED);
  const byName = Object.fromEntries(classifyProjects(ledger, day(21)).map((p) => [p.project, p]));
  assert.equal(byName.RECENT.class, 'maintained');
  assert.equal(byName.RECENT.fresh_boat_status, 1);
  assert.equal(byName.OLD.class, 'static');
  assert.equal(byName.OLD.fresh_boat_status, 0, 'a reader of OLD would see a dated status, not a current one');
  assert.equal(byName.ANCIENT.class, 'stale');
  assert.equal(byName.ANCIENT.stale_notes, 1);
  assert.equal(byName.NONE.class, 'unmaintained');

  // Three weeks of identical reads do not promote OLD.
  const quiet = mergeLedger(ledger, normalizeStatusSnapshot(snapshot([recent, old, ancient, none], day(21))), day(21)).ledger;
  assert.equal(classifyProjects(quiet, day(22)).find((p) => p.project === 'OLD')?.class, 'static');

  // A status change seen now does.
  const oldClosed = { ...old, attributes: { ...old.attributes, boat: 'Closed' } };
  const changed = mergeLedger(quiet, normalizeStatusSnapshot(snapshot([recent, oldClosed, ancient, none], day(22))), day(22)).ledger;
  const oldNow = classifyProjects(changed, day(23)).find((p) => p.project === 'OLD')!;
  assert.equal(oldNow.class, 'maintained');
  assert.equal(oldNow.status_changes_in_window, 1);

  // The same change, viewed 128 days later with nothing since, no longer counts.
  const later = classifyProjects(changed, day(150)).find((p) => p.project === 'OLD')!;
  assert.equal(later.status_changes_in_window, 0);
  assert.equal(later.class, 'static', 'a change observed outside the window keeps nothing maintained');

  // RECENT's one fresh area does not make its stale neighbours look current: the per-area count says so.
  const mixed = mergeLedger(null, normalizeStatusSnapshot(snapshot([
    feature({ recprojectsitename: 'MIXED', recreationboundaryidpk: '10', date_updated: Date.parse('2026-11-01T00:00:00Z') }),
    feature({ recprojectsitename: 'MIXED', recreationboundaryidpk: '11', date_updated: Date.parse('2024-06-01T00:00:00Z') }),
    feature({ recprojectsitename: 'MIXED', recreationboundaryidpk: '12', date_updated: Date.parse('2024-06-01T00:00:00Z') }),
  ])), RETRIEVED).ledger;
  const m = classifyProjects(mixed, day(1))[0];
  assert.equal(m.class, 'maintained');
  assert.equal(m.with_boat_status, 3);
  assert.equal(m.fresh_boat_status, 1);
  assert.equal(provenanceLine(mixed.areas['11'].record), 'Corps of Engineers listing, updated 2024-06-01', 'display follows the area, not the project');
});
