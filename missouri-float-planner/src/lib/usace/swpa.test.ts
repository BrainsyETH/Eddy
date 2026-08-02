import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import {
  SWPA_PROJECTS,
  idleWindows,
  megawattsToCfs,
  parseScheduleDate,
  parseSchedulePage,
  retrievedAtFrom,
  swpaCodeCandidates,
  weekdayFileFor,
  centralDateKey,
  type ProjectSchedule,
} from './swpa';

// A captured live page from 2026-07-27. This fixture is the whole point of the
// test file: SWPA is a scraper target — fixed-width text on a government page
// with no version, no content-type contract and no changelog — so a format
// change is the likeliest way this feature breaks. Catching it here beats
// finding out when an angler sees an empty schedule.
// Resolved from cwd, matching src/lib/api-cache-headers.test.ts — tsx
// transpiles these to CJS, where import.meta.dirname is undefined.
const FIXTURE = readFileSync(
  join(process.cwd(), 'src/lib/usace/__fixtures__/swpa-mon-2026-07-27.txt'),
  'utf8'
);

test('Ozark resolves whichever way SWPA spells it that day', () => {
  // SWPA prints two different codes for one project ON THE SAME PAGE: the
  // column header says OZK (fixture line 6), the project table says OZD
  // (fixture line 52). Schedules are keyed on the column, so a dam wired to the
  // table's spelling would report "no schedule" forever — a silent failure
  // indistinguishable from the feed being down.
  const day = parseSchedulePage(FIXTURE);
  assert.ok(day, 'fixture must parse');

  // The parsed columns carry OZK, not OZD — this is the asymmetry itself.
  assert.ok(day.projects.OZK, 'fixture column header spells it OZK');
  assert.equal(day.projects.OZD, undefined, 'the table spelling is not a column');

  // Both spellings must lead a caller to the same place.
  assert.deepEqual(swpaCodeCandidates('OZD'), ['OZD', 'OZK']);
  assert.deepEqual(swpaCodeCandidates('OZK'), ['OZK', 'OZD']);
  for (const code of ['OZD', 'OZK']) {
    // Annotated for the same reason as below: assert.ok narrows, so inferring
    // this from a value it narrows is circular (TS7022).
    const found: string | undefined = swpaCodeCandidates(code).find((c) => day.projects[c]);
    assert.ok(found, `${code} must resolve to a parsed column`);
  }

  // A code with no alias resolves to just itself.
  assert.deepEqual(swpaCodeCandidates('BSD'), ['BSD']);
});

test('every project SWPA schedules is one the parser knows', () => {
  // The 18 columns are the set that decides how many dams Eddy can have.
  const day = parseSchedulePage(FIXTURE);
  assert.ok(day);
  const columns = Object.keys(day.projects);
  assert.equal(columns.length, 18, 'SWPA schedules 18 projects');
  for (const code of columns) {
    assert.ok(SWPA_PROJECTS[code], `column ${code} has no SWPA_PROJECTS entry`);
  }
});

test('parses the schedule date from the body, not the title', () => {
  // Load-bearing: on the day this fixture was captured, tue.htm was TITLED
  // "TUESDAY, JULY 27, 2026" while its body read "TUESDAY JULY 28, 2026". The
  // title lags a day. Reading the title would shift every schedule by one day.
  assert.equal(parseScheduleDate(FIXTURE), '2026-07-27');
});

test('parses every project into a full 24-hour schedule', () => {
  const day = parseSchedulePage(FIXTURE);
  assert.ok(day, 'fixture should parse');
  assert.equal(day.scheduleDate, '2026-07-27');

  for (const code of ['TRD', 'BSD', 'BEV', 'NFD', 'GFD', 'STD', 'HST', 'CAN']) {
    // Annotated because assert.ok is an assertion function: inferring the type
    // from a value it narrows is circular (TS7022).
    const schedule: ProjectSchedule | undefined = day.projects[code];
    assert.ok(schedule, `${code} should be present`);
    assert.equal(schedule.hours.length, 24, `${code} should have 24 hours`);
    assert.deepEqual(
      schedule.hours.map((h) => h.hourEnding),
      Array.from({ length: 24 }, (_, i) => i + 1),
      `${code} hours should be 1..24 in order`
    );
  }
});

test('reads Table Rock megawatts exactly as posted', () => {
  const day = parseSchedulePage(FIXTURE)!;
  const trd = day.projects.TRD;
  // Straight off the captured page: idle overnight, 35 MW through the morning,
  // then up to 150 MW for the afternoon peak.
  assert.equal(trd.hours[0].megawatts, 0, 'hour 1 idle');
  assert.equal(trd.hours[6].megawatts, 35, 'hour 7 at 35 MW');
  assert.equal(trd.hours[13].megawatts, 150, 'hour 14 at 150 MW');
});

test('idle hours carry no cfs estimate', () => {
  const day = parseSchedulePage(FIXTURE)!;
  for (const h of day.projects.TRD.hours) {
    if (h.megawatts === 0) assert.equal(h.cfs, null, `hour ${h.hourEnding}`);
    else assert.ok(h.cfs && h.cfs > 0, `hour ${h.hourEnding} should estimate a release`);
  }
});

test('flags ramp hours, where the cfs estimate is unreliable', () => {
  const day = parseSchedulePage(FIXTURE)!;
  const trd = day.projects.TRD;
  // Measured against CWMS Flow-Plant the same day, ramp hours ran -41% to
  // +117% off, because units spin up partway through the hour. The UI must not
  // print a number on these.
  assert.equal(trd.hours[6].isRamp, true, 'hour 7: 0 -> 35 MW is a ramp');
  assert.equal(trd.hours[7].isRamp, false, 'hour 8: steady at 35 MW');
  assert.equal(trd.hours[13].isRamp, true, 'hour 14: 50 -> 150 MW is a ramp');
});

test('converts megawatts to cfs with the page\'s own project table', () => {
  // Table Rock: 230 MW plant, ~15,100 cfs at full power.
  // 35/230 * 15100 = 2,298 -> rounds to 2,300.
  assert.equal(megawattsToCfs('TRD', 35), 2_300);
  assert.equal(megawattsToCfs('TRD', 230), 15_100);
  assert.equal(megawattsToCfs('TRD', 0), null, 'idle is not a release');
  assert.equal(megawattsToCfs('NOPE', 50), null, 'unknown project yields no estimate');
});

test('cfs estimates are rounded, never precise', () => {
  // The conversion measured within ~10% of observed flow at steady state, so a
  // figure like "2,298 cfs" would imply precision the schedule does not have.
  for (const mw of [10, 35, 88, 150, 391]) {
    for (const code of Object.keys(SWPA_PROJECTS)) {
      const cfs = megawattsToCfs(code, mw);
      if (cfs !== null) assert.equal(cfs % 100, 0, `${code} @ ${mw} MW -> ${cfs}`);
    }
  }
});

test('finds the idle windows an angler can wade', () => {
  const day = parseSchedulePage(FIXTURE)!;
  const windows = idleWindows(day.projects.TRD);
  // Table Rock ran 0 MW through hour 6 on this day, then generated.
  assert.ok(windows.length > 0, 'should find at least one idle window');
  assert.deepEqual(windows[0], { from: 1, to: 6 });
});

test('a project generating every hour has no idle window', () => {
  const day = parseSchedulePage(FIXTURE)!;
  // KEY held 35 MW all 24 hours on this day — no wading window, and the
  // function must say so rather than inventing one.
  assert.deepEqual(idleWindows(day.projects.KEY), []);
});

test('rejects pages that are not schedules', () => {
  assert.equal(parseSchedulePage('<html><body>Service unavailable</body></html>'), null);
  assert.equal(parseSchedulePage(''), null);
  assert.equal(parseScheduleDate('PROJECTED LOADING SCHEDULE  SOMEDAY'), null);
});

test('rejects a schedule whose hour rows are incomplete', () => {
  // Truncating the table mid-day must drop the affected projects rather than
  // present a schedule with holes in it.
  const truncated = FIXTURE.split('\n').slice(0, 12).join('\n');
  const day = parseSchedulePage(truncated);
  assert.equal(day, null, 'a partial table should not parse into a usable schedule');
});

test('retrieval time is the response Date', () => {
  const at = retrievedAtFrom(new Headers({ date: 'Tue, 28 Jul 2026 02:30:04 GMT' }));
  assert.equal(at, '2026-07-28T02:30:04.000Z');
});

test('Age is IGNORED, because adding it lands in the future', () => {
  // energy.gov sits behind two caches (Varnish, then CloudFront). `Age`
  // accumulates across both while `Date` is rewritten by one of them, so the
  // sum double-counts. Measured across three consecutive live samples on
  // 2026-07-28, Date+Age ran 12-16 MINUTES AHEAD of the clock every time,
  // while Date alone was never ahead.
  //
  // That direction is the whole point: this figure feeds a staleness warning,
  // and erring old understates freshness where erring new would tell somebody
  // a schedule is current when it is not.
  const date = 'Tue, 28 Jul 2026 02:30:04 GMT';
  const expected = '2026-07-28T02:30:04.000Z';
  assert.equal(retrievedAtFrom(new Headers({ date, age: '1529' })), expected);
  assert.equal(retrievedAtFrom(new Headers({ date, age: '0' })), expected);
  assert.equal(retrievedAtFrom(new Headers({ date })), expected);
});

test('no usable Date yields no retrieval time', () => {
  // Fails closed. A schedule with an unknown retrieval renders no timestamp;
  // it must never fall back to the current time.
  assert.equal(retrievedAtFrom(new Headers()), null);
  assert.equal(retrievedAtFrom(new Headers({ date: 'whenever' })), null);
});

test('a parsed page carries the retrieval time onto every project', () => {
  const at = '2026-07-28T02:55:33.000Z';
  const day = parseSchedulePage(FIXTURE, at)!;
  assert.equal(day.retrievedAt, at);
  for (const code of ['TRD', 'BSD', 'STD', 'HST']) {
    assert.equal(day.projects[code].retrievedAt, at, `${code} should carry it`);
  }
});

test('parsing without a retrieval time leaves it NULL, never "now"', () => {
  // The regression this whole change exists to prevent. A caller that does not
  // know when the bytes arrived — a test fixture, a future code path — must
  // produce an absent timestamp rather than a fabricated claim of freshness
  // about a schedule someone may wade against.
  const day = parseSchedulePage(FIXTURE)!;
  assert.equal(day.retrievedAt, null);
  assert.equal(day.projects.TRD.retrievedAt, null);
});

test('the schedule file is chosen by the CENTRAL weekday, not the server\'s', () => {
  // The bug: weekdayFileFor used date.getDay(), which reads the SERVER's
  // timezone. On a UTC host — which is every Vercel deploy — the UTC date rolls
  // over at 7pm Central, so from 7pm onward the file picker asked for tomorrow
  // while centralDateKey still expected today. The fail-closed date check then
  // rejected a perfectly good schedule, and every generation schedule on the
  // site went blank each evening.
  //
  // 2026-07-28T00:42Z is 7:42pm CDT on MONDAY the 27th.
  const mondayEvening = new Date('2026-07-28T00:42:00Z');
  assert.equal(weekdayFileFor(mondayEvening), 'mon');
  assert.equal(centralDateKey(mondayEvening), '2026-07-27');
});

test('the file and the expected date always agree on the same day', () => {
  // The two must never disagree, at any hour, or the fetch is dropped. Walk a
  // full day in 30-minute steps across a UTC-midnight boundary.
  const order = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  for (let i = 0; i < 48; i++) {
    const t = new Date(Date.parse('2026-07-27T12:00:00Z') + i * 30 * 60_000);
    const key = centralDateKey(t);
    // Reconstruct the weekday from the Central calendar date the key names.
    const [y, m, d] = key.split('-').map(Number);
    const expected = order[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
    assert.equal(weekdayFileFor(t), expected, `disagreement at ${t.toISOString()} (central ${key})`);
  }
});
