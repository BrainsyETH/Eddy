import test from 'node:test';
import assert from 'node:assert/strict';
import { adminPermission } from '@/lib/admin/permissions';
import { MAX_BULK_EMAILS, parseBulkEmailUpdate } from './inbound';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

test('bulk triage accepts up to one page of message ids, deduplicated', () => {
  assert.deepEqual(parseBulkEmailUpdate({ ids: [id(1), id(2), id(1)], status: 'archived' }), {
    ids: [id(1), id(2)],
    status: 'archived',
  });
  const page = Array.from({ length: MAX_BULK_EMAILS }, (_, i) => id(i));
  assert.ok('ids' in parseBulkEmailUpdate({ ids: page, status: 'spam' }));
});

test('bulk triage refuses empty, oversized, malformed or unknown-status bodies', () => {
  const tooMany = Array.from({ length: MAX_BULK_EMAILS + 1 }, (_, i) => id(i));
  for (const body of [
    null,
    { ids: [], status: 'read' },
    { ids: tooMany, status: 'read' },
    { ids: ['not-a-uuid'], status: 'read' },
    { ids: [id(1)], status: 'deleted' },
    { ids: id(1), status: 'read' },
  ])
    assert.ok('error' in parseBulkEmailUpdate(body), JSON.stringify(body));
});

test('moderators can bulk-triage email; editors cannot', () => {
  assert.equal(adminPermission('moderator', '/api/admin/inbound-emails', 'PATCH'), true);
  assert.equal(adminPermission('editor', '/api/admin/inbound-emails', 'PATCH'), false);
});
