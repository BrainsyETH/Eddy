import assert from 'node:assert/strict';
import test from 'node:test';
import type { DamMetricValue, DamSnapshot } from './dam-types';
import type { GenerationReference } from './dam-generation';
import {
  buildTailwaterStatus,
  tailwaterStatusVoiceOver,
  TAILWATER_IDLE_NOTE,
  TAILWATER_RISE_NOTE,
  TAILWATER_STATUS_METRICS,
  TAILWATER_UNAVAILABLE_NOTE,
} from './tailwater-status';

/** Bull Shoals, from SWPA's project table. Eight units, 26,400 cfs at full. */
const BULL_SHOALS: GenerationReference = {
  units: 8,
  fullGenerationCfs: 26_400,
  schedulingCapacityMw: 391,
  source: 'SWPA',
};

const NOON_CENTRAL = Date.parse('2026-07-28T17:00:00Z');

function reading(
  value: number,
  minutesAgo: number,
  extra?: Partial<DamMetricValue>
): DamMetricValue {
  return {
    value,
    unit: 'cfs',
    at: new Date(NOON_CENTRAL - minutesAgo * 60_000).toISOString(),
    staleness: 'fresh',
    ...extra,
  };
}

/** A tailwater-elevation reading, which is the only metric carrying a trend. */
function stage(
  minutesAgo: number,
  trend?: { hours: number; delta: number }
): DamMetricValue {
  return {
    value: 442.1,
    unit: 'ft',
    at: new Date(NOON_CENTRAL - minutesAgo * 60_000).toISOString(),
    staleness: 'fresh',
    ...(trend ? { trend } : {}),
  };
}

type Inputs = Pick<
  DamSnapshot,
  'id' | 'name' | 'hasTurbines' | 'metrics' | 'generationReference' | 'generationFloorCfs'
>;

function dam(overrides: Partial<Inputs> = {}): Inputs {
  return {
    id: 'swl-bull-shoals-dam',
    name: 'Bull Shoals Dam',
    hasTurbines: true,
    metrics: { generationFlow: reading(3_300, 20) },
    generationReference: BULL_SHOALS,
    generationFloorCfs: 100,
    ...overrides,
  };
}

/** Every string the row would render, for the sweeps below. */
function allText(status: NonNullable<ReturnType<typeof buildTailwaterStatus>>): string {
  return [status.headline, ...status.supporting, status.safetyNote ?? ''].join(' | ');
}

// ── The headline ───────────────────────────────────────────────────────────

test('a fresh generating observation names the dam and speaks in the present', () => {
  const status = buildTailwaterStatus(dam(), NOON_CENTRAL)!;
  assert.equal(status.headline, 'Bull Shoals Dam is generating');
  assert.equal(status.tone, 'generating');
  assert.equal(status.damId, 'swl-bull-shoals-dam');
});

test('a five-hour-old generating observation loses the present tense', () => {
  // READING_LAGGING_AFTER_HOURS is two, and past it a reading no longer
  // describes now. A true number attached to the wrong moment is the error.
  const status = buildTailwaterStatus(
    dam({ metrics: { generationFlow: reading(3_300, 300) } }),
    NOON_CENTRAL
  )!;
  assert.equal(status.headline, 'Bull Shoals Dam: last observed generating');
  assert.doesNotMatch(allText(status), /\bnow\b/i, 'a stale row claimed the present');
});

test('a fresh idle observation reports no generation without calling the water off', () => {
  const status = buildTailwaterStatus(
    dam({ metrics: { generationFlow: reading(18, 20) } }),
    NOON_CENTRAL
  )!;
  assert.equal(status.headline, 'Bull Shoals Dam: no turbine generation observed');
  assert.equal(status.tone, 'idle');
  assert.ok(status.supporting.includes(TAILWATER_IDLE_NOTE));
  assert.doesNotMatch(allText(status), /water off|safe to wade|all clear/i);
});

test('a stale idle observation says when it was observed, not that it is so now', () => {
  const status = buildTailwaterStatus(
    dam({ metrics: { generationFlow: reading(18, 300) } }),
    NOON_CENTRAL
  )!;
  assert.equal(status.headline, 'Bull Shoals Dam: no generation at last observation');
  assert.doesNotMatch(allText(status), /\bnow\b/i);
});

test('an absent turbine feed is unavailable, not idle and not zero', () => {
  // The distinction the wire draws and a dashboard collapses: 'not-generating'
  // is a measurement of approximately no flow, 'unavailable' is the absence of
  // a measurement. Collapsing them tells somebody the units are off because a
  // feed timed out.
  const status = buildTailwaterStatus(dam({ metrics: {} }), NOON_CENTRAL)!;
  assert.equal(status.headline, 'Bull Shoals Dam generation unavailable');
  assert.equal(status.tone, 'unavailable');
  assert.deepEqual(status.supporting, [TAILWATER_UNAVAILABLE_NOTE]);
  assert.doesNotMatch(allText(status), /\b0\b|idle|not generating/i);
});

// ── The generator equivalent ───────────────────────────────────────────────

test('the generator equivalent is hedged and carries its denominator', () => {
  const status = buildTailwaterStatus(dam(), NOON_CENTRAL)!;
  assert.ok(
    status.supporting.some((line) => /^About \d+ of 8 generators’ worth$/.test(line)),
    `no hedged equivalent in ${JSON.stringify(status.supporting)}`
  );
  // Eddy observes turbine DISCHARGE. "1 unit generating" is a claim about
  // machinery nobody published.
  assert.doesNotMatch(allText(status), /\d+ units? (are |is )?(running|generating|on)\b/i);
});

test('below one equivalent says so in words rather than rounding up to a unit', () => {
  // generatorEquivalentPhrase returns a STRING here, not null — "about 1
  // generator's worth" would read as a unit that is running when the honest
  // statement is that very little is moving.
  const status = buildTailwaterStatus(
    dam({ metrics: { generationFlow: reading(1_200, 20) } }),
    NOON_CENTRAL
  )!;
  assert.ok(
    status.supporting.includes('Less than one generator’s worth'),
    `expected the sub-unit phrase, got ${JSON.stringify(status.supporting)}`
  );
});

test('without a reference the state is still reported and the equivalent is dropped', () => {
  const status = buildTailwaterStatus(
    dam({ generationReference: undefined }),
    NOON_CENTRAL
  )!;
  assert.equal(status.headline, 'Bull Shoals Dam is generating');
  assert.doesNotMatch(allText(status), /generators’ worth/);
});

// ── Movement, and the rise it qualifies ────────────────────────────────────

test('a rising tailwater reads as prose and earns the wading line', () => {
  const status = buildTailwaterStatus(
    dam({
      metrics: {
        generationFlow: reading(3_300, 20),
        tailwaterElevation: stage(20, { hours: 3, delta: 2.14 }),
      },
    }),
    NOON_CENTRAL
  )!;
  assert.ok(
    status.supporting.includes('Water below the dam rose 2.1 ft over 3 hours · 20 minutes ago')
  );
  assert.equal(status.safetyNote, TAILWATER_RISE_NOTE);
});

test('a falling tailwater reports the fall and does NOT carry the rise line', () => {
  // The caution is about a rise. Printing it under every state makes it chrome,
  // and chrome is read once and then never again.
  const status = buildTailwaterStatus(
    dam({
      metrics: {
        generationFlow: reading(3_300, 20),
        tailwaterElevation: stage(20, { hours: 3, delta: -2.57 }),
      },
    }),
    NOON_CENTRAL
  )!;
  assert.ok(
    status.supporting.includes('Water below the dam fell 2.6 ft over 3 hours · 20 minutes ago')
  );
  assert.equal(status.safetyNote, null);
});

test('no trend renders no movement line and invents no steady band', () => {
  const status = buildTailwaterStatus(
    dam({
      metrics: { generationFlow: reading(3_300, 20), tailwaterElevation: stage(20) },
    }),
    NOON_CENTRAL
  )!;
  assert.doesNotMatch(allText(status), /steady|water below the dam/i);
  assert.equal(status.safetyNote, null);
});

test('a bare age never leaks through as if it were movement', () => {
  // tailwaterMovementSentence() answers with the AGE alone when there is no
  // trend. Under a heading about the dam that reads as movement, so this row
  // gates before it words anything — no trend means no line, age included.
  const status = buildTailwaterStatus(
    dam({
      metrics: { generationFlow: reading(3_300, 20), tailwaterElevation: stage(20) },
    }),
    NOON_CENTRAL
  )!;
  assert.doesNotMatch(allText(status), /ago\b/i);
});

test('a movement line always carries the age of its OWN observation', () => {
  // This once carried none, borrowing the condition card's age. The condition
  // card reads a USGS gauge; tailwaterElevation is a CWMS reading at the dam.
  // Two observations, two clocks — so a 100-minute-old rise was rendering as
  // undated current context and arming the wading line with it.
  const status = buildTailwaterStatus(
    dam({
      metrics: {
        generationFlow: reading(3_300, 5),
        tailwaterElevation: stage(100, { hours: 3, delta: 2.14 }),
      },
    }),
    NOON_CENTRAL
  )!;
  const line = status.supporting.find((l) => l.includes('Water below the dam'))!;
  assert.ok(line, 'a fresh trend produced no movement line');
  assert.match(line, /· an hour ago$/, `movement went undated: ${line}`);
});

test('every movement line in every state is dated', () => {
  for (const [label, input] of EVERY_STATE) {
    const status = buildTailwaterStatus(input, NOON_CENTRAL)!;
    for (const line of status.supporting) {
      if (!line.includes('Water below the dam')) continue;
      assert.match(line, / · .+ ago$/, `${label} rendered an undated movement line`);
    }
  }
});

test('a lagging or stale tailwater reading reports no movement at all', () => {
  // This row carries no age, so an undated "rose 2.1 ft over 3 hours" on a
  // four-hour-old reading would be a true number on the wrong moment.
  for (const minutesAgo of [240, 600]) {
    const status = buildTailwaterStatus(
      dam({
        metrics: {
          generationFlow: reading(3_300, 20),
          tailwaterElevation: stage(minutesAgo, { hours: 3, delta: 2.14 }),
        },
      }),
      NOON_CENTRAL
    )!;
    assert.doesNotMatch(allText(status), /water below the dam/i, `at ${minutesAgo} min`);
    assert.equal(status.safetyNote, null, `at ${minutesAgo} min`);
  }
});

test('an unreadable powerhouse never pairs its outage with a stage movement', () => {
  // Pairing them invites the reader to infer the units from the stage, which is
  // the inference Eddy refuses to make itself.
  const status = buildTailwaterStatus(
    dam({ metrics: { tailwaterElevation: stage(20, { hours: 3, delta: 2.14 }) } }),
    NOON_CENTRAL
  )!;
  assert.deepEqual(status.supporting, [TAILWATER_UNAVAILABLE_NOTE]);
});

// ── The density cap and the standing rules ─────────────────────────────────

const EVERY_STATE: Array<[string, Inputs]> = [
  ['fresh generating', dam()],
  ['stale generating', dam({ metrics: { generationFlow: reading(3_300, 300) } })],
  ['sub-unit generating', dam({ metrics: { generationFlow: reading(1_200, 20) } })],
  ['fresh idle', dam({ metrics: { generationFlow: reading(18, 20) } })],
  ['stale idle', dam({ metrics: { generationFlow: reading(18, 300) } })],
  ['unavailable', dam({ metrics: {} })],
  ['no reference', dam({ generationReference: undefined })],
  [
    'generating and rising',
    dam({
      metrics: {
        generationFlow: reading(19_130, 20),
        tailwaterElevation: stage(20, { hours: 3, delta: 2.14 }),
      },
    }),
  ],
  [
    'idle and falling',
    dam({
      metrics: {
        generationFlow: reading(18, 20),
        tailwaterElevation: stage(20, { hours: 3, delta: -1.2 }),
      },
    }),
  ],
];

test('no state renders more than two supporting lines', () => {
  // The cap is what keeps this a row rather than a dashboard.
  for (const [label, input] of EVERY_STATE) {
    const status = buildTailwaterStatus(input, NOON_CENTRAL)!;
    assert.ok(status.supporting.length <= 2, `${label} rendered ${status.supporting.length}`);
  }
});

test('every state names the dam in its headline', () => {
  for (const [label, input] of EVERY_STATE) {
    const status = buildTailwaterStatus(input, NOON_CENTRAL)!;
    assert.ok(status.headline.startsWith('Bull Shoals Dam'), `${label}: ${status.headline}`);
  }
});

test('no state ever reads as an all-clear for wading', () => {
  // The safety property this whole file exists for: "not wadeable" is not
  // "dangerous to float", and neither direction may become the other.
  for (const [label, input] of EVERY_STATE) {
    const status = buildTailwaterStatus(input, NOON_CENTRAL)!;
    assert.doesNotMatch(
      allText(status),
      /safe to wade|ok to wade|clear to wade|water is off|all[- ]clear/i,
      `${label} read as an all-clear`
    );
    assert.ok(
      status.safetyNote === null || status.safetyNote === TAILWATER_RISE_NOTE,
      `${label} invented a safety note: ${status.safetyNote}`
    );
  }
});

test('no state claims to know the river where the reader is standing', () => {
  // Eddy watched the DAM. Water released an hour ago is still travelling, and
  // the recession limb holds a tailwater up long after the units come off.
  for (const [label, input] of EVERY_STATE) {
    const status = buildTailwaterStatus(input, NOON_CENTRAL)!;
    assert.doesNotMatch(allText(status), /downstream is|the river is (low|down|safe)/i, label);
  }
});

// ── The one dam this row is not for ────────────────────────────────────────

test('a project with no powerhouse gets no row at all', () => {
  // Clearwater is pure flood control. "Generation unavailable" would report a
  // feed outage where the truth is that the question does not apply.
  assert.equal(
    buildTailwaterStatus(
      dam({ hasTurbines: false, name: 'Clearwater Dam', metrics: {} }),
      NOON_CENTRAL
    ),
    null
  );
});

// ── What a screen reader hears ─────────────────────────────────────────────

test('the spoken row contains every line the row shows', () => {
  // The defect this pins: an accessibilityLabel of just the headline, which
  // replaces the label RN aggregates from the children and drops the wading
  // warning along with everything else.
  for (const [label, input] of EVERY_STATE) {
    const status = buildTailwaterStatus(input, NOON_CENTRAL)!;
    const spoken = tailwaterStatusVoiceOver(status);
    assert.ok(spoken.includes(status.headline), `${label}: headline missing`);
    for (const line of status.supporting) {
      assert.ok(spoken.includes(line), `${label}: supporting line missing — ${line}`);
    }
    if (status.safetyNote) {
      // Trailing period is normalised by the joiner, so compare without it.
      const note = status.safetyNote.replace(/\.$/, '');
      assert.ok(spoken.includes(note), `${label}: safety note missing`);
    }
  }
});

test('the spoken row names its destination last', () => {
  const status = buildTailwaterStatus(dam(), NOON_CENTRAL)!;
  const spoken = tailwaterStatusVoiceOver(status);
  assert.match(spoken, /Opens Bull Shoals Dam details\.$/);
  // The facts come before what the row does.
  assert.ok(spoken.indexOf(status.headline) < spoken.indexOf('Opens'));
});

test('the metrics the model needs are declared for the route contract', () => {
  // dams-route-contract.test.ts asserts this list against SUMMARY_METRICS.
  assert.deepEqual([...TAILWATER_STATUS_METRICS], ['generationFlow', 'tailwaterElevation']);
});
