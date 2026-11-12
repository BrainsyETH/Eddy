import assert from 'node:assert/strict';
import { afterEach, beforeEach, mock, test } from 'node:test';
import { recentlyFailedPhoto, rememberPhotoFailure } from './web-photo-failures';

let now = 1_800_000_000_000;
beforeEach(() => {
  now += 120_000;
  mock.method(Date, 'now', () => now);
});
afterEach(() => mock.restoreAll());

test('a remounted card remembers only the failed image URL', () => {
  rememberPhotoFailure('/broken.jpg');
  assert.equal(recentlyFailedPhoto('/broken.jpg'), true);
  assert.equal(recentlyFailedPhoto('/other.jpg'), false);
});

test('transient image failures can be retried after one minute', () => {
  rememberPhotoFailure('/broken.jpg');
  now += 59_999;
  assert.equal(recentlyFailedPhoto('/broken.jpg'), true);
  now++;
  assert.equal(recentlyFailedPhoto('/broken.jpg'), false);
});

test('the failure cache evicts the oldest of more than forty URLs', () => {
  for (let i = 0; i < 41; i++) rememberPhotoFailure(`/photo-${i}.jpg`);
  assert.equal(recentlyFailedPhoto('/photo-0.jpg'), false);
  assert.equal(recentlyFailedPhoto('/photo-1.jpg'), true);
  assert.equal(recentlyFailedPhoto('/photo-40.jpg'), true);
});
