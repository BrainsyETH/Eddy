import assert from 'node:assert/strict';
import test from 'node:test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { dispatchVideos } from './dispatch-videos';
import {
  SCHEDULED_FORMATS, formatsFromLegacy, formatsOnSave, legacyFormatSettings, mediaForDay,
  placementChoicesFrom, resolveFormatSettings, validFormatSettings,
} from './format-settings';
import { expandDestinations } from './placements';
import { postsFromToday } from './post-scheduler';
import { savedPostMedia } from './review';
import type { MediaSchedule } from './types';

const media_schedule: MediaSchedule = {
  river_highlight: { thu: 'video' },
  daily_digest: { mon: 'video', tue: 'image' },
  weekly_forecast: { fri: 'video' },
  section_guide: { wed: 'video', sat: 'video' },
};
const legacy = {
  media_schedule,
  digest_time_cst: '14:30',
  weekly_forecast: { enabled: true, day_of_week: 5, time_cst: '21:00', media: 'video' as const },
  section_guide: { enabled: true, day_of_week: 3, time_cst: '16:00', media: 'video' as const, placements: { instagram: 'both' as const } },
};

test('legacy keys describe each format in the one settings shape', () => {
  assert.deepEqual(legacyFormatSettings(legacy, 'section_guide'), {
    days: { wed: 'video', sat: 'video' },
    time: '16:00',
    destinations: [
      { platform: 'instagram', placement: 'reel' }, { platform: 'instagram', placement: 'story' },
      { platform: 'facebook', placement: 'reel' }, { platform: 'tiktok', placement: 'reel' },
    ],
  });
  const forecast = legacyFormatSettings(legacy, 'weekly_forecast');
  assert.equal(forecast.time, '21:00');
  assert.deepEqual(forecast.destinations, [{ platform: 'instagram' }, { platform: 'facebook' }, { platform: 'tiktok' }],
    'a shared format has no placement, whatever Float Pick saved');
  const digest = legacyFormatSettings(legacy, 'daily_digest');
  assert.equal(digest.time, '14:30');
  assert.deepEqual(digest.destinations.map(d => d.platform), ['instagram', 'facebook'], 'the carousel never goes to TikTok');
  assert.equal(legacyFormatSettings(legacy, 'river_highlight').time, '17:00');
  // A config missing a format's keys still gets that format's defaults.
  assert.deepEqual(legacyFormatSettings({}, 'weekly_forecast').time, '22:00');
  assert.deepEqual(legacyFormatSettings({}, 'weekly_forecast').days, {});
  assert.deepEqual(Object.keys(formatsFromLegacy(legacy)), [...SCHEDULED_FORMATS]);
});

test('a valid saved entry wins; an invalid one falls back to the legacy keys', () => {
  const saved = { days: { mon: 'video' as const }, time: '09:15', destinations: [{ platform: 'facebook' as const, placement: 'story' as const }] };
  assert.deepEqual(resolveFormatSettings({ ...legacy, formats: { section_guide: saved } }, 'section_guide'), saved);
  const fallback = legacyFormatSettings(legacy, 'weekly_forecast');
  for (const bad of [
    { ...saved, time: '9:15' },
    { ...saved, days: { funday: 'video' } },
    { ...saved, destinations: [{ platform: 'facebook', placement: 'story' }] }, // Story on a shared format
    { ...saved, destinations: [{ platform: 'myspace' }] },
    null,
  ]) {
    assert.deepEqual(resolveFormatSettings({ ...legacy, formats: { weekly_forecast: bad } }, 'weekly_forecast'), fallback, JSON.stringify(bad));
  }
  assert.equal(validFormatSettings('daily_digest', { days: {}, time: '14:00', destinations: [{ platform: 'tiktok' }] }), false);
  assert.equal(validFormatSettings('weekly_forecast', { days: {}, time: '14:00', destinations: [] }), true, 'no destinations is a valid choice');
  assert.deepEqual(resolveFormatSettings({ ...legacy, formats: 'oops' }, 'section_guide'), legacyFormatSettings(legacy, 'section_guide'));
});

test('day cells and placement choices read back from settings', () => {
  const pick = legacyFormatSettings(legacy, 'section_guide');
  assert.equal(mediaForDay(pick, 3), 'video');
  assert.equal(mediaForDay(pick, 4), null);
  assert.equal(mediaForDay(legacyFormatSettings(legacy, 'daily_digest'), 2), 'image');
  assert.deepEqual(placementChoicesFrom(pick.destinations), { instagram: 'both' });
  for (const choices of [{}, { facebook: 'story' as const }, { instagram: 'story' as const, facebook: 'both' as const }]) {
    assert.deepEqual(placementChoicesFrom(expandDestinations(['instagram', 'facebook', 'tiktok'], choices)), choices);
  }
});

test('saved rows carry their format and placement, and readers prefer them', async t => {
  const before = process.env.GH_ACTIONS_TOKEN;
  process.env.GH_ACTIONS_TOKEN = 'fixture';
  t.after(() => { if (before === undefined) delete process.env.GH_ACTIONS_TOKEN; else process.env.GH_ACTIONS_TOKEN = before; });
  t.mock.method(globalThis, 'fetch', async () => new Response(null, { status: 204 }));
  let inserted: { format: string; placement: string | null }[] = [];
  const db = { from: () => ({ insert(rows: typeof inserted) { inserted = rows; return { error: null }; } }) } as unknown as SupabaseClient;
  const base = { riverSlug: null, caption: 'c', imageUrl: 'i', hashtags: [] };
  await dispatchVideos(db, 'section_guide', {}, expandDestinations(['instagram'], { instagram: 'both' }).map(d => ({ ...d, ...base })), true);
  assert.deepEqual(inserted.map(r => [r.format, r.placement]), [['section_guide', 'reel'], ['section_guide', 'story']]);
  await dispatchVideos(db, 'weekly_forecast', {}, [{ platform: 'facebook', ...base }], true);
  assert.deepEqual(inserted.map(r => [r.format, r.placement]), [['weekly_forecast', null]]);

  // The saved placement decides how a video publishes, even without a laid-out render request.
  const video = { platform: 'facebook', caption: 'caption', image_url: 'cover', video_url: 'v', media_type: 'video' };
  assert.equal(savedPostMedia({ ...video, placement: 'story' }).placement, 'story');
  assert.equal(savedPostMedia({ ...video, placement: null, render_request: { inputProps: { placement: 'story' } } }).placement, 'story');
  assert.equal(savedPostMedia({ ...video, placement: 'reel' }).coverUrl, 'cover');

  // Dedupe trusts the saved format: a clip never fills the Read's slot, and a Read counts without the cover URL match.
  const now = new Date('2026-11-19T20:00:00Z');
  const at = '2026-11-19T18:00:00Z';
  const rows = [
    { id: 'clip', created_at: at, status: 'published', auto_publish: true, image_url: 'x?type=weekend-read&', format: 'clip' },
    { id: 'read', created_at: at, status: 'published', auto_publish: true, image_url: 'https://cdn/cover.jpg', format: 'river_highlight' },
    { id: 'old-read', created_at: at, status: 'published', auto_publish: true, image_url: 'x?type=weekend-read&p=1', format: null },
    { id: 'old-clip', created_at: at, status: 'published', auto_publish: true, image_url: 'https://cdn/clip.jpg', format: null },
  ];
  const readDb = { from: () => ({ select: () => ({ eq: () => ({ gte: async () => ({ data: rows, error: null }) }) }) }) };
  assert.deepEqual((await postsFromToday(readDb, 'river_highlight', 'America/Chicago', now)).map(r => r.id), ['read', 'old-read']);
});

test('saving an unrelated setting keeps a saved Story-only schedule; editing its time changes only the time', () => {
  // The review case: Facebook Story only, at 9:15 AM, saved per format.
  const storyOnly = { days: { wed: 'video' as const }, time: '09:15', destinations: [{ platform: 'facebook' as const, placement: 'story' as const }] };
  const existing = { ...legacy, formats: { section_guide: storyOnly } };
  const unrelated = formatsOnSave(existing, { ...existing, highlight_cooldown_hours: 6 } as typeof existing);
  assert.deepEqual(unrelated.section_guide, storyOnly);
  assert.deepEqual(unrelated.weekly_forecast, legacyFormatSettings(legacy, 'weekly_forecast'));

  const retimed = formatsOnSave(existing, { ...existing, section_guide: { ...legacy.section_guide, time_cst: '18:00' } });
  assert.deepEqual(retimed.section_guide, { ...storyOnly, time: '18:00' });

  const regrid = formatsOnSave(existing, { ...existing, media_schedule: { ...media_schedule, section_guide: { fri: 'video' } } });
  assert.deepEqual(regrid.section_guide, { ...storyOnly, days: { fri: 'video' } });

  const replaced = formatsOnSave(existing, { ...existing, section_guide: { ...legacy.section_guide, placements: { facebook: 'both' as const } } });
  assert.deepEqual(replaced.section_guide?.destinations, legacyFormatSettings({ ...legacy, section_guide: { ...legacy.section_guide, placements: { facebook: 'both' } } }, 'section_guide').destinations,
    'editing placements replaces the destinations');
  assert.equal(replaced.section_guide?.time, '09:15');

  // Grid key order alone is not an edit.
  const reordered = formatsOnSave(existing, { ...existing, media_schedule: { ...media_schedule, section_guide: { sat: 'video', wed: 'video' } } });
  assert.deepEqual(reordered.section_guide, storyOnly);
});

test('a destination is listed once and only where it can be delivered', () => {
  const ok = (kind: 'section_guide' | 'weekly_forecast', destinations: unknown[]) =>
    validFormatSettings(kind, { days: {}, time: '12:00', destinations });
  assert.equal(ok('section_guide', [{ platform: 'instagram', placement: 'story' }, { platform: 'instagram', placement: 'reel' }]), true);
  assert.equal(ok('section_guide', [{ platform: 'instagram', placement: 'story' }, { platform: 'instagram', placement: 'story' }]), false, 'duplicate Story');
  assert.equal(ok('section_guide', [{ platform: 'facebook' }, { platform: 'facebook', placement: 'reel' }]), false, 'a missing placement is the regular post');
  assert.equal(ok('section_guide', [{ platform: 'tiktok', placement: 'story' }]), false, 'TikTok takes regular video only');
  assert.equal(ok('section_guide', [{ platform: 'tiktok', placement: 'reel' }]), true);
  assert.equal(ok('weekly_forecast', [{ platform: 'tiktok' }, { platform: 'tiktok' }]), false);
  assert.equal(ok('section_guide', [{ platform: 'instagram', placement: 'banner' }]), false);
});

test('dispatch refuses two rows for one destination before saving anything', async () => {
  let inserts = 0;
  const db = { from: () => ({ insert() { inserts++; return { error: null }; } }) } as unknown as SupabaseClient;
  const story = { platform: 'instagram' as const, placement: 'story' as const, riverSlug: null, caption: 'c', imageUrl: 'i', hashtags: [] };
  await assert.rejects(dispatchVideos(db, 'section_guide', {}, [story, { ...story }], true), /Duplicate destination instagram story/);
  assert.equal(inserts, 0);
});
