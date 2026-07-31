import assert from 'node:assert/strict';
import test from 'node:test';
import { UPLOAD_SAFE_BYTES, uploadPreparation } from '../../../eddy-ios/src/lib/uploadPrep';

test('small supported images preserve their real format', () => {
  assert.deepEqual(uploadPreparation({ fileSize: 1000, mimeType: 'image/png' }), {
    reencode: false,
    name: 'river-photo.png',
    type: 'image/png',
  });
});

test('large, unknown-size, HEIC, and unknown images are re-encoded', () => {
  for (const input of [
    { fileSize: UPLOAD_SAFE_BYTES + 1, mimeType: 'image/jpeg' },
    { fileSize: undefined, mimeType: 'image/png' },
    { fileSize: 1000, mimeType: 'image/heic' },
    { fileSize: 1000, mimeType: undefined },
  ]) {
    assert.deepEqual(uploadPreparation(input), {
      reencode: true,
      name: 'river-photo.jpg',
      type: 'image/jpeg',
    });
  }
});

test('the client leaves multipart headroom under Vercel limits', () => {
  assert.equal(UPLOAD_SAFE_BYTES, 3_670_016);
});
