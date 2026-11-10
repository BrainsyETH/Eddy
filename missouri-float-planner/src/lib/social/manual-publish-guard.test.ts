import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  duplicateMessage,
  findBlockingDuplicate,
  isPublishableImageUrl,
  manualPublishKey,
} from './manual-publish-guard';

const NOW = new Date('2026-11-10T18:00:00Z');
const ago = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000).toISOString();

describe('manual publish duplicate guard', () => {
  it('keys on platform, trimmed caption and image', () => {
    assert.equal(manualPublishKey('facebook', ' Hi ', null), manualPublishKey('facebook', 'Hi', ''));
    assert.notEqual(manualPublishKey('facebook', 'Hi', null), manualPublishKey('instagram', 'Hi', null));
    assert.notEqual(manualPublishKey('facebook', 'Hi', null), manualPublishKey('facebook', 'Hi', 'https://a.example/x.png'));
  });

  it('a retry cannot create a second post once the first went out or is in flight', () => {
    for (const status of ['published', 'inbox', 'publishing', 'unknown']) {
      const hit = findBlockingDuplicate([{ status, image_url: null, created_at: ago(2) }], undefined, NOW);
      assert.ok(hit, status);
    }
  });

  it('a failed attempt stays retryable', () => {
    assert.equal(findBlockingDuplicate([{ status: 'failed', image_url: null, created_at: ago(1) }], null, NOW), null);
  });

  it('ignores old posts and posts with a different image', () => {
    assert.equal(findBlockingDuplicate([{ status: 'published', image_url: null, created_at: ago(16) }], null, NOW), null);
    assert.equal(
      findBlockingDuplicate([{ status: 'published', image_url: 'https://a.example/1.png', created_at: ago(1) }], null, NOW),
      null,
    );
  });

  it('says what happened to the earlier post', () => {
    assert.match(duplicateMessage('facebook', { status: 'published', image_url: null, created_at: ago(3) }, NOW), /was already sent \(3 minutes ago\)/);
    assert.match(duplicateMessage('facebook', { status: 'unknown', image_url: null, created_at: ago(1) }, NOW), /outcome is unknown/);
    assert.match(duplicateMessage('instagram', null, NOW), /submitted in the last 90 seconds/);
  });

  it('accepts only https image URLs', () => {
    assert.equal(isPublishableImageUrl('https://cdn.example.com/a.png'), true);
    for (const bad of ['http://cdn.example.com/a.png', 'https://localhost/a.png', 'file:///etc/passwd', 'nope']) {
      assert.equal(isPublishableImageUrl(bad), false, bad);
    }
  });
});
