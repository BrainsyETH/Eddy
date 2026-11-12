import test from 'node:test';
import assert from 'node:assert/strict';
import { adminPermission } from '@/lib/admin/permissions';
import {
  FEEDBACK_SUPPORT_ADDRESS,
  feedbackReplyFrom,
  feedbackUpdate,
  MAX_ADMIN_NOTES_LENGTH,
  REPORTED_PHOTO_TYPE,
  reportedPhotoContext,
} from './admin';

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

test('a reported photo resolves to its report and a safe preview URL', () => {
  const reportId = '9b2f3c4d-1111-4222-8333-444455556666';
  const photo = reportedPhotoContext({
    feedbackType: REPORTED_PHOTO_TYPE,
    contextData: {
      visualId: reportId,
      imageUrl: 'https://example.supabase.co/storage/v1/object/public/river-visuals/a.jpg',
      accessPointName: 'Akers Ferry',
      description: '  Gravel bar at low water ',
    },
  });
  assert.deepEqual(photo, {
    reportId,
    imageUrl: 'https://example.supabase.co/storage/v1/object/public/river-visuals/a.jpg',
    accessPointName: 'Akers Ferry',
    description: 'Gravel bar at low water',
  });
});

test('client-submitted photo context is never trusted as an id or a URL', () => {
  const base = { feedbackType: REPORTED_PHOTO_TYPE } as const;
  assert.equal(reportedPhotoContext({ ...base, contextData: null }), null);
  assert.equal(reportedPhotoContext({ ...base, contextData: { visualId: '../../reports' } }), null);
  assert.equal(
    reportedPhotoContext({ feedbackType: 'bug_report', contextData: { visualId: '9b2f3c4d-1111-4222-8333-444455556666' } }),
    null,
  );
  for (const imageUrl of ['javascript:alert(1)', 'http://example.com/a.jpg', 'not a url', 42]) {
    const photo = reportedPhotoContext({
      ...base,
      contextData: { visualId: '9b2f3c4d-1111-4222-8333-444455556666', imageUrl },
    });
    assert.equal(photo?.imageUrl, null);
  }
});

test('feedback replies come from the configured address, else the support inbox', () => {
  assert.equal(feedbackReplyFrom({}), FEEDBACK_SUPPORT_ADDRESS);
  assert.equal(feedbackReplyFrom({ RESEND_REPLY_FROM: '  ' }), FEEDBACK_SUPPORT_ADDRESS);
  assert.equal(feedbackReplyFrom({ RESEND_REPLY_FROM: 'not-an-address' }), FEEDBACK_SUPPORT_ADDRESS);
  assert.equal(feedbackReplyFrom({ RESEND_REPLY_FROM: 'Eddy <hello@eddy.guide>' }), 'Eddy <hello@eddy.guide>');
});

test('moderators can reply to feedback; editors cannot', () => {
  const path = '/api/admin/feedback/9b2f3c4d-1111-4222-8333-444455556666/reply';
  assert.equal(adminPermission('moderator', path, 'POST'), true);
  assert.equal(adminPermission('editor', path, 'POST'), false);
  assert.equal(adminPermission('moderator', path, 'GET'), false);
});
