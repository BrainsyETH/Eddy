import assert from 'node:assert/strict';
import test from 'node:test';
import {
  EXPO_BATCH_SIZE,
  EXPO_RECEIPT_BATCH_SIZE,
  chunkMessages,
  chunkReceiptIds,
  classifyTicketError,
  fetchExpoReceipts,
  isExpoPushToken,
  sendExpoPush,
  type ExpoMessage,
} from './expo';

const noSleep = async () => {};
const msg = (to: string): ExpoMessage => ({ to, title: 't', body: 'b' });
const many = (n: number) => Array.from({ length: n }, (_, i) => msg(`ExponentPushToken[${i}]`));

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

// ── chunking ─────────────────────────────────────────────────────

test('chunks at Expo documented batch size', () => {
  assert.equal(chunkMessages([]).length, 0);
  assert.equal(chunkMessages(many(1)).length, 1);
  assert.equal(chunkMessages(many(100)).length, 1);
  assert.equal(chunkMessages(many(101)).length, 2);
  assert.equal(chunkMessages(many(250)).length, 3);
  assert.equal(EXPO_BATCH_SIZE, 100);
});

test('chunks preserve order and lose nothing', () => {
  const chunks = chunkMessages(many(250));
  const flat = chunks.flat();
  assert.equal(flat.length, 250);
  assert.equal(flat[0].to, 'ExponentPushToken[0]');
  assert.equal(flat[249].to, 'ExponentPushToken[249]');
  assert.equal(chunks[2].length, 50);
});

// ── ticket classification ────────────────────────────────────────

test('classifies each Expo error the pruning logic depends on', () => {
  assert.equal(
    classifyTicketError({ status: 'error', details: { error: 'DeviceNotRegistered' } }),
    'device_not_registered'
  );
  assert.equal(
    classifyTicketError({ status: 'error', details: { error: 'MessageTooBig' } }),
    'message_too_big'
  );
  assert.equal(
    classifyTicketError({ status: 'error', details: { error: 'MessageRateExceeded' } }),
    'message_rate_exceeded'
  );
  assert.equal(
    classifyTicketError({ status: 'error', details: { error: 'MismatchedSenderId' } }),
    'mismatched_credentials'
  );
  assert.equal(classifyTicketError({ status: 'error', message: 'boom' }), 'other');
  assert.equal(classifyTicketError({ status: 'ok', id: 'x' }), null);
});

test('recognizes both Expo token spellings', () => {
  assert.equal(isExpoPushToken('ExponentPushToken[abc123]'), true);
  assert.equal(isExpoPushToken('ExpoPushToken[abc123]'), true);
  assert.equal(isExpoPushToken('not-a-token'), false);
  assert.equal(isExpoPushToken(''), false);
});

// ── sending ──────────────────────────────────────────────────────

test('returns tickets index-aligned with the input', async () => {
  const fetchImpl = async () =>
    jsonResponse({ data: [{ status: 'ok', id: 'a' }, { status: 'ok', id: 'b' }] });
  const tickets = await sendExpoPush(many(2), { fetchImpl: fetchImpl as typeof fetch });
  assert.equal(tickets.length, 2);
  assert.equal(tickets[0].id, 'a');
  assert.equal(tickets[1].id, 'b');
});

test('an empty batch never hits the network', async () => {
  let called = false;
  const fetchImpl = async () => { called = true; return jsonResponse({ data: [] }); };
  assert.deepEqual(await sendExpoPush([], { fetchImpl: fetchImpl as typeof fetch }), []);
  assert.equal(called, false);
});

test('one bad token does not fail the batch', async () => {
  const fetchImpl = async () =>
    jsonResponse({
      data: [
        { status: 'ok', id: 'a' },
        { status: 'error', message: 'gone', details: { error: 'DeviceNotRegistered' } },
      ],
    });
  const tickets = await sendExpoPush(many(2), { fetchImpl: fetchImpl as typeof fetch });
  assert.equal(tickets[0].status, 'ok');
  assert.equal(classifyTicketError(tickets[1]), 'device_not_registered');
});

test('a whole-request rejection becomes one error ticket per message', async () => {
  // Expo reports auth/shape failures as a top-level errors[] with no data[].
  const fetchImpl = async () =>
    jsonResponse({ errors: [{ message: 'invalid credentials' }] }, 400);
  const tickets = await sendExpoPush(many(3), { fetchImpl: fetchImpl as typeof fetch });
  assert.equal(tickets.length, 3, 'alignment must survive a total failure');
  assert.ok(tickets.every((t) => t.status === 'error'));
  assert.match(tickets[0].message ?? '', /invalid credentials/);
});

test('retries on 429 and succeeds', async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls++;
    if (calls === 1) return jsonResponse({}, 429);
    return jsonResponse({ data: [{ status: 'ok', id: 'a' }] });
  };
  const tickets = await sendExpoPush(many(1), {
    fetchImpl: fetchImpl as typeof fetch,
    sleepImpl: noSleep,
  });
  assert.equal(calls, 2);
  assert.equal(tickets[0].status, 'ok');
});

test('retries on 5xx then gives up with error tickets', async () => {
  let calls = 0;
  const fetchImpl = async () => { calls++; return jsonResponse({}, 503); };
  const tickets = await sendExpoPush(many(2), {
    fetchImpl: fetchImpl as typeof fetch,
    sleepImpl: noSleep,
    maxRetries: 2,
  });
  assert.equal(calls, 3, 'initial attempt plus two retries');
  assert.equal(tickets.length, 2);
  assert.ok(tickets.every((t) => t.status === 'error'));
});

test('a thrown network error yields error tickets rather than propagating', async () => {
  const fetchImpl = async () => { throw new Error('ECONNRESET'); };
  const tickets = await sendExpoPush(many(2), {
    fetchImpl: fetchImpl as typeof fetch,
    sleepImpl: noSleep,
    maxRetries: 1,
  });
  assert.equal(tickets.length, 2);
  assert.match(tickets[0].message ?? '', /ECONNRESET/);
});

test('a short data[] is padded so index alignment holds', async () => {
  // Guards the caller's ticket[i] -> token[i] mapping; a silent shift would
  // disable the wrong device.
  const fetchImpl = async () => jsonResponse({ data: [{ status: 'ok', id: 'a' }] });
  const tickets = await sendExpoPush(many(3), { fetchImpl: fetchImpl as typeof fetch });
  assert.equal(tickets.length, 3);
  assert.equal(tickets[0].status, 'ok');
  assert.equal(tickets[2].status, 'error');
});

test('a malformed response yields error tickets', async () => {
  const fetchImpl = async () => jsonResponse({ unexpected: true });
  const tickets = await sendExpoPush(many(2), { fetchImpl: fetchImpl as typeof fetch });
  assert.equal(tickets.length, 2);
  assert.ok(tickets.every((t) => t.status === 'error'));
});

// ── receipts ─────────────────────────────────────────────────────
//
// The second half of a send, and previously not implemented at all. A ticket
// only says Expo accepted the message; DeviceNotRegistered almost always
// arrives here instead.

test('receipts come back keyed by ticket id, not positionally', () => {
  // Unlike /push/send, getReceipts answers with an OBJECT. There is no index
  // alignment to preserve, and assuming one would mis-attribute every error.
  const fetchImpl = async () =>
    jsonResponse({
      data: {
        'ticket-b': { status: 'ok' },
        'ticket-a': { status: 'error', details: { error: 'DeviceNotRegistered' } },
      },
    });

  return fetchExpoReceipts(['ticket-a', 'ticket-b'], { fetchImpl, sleepImpl: noSleep }).then(
    (receipts) => {
      assert.equal(receipts.size, 2);
      assert.equal(classifyTicketError(receipts.get('ticket-a')!), 'device_not_registered');
      assert.equal(classifyTicketError(receipts.get('ticket-b')!), null);
    }
  );
});

test('a ticket absent from the response is not an error', async () => {
  // Expo omits receipts that are not ready yet. Treating a gap as failure would
  // disable working devices — the exact opposite of this pass's job.
  const fetchImpl = async () => jsonResponse({ data: { 'ticket-a': { status: 'ok' } } });
  const receipts = await fetchExpoReceipts(['ticket-a', 'ticket-b'], {
    fetchImpl,
    sleepImpl: noSleep,
  });

  assert.equal(receipts.size, 1);
  assert.equal(receipts.has('ticket-b'), false);
});

test('a whole-request failure yields no receipts rather than throwing', async () => {
  // The caller must leave those tickets unchecked and retry next pass, never
  // act on an outage as though it were an answer about the devices.
  for (const respond of [
    async () => jsonResponse({ errors: [{ message: 'nope' }] }, 400),
    async () => jsonResponse({}, 500),
    async () => {
      throw new Error('network down');
    },
  ]) {
    const receipts = await fetchExpoReceipts(['ticket-a'], {
      fetchImpl: respond as unknown as typeof fetch,
      sleepImpl: noSleep,
      maxRetries: 1,
    });
    assert.equal(receipts.size, 0);
  }
});

test('no ids means no request at all', async () => {
  let called = false;
  const fetchImpl = async () => {
    called = true;
    return jsonResponse({ data: {} });
  };
  const receipts = await fetchExpoReceipts([], { fetchImpl, sleepImpl: noSleep });
  assert.equal(receipts.size, 0);
  assert.equal(called, false);
});

test('receipt ids chunk at Expo documented maximum', () => {
  const ids = Array.from({ length: 2500 }, (_, i) => `t-${i}`);
  const chunks = chunkReceiptIds(ids);
  assert.equal(EXPO_RECEIPT_BATCH_SIZE, 1000);
  assert.equal(chunks.length, 3);
  assert.equal(chunks.flat().length, 2500);
  assert.equal(chunks[2].length, 500);
});
