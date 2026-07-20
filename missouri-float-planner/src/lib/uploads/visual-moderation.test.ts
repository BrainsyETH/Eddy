// Guards the F15 audit fix: community photos stay quarantined until a
// moderator verifies them, rejection deletes stored copies, and only OUR
// public-bucket objects are ever candidates for deletion.
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isQuarantinePath,
  planMediaTransition,
  publicImagePathFromUrl,
} from './visual-moderation';

const PATH = 'community-visuals/2026-07/0b2f4a1c-9d3e-4f5a-8b6c-1d2e3f4a5b6c.webp';

test('isQuarantinePath accepts only the exact /api/upload shape', () => {
  assert.ok(isQuarantinePath(PATH));
  for (const bad of [
    '../secrets/env.webp',
    'community-visuals/2026-07/not-a-uuid.webp',
    `community-visuals/2026-07/../../${'0b2f4a1c-9d3e-4f5a-8b6c-1d2e3f4a5b6c'}.webp`,
    `${PATH}.png`,
    'clips/2026-07/0b2f4a1c-9d3e-4f5a-8b6c-1d2e3f4a5b6c.webp',
    42,
    null,
  ]) {
    assert.equal(isQuarantinePath(bad), false, `must reject ${String(bad)}`);
  }
});

test('publicImagePathFromUrl parses only our public images bucket', () => {
  assert.equal(
    publicImagePathFromUrl(`https://x.supabase.co/storage/v1/object/public/images/${PATH}`),
    PATH,
  );
  assert.equal(publicImagePathFromUrl('https://example.com/some-external-photo.jpg'), null);
  assert.equal(
    publicImagePathFromUrl('https://x.supabase.co/storage/v1/object/public/clips/video.mp4'),
    null,
  );
  assert.equal(publicImagePathFromUrl(null), null);
});

test('verify publishes a quarantined photo exactly once', () => {
  assert.deepEqual(planMediaTransition('verified', { imagePath: PATH, imageUrl: null }), {
    kind: 'publish',
    quarantinePath: PATH,
  });
  // Already published (or legacy public-URL row): nothing to do.
  assert.deepEqual(
    planMediaTransition('verified', { imagePath: PATH, imageUrl: 'https://x/img.webp' }),
    { kind: 'none' },
  );
  assert.deepEqual(planMediaTransition('verified', { imagePath: null, imageUrl: 'https://x/img.webp' }), {
    kind: 'none',
  });
});

test('reject takes down quarantine and our published copies, never external URLs', () => {
  assert.deepEqual(planMediaTransition('rejected', { imagePath: PATH, imageUrl: null }), {
    kind: 'takedown',
    quarantinePath: PATH,
    publicPath: null,
  });
  assert.deepEqual(
    planMediaTransition('rejected', {
      imagePath: null,
      imageUrl: `https://x.supabase.co/storage/v1/object/public/images/${PATH}`,
    }),
    { kind: 'takedown', quarantinePath: null, publicPath: PATH },
  );
  // Legacy external URL: no storage of ours to delete.
  assert.deepEqual(
    planMediaTransition('rejected', { imagePath: null, imageUrl: 'https://example.com/x.jpg' }),
    { kind: 'none' },
  );
});

test('returning a report to pending never touches storage', () => {
  assert.deepEqual(planMediaTransition('pending', { imagePath: PATH, imageUrl: null }), {
    kind: 'none',
  });
});
