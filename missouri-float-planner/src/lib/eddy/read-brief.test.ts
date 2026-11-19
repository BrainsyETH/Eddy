import assert from 'node:assert/strict';
import test from 'node:test';
import { buildReadBrief, GAUGE_READ_BRIEF, RIVER_READ_BRIEF } from './read-brief';
import { EDDY_VOICE } from './voice';
import { checkRead } from './read-checks';
import { parseEddyResponse } from './parse-response';

// The brief is prose, so most of what makes it good cannot be asserted. What
// can be: that both Reads get the same rules, that each rule which protects a
// reader is still in it, and that its own examples keep the rules it sets.

/** Everything in a brief except the one paragraph that differs by kind. */
const shared = (brief: string) => brief.replace(/THIS REPORT\n[^\n]+\n/, '');

test('the river and gauge briefs differ only in what the report is', () => {
  assert.equal(RIVER_READ_BRIEF, buildReadBrief('river'));
  assert.equal(GAUGE_READ_BRIEF, buildReadBrief('gauge'));
  assert.notEqual(RIVER_READ_BRIEF, GAUGE_READ_BRIEF);
  assert.equal(shared(RIVER_READ_BRIEF), shared(GAUGE_READ_BRIEF));
  assert.match(RIVER_READ_BRIEF, /It is the river's main report/);
  assert.match(GAUGE_READ_BRIEF, /one of the river's other gauges/);
});

test('both briefs carry the one voice and no river-specific value', () => {
  for (const brief of [RIVER_READ_BRIEF, GAUGE_READ_BRIEF]) {
    assert.ok(brief.includes(EDDY_VOICE));
    // Static, so the prefix is identical across every call and cacheable.
    assert.doesNotMatch(brief, /\$\{|undefined|\bnull\b/);
  }
});

test('the rules that protect a reader are in both briefs', () => {
  // Each of these was added after a Read got it wrong. The gauge prompt lacked
  // the fourth until the briefs were merged, and on 2026-11-19 the Akers gauge
  // Read said rain reaches it "within 6 to 12 hours".
  const rules = [
    /Dangerous: "stay off the water", first and without hedging/,
    /An active NWS flood alert leads the summary and the full text/,
    /Never say conditions will stay, remain or be a certain way/,
    /Do not say how many hours rain takes to reach or crest at this gauge, and do not give a rate or a timeline for the river coming back down/,
    /Never predict a gauge height/,
    /Do not invent a cause for a change or for a steady reading/,
    /Only cite numbers that are in the facts/,
    /Do not send the reader to a different river/,
    /Never print a percentile or the word percentile/,
    /Low: floatable\. Apply the LOW WATER GUIDANCE in the user message\. Do not recommend against going/,
    /A reading below the optimal range does not by itself mean shallow riffles or scraping/,
    /never say "band"/,
    /Never call a level "ideal"/,
  ];
  for (const brief of [RIVER_READ_BRIEF, GAUGE_READ_BRIEF]) for (const rule of rules) assert.match(brief, rule);
});

test('each block is given its own job, and the stock lines are named as not news', () => {
  for (const heading of ['WHO IS READING', 'HOW EDDY TALKS', 'THE THREE BLOCKS', 'WHAT IS NOT NEWS', 'THE RATING', 'STAY ON YOUR WATER', 'TREND AND THE DAYS AHEAD', 'OUTPUT FORMAT (strict)']) {
    assert.ok(RIVER_READ_BRIEF.includes(`\n${heading}\n`), heading);
  }
  assert.match(RIVER_READ_BRIEF, /each has its own job and none repeats another/);
  assert.match(RIVER_READ_BRIEF, /A gauge that has not moved/);
  assert.match(RIVER_READ_BRIEF, /Calling an outfitter, checking back after rain, lighter boats doing better/);
  assert.match(RIVER_READ_BRIEF, /Everything in the user message is for you/);
  assert.match(RIVER_READ_BRIEF, /Do not join two sentences with a comma, and use no dashes/);
});

test("the brief's own examples keep the rules it sets", () => {
  const examples = RIVER_READ_BRIEF.split('THREE EXAMPLES')[1].split(/(?=\[CLAIMS\])/).slice(1);
  assert.equal(examples.length, 3);
  // Three different ratings, so no one shape is the template.
  assert.deepEqual(examples.map((e) => e.match(/condition=(\w+)/)?.[1]), ['too_low', 'good', 'high']);
  for (const example of examples) {
    const parsed = parseEddyResponse(example.split('\n').slice(1).join('\n'));
    assert.ok(parsed.summaryText && parsed.eddyRead && parsed.quoteText, example.slice(0, 60));
    const failed = checkRead({ summary: parsed.summaryText, eddyRead: parsed.eddyRead, full: parsed.quoteText }, { prompt: null })
      .filter((r) => r.status === 'fail');
    // The Too Low example says to look again after rain, which is the one
    // place that line is the point; nothing else may trip.
    assert.deepEqual(failed.filter((r) => !(r.id === 'stock_lines' && /^check back after rain$/.test(r.detail ?? ''))), [], example.slice(0, 60));
    assert.doesNotMatch(example, /—| -- |!/);
  }
  // Rivers that do not exist: the old prompt's Van Buren example was mirrored
  // sentence for sentence by the live Current Read.
  assert.doesNotMatch(RIVER_READ_BRIEF.split('THREE EXAMPLES')[1], /Current|Meramec|Huzzah|Buffalo|Van Buren|Steelville|Akers/);
});
