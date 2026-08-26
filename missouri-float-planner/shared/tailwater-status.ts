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
import { readingStaleness, tailwaterMovementProse } from './dam-schedule-copy';

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
  /** Set only on a RISING tailwater. Null is not an all-clear — see below. */
  safetyNote: string | null;
}

/**
 * The one caution this row carries, and only when the water is coming up.
 *
 * ── Why it is conditional ───────────────────────────────────────────────────
 * A caution printed under every state is chrome, and chrome is read once and
 * then never again — which is exactly the wrong outcome for the state where it
 * matters. A rise is the observable, and it is the moment a wader has to move.
 *
 * ── Why "never" and not "do not" ────────────────────────────────────────────
 * "Do not wade during a rise" reads as advice about this rise. The rule is not
 * about this rise.
 */
export const TAILWATER_RISE_NOTE = 'Never wade or anchor mid-channel during a rise.';

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

  // ── Movement, gated on freshness before it is ever worded ────────────────
  // tailwaterMovementSentence() cannot be used here: it answers with the bare
  // AGE ("18 minutes ago") when there is no trend or the reading has gone
  // stale, and under a heading about the dam that reads as movement. This row
  // carries no age at all, so the gate has to happen before the wording.
  //
  // `fresh` and not `lagging`: an undated "rose 2.1 ft over 3 hours" on a
  // four-hour-old reading is a true number attached to the wrong moment, which
  // is the error the staleness bands exist to prevent.
  const tailwater = dam.metrics?.tailwaterElevation ?? null;
  const movementIsCurrent = tailwater ? readingStaleness(tailwater.at, now) === 'fresh' : false;
  const movement = movementIsCurrent ? tailwaterMovementProse(tailwater!.trend) : null;
  const rising = movement !== null && (tailwater!.trend?.delta ?? 0) > 0;

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
    safetyNote: rising ? TAILWATER_RISE_NOTE : null,
  };
}
