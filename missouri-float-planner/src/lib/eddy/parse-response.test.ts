import assert from 'node:assert/strict';
import test from 'node:test';
import { parseEddyResponse } from './parse-response';

test('parses summary, Eddy read, and full report from one model response', () => {
  const parsed = parseEddyResponse(`[SUMMARY]
Flowing today with a steady gauge.
[EDDY_READ]
Spring influence makes this reach respond more gradually than nearby rain-fed creeks.
[FULL]
The gauge is in its optimal range. The measured trend is steady. Recheck before launch.`);

  assert.equal(parsed.summaryText, 'Flowing today with a steady gauge.');
  assert.equal(parsed.eddyRead, 'Spring influence makes this reach respond more gradually than nearby rain-fed creeks.');
  assert.match(parsed.quoteText, /^The gauge is in its optimal range/);
});

test('keeps older summary and full responses backward compatible', () => {
  const parsed = parseEddyResponse(`[SUMMARY]
Flowing today with a steady gauge.
[FULL]
The gauge is in its optimal range. Recheck before launch.`);

  assert.equal(parsed.summaryText, 'Flowing today with a steady gauge.');
  assert.equal(parsed.eddyRead, null);
  assert.match(parsed.quoteText, /^The gauge is in its optimal range/);
});

test('a lone dash becomes a full stop and a pair becomes commas', async () => {
  const { replaceEmDashes } = await import('./parse-response');
  // One dash in a sentence starts a new thought. A comma there was a splice
  // in 17 of 41 gauge Reads on 2026-11-19.
  assert.equal(replaceEmDashes('sitting at 15 cfs — well short'), 'sitting at 15 cfs. Well short');
  assert.equal(replaceEmDashes('reflects that—holding steady'), 'reflects that. Holding steady');
  assert.equal(
    replaceEmDashes('Too low to float near Boxley right now — this stretch needs a lot more water.'),
    'Too low to float near Boxley right now. This stretch needs a lot more water.',
  );
  // Two in one sentence are an aside.
  assert.equal(
    replaceEmDashes('The Narrows — between the springs — runs thin. Put in below it — the flow returns there.'),
    'The Narrows, between the springs, runs thin. Put in below it. The flow returns there.',
  );
  // A decimal point is not a sentence end, and a trailing dash leaves no orphan.
  assert.equal(replaceEmDashes('At 2.5 ft — about normal.'), 'At 2.5 ft. About normal.');
  assert.equal(replaceEmDashes('ends with a dash —'), 'ends with a dash.');
  assert.equal(replaceEmDashes('no dash here'), 'no dash here');
  // Models dodge the em-dash ban with a double hyphen.
  assert.equal(replaceEmDashes('reads Good and steady -- floatable'), 'reads Good and steady. Floatable');
  assert.equal(replaceEmDashes('a --- rule stays'), 'a --- rule stays');
});
