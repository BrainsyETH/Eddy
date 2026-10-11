import assert from 'node:assert/strict';
import test from 'node:test';
import { findFiledReport, ReportLookupError } from './idempotency';

test('clients without a report key do not query the new column', async () => {
  assert.equal(await findFiledReport(undefined, async () => { throw new Error('must not query'); }), null);
});

test('a successful lookup distinguishes a new report from a delivered retry', async () => {
  assert.equal(await findFiledReport('client-key', async (id) => {
    assert.equal(id, 'client-key');
    return { data: { id: 'stored-id' }, error: null };
  }), 'stored-id');
  assert.equal(await findFiledReport('new-key', async () => ({ data: null, error: null })), null);
});

test('missing schema and transport failures cannot be mistaken for a new report', async () => {
  const missingColumn = { code: '42703', message: 'column client_report_id does not exist' };
  await assert.rejects(findFiledReport('key', async () => ({ data: null, error: missingColumn })),
    (error: unknown) => error instanceof ReportLookupError && error.cause === missingColumn);
  const network = new Error('connection failed');
  await assert.rejects(findFiledReport('key', async () => { throw network; }),
    (error: unknown) => error instanceof ReportLookupError && error.cause === network);
});
