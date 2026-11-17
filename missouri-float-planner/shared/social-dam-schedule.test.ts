import test from 'node:test';
import assert from 'node:assert/strict';
import { damStorySnapshot, damStoryWindows, damStorySummary, damStoryRender, damStoryCaption, DAM_STORY_FIXTURE } from './social-dam-schedule';
import { savedPostMedia } from '../src/lib/social/review';
import type { DamScheduleDay } from './dam-types';

const now = Date.parse('2026-11-09T16:30:00Z');
const day = (active = [13, 14, 15, 16, 17, 18, 19, 20]): DamScheduleDay => ({
  scheduleDate: '2026-11-09', retrievedAt: '2026-11-09T16:00:00Z', idle: [],
  hours: Array.from({ length: 24 }, (_, i) => ({ hourEnding: i + 1, megawatts: active.includes(i + 1) ? 100 : 0, cfs: null, isRamp: false })),
});
test('hour-ending data produces noon to 8 PM, preserves gaps and labels midnight', () => {
  assert.deepEqual(damStoryWindows(damStorySnapshot(day(), '2026-11-09', now).hours), ['Noon–8 PM']);
  assert.deepEqual(damStoryWindows(damStorySnapshot(day([1, 2, 13, 24]), '2026-11-09', now).hours), ['Midnight–2 AM', 'Noon–1 PM', '11 PM–midnight']);
  assert.deepEqual(damStoryWindows(Array(24).fill(true)), ['All day']);
  assert.equal(damStoryWindows(Array.from({ length: 24 }, (_, i) => i % 2 === 0)).length, 12);
});
test('minimum flow and a confirmed zero day never imply that water is off', () => {
  const minimum = day([]); minimum.hours.forEach(h => { h.minimumFlow = true; h.megawatts = 5; });
  const snapshot = damStorySnapshot(minimum, minimum.scheduleDate, now);
  assert.equal(snapshot.minimumFlow, true); assert.equal(snapshot.hours.some(Boolean), false);
  assert.equal(damStorySummary(snapshot), 'Only minimum flow scheduled');
  assert.match(damStoryCaption(snapshot), /Only minimum flow scheduled/);
  assert.doesNotMatch(damStoryCaption(snapshot), /No generation scheduled|0 hours|also scheduled/);
  assert.equal(damStorySummary(damStorySnapshot(day([]), minimum.scheduleDate, now)), 'No generation scheduled');
  assert.doesNotMatch(damStoryCaption(snapshot), /water off|safe to wade/i);
  assert.equal(damStorySnapshot(day([]), minimum.scheduleDate, now).hours.some(Boolean), false);
});
test('unposted, incomplete, duplicate, non-finite and stale sources fail closed', () => {
  assert.throws(() => damStorySnapshot(undefined, '2026-11-09', now), /not been posted/);
  for (const hours of [day().hours.slice(1), day().hours.map(h => ({ ...h, hourEnding: 1 })), day().hours.map(h => ({ ...h, megawatts: NaN })), day().hours.map(h => ({ ...h, megawatts: -1 }))]) {
    assert.throws(() => damStorySnapshot({ ...day(), hours }, '2026-11-09', now), /incomplete/);
  }
  for (const retrievedAt of [null, 'invalid', '2026-11-09T14:00:00Z', '2026-11-09T17:00:00Z']) {
    assert.throws(() => damStorySnapshot({ ...day(), retrievedAt }, '2026-11-09', now), /needs a new check/);
  }
});
test('date selection follows Central midnight, including DST days, without substituting dates', () => {
  assert.throws(() => damStorySnapshot(day(), '2026-11-10', now), /not been posted/);
  assert.throws(() => damStorySnapshot(day(), '2026-11-08', now), /today or tomorrow/);
  assert.throws(() => damStorySnapshot(day(), '2026-11-11', now), /today or tomorrow/);
  for (const [instant, date] of [['2026-03-09T04:30:00Z', '2026-03-08'], ['2026-11-02T05:30:00Z', '2026-11-01']]) {
    const source = { ...day(), scheduleDate: date, retrievedAt: instant };
    assert.equal(damStorySnapshot(source, date, Date.parse(instant)).scheduleDate, date);
  }
});
test('real exports replace sample props and cannot enter the generic publishing path', () => {
  for (const platform of ['instagram', 'tiktok'] as const) {
    const render = damStoryRender(DAM_STORY_FIXTURE, platform);
    assert.equal(render.inputProps.sample, false);
    assert.match(render.outputFilename, new RegExp(platform));
    assert.throws(() => savedPostMedia({ caption: '', media_type: 'video', video_url: 'https://video.example/file.mp4', image_url: null, render_request: render }), /download-only/);
  }
  assert.throws(() => savedPostMedia({ caption: '', media_type: 'video', video_url: null, image_url: null, render_request: { compositionId: 'social-dam-schedule' } }), /download-only/);
});
