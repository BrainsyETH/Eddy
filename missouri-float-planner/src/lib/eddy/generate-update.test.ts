import assert from 'node:assert/strict';
import test from 'node:test';
import { parseEddyResponse } from './generate-update';

test('parses summary, Eddy read, and full report from one model response', () => {
  const parsed = parseEddyResponse(`[SUMMARY]
Ideal today with a steady gauge.
[EDDY_READ]
Spring influence makes this reach respond more gradually than nearby rain-fed creeks.
[FULL]
The gauge is in its ideal range. The measured trend is steady. Recheck before launch.`);

  assert.equal(parsed.summaryText, 'Ideal today with a steady gauge.');
  assert.equal(parsed.eddyRead, 'Spring influence makes this reach respond more gradually than nearby rain-fed creeks.');
  assert.match(parsed.quoteText, /^The gauge is in its ideal range/);
});

test('keeps older summary and full responses backward compatible', () => {
  const parsed = parseEddyResponse(`[SUMMARY]
Ideal today with a steady gauge.
[FULL]
The gauge is in its ideal range. Recheck before launch.`);

  assert.equal(parsed.summaryText, 'Ideal today with a steady gauge.');
  assert.equal(parsed.eddyRead, null);
  assert.match(parsed.quoteText, /^The gauge is in its ideal range/);
});
