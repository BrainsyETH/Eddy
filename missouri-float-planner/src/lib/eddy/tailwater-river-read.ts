// src/lib/eddy/tailwater-river-read.ts
// The river Read for a river whose level IS a dam's release: the White below
// Bull Shoals, the Norfork tailwater, and Taneycomo below Table Rock.
//
// ── Why these rivers need their own Read ───────────────────────────────────
// They have no float ladder, so the river Read generator's only honest output
// was its fallback: "Gauge assessment unavailable for White River. A condition
// assessment is unavailable from the matching measurement and thresholds. No
// usable reporting gauge is available." It wrote that every morning. The dam
// that moves the water has a Read (ADR 0017), and the knowledge file says what
// that water is like, but neither reached the river's own summary.
//
// ── The three blocks, the ones every river Read has ────────────────────────
//   summary   what is posted next at the dam, named, with its size. PUBLIC:
//             it restates the posted schedule, which is free on the dam page.
//   eddyRead  what a local would add: one note for what the posted schedule
//             has the dam doing now (idle, generating, near full power).
//             Premium.
//   full      the recent pattern, how the posted start has held, and that
//             every time is at the dam. Premium.
// The dam's own Read stays wholly Premium (ADR 0017 decision 7); only the
// schedule restated is public here (decision 10, owner 2026-11-20).
//
// ── No model, and rendered when served ─────────────────────────────────────
// Code writes all of it, for the reason the dam Read is code-written: a claim
// about a release schedule has to be checkable against the schedule. And it is
// rendered on each request against the current snapshot, never stored: a
// sentence about what is posted next, written at 5 AM and served at 3 PM, is
// the stale schedule ADR 0017 decision 6 exists to prevent.
//
// ── What a note may say ────────────────────────────────────────────────────
// Only what EDDY_KNOWLEDGE.md already says about that water, as a pattern and
// never as a reading. Nothing about whether or where it can be waded, and
// nothing about when water reaches a place downstream (ADR 0017: every time
// is at the dam; river-guide-style.md: never "wadeable at a given release").
// The owner confirmed these on 2026-11-20. One word differs from what was
// confirmed: the White's idle note said the river "never goes dry", and no
// rendered Read states an absolute (ADR 0017 decision 3), so it says "does not
// go dry". A test holds the rules.

import { getUsaceDam, USACE_DAMS } from '@/lib/flow-providers/usace-registry';
import { readStoredSnapshot } from '@/lib/data/dam-snapshot-store';
import { damHasRead } from './dam-read-dams';
import { damRiverBlocks, withCurrentSchedule, type DamReadFacts, type GenerationRef, type PostedState } from './dam-read-facts';
import { servable } from './dam-update-policy';
import type { DamSnapshot } from '@shared/dam-types';
import type { EddyUpdateEntry } from '@/types/api';

/** One note per posted state. Without `full`, near full power uses `generating`. */
export interface TailwaterNotes {
  idle: string;
  generating: string;
  full?: string;
}

/** Keyed by river slug. Owner-confirmed 2026-11-20; sourced from EDDY_KNOWLEDGE.md. */
export const TAILWATER_NOTES: Record<string, TailwaterNotes> = {
  white: {
    idle: 'Bull Shoals still passes its minimum flow, so this river does not go dry. Below the Norfork confluence, Norfork’s release matters as much as this one.',
    generating: 'This river can go from minimum flow to big, pushy water in under an hour, with no rain anywhere.',
  },
  'norfork-tailwater': {
    idle: 'With both generators idle, a siphon keeps a small, steady release going. That is the floor here.',
    generating: 'There is no gentle middle here. One generator turns a trickle into a fast, full river.',
  },
  taneycomo: {
    idle: 'With Table Rock idle, the top of the lake runs like a cold river. Below Fall Creek it turns to flat water held by Powersite.',
    generating: 'Close to the dam the water can come up feet in minutes. The dam sounds a horn first, but read the posted schedule before the horn.',
    full: 'Between idle and full generation the level below the dam swings about eight feet.',
  },
};

/**
 * The dam whose Read writes this river's Read, or null.
 *
 * A river qualifies when a dam with a Read names it as its tailwater AND the
 * river's gauge is that dam's own release (the gauge site id is the dam id).
 * The Black below Clearwater is a tailwater too, but it is gauged by USGS at
 * Poplar Bluff, has a float ladder, and gets a river Read written against it.
 */
export function tailwaterReadDamId(riverSlug: string): string | null {
  for (const dam of Object.values(USACE_DAMS)) {
    if (dam.tailwater?.riverSlug !== riverSlug) continue;
    if (dam.tailwater.gaugeSiteId !== dam.id || dam.tailwater.sectionSlug) continue;
    if (damHasRead(dam.id) && TAILWATER_NOTES[riverSlug]) return dam.id;
  }
  return null;
}

/** Every river slug that gets a tailwater Read. */
export function tailwaterReadRiverSlugs(): string[] {
  return Object.keys(TAILWATER_NOTES).filter((slug) => tailwaterReadDamId(slug) !== null);
}

export function tailwaterNote(riverSlug: string, state: PostedState | null): string | null {
  const notes = TAILWATER_NOTES[riverSlug];
  if (!notes || state === null) return null;
  return state === 'full' ? notes.full ?? notes.generating : notes[state];
}

export interface TailwaterRiverRead {
  summaryText: string;
  /** Null when today's schedule is not posted: no state to choose a note by. */
  eddyRead: string | null;
  quoteText: string;
}

/** The three blocks, from a dam's facts already set to the serving clock. */
export function renderTailwaterRiverRead(riverSlug: string, facts: DamReadFacts): TailwaterRiverRead {
  const blocks = damRiverBlocks(facts);
  return {
    summaryText: blocks.summary,
    eddyRead: tailwaterNote(riverSlug, blocks.state),
    quoteText: blocks.full,
  };
}

export interface ServedTailwaterRiverRead extends TailwaterRiverRead {
  damId: string;
  /** When the dam's facts were written; the prose itself is rendered now. */
  generatedAt: string;
  sourcesUsed: string[];
}

interface DamUpdateRow {
  facts: DamReadFacts | null;
  sources_used: string[] | null;
  generated_at: string;
  expires_at: string;
}

function referenceOf(snapshot: DamSnapshot | null, stored: GenerationRef | null): GenerationRef | null {
  const ref = snapshot?.generationReference;
  return ref
    ? { units: ref.units, fullGenerationCfs: ref.fullGenerationCfs, schedulingCapacityMw: ref.schedulingCapacityMw }
    : stored;
}

/**
 * This river's Read, rendered now, or null when it is not a tailwater-Read
 * river or its dam has no servable Read. The same eligibility as the dam's own
 * route (dam-update-policy.ts): today's facts, and a current snapshot or facts
 * young enough to advance without one.
 */
export async function loadTailwaterRiverRead(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  riverSlug: string,
  options: { now?: number; readSnapshot?: typeof readStoredSnapshot } = {},
): Promise<ServedTailwaterRiverRead | null> {
  const damId = tailwaterReadDamId(riverSlug);
  if (!damId || !getUsaceDam(damId)) return null;
  const now = options.now ?? Date.now();
  const readSnapshot = options.readSnapshot ?? readStoredSnapshot;

  const [{ data, error }, snapshot] = await Promise.all([
    supabase
      .from('dam_updates')
      .select('facts, sources_used, generated_at, expires_at')
      .eq('dam_id', damId)
      .order('generated_at', { ascending: false })
      .limit(1)
      .maybeSingle() as Promise<{ data: DamUpdateRow | null; error: { message: string } | null }>,
    readSnapshot(damId, { now }),
  ]);
  if (error) {
    console.error(`[TailwaterRead] dam_updates query error for ${damId}:`, error);
    return null;
  }
  if (!data?.facts) return null;
  if (!servable({ generatedAt: data.generated_at, expiresAt: data.expires_at }, snapshot !== null, now)) return null;

  const facts = withCurrentSchedule(data.facts, snapshot?.schedule ?? null, now, referenceOf(snapshot, data.facts.reference), snapshot?.scheduleCheck ?? null);
  return {
    ...renderTailwaterRiverRead(riverSlug, facts),
    damId,
    generatedAt: data.generated_at,
    sourcesUsed: Array.isArray(data.sources_used) ? data.sources_used : [],
  };
}

/**
 * The batched summaries (/api/eddy-updates: Pulse and the river cards) with
 * each tailwater river's summary in place, for every river in `slugs`.
 *
 * `slugs` is the ACTIVE tailwater rivers, not the ones with a stored row. The
 * summary is rendered from the dam, never read from eddy_updates, so it does
 * not need one: when the morning river pass failed, the river page (which
 * serves it without a row, latest-update.ts) kept its summary while Pulse and
 * the cards lost it. The reading the live overlay attached, when there was a
 * row to attach it to, stays. A river whose dam has no servable Read keeps
 * whatever it had, including nothing.
 */
export async function withTailwaterSummaries(
  updates: Record<string, EddyUpdateEntry>,
  slugs: readonly string[],
  load: (riverSlug: string) => Promise<ServedTailwaterRiverRead | null>,
): Promise<Record<string, EddyUpdateEntry>> {
  const out = { ...updates };
  await Promise.all(slugs.filter((slug) => tailwaterReadDamId(slug)).map(async (slug) => {
    const tailwater = await load(slug).catch((err) => {
      console.error(`[EddyUpdates] Tailwater Read failed for ${slug}:`, err);
      return null;
    });
    if (!tailwater) return;
    const existing: EddyUpdateEntry | undefined = out[slug];
    out[slug] = {
      // Unrated on purpose: a release is not a float verdict.
      conditionCode: existing?.conditionCode ?? 'unknown',
      gaugeHeightFt: existing?.gaugeHeightFt ?? null,
      dischargeCfs: existing?.dischargeCfs ?? null,
      readingTimestamp: existing?.readingTimestamp ?? null,
      snapshotId: existing?.snapshotId ?? null,
      summaryText: tailwater.summaryText,
      generatedAt: tailwater.generatedAt,
    };
  }));
  return out;
}
