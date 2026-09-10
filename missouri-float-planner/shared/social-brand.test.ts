import assert from 'node:assert/strict';
import test from 'node:test';
import {
  REEL_SAFE,
  SOCIAL_VIDEO_SAFE,
  STORY_SAFE,
  gridCropGap,
  sharedVideoSafe,
} from './social-brand';

test('cross-posted Reel bounds are the intersection of all platform profiles', () => {
  assert.deepEqual(REEL_SAFE, { top: 250, bottom: 420, left: 120, right: 270 });
  assert.deepEqual(REEL_SAFE, sharedVideoSafe('reel'));
  for (const platform of Object.values(SOCIAL_VIDEO_SAFE)) {
    assert.ok(REEL_SAFE.top >= platform.reel.top);
    assert.ok(REEL_SAFE.bottom >= platform.reel.bottom);
    assert.ok(REEL_SAFE.left >= platform.reel.left);
    assert.ok(REEL_SAFE.right >= platform.reel.right);
  }
});

test('Instagram Reel inset survives tall-device aspect-fill cropping', () => {
  // Observed full-screen playback on a 1290x2796 iPhone uses an approximately
  // 1290x2536 media viewport. A 9:16 master aspect-filled into that viewport
  // loses ~52 source pixels on each horizontal edge.
  const masterWidth = 1080;
  const masterHeight = 1920;
  const viewportWidth = 1290;
  const viewportHeight = 2536;
  const scale = viewportHeight / masterHeight;
  const croppedSourcePx = ((masterWidth * scale - viewportWidth) / 2) / scale;
  const visibleLeftGutter = SOCIAL_VIDEO_SAFE.instagram.reel.left - croppedSourcePx;

  assert.ok(croppedSourcePx > 50 && croppedSourcePx < 55);
  assert.ok(visibleLeftGutter >= 60);
});

test('Story bounds are maintained independently from Reel bounds', () => {
  assert.deepEqual(STORY_SAFE, { top: 250, bottom: 420, left: 60, right: 270 });
  assert.deepEqual(STORY_SAFE, sharedVideoSafe('story'));
  assert.notEqual(SOCIAL_VIDEO_SAFE.instagram.story.bottom, SOCIAL_VIDEO_SAFE.instagram.reel.bottom);
});

test('portrait cover crops use platform profile-tile ratios, not playback UI', () => {
  assert.equal(gridCropGap(1080, 1920, 'instagram'), 240);
  assert.equal(gridCropGap(1080, 1920, 'tiktok'), 240);
  assert.equal(gridCropGap(1080, 1920, 'facebook'), 420);
  assert.equal(gridCropGap(1080, 1080, 'facebook'), 0);
});
