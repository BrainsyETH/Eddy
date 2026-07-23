import test from 'node:test';
import assert from 'node:assert/strict';
import { parseEddyResponse } from './generate-update';
import { parseEddyTakeSections } from './take-sections';

test('parses the five-block Eddy response without changing legacy prose fields', () => {
  const parsed = parseEddyResponse(`[SUMMARY]\nA compact legacy summary.\n\n[BOTTOM_LINE]\nToday is a solid float window.\n\n[WHY]\nThe river is in its ideal band.\n\n[WATCH_FOR]\nRecheck before launch if rain develops.\n\n[FULL]\nThe original full report remains intact.`);

  assert.equal(parsed.summaryText, 'A compact legacy summary.');
  assert.equal(parsed.quoteText, 'The original full report remains intact.');
  assert.deepEqual(parsed.takeSections, {
    bottomLine: 'Today is a solid float window.',
    why: 'The river is in its ideal band.',
    watchFor: 'Recheck before launch if rain develops.',
  });
});

test('keeps older two-block responses compatible', () => {
  const parsed = parseEddyResponse('[SUMMARY]\nOlder summary.\n\n[FULL]\nOlder full report with enough detail.');
  assert.equal(parsed.summaryText, 'Older summary.');
  assert.equal(parsed.quoteText, 'Older full report with enough detail.');
  assert.equal(parsed.takeSections, null);
});

test('rejects incomplete structured sections without losing the full report', () => {
  const parsed = parseEddyResponse('[SUMMARY]\nSummary.\n[BOTTOM_LINE]\nA call.\n[WHY]\nEvidence.\n[FULL]\nFull report.');
  assert.equal(parsed.quoteText, 'Full report.');
  assert.equal(parsed.takeSections, null);
});

test('validates stored JSONB sections before exposing them', () => {
  assert.deepEqual(parseEddyTakeSections({ bottomLine: ' Call ', why: ' Evidence ', watchFor: ' Trigger ' }), {
    bottomLine: 'Call',
    why: 'Evidence',
    watchFor: 'Trigger',
  });
  assert.equal(parseEddyTakeSections({ bottomLine: 'Call', why: 'Evidence' }), null);
  assert.equal(parseEddyTakeSections(['Call', 'Evidence', 'Trigger']), null);
});
