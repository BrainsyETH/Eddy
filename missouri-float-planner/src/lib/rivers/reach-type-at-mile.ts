// src/lib/rivers/reach-type-at-mile.ts
// Which hydrology a PUT-IN sits in, for the float-time decision.
//
// ── Why the river row is not enough ────────────────────────────────────────
// rivers.river_type describes one river with one number. Migration 00204 lets
// a river_sections row override it for a reach, and the Black is the live case:
// `upper-lesterville` inherits the river's spring_fed_float; `lower-markham-
// hammer` (mile 38 down) is dam_tailwater below Clearwater Dam.
//
// Both float-time callers — /api/plan and chat's get_float_route — read the
// river row only. So a Clearwater-tailwater put-in was never a tailwater to
// them: no withholding without flow, no `releaseDependent` with it, no caveat
// on the card, while the number itself was built from the below-dam gauge the
// segment lookup now correctly picks. The three rivers whose ROW says
// dam_tailwater (Bull Shoals, Norfork, Table Rock) got the caveat and are all
// inactive; the one tailwater people can float today did not.
//
// The pure half is exported so the mile arithmetic is testable without a
// database; the async half runs the one query and FALLS BACK TO THE RIVER ROW
// on any failure, which is exactly the behaviour every caller had before and
// therefore never fails more open than the code it replaces.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { createClient } from '@/lib/supabase/server';

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;
type ReachClient = SupabaseServerClient | SupabaseClient;

export interface ReachTypeRow {
  river_type: string | null;
  river_mile_start: number | string | null;
  river_mile_end: number | string | null;
}

function asMile(value: number | string | null): number | null {
  if (value == null) return null;
  const n = typeof value === 'number' ? value : parseFloat(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * The river_type of the reach containing `mile`, or `fallback`.
 *
 * A reach with a NULL start is open upstream; a NULL end is open downstream.
 * The boundary belongs to the downstream reach (`start <= mile < end`), which
 * is the convention 00204 seeds the Black with (38.0 ends the upper reach and
 * begins the lower). A reach with a NULL river_type inherits, so it never wins
 * over the fallback. An unusable mile yields the fallback.
 */
export function pickReachRiverType<T extends string>(
  rows: readonly ReachTypeRow[] | null | undefined,
  mile: number | null | undefined,
  fallback: T | null,
): T | null {
  if (!rows || mile == null || !Number.isFinite(mile)) return fallback;
  for (const row of rows) {
    if (!row.river_type) continue;
    const start = asMile(row.river_mile_start);
    const end = asMile(row.river_mile_end);
    if (start != null && mile < start) continue;
    if (end != null && mile >= end) continue;
    return row.river_type as T;
  }
  return fallback;
}

/**
 * Resolve the reach type at a put-in mile, falling back to the river row.
 *
 * One small query. It is not cached and must not be: a cached miss behind a
 * swallowed catch is how the original refusal failed open (see the ratchets in
 * float-time-tailwater.test.ts). A query error here returns the fallback, and
 * the fallback is the river row that every caller already reads.
 */
export async function reachRiverTypeAtMile<T extends string>(
  supabase: ReachClient,
  riverId: string,
  mile: number | null | undefined,
  fallback: T | null,
): Promise<T | null> {
  if (mile == null || !Number.isFinite(mile)) return fallback;
  try {
    // One narrow cast, the same one endpoint-resolver makes: the two client
    // types differ only in whether they carry the generated Database generic,
    // and this read is identical under both.
    const { data, error } = await (supabase as SupabaseClient)
      .from('river_sections')
      .select('river_type, river_mile_start, river_mile_end')
      .eq('river_id', riverId);
    if (error || !data) return fallback;
    return pickReachRiverType(data as ReachTypeRow[], mile, fallback);
  } catch {
    return fallback;
  }
}
