import test from 'node:test';
import assert from 'node:assert/strict';
import { feedbackUpdate, MAX_ADMIN_NOTES_LENGTH } from './admin';

const now = new Date('2026-11-11T18:00:00Z');

test('a status change stamps the named reviewer, not a generic "admin"', () => {
  const result = feedbackUpdate({ status: 'resolved' }, 'Ada', now);
  assert.ok('update' in result);
  assert.equal(result.update.status, 'resolved');
  assert.equal(result.update.reviewed_by, 'Ada');
  assert.equal(result.update.reviewed_at, now.toISOString());
});

test('saving only a note leaves the review stamp alone', () => {
  const result = feedbackUpdate({ adminNotes: '  Called the outfitter.  ' }, 'Ada', now);
  assert.ok('update' in result);
  assert.equal(result.update.admin_notes, 'Called the outfitter.');
  assert.equal(result.update.status, undefined);
  assert.equal(result.update.reviewed_by, undefined);
  assert.equal(result.update.reviewed_at, undefined);
});

test('clearing a note stores null rather than an empty string', () => {
  for (const adminNotes of ['', '   ', null]) {
    const result = feedbackUpdate({ adminNotes }, 'Ada', now);
    assert.ok('update' in result);
    assert.equal(result.update.admin_notes, null);
  }
});

test('invalid or empty bodies are refused', () => {
  assert.deepEqual(feedbackUpdate({ status: 'archived' }, 'Ada', now), { error: 'Invalid status' });
  assert.deepEqual(feedbackUpdate({ adminNotes: 42 }, 'Ada', now), { error: 'Notes must be text' });
  assert.deepEqual(feedbackUpdate({}, 'Ada', now), { error: 'No updates provided' });
  assert.deepEqual(feedbackUpdate(null, 'Ada', now), { error: 'No updates provided' });
  const long = feedbackUpdate({ adminNotes: 'x'.repeat(MAX_ADMIN_NOTES_LENGTH + 1) }, 'Ada', now);
  assert.ok('error' in long);
});
