import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { UPLOAD_SAFE_BYTES, uploadPreparation } from '../../../eddy-ios/src/lib/uploadPrep';
import { COMMUNITY_UPLOAD_MAX_BYTES } from './uploads/upload-limits';

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
  assert.equal(UPLOAD_SAFE_BYTES, COMMUNITY_UPLOAD_MAX_BYTES);
});

test('the mobile sheet never uploads original bytes — every photo is re-drawn', () => {
  // A camera-roll photo's own EXIF carries a GPS tag on most phones, and the
  // location permission copy promises "It is never sent to our servers". The
  // server strips metadata before storage, but a pass-through still sent the
  // tag across the wire. The strip is a no-resize manipulateAsync — any
  // re-draw drops every metadata block — so the small-file fast path must go
  // through it, not around it.
  const mobile = readFileSync('../eddy-ios/src/components/PhotoSubmitSheet.tsx', 'utf8');
  assert.doesNotMatch(mobile, /return \{ uri: asset\.uri/);
  assert.match(mobile, /manipulateAsync\(asset\.uri, \[\], \{/);
});

test('both clients reject a prepared payload that remains over the server limit', () => {
  const web = readFileSync('src/components/river/RiverVisualSubmitForm.tsx', 'utf8');
  const mobile = readFileSync('../eddy-ios/src/components/PhotoSubmitSheet.tsx', 'utf8');
  assert.match(web, /blob\.size <= COMMUNITY_UPLOAD_MAX_BYTES/);
  assert.match(web, /could not be compressed below 3\.5MB/i);
  assert.match(mobile, /size <= UPLOAD_SAFE_BYTES/);
  assert.match(mobile, /remains above the upload limit/i);
});
