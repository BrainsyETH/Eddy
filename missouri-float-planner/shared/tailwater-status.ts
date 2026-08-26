// missouri-float-planner/shared/tailwater-status.ts
// One row of operational fact for a hydropower tailwater, to sit directly under
// the river's live condition card on both platforms.
//
// ── What this is NOT ────────────────────────────────────────────────────────
// It is not a second condition. Eddy's ladder — too_low → low → good → flowing
// → high → dangerous — is a FLOAT verdict, and on a tailwater the meanings
// invert: minimum release is the best wading on the river and unfloatable, one
// generating unit ends wading while making good floating water, and ordinary
// generation is not "dangerous" merely because it is dangerous to stand in. So
// nothing here maps to a ConditionCode, borrows a condition colour, or claims a
// rank. `tone` picks an icon and nothing else.
//
// The corollary matters more: "not wadeable" is not "dangerous to float", and
// this file must never let one become the other.
//
// ── Why the model is strings and not data ───────────────────────────────────
// Because the wording IS the safety property. Every rule this file enforces —
// no present tense on a stale reading, no unit count, no all-clear, no claim
// about water the reader is standing in — is a rule about a sentence. Handing a
// UI `{ generating: true, equivalents: 1.2 }` moves all of that into two
// components that then have to agree, on two platforms, forever.
//
// Pure TypeScript, sibling imports only — the constraint every file in shared/
// is under, so Metro, tsx and Next can all consume it.

import type { DamSnapshot } from './dam-types';
import {
  generationNow,
  generatorEquivalentPhrase,
  speaksForNow,
} from './dam-generation';
import {
  readingStaleness,
  relativeAge,
  tailwaterMovementProse,
} from './dam-schedule-copy';

/** What the powerhouse is doing, for an icon. NEVER a condition code. */
export type TailwaterTone = 'generating' | 'idle' | 'unavailable';

/**
 * Everything the row renders, already final.
 *
 * Two supporting lines at most. The cap is not a layout preference — it is what
 * keeps this a row rather than a dashboard, and the thing a reader glancing at
 * a river page will actually read.
 */
export interface TailwaterStatus {
  damId: string;
  damName: string;
  tone: TailwaterTone;
  /** Always names the dam, so the row's accessible name is self-sufficient. */
  headline: string;
  /** Ordered, 0–2 entries. */
  supporting: string[];
}

// ── Why there is no wading warning here ────────────────────────────────────
//
// There was one: "Never wade or anchor mid-channel during a rise.", set whenever
// the trend was positive. It is gone, and putting it back needs more than an
// opinion.
//
// The trigger was any rise the rounding floor admits, which is 0.1 ft over three
// hours — an inch and a bit. Measured on Norfork the day this shipped, that is
// exactly what fired it. But tailwaterMovementLabel's own research is that 25%
// of GENERATING hours move under 0.23 ft and the idle distribution reaches 4.0
// ft at p99: the two overlap across the whole range a threshold could sit in.
// That number is descriptive data, not a validated hazard boundary, and it
// cannot be promoted into one here.
//
// So the row states the measurement and stops. "Water below the dam rose 0.1 ft
// over 3 hours" is precise and appropriately modest; the same figure under an
// alarm is a claim Eddy cannot source. A warning that fires on an inch is also
// a warning nobody reads by the third river.
//
// What would justify bringing it back: a published hazard flow or stage for one
// of these reaches, or a rate of rise somebody with authority is willing to sign
// — the same bar river_gauges' condition_rating_approved_by sets for a ladder.
// The standing caution about horns and posted warnings already lives in
// RiverDamPanel's footnote, which is where an unconditional rule belongs.

/**
 * What Eddy can honestly say when the turbines are off.
 *
 * ── Why this is not "the water is off" ──────────────────────────────────────
 * Because Eddy watched the DAM, and the reader is somewhere below it. Water
 * released an hour ago is still travelling, and the recession limb holds a
 * tailwater up long after the units come off — the asymmetry dam-schedule-copy
 * spells out: a start understates when water arrives, a stop OVERSTATES when
 * downstream is safe to stand in.
 *
 * "may still be" rather than "is": Eddy does not know either way, and a row
 * that guesses in the reassuring direction is the failure this whole file is
 * written against.
 */
export const TAILWATER_IDLE_NOTE = 'Water already released may still be moving downstream';

/** Where the schedule actually lives, said as a destination rather than a gap. */
export const TAILWATER_UNAVAILABLE_NOTE = 'See the latest release and schedule';

/**
 * The metrics this model reads, named so a contract test can hold them.
 *
 * ── Why this is exported and not just implied ──────────────────────────────
 * The row reads its metrics THROUGH buildTailwaterStatus rather than inline,
 * so dams-route-contract.test.ts's `.metrics.X` regex — which is what keeps a
 * list surface from reading something /api/dams no longer sends — sees nothing
 * in the components at all. Listing the file there was decorative: dropping
 * tailwaterElevation from SUMMARY_METRICS passed every test in the repo and
 * silently took the movement line away from every installed client, which
 * cannot be fixed by shipping a new server.
 *
 * So the requirement is declared here, beside the code that has it, and
 * asserted against SUMMARY_METRICS there.
 */
export const TAILWATER_STATUS_METRICS = ['generationFlow', 'tailwaterElevation'] as const;

type TailwaterInputs = Pick<
  DamSnapshot,
  'id' | 'name' | 'hasTurbines' | 'metrics' | 'generationReference' | 'generationFloorCfs'
>;

/**
 * Build the row, or null when there is no row to build.
 *
 * ── Why null for a project with no powerhouse ───────────────────────────────
 * Clearwater is pure flood control. Every sentence this file can produce is
 * about turbines, and a row that said "generation unavailable" for a dam that
 * has none would report a feed outage where the truth is that the question does
 * not apply. Keyed off the dam rather than a list of river slugs, so it stays
 * right the next time a dam is added.
 *
 * `now` is injected rather than read, for the same reason generationNow takes
 * it: the staleness band has to be computed on the READER's clock, not stamped
 * when the server assembled the payload and then frozen while an iOS screen sat
 * backgrounded.
 */
export function buildTailwaterStatus(
  dam: TailwaterInputs,
  now = Date.now()
): TailwaterStatus | null {
  const state = generationNow(dam, now);
  if (state.kind === 'unavailable' && state.reason === 'no-powerhouse') return null;

  // ── Movement, gated on freshness and stamped with its own age ────────────
  // tailwaterMovementSentence() cannot be dropped in here: it answers with the
  // bare AGE ("18 minutes ago") when there is no trend or the reading has gone
  // stale, and under a heading about the dam that reads as movement. So the
  // gate happens before the wording, and the age is attached after it.
  //
  // ── Why the age is attached at all ───────────────────────────────────────
  // This once carried none, on the reasoning that the condition card directly
  // above already states when it was taken. That was wrong, and wrong in the
  // way this file keeps trying to close: the condition card reads a USGS
  // GAUGE, while tailwaterElevation is a CWMS reading at the DAM. Two
  // observations, two clocks. Borrowing one age for the other is the same
  // true-number-wrong-moment error as an hour-ending off-by-one.
  //
  // `fresh` still gates — a `lagging` reading gets no movement line at all —
  // but `fresh` runs to two hours, and "rose 2.1 ft over 3 hours" with no date
  // on it reads as the last three hours no matter how old it is. The age is
  // what makes the ninety-minute case honest rather than the gate alone.
  //
  // Separator and wording follow tailwaterMovementSentence's fresh branch, so
  // the two forms cannot describe one reading differently.
  const tailwater = dam.metrics?.tailwaterElevation ?? null;
  const movementIsCurrent = tailwater ? readingStaleness(tailwater.at, now) === 'fresh' : false;
  const movementProse = movementIsCurrent ? tailwaterMovementProse(tailwater!.trend) : null;
  const movementAge = movementProse ? relativeAge(tailwater!.at, now) : null;
  const movement = movementProse && movementAge ? `${movementProse} · ${movementAge}` : null;

  const supporting: string[] = [];
  let tone: TailwaterTone;
  let headline: string;

  switch (state.kind) {
    case 'generating': {
      tone = 'generating';
      // The tense comes from the timestamp, never from the fact of a reading
      // existing. Same rule generationStatusLabel holds.
      headline = speaksForNow(state.age)
        ? `${dam.name} is generating`
        : `${dam.name}: last observed generating`;

      // Hedged or absent, never a unit count. Eddy reads turbine DISCHARGE and
      // infers from it; "1 unit is running" is a claim about machinery nobody
      // published. Below one equivalent the helper says so in words rather than
      // rounding up to a unit that would read as running.
      const equivalent = generatorEquivalentPhrase(state.equivalents, dam.generationReference);
      if (equivalent) supporting.push(equivalent);
      if (movement) supporting.push(movement);
      break;
    }

    case 'not-generating': {
      tone = 'idle';
      headline = speaksForNow(state.age)
        ? `${dam.name}: no turbine generation observed`
        : `${dam.name}: no generation at last observation`;
      // The idle note first: it is the correction a reader needs before they
      // read a flat tailwater as an all-clear.
      supporting.push(TAILWATER_IDLE_NOTE);
      if (movement) supporting.push(movement);
      break;
    }

    case 'unavailable': {
      tone = 'unavailable';
      headline = `${dam.name} generation unavailable`;
      // No movement line here, deliberately. Whatever the tailwater is doing,
      // pairing it with an unreadable powerhouse invites the reader to infer
      // the units from the stage, which is the inference Eddy refuses to make
      // itself.
      supporting.push(TAILWATER_UNAVAILABLE_NOTE);
      break;
    }
  }

  return {
    damId: dam.id,
    damName: dam.name,
    tone,
    headline,
    supporting: supporting.slice(0, 2),
  };
}

/**
 * The row, said in words.
 *
 * ── Why this exists ────────────────────────────────────────────────────────
 * The iOS row is one Pressable wrapping several Text nodes, and an
 * accessibilityLabel on it REPLACES the label React Native would otherwise
 * aggregate from those children. It shipped carrying only the headline, which
 * meant VoiceOver heard "Bull Shoals Dam is generating" and none of the lines
 * that qualify it — including "Water already released may still be moving
 * downstream" and the wading warning. A partial label is the one option that
 * drops content silently; the app's other rows either compose every field
 * (RiverRow, GaugeRow, ReferenceGaugeRow) or set no label at all so the
 * children are read (DamRow).
 *
 * ── Why it lives here and not at the call site ─────────────────────────────
 * Same reason this module returns strings: the wording is the safety property.
 * Composed in the component, the spoken order is untestable and the two
 * platforms drift. Mirrors the `*VoiceOver` builders in dam-generation.ts.
 *
 * The destination goes last, after the facts, so a listener hears what the row
 * says before what it does.
 */
export function tailwaterStatusVoiceOver(status: TailwaterStatus): string {
  const parts = [status.headline, ...status.supporting];
  // Sentence-joined rather than comma-joined: these are whole sentences, and
  // ", " would run one onto the end of another.
  const spoken = parts.map((part) => part.replace(/\.$/, '')).join('. ');
  return `${spoken}. Opens ${status.damName} details.`;
}
