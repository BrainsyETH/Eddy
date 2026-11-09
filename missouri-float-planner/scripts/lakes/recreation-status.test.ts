import assert from 'node:assert/strict';
import test from 'node:test';
import {
  REPORTED_STATUS_LABELS, USACE_RECREATION_STATUS_SOURCE, classifyProjects, mergeLedger,
  normalizeStatusSnapshot, parseNoteDates, provenanceLine, reportedStatus, type StatusSnapshot,
} from './recreation-status';

const RETRIEVED = '2026-11-09T19:00:00.000Z';

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

function snapshot(features = [feature()]): StatusSnapshot {
  return { url: USACE_RECREATION_STATUS_SOURCE.url, retrieved_at: RETRIEVED, count: features.length, features };
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

test('the ledger moves first_observed_at only on a change and never backdates the agency', () => {
  const day1 = normalizeStatusSnapshot(snapshot());
  const run1 = mergeLedger(null, day1, RETRIEVED);
  assert.equal(run1.added, 1);
  const day2At = '2026-11-10T19:00:00.000Z';
  const run2 = mergeLedger(run1.ledger, day1, day2At);
  const unchanged = run2.ledger.areas['100'];
  assert.equal(run2.changed, 0);
  assert.equal(unchanged.first_observed_at, RETRIEVED);
  assert.equal(unchanged.last_checked_at, day2At);
  assert.equal(unchanged.record.source_updated_at, '2026-04-28T00:00:00.000Z', 'watching a value does not refresh its agency date');
  const day3At = '2026-11-11T19:00:00.000Z';
  const closed = normalizeStatusSnapshot({ ...snapshot([feature({ boat: 'Closed' })]), retrieved_at: day3At });
  const run3 = mergeLedger(run2.ledger, closed, day3At);
  const entry = run3.ledger.areas['100'];
  assert.equal(run3.changed, 1);
  assert.equal(entry.first_observed_at, day3At);
  assert.deepEqual(entry.changes.map((c) => [c.field, c.from, c.to]), [['boat_status', 'open', 'closed']]);
  const run4 = mergeLedger(run3.ledger, [], '2026-11-12T19:00:00.000Z');
  assert.equal(run4.missing, 1);
  assert.equal(run4.ledger.areas['100'].missing_since, '2026-11-12T19:00:00.000Z');
  assert.throws(() => mergeLedger(run4.ledger, day1, RETRIEVED), /older than the ledger/);
});

test('projects are classed by the agency date and observed change, not by Eddy watching a value stay put', () => {
  const recent = feature({ recprojectsitename: 'RECENT', recreationboundaryidpk: '1', date_updated: Date.parse('2026-10-16T00:00:00Z') });
  const old = feature({ recprojectsitename: 'OLD', recreationboundaryidpk: '2', date_updated: Date.parse('2026-04-28T00:00:00Z') });
  const ancient = feature({ recprojectsitename: 'ANCIENT', recreationboundaryidpk: '3', date_updated: Date.parse('2022-03-01T00:00:00Z'), notes: 'Winter closure until 1 March 2022.' });
  const none = feature({ recprojectsitename: 'NONE', recreationboundaryidpk: '4', status: null, boat: null, date_updated: null });
  const records = normalizeStatusSnapshot(snapshot([recent, old, ancient, none]));
  const { ledger } = mergeLedger(null, records, RETRIEVED);
  const byName = Object.fromEntries(classifyProjects(ledger, '2026-11-30T00:00:00Z').map((p) => [p.project, p]));
  assert.equal(byName.RECENT.class, 'maintained');
  assert.equal(byName.OLD.class, 'static');
  assert.equal(byName.ANCIENT.class, 'stale');
  assert.equal(byName.ANCIENT.stale_notes, 1);
  assert.equal(byName.NONE.class, 'unmaintained');
  // Three weeks of unchanged reads do not promote OLD.
  const later = mergeLedger(ledger, records, '2026-11-30T19:00:00.000Z');
  assert.equal(classifyProjects(later.ledger, '2026-12-01T00:00:00Z').find((p) => p.project === 'OLD')?.class, 'static');
  // An observed change does.
  const reopened = normalizeStatusSnapshot({ ...snapshot([{ ...old, attributes: { ...old.attributes, boat: 'Closed' } }, recent, ancient, none]), retrieved_at: '2026-12-01T19:00:00.000Z' });
  const changedLedger = mergeLedger(later.ledger, reopened, '2026-12-01T19:00:00.000Z').ledger;
  assert.equal(classifyProjects(changedLedger, '2026-12-02T00:00:00Z').find((p) => p.project === 'OLD')?.class, 'maintained');
});
