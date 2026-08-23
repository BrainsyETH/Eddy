// src/lib/access-points/endpoint-resolver.ts
// The one place that answers "may these two access points be the ends of a
// float?", for every route-building entry point.
//
// ── Why this is server-side and shared ───────────────────────────────────
//
// Before this file, each entry point asked its own version of the question and
// three of them got it wrong:
//
//   /api/plan       .in('id', [startId, endId]).eq('approved', true)
//                   — no river filter, though riverId was already resolved a few
//                     lines above. Two access points on two different rivers
//                     planned a float between them.
//   /api/shuttle    .in('id', [putInId, takeOutId])
//                   — no approved filter at all. It compared
//                     putIn.river_id === takeOut.river_id to decide whether the
//                     mileage was meaningful, then carried on either way.
//   /api/plan/save  no validation. It inserted start_access_id / end_access_id
//                   into float_plans as given.
//
// Filtering in the planner UI does not fix any of that. The UI is one caller of
// several, it is bypassable by construction, and a saved plan or a shared short
// code replays whatever was stored. Eligibility has to be decided where the
// float is built.
//
// ── Why the rows are classified in TypeScript, not in the WHERE clause ───
//
// A single filtered query answers every failure with zero rows, so "that id
// doesn't exist", "that point isn't public", "that point isn't a launch" and
// "that point is on a different river" all become one 404 and the caller cannot
// say anything useful. One unfiltered read by id, then classification here,
// costs the same round trip and keeps the four apart.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { createClient } from '@/lib/supabase/server';

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

/**
 * Either client, because the callers are split between them: /api/plan uses the
 * cookie-scoped server client, /api/shuttle the service-role admin one (which
 * src/lib/supabase/admin.ts deliberately leaves untyped). Both satisfy the one
 * read this module performs.
 */
type EndpointClient = SupabaseServerClient | SupabaseClient;

/** The columns this module needs regardless of what the caller asked for. */
const REQUIRED_COLUMNS = ['id', 'river_id', 'approved', 'is_float_endpoint'] as const;

/**
 * The four columns this decision needs, and deliberately no index signature.
 *
 * An `[key: string]: unknown` here would satisfy every caller's shape at the
 * cost of erasing it: `/api/plan` selects `*` and then reads two dozen fields
 * off the result, all of which would arrive as `unknown`. Callers instead pass
 * their own row type as `T`, and this interface is only the constraint.
 */
export interface EndpointRow {
  id: string;
  river_id: string | null;
  approved: boolean | null;
  is_float_endpoint: boolean | null;
}

export type EndpointFailureReason =
  /** No access point carries this id. */
  | 'not-found'
  /** The record exists but is not public — unreviewed, or withdrawn. */
  | 'not-approved'
  /**
   * Public, but not a launch — a real place with a real page that is not a
   * put-in. A state park or campground on the water with no ramp.
   */
  | 'not-an-endpoint'
  /** Public and a launch, but on a different river than the one asked about. */
  | 'wrong-river'
  /** Put-in and take-out are the same point. */
  | 'same-point'
  /**
   * The read itself failed — an outage, a permission error, a column that is
   * not there yet. NOT a statement about the ids.
   *
   * This exists because the first version of this file folded it into
   * `not-found`, which told a caller "no such access point" during a database
   * outage. That is a 200-adjacent lie: the client retries nothing, the user is
   * told their put-in does not exist, and the incident is invisible in the 4xx
   * rate. A failed read is a 500 and must look like one.
   */
  | 'read-failed';

export type EndpointResolution<T extends EndpointRow> =
  | { ok: true; putIn: T; takeOut: T }
  | { ok: false; reason: EndpointFailureReason; detail: string };

/**
 * Pure. Given the rows a read returned and what was asked for, decide.
 *
 * Split out from the query so the decision can be tested without a database,
 * matching `deriveServiceGeoFindings` in src/lib/trust/checks/.
 */
export function classifyEndpoints<T extends EndpointRow>(
  rows: readonly T[],
  { riverId, putInId, takeOutId }: { riverId: string | null; putInId: string; takeOutId: string },
): EndpointResolution<T> {
  if (putInId === takeOutId) {
    return {
      ok: false,
      reason: 'same-point',
      detail: 'A float needs two different access points.',
    };
  }

  const byId = new Map(rows.map((r) => [r.id, r]));

  for (const [id, role] of [
    [putInId, 'put-in'],
    [takeOutId, 'take-out'],
  ] as const) {
    const row = byId.get(id);

    if (!row) {
      return { ok: false, reason: 'not-found', detail: `No access point matches the ${role} id.` };
    }
    if (row.approved !== true) {
      return {
        ok: false,
        reason: 'not-approved',
        detail: `The ${role} is not a published access point.`,
      };
    }
    // Checked before the river, so a non-launch reads as a non-launch rather
    // than as a river mismatch when both happen to be true.
    if (row.is_float_endpoint !== true) {
      return {
        ok: false,
        reason: 'not-an-endpoint',
        detail: `The ${role} is a place on the river, not a launch — it cannot start or end a float.`,
      };
    }
    if (riverId !== null && row.river_id !== riverId) {
      return {
        ok: false,
        reason: 'wrong-river',
        detail: `The ${role} is not on this river.`,
      };
    }
  }

  // Both sides passed every gate above, so both lookups are present.
  return { ok: true, putIn: byId.get(putInId) as T, takeOut: byId.get(takeOutId) as T };
}

/**
 * The HTTP status each failure deserves.
 *
 * 404 only for a query that SUCCEEDED and found nothing; 500 when the query
 * itself failed; 400 for the three ways a caller can name real rows that may
 * not be floated between.
 */
export function endpointFailureStatus(reason: EndpointFailureReason): 400 | 404 | 500 {
  if (reason === 'read-failed') return 500;
  if (reason === 'not-found') return 404;
  return 400;
}

/**
 * Read both endpoints and decide whether a float may be built from them.
 *
 * `columns` is the caller's projection; the four columns this decision needs are
 * appended, so a caller cannot accidentally opt out of being checked.
 *
 * Pass `riverId: null` only where there is genuinely no river in hand yet — the
 * river is then taken from the resolved put-in rather than trusted from input.
 */
export async function resolveFloatEndpoints<T extends EndpointRow = EndpointRow>(
  supabase: EndpointClient,
  {
    riverId,
    putInId,
    takeOutId,
    columns = '*',
  }: { riverId: string | null; putInId: string; takeOutId: string; columns?: string },
): Promise<EndpointResolution<T>> {
  const projection =
    columns === '*'
      ? '*'
      : [...new Set([...columns.split(',').map((c) => c.trim()), ...REQUIRED_COLUMNS])].join(', ');

  // One narrow cast: the two client types differ only in whether they carry the
  // generated Database generic, and this read is identical under both.
  const { data, error } = await (supabase as SupabaseClient)
    .from('access_points')
    .select(projection)
    .in('id', [putInId, takeOutId]);

  if (error) {
    return {
      ok: false,
      reason: 'read-failed',
      detail: 'Could not read the access points.',
    };
  }

  return classifyEndpoints((data ?? []) as unknown as T[], { riverId, putInId, takeOutId });
}
