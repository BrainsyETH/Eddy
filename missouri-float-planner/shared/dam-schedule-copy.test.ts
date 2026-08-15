import assert from 'node:assert/strict';
import test from 'node:test';
import {
  hourEndingLabel,
  windowLabel,
  idleWindowSentence,
  scheduleDayLabel,
  relativeAge,
  scheduleIsStale,
  retrievalSentence,
  SCHEDULE_STALE_AFTER_MINUTES,
  centralDayKey,
  scheduleHoursElapsed,
  hourEndingNow,
  scheduleStateNow,
  nextScheduleChangeSentence,
  oldestRetrievedAt,
  scheduledHoursSummary,
  SCHEDULE_CHANGE_NOTE,
  SCHEDULE_CHANGE_SENTENCE,
  tailwaterMovementLabel,
  tailwaterMovementSentence,
  readingStaleness,
} from './dam-schedule-copy';

/**
 * A day of scheduled megawatts from a sparse `{ hourEnding: mw }` map — every
 * hour not named is idle. Written this way so a case reads as the shape of the
 * day rather than as 24 numbers.
 */
function day(scheduleDate: string, mwByHour: Record<number, number>) {
  return {
    scheduleDate,
    hours: Array.from({ length: 24 }, (_, i) => ({
      hourEnding: i + 1,
      megawatts: mwByHour[i + 1] ?? 0,
    })),
  };
}

// 17:00 UTC is noon Central in July (CDT), which is hour ending 13.
const NOON_CENTRAL = Date.parse('2026-07-28T17:00:00Z');

test('hour ending names the hour the water starts moving', () => {
  // SWPA's own convention: hour 14 is the release running 1pm-2pm. This is the
  // off-by-one that puts someone in the water an hour early, so it is pinned.
  assert.equal(hourEndingLabel(14), '1 PM');
  assert.equal(hourEndingLabel(1), '12 AM');
  assert.equal(hourEndingLabel(13), '12 PM');
  assert.equal(hourEndingLabel(24), '11 PM');
});

test('midnight is spelled, not printed as 12 AM', () => {
  assert.equal(windowLabel(1, 6), 'midnight – 6 AM');
  assert.equal(windowLabel(7, 24), '6 AM – midnight');
});

test('a full day of generation says so rather than going quiet', () => {
  // An empty window list must not render as absence — "no data" and "the units
  // are scheduled all day" are opposite facts for someone deciding whether to
  // wade.
  assert.equal(
    idleWindowSentence([]),
    'Generation scheduled every hour — no break in the schedule.'
  );
  assert.equal(
    idleWindowSentence([{ from: 1, to: 6 }]),
    'No generation scheduled: midnight – 6 AM'
  );
  assert.equal(
    idleWindowSentence([
      { from: 1, to: 6 },
      { from: 20, to: 24 },
    ]),
    'No generation scheduled: midnight – 6 AM, 7 PM – midnight'
  );
});

test('a schedule date is not shifted by the viewer timezone', () => {
  // SWPA days are Central. Parsed as an instant and formatted locally, this
  // would render as the 26th anywhere west of Central.
  assert.equal(scheduleDayLabel('2026-07-27'), 'Mon, Jul 27');
});

test('relative age is coarse past a day', () => {
  const now = Date.parse('2026-07-28T12:00:00Z');
  const ago = (ms: number) => new Date(now - ms).toISOString();

  assert.equal(relativeAge(ago(30_000), now), 'just now');
  // Between 30 and 90 seconds this rounds to one, and "1 minutes ago" shipped
  // on the dam schedule freshness line.
  assert.equal(relativeAge(ago(75_000), now), 'a minute ago');
  assert.equal(relativeAge(ago(12 * 60_000), now), '12 minutes ago');
  assert.equal(relativeAge(ago(90 * 60_000), now), 'an hour ago');
  assert.equal(relativeAge(ago(5 * 3_600_000), now), '5 hours ago');
  assert.equal(relativeAge(ago(30 * 3_600_000), now), 'yesterday');
  assert.equal(relativeAge(ago(72 * 3_600_000), now), '3 days ago');
});

test('a timestamp slightly in the future reads as current, not negative', () => {
  // Our clock and a CDN edge's need not agree to the second, and "in 30
  // seconds" would be nonsense on a freshness line.
  const now = Date.parse('2026-07-28T12:00:00Z');
  assert.equal(relativeAge(new Date(now + 20_000).toISOString(), now), 'just now');
});

test('an unknown retrieval yields nothing at all', () => {
  // The whole point of the null path: absent renders nothing, and must never
  // be substituted with the current time.
  assert.equal(relativeAge(null), null);
  assert.equal(relativeAge(undefined), null);
  assert.equal(relativeAge('not a date'), null);
  assert.equal(retrievalSentence(null), null);
  assert.equal(scheduleIsStale(null), false, 'absent is not stale');
});

test('staleness fires only past the cache windows, not inside them', () => {
  const now = Date.parse('2026-07-28T12:00:00Z');
  const ago = (min: number) => new Date(now - min * 60_000).toISOString();

  // SWPA's edge caches 600s and Eddy revalidates at 1800s; inside that the
  // system is working normally and a warning would be noise.
  assert.equal(scheduleIsStale(ago(SCHEDULE_STALE_AFTER_MINUTES - 1), now), false);
  assert.equal(scheduleIsStale(ago(SCHEDULE_STALE_AFTER_MINUTES + 1), now), true);
});

test('the retrieval line names Eddy as the subject, never SWPA', () => {
  // SWPA publishes no timestamp, so any phrasing that attributes freshness to
  // them is a claim the source never made.
  const now = Date.parse('2026-07-28T12:00:00Z');
  const fresh = retrievalSentence(new Date(now - 12 * 60_000).toISOString(), now);
  assert.equal(fresh, 'Eddy last checked 12 minutes ago.');
  assert.ok(!/updated|posted|SWPA/i.test(fresh!), 'must not imply a publication time');

  const stale = retrievalSentence(new Date(now - 5 * 3_600_000).toISOString(), now);
  assert.equal(stale, 'Eddy last checked 5 hours ago. It may have been revised since.');
});

test('the clock is read at the DAM, not on the phone', () => {
  // 03:30 UTC on the 29th is 22:30 Central on the 28th (CDT, UTC-5). A viewer
  // anywhere in the world asking "what is the water doing" means at the dam, so
  // the schedule day is the 28th and the marker sits at 22.5 hours.
  const night = Date.parse('2026-07-29T03:30:00Z');
  assert.equal(centralDayKey(night), '2026-07-28');
  assert.equal(scheduleHoursElapsed('2026-07-28', night), 22.5);
});

test('only today carries a marker', () => {
  // A three-day schedule renders three identical bar rows. A "now" line on
  // tomorrow's would be a claim about a river at a time that has not happened.
  const noon = Date.parse('2026-07-28T17:00:00Z'); // 12:00 Central
  assert.equal(scheduleHoursElapsed('2026-07-28', noon), 12);
  assert.equal(scheduleHoursElapsed('2026-07-29', noon), null, 'tomorrow gets none');
  assert.equal(scheduleHoursElapsed('2026-07-27', noon), null, 'yesterday gets none');
});

test('the hour running now is SWPA hour-ending, not the wall-clock hour', () => {
  // The off-by-one this whole module exists to pin. At 13:30 Central the water
  // moving is the release posted as hour ending 14 — and hourEndingLabel(14)
  // reads back as "1 PM", which is where the reader started.
  assert.equal(hourEndingNow(13.5), 14);
  assert.equal(hourEndingLabel(hourEndingNow(13.5)), '1 PM');

  // Both ends of the day, where an off-by-one wraps rather than merely shifts.
  assert.equal(hourEndingNow(0), 1, 'the first minute after midnight is hour 1');
  assert.equal(hourEndingNow(23.99), 24, 'the last minute of the day is hour 24');
});

test('centralDayKey survives the DST boundary', () => {
  // 06:30 UTC is 01:30 CDT (UTC-5) in July but 00:30 CST (UTC-6) in January —
  // a fixed offset would put one of them on the wrong calendar day.
  assert.equal(centralDayKey(Date.parse('2026-07-15T06:30:00Z')), '2026-07-15');
  assert.equal(centralDayKey(Date.parse('2026-01-15T06:30:00Z')), '2026-01-15');
  // 05:30 UTC in January is 23:30 CST the previous day.
  assert.equal(centralDayKey(Date.parse('2026-01-15T05:30:00Z')), '2026-01-14');
});

// ── The next scheduled change ──────────────────────────────────────────────
// The forward-looking half of the schedule: not "what is the water doing" —
// the card's CWMS-backed chip answers that — but "when does it change".

test('an idle dam reports when the water comes on', () => {
  // Units scheduled 3 PM to 9 PM, i.e. hours ending 16-21. At noon the dam is
  // idle and the next thing that happens is the 3 PM start.
  const schedule = [day('2026-07-28', { 16: 35, 17: 35, 18: 35, 19: 35, 20: 35, 21: 35 })];
  const state = scheduleStateNow(schedule, NOON_CENTRAL);
  assert.equal(state?.generating, false);
  assert.equal(state?.change?.hourEnding, 16);
  assert.equal(state?.change?.generating, true, 'it changes INTO generating');
  assert.equal(nextScheduleChangeSentence(schedule, NOON_CENTRAL), 'Generation scheduled to start at 3 PM');
});

test('a generating dam reports when the water goes off', () => {
  // Running since 6 AM and scheduled to stop after hour ending 21 — the last
  // hour of load — so the water is off from 9 PM.
  const schedule = [
    day('2026-07-28', { 7: 35, 8: 35, 9: 35, 10: 35, 11: 35, 12: 35, 13: 35, 14: 35, 15: 35, 16: 35, 17: 35, 18: 35, 19: 35, 20: 35, 21: 35 }),
  ];
  const state = scheduleStateNow(schedule, NOON_CENTRAL);
  assert.equal(state?.generating, true);
  assert.equal(state?.change?.hourEnding, 22, 'the first idle hour, not the last loaded one');
  assert.equal(nextScheduleChangeSentence(schedule, NOON_CENTRAL), 'Generation scheduled to stop at 9 PM');
});

test('the change is found in the hour running now, not the wall-clock hour', () => {
  // The off-by-one this module exists to pin, in its most dangerous form. At
  // noon the hour RUNNING is hour ending 13. A schedule that starts generating
  // at hour ending 13 is already generating — reading the wall-clock hour 12
  // instead would report the dam as idle with the water about to come on, and
  // send someone into a river the units are already running into.
  const schedule = [day('2026-07-28', { 13: 35, 14: 35, 15: 35 })];
  const state = scheduleStateNow(schedule, NOON_CENTRAL);
  assert.equal(state?.generating, true, 'hour ending 13 is the hour running at noon');
  assert.equal(nextScheduleChangeSentence(schedule, NOON_CENTRAL), 'Generation scheduled to stop at 3 PM');
});

test('a change after midnight is named as tomorrow', () => {
  // Idle for the rest of today, units on at 6 AM the next morning. The answer
  // spans two schedule files, which is why the index page loads two days.
  const schedule = [day('2026-07-28', {}), day('2026-07-29', { 7: 35, 8: 35 })];
  const state = scheduleStateNow(schedule, NOON_CENTRAL);
  assert.equal(state?.change?.dayOffset, 1);
  assert.equal(nextScheduleChangeSentence(schedule, NOON_CENTRAL), 'Generation scheduled to start at 6 AM tomorrow');
});

test('a change two days out is named by weekday', () => {
  const schedule = [day('2026-07-28', {}), day('2026-07-29', {}), day('2026-07-30', { 15: 35 })];
  // 2026-07-30 is a Thursday. "tomorrow" would be wrong and a bare "2 PM"
  // would read as today.
  assert.equal(nextScheduleChangeSentence(schedule, NOON_CENTRAL), 'Generation scheduled to start at 2 PM Thursday');
});

test('a gap in the loaded days is never walked across', () => {
  // fetchProjectSchedule drops a day whose file has not refreshed yet, so the
  // array can hold today and the day AFTER tomorrow with a hole between them.
  // Walking the hole would report Thursday's 6 AM start as Wednesday's — a
  // whole day early, on a line someone plans a wade around.
  const schedule = [day('2026-07-28', {}), day('2026-07-30', { 7: 35 })];
  const state = scheduleStateNow(schedule, NOON_CENTRAL);
  assert.equal(state?.generating, false, 'today is still readable');
  assert.equal(state?.change, null, 'but tomorrow is unknown, so nothing is claimed');
  assert.equal(nextScheduleChangeSentence(schedule, NOON_CENTRAL), null);
});

test('no schedule for today means no claim at all', () => {
  // Absent is not idle. A dam whose file failed to fetch must render nothing
  // here rather than a transition derived from some other day.
  assert.equal(scheduleStateNow([], NOON_CENTRAL), null);
  assert.equal(scheduleStateNow([day('2026-07-29', { 7: 35 })], NOON_CENTRAL), null);
  assert.equal(nextScheduleChangeSentence([day('2026-07-29', { 7: 35 })], NOON_CENTRAL), null);
});

test('a day that never changes state reports no change', () => {
  // Generating every hour, and idle every hour. Both are real: the Arkansas
  // River navigation dams run around the clock, and a project on outage sits
  // idle for days. Neither has anything to announce.
  assert.equal(nextScheduleChangeSentence([day('2026-07-28', {})], NOON_CENTRAL), null);
  const allOn = day('2026-07-28', Object.fromEntries(Array.from({ length: 24 }, (_, i) => [i + 1, 35])));
  const state = scheduleStateNow([allOn], NOON_CENTRAL);
  assert.equal(state?.generating, true);
  assert.equal(state?.change, null);
});

test('a midnight change is called midnight, not 12 AM — and it is TONIGHT', () => {
  // Hour ending 1 is the release running from midnight. "...at 12 AM" is
  // correct but reads as a typo next to windowLabel's "midnight".
  //
  // And the day word is "tonight", though the flip sits on TOMORROW's sheet:
  // 00:00 tomorrow is the midnight that ends today. "midnight tomorrow" names
  // the following one and put the start a full day late — the one direction
  // this file's hedges are never allowed to err in, since it leaves somebody
  // standing in a tailwater the units are about to run into.
  const schedule = [day('2026-07-28', {}), day('2026-07-29', { 1: 35, 2: 35 })];
  assert.equal(nextScheduleChangeSentence(schedule, NOON_CENTRAL), 'Generation scheduled to start at midnight tonight');
  // The hour either side of it still takes the plain day word, so the special
  // case cannot quietly widen into "everything early tomorrow is tonight".
  const oneAm = [day('2026-07-28', {}), day('2026-07-29', { 2: 35, 3: 35 })];
  assert.equal(nextScheduleChangeSentence(oneAm, NOON_CENTRAL), 'Generation scheduled to start at 1 AM tomorrow');
});

test('the change is read at the dam, not on the viewer phone', () => {
  // 03:30 UTC on the 29th is 22:30 Central on the 28th — hour ending 23. A
  // viewer in another timezone asking when the water changes means at the dam.
  const lateNight = Date.parse('2026-07-29T03:30:00Z');
  const schedule = [day('2026-07-28', { 23: 35, 24: 35 })];
  const state = scheduleStateNow(schedule, lateNight);
  assert.equal(state?.generating, true);
  assert.equal(state?.change, null, 'the schedule ends still generating');
});

// ── Saying what the source said, at the place it said it ───────────────────
// Every string below is read by someone deciding whether to stand in a river.

test('no schedule copy claims to describe the water', () => {
  // "Water off at 10 PM" shipped, and it turns a fact about a powerhouse into a
  // claim about a river miles downstream — where the recession limb keeps the
  // level up long after the units come off. The subject has to be the plant
  // until travel time is built (docs/TAILWATER_PLAN.md).
  const idle = [day('2026-07-28', { 16: 35 })];
  const running = [day('2026-07-28', { 1: 35, 12: 35, 13: 35, 14: 35 })];

  const strings = [
    nextScheduleChangeSentence(idle, NOON_CENTRAL)!,
    nextScheduleChangeSentence(running, NOON_CENTRAL)!,
    idleWindowSentence([{ from: 1, to: 6 }]),
    idleWindowSentence([]),
  ];
  for (const s of strings) {
    assert.ok(s, 'expected a sentence to check');
    assert.ok(
      !/\bwater\b/i.test(s),
      `schedule copy must not make a claim about water: ${JSON.stringify(s)}`
    );
  }
});

test('no schedule copy speaks as if it had looked at the powerhouse', () => {
  // The sibling of the water assertion above, and the invariant that was
  // missing when "Generation off:" and "Generating now" shipped from functions
  // that read a schedule. Both rendered on iOS directly beneath a hero capable
  // of saying "No turbine generation observed" — a measurement and a plan, on
  // adjacent lines, in the same present tense, with nothing to tell them apart.
  //
  // Every string this module produces describes a POSTED PLAN. It may say
  // "scheduled"; it may not report the state of the machinery.
  const idle = [day('2026-07-28', { 16: 35 })];
  const running = [day('2026-07-28', { 1: 35, 12: 35, 13: 35, 14: 35 })];

  const strings = [
    idleWindowSentence([]),
    idleWindowSentence([{ from: 1, to: 6 }]),
    nextScheduleChangeSentence(idle, NOON_CENTRAL)!,
    nextScheduleChangeSentence(running, NOON_CENTRAL)!,
  ];

  for (const s of strings) {
    assert.ok(s, 'expected a sentence to check');
    // "Generating", "Generation off", "running now" — anything asserting a
    // present state. The permitted forms all carry "scheduled".
    assert.ok(
      !/\b(generating|generation off|units? (?:are|is) (?:on|off)|running)\b/i.test(s),
      `schedule copy claims a present machinery state: ${JSON.stringify(s)}`
    );
    assert.ok(
      /schedul/i.test(s),
      `schedule copy must name itself as a schedule: ${JSON.stringify(s)}`
    );
  }
});

test('a scheduled change is hedged inside its own sentence', () => {
  // The note is a separate string a caller can forget to render. The modality
  // therefore lives in the sentence too, so the worst case is a line missing
  // its location rather than a line asserting an unconditional future.
  const schedule = [day('2026-07-28', { 16: 35, 17: 35 })];
  const sentence = nextScheduleChangeSentence(schedule, NOON_CENTRAL)!;
  assert.match(sentence, /scheduled/i);
  assert.equal(sentence, 'Generation scheduled to start at 3 PM');
});

test('the change note carries location, revisability and lag', () => {
  // WATER_REGIMES_STRATEGY.md requires SWPA's disclaimer to travel with the
  // schedule everywhere it appears, and /dams renders the change line with no
  // schedule block — so this note is the only caveat on that page.
  assert.match(SCHEDULE_CHANGE_NOTE, /at the dam/i);
  assert.match(SCHEDULE_CHANGE_NOTE, /subject to change/i);
  assert.match(SCHEDULE_CHANGE_NOTE, /downstream/i);
});

// ── Movement never appears without its age ─────────────────────────────────

const READING_AT = '2026-08-12T18:00:00Z';
const AT_PLUS = (minutes: number) => Date.parse(READING_AT) + minutes * 60_000;

test('a fresh reading shows movement and age together', () => {
  const sentence = tailwaterMovementSentence(
    { at: READING_AT, trend: { hours: 3, delta: -2.57 } },
    AT_PLUS(18)
  );
  assert.equal(sentence, '−2.6 ft over 3h · 18 minutes ago');
});

test('a lagging reading locates the window it actually measured', () => {
  // changeOver measures the three hours ending at the LATEST OBSERVATION. On a
  // lagging series that window closed hours ago, and printing it beside a bare
  // age would still invite reading it as the three hours ending now.
  const sentence = tailwaterMovementSentence(
    { at: READING_AT, trend: { hours: 3, delta: 2.1 } },
    AT_PLUS(4 * 60)
  );
  assert.equal(sentence, '+2.1 ft over 3h ending 4 hours ago');
});

test('a stale reading drops the movement entirely', () => {
  // Past six hours the movement describes a stretch of river that has since
  // been through a whole generation cycle. The age alone is the honest answer.
  const sentence = tailwaterMovementSentence(
    { at: READING_AT, trend: { hours: 3, delta: 2.1 } },
    AT_PLUS(9 * 60)
  );
  assert.equal(sentence, '9 hours ago');
});

test('movement is never rendered without an age', () => {
  // The defect this function exists to prevent, stated as an invariant: if the
  // timestamp cannot be read there is no sentence at all, rather than a
  // movement figure floating free of when it was measured.
  assert.equal(
    tailwaterMovementSentence(
      { at: 'not a date', trend: { hours: 3, delta: 2.1 } },
      AT_PLUS(0)
    ),
    null
  );
  // And with no trend, the age still shows.
  assert.equal(
    tailwaterMovementSentence({ at: READING_AT }, AT_PLUS(18)),
    '18 minutes ago'
  );
});

test('movement rounds to a tenth, and a rounded zero renders nothing', () => {
  // The rounding IS the "steady" threshold — see the measurement note. Clearwater
  // read -0.01 ft over three hours on 2026-08-12: flood control, no powerhouse,
  // release steady for days.
  assert.equal(tailwaterMovementLabel({ hours: 3, delta: -0.01 }), null);
  assert.equal(tailwaterMovementLabel({ hours: 3, delta: 0.04 }), null);
  assert.equal(tailwaterMovementLabel({ hours: 3, delta: 2.57 }), '+2.6 ft over 3h');
  assert.equal(tailwaterMovementLabel({ hours: 3, delta: -3.59 }), '−3.6 ft over 3h');
  assert.equal(tailwaterMovementLabel(undefined), null);
  // The window is stated rather than assumed — the river gauge card renders its
  // own delta with no window at all, and these must not read as comparable.
  assert.match(tailwaterMovementLabel({ hours: 6, delta: 1 })!, /over 6h/);
});

test('the band comes from the timestamp, not from a value the server stamped', () => {
  // The defect: DamMetricValue.staleness is computed when the SERVER assembles
  // the snapshot and then frozen on the wire. The iOS dam screen fetches once
  // on mount with no refetch on focus, so a screen backgrounded and resumed
  // nine hours later still carries `staleness: 'fresh'` — while the age beside
  // it, computed on the device, correctly reads "9 hours ago". Trusting the
  // wire printed movement next to that age.
  //
  // Passing a whole DamMetricValue still type-checks (structural typing), so
  // the guard is that the band is IGNORED, not merely absent from the type.
  const wireSaysFresh = {
    at: READING_AT,
    staleness: 'fresh' as const,
    trend: { hours: 3, delta: 2.1 },
  };
  assert.equal(
    tailwaterMovementSentence(wireSaysFresh, AT_PLUS(9 * 60)),
    '9 hours ago',
    'movement must be suppressed on the real age, whatever the wire claims'
  );
  // And the inverse: a wire band of `stale` must not suppress a reading that is
  // genuinely current, which would hide live movement on a resumed screen.
  const wireSaysStale = {
    at: READING_AT,
    staleness: 'stale' as const,
    trend: { hours: 3, delta: 2.1 },
  };
  assert.equal(
    tailwaterMovementSentence(wireSaysStale, AT_PLUS(18)),
    '+2.1 ft over 3h · 18 minutes ago'
  );
});

test('the staleness bands sit where the server put them', () => {
  // Same 2h/6h boundaries stalenessOf used before it delegated here, so a
  // reading does not change band by being classified on the other side.
  const at = Date.parse(READING_AT);
  const hoursOn = (h: number) => readingStaleness(READING_AT, at + h * 3_600_000);
  assert.equal(hoursOn(0), 'fresh');
  assert.equal(hoursOn(2), 'fresh', 'the boundary belongs to the fresher band');
  assert.equal(hoursOn(2.1), 'lagging');
  assert.equal(hoursOn(6), 'lagging');
  assert.equal(hoursOn(6.1), 'stale');
  // Clock skew against a CDN edge puts a timestamp slightly ahead of us.
  assert.equal(hoursOn(-0.5), 'fresh', 'a future timestamp is current, not ancient');
  // Epoch millis and ISO agree, because stalenessOf passes a number.
  assert.equal(readingStaleness(at, at + 9 * 3_600_000), 'stale');
  assert.equal(readingStaleness('not a date'), null, 'unreadable is never a guess');
});

test('a schedule block is only as fresh as its oldest day', () => {
  // Each day is a separate file (mon.htm, tue.htm) with its own cache age, so
  // the newest timestamp would overstate the set. This fold was written five
  // times across three packages before it lived here; the shared helper is
  // what keeps a freshness-rule change from missing one of them.
  assert.equal(
    oldestRetrievedAt([
      { retrievedAt: '2026-07-28T17:00:00.000Z' },
      { retrievedAt: '2026-07-28T11:00:00.000Z' },
      { retrievedAt: '2026-07-28T16:00:00.000Z' },
    ]),
    '2026-07-28T11:00:00.000Z'
  );
  // A day with no timestamp neither wins nor disqualifies the rest.
  assert.equal(
    oldestRetrievedAt([{ retrievedAt: null }, { retrievedAt: '2026-07-28T16:00:00.000Z' }]),
    '2026-07-28T16:00:00.000Z'
  );
  assert.equal(oldestRetrievedAt([{ retrievedAt: null }]), null);
  assert.equal(oldestRetrievedAt([]), null);
});

test('the long-form change note carries the same three claims in plain language', () => {
  // The compact note is sized for a list row; the hero has a whole block and
  // can afford words. Both have to carry all three: whose clock this is, what
  // it means where the reader is standing, and how much to trust it.
  assert.match(SCHEDULE_CHANGE_SENTENCE, /at the dam/i);
  assert.match(SCHEDULE_CHANGE_SENTENCE, /downstream/i);
  assert.match(SCHEDULE_CHANGE_SENTENCE, /can change/i);
  // "lags" was the word doing the downstream work, and it is jargon standing
  // in for the one fact a wading reader most needs.
  assert.ok(!/lags/i.test(SCHEDULE_CHANGE_SENTENCE));
  // And it may not promise a safe river — the same rule the rest of this file
  // holds. Saying water arrives later is a fact; saying it is then safe is not.
  assert.ok(!/\b(safe|wade|wading)\b/i.test(SCHEDULE_CHANGE_SENTENCE));
});

test('a day summary says "scheduled" in every branch, and names an all-day run', () => {
  const hours = (running: number) =>
    Array.from({ length: 24 }, (_, i) => ({ megawatts: i < running ? 300 : 0 }));

  assert.equal(scheduledHoursSummary(hours(0)), 'No generation scheduled');
  assert.equal(scheduledHoursSummary(hours(14)), 'Scheduled to generate 14 of 24 hours');
  // "24 of 24 hours" is a fraction a reader has to resolve before learning
  // anything, and the answer is always the same three words.
  assert.equal(scheduledHoursSummary(hours(24)), 'Scheduled to generate all day');

  assert.equal(scheduledHoursSummary(hours(0), { compact: true }), 'idle');
  assert.equal(scheduledHoursSummary(hours(14), { compact: true }), '14/24 h');
  assert.equal(scheduledHoursSummary(hours(24), { compact: true }), 'all day');

  // Never a bare "generating": this reads a plan and renders beside a hero
  // that may be reporting a measured "No turbine generation observed".
  for (const n of [0, 1, 14, 24]) {
    const full = scheduledHoursSummary(hours(n));
    assert.ok(/scheduled/i.test(full), `"${full}" must name itself a plan`);
  }
});
