// shared/flow-band.test.ts
//
// The load-bearing assertion here is the LAST one: that flow bands and the
// condition taxonomy stay two separate vocabularies. The rest pin the cut
// points and the null behaviour.

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FLOW_BAND_ORDER,
  FLOW_BAND_SYSTEM,
  FLOW_BAND_UNKNOWN_SOLID,
  flowBand,
  flowBandLabel,
  flowBandSentence,
  type FlowBand,
} from './flow-band';
import { CONDITION_SYSTEM, type ConditionCode } from './condition-system';

test('cut points are 10 / 25 / 75 / 90, inclusive at the bottom of each band', () => {
  assert.equal(flowBand(0), 'much_lower');
  assert.equal(flowBand(9.99), 'much_lower');
  assert.equal(flowBand(10), 'lower');
  assert.equal(flowBand(24.99), 'lower');
  assert.equal(flowBand(25), 'normal');
  assert.equal(flowBand(74.99), 'normal');
  assert.equal(flowBand(75), 'higher');
  assert.equal(flowBand(89.99), 'higher');
  assert.equal(flowBand(90), 'much_higher');
  assert.equal(flowBand(100), 'much_higher');
});

test('out-of-range percentiles clamp rather than returning null', () => {
  // A percentile outside 0-100 is a bug upstream, but it is a bug about
  // magnitude, not about whether we have data — clamping keeps the pin honest.
  assert.equal(flowBand(-5), 'much_lower');
  assert.equal(flowBand(140), 'much_higher');
});

test('null, undefined and NaN all mean "no comparison", not "normal"', () => {
  // The whole point: a gauge with no history must never be painted as normal.
  assert.equal(flowBand(null), null);
  assert.equal(flowBand(undefined), null);
  assert.equal(flowBand(NaN), null);
  assert.equal(flowBand(Infinity), null);
  assert.equal(flowBandLabel(null), null);
  assert.equal(flowBandSentence(null), null);
});

test('every band is defined, ordered driest to wettest, and self-consistent', () => {
  assert.equal(FLOW_BAND_ORDER.length, 5);
  assert.deepEqual(FLOW_BAND_ORDER, Object.keys(FLOW_BAND_SYSTEM));
  for (const band of FLOW_BAND_ORDER) {
    assert.equal(FLOW_BAND_SYSTEM[band].band, band, `${band} disagrees with its key`);
    assert.ok(FLOW_BAND_SYSTEM[band].label.length > 0);
    assert.ok(FLOW_BAND_SYSTEM[band].sentence.length > 0);
  }

  // Ordering is a real claim: walking the percentile scale must walk the array.
  const walked = [0, 15, 50, 80, 95].map((p) => flowBand(p));
  assert.deepEqual(walked, FLOW_BAND_ORDER);
});

test('the sentences are the ones the app has been shipping', () => {
  // percentileSentence() in eddy-ios/src/lib/readingCopy.ts now DELEGATES here
  // rather than carrying its own copy of these cut points and strings — so this
  // is the only place the wording lives, and pinning it here pins what the
  // river screen says too. The strings are asserted verbatim because they are a
  // user-visible contract, not an implementation detail.
  const probes: Array<[number, FlowBand, string]> = [
    [3, 'much_lower', 'Much lower than usual for this time of year'],
    [18, 'lower', 'Lower than usual for this time of year'],
    [50, 'normal', 'About normal for this time of year'],
    [82, 'higher', 'Higher than usual for this time of year'],
    [97, 'much_higher', 'Much higher than usual for this time of year'],
  ];
  for (const [p, band, sentence] of probes) {
    assert.equal(flowBand(p), band);
    assert.equal(flowBandSentence(band), sentence, `percentile ${p}`);
  }
});

test('flow bands never borrow the condition taxonomy\'s words', () => {
  // The safety line, asserted. A flow band describes a comparison; a condition
  // code delivers a verdict. If a band ever came back labelled "Flowing" or
  // "Flood", the map would be telling someone an unrated river is safe (or
  // not) on the strength of a percentile — which is precisely the claim Eddy
  // does not make.
  const conditionWords = new Set<string>();
  for (const code of Object.keys(CONDITION_SYSTEM) as ConditionCode[]) {
    conditionWords.add(CONDITION_SYSTEM[code].label.toLowerCase());
    conditionWords.add(CONDITION_SYSTEM[code].longLabel.toLowerCase());
  }

  for (const band of FLOW_BAND_ORDER) {
    const label = FLOW_BAND_SYSTEM[band].label.toLowerCase();
    assert.ok(
      !conditionWords.has(label),
      `flow band "${band}" is labelled "${label}", which is a condition label`,
    );
  }
});

test('flow bands never borrow the condition taxonomy\'s colours', () => {
  // The same safety line in the other channel, and the one that matters on a
  // map — most people read the dot, not the label. This app has drifted a
  // hardcoded condition hex once before (#DC2626 vs the canonical #ef4444),
  // so the collision is asserted rather than trusted.
  const conditionColors = new Set<string>();
  for (const code of Object.keys(CONDITION_SYSTEM) as ConditionCode[]) {
    conditionColors.add(CONDITION_SYSTEM[code].solid.toLowerCase());
    conditionColors.add(CONDITION_SYSTEM[code].ink.toLowerCase());
  }

  const flowColors = [
    ...FLOW_BAND_ORDER.map((b) => FLOW_BAND_SYSTEM[b].solid),
    FLOW_BAND_UNKNOWN_SOLID,
  ];

  for (const hex of flowColors) {
    assert.match(hex, /^#[0-9A-Fa-f]{6}$/, `${hex} is not a 6-digit hex`);
    assert.ok(
      !conditionColors.has(hex.toLowerCase()),
      `flow ramp colour ${hex} collides with a condition colour`,
    );
  }

  // And every step is distinct, or the ramp does not rank anything.
  assert.equal(new Set(flowColors.map((c) => c.toLowerCase())).size, flowColors.length);
});

test('the flow ramp contains no green and no red', () => {
  // Green means "go" and red means "do not float" — both learnable, both
  // verdicts, and neither is something a percentile is entitled to say. This
  // catches a well-meaning future edit that "improves" the ramp's legibility
  // by reaching for a traffic-light scale.
  for (const hex of [...FLOW_BAND_ORDER.map((b) => FLOW_BAND_SYSTEM[b].solid), FLOW_BAND_UNKNOWN_SOLID]) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);

    // Chroma first. The dry end of this ramp is warm STONE, which has red
    // marginally ahead of blue (#A49C8E) and is nonetheless obviously not a
    // red — it is a near-neutral. Only a colour with real chroma can carry the
    // learnable "go"/"stop" meaning we are guarding against, so desaturated
    // colours are exempt and saturated ones must be blue-led.
    const chroma = Math.max(r, g, b) - Math.min(r, g, b);
    if (chroma < 40) continue;

    assert.ok(b >= r, `${hex} is a saturated red-leaning colour (r=${r}, b=${b})`);
    assert.ok(b >= g, `${hex} is a saturated green-leaning colour (g=${g}, b=${b})`);
  }
});
