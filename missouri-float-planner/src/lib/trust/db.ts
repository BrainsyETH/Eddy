// src/lib/trust/db.ts
// The `error` half, made impossible to forget.
//
// ── The mistake this exists to stop ──────────────────────────────────────
//
// PostgREST does not throw. A query against a missing table, a broken RPC, a
// revoked grant, or a dead connection RESOLVES — with `data: null` and an
// `error` object. So this:
//
//     const { data } = await supabase.from('trust_runs').select('started_at');
//
// is not "read the runs". It is "read the runs, and if that is impossible,
// pretend there were none". Every failure becomes an empty result, and an empty
// result is the shape of good news: no findings, no rows, nothing wrong.
//
// This repo has now named that defect four times in four different files:
//
//   1. `/api/admin/river-health` read only `data` from get_river_geometry_json,
//      so a MISSING FUNCTION looked like 24 rivers with no geometry. The page
//      had been reporting "No geometry data found" for every river.
//   2. `trust_schema_invariants()` joined pg_roles on the ACL grantee, and
//      aclexplode() represents PUBLIC as grantee 0, which has no pg_roles row.
//      A `GRANT INSERT ... TO PUBLIC` passed clean.
//   3. The update-gauges watchdog read only `data` from trust_runs, so an
//      unreadable ledger produced null, and isLedgerSilent(null) reports
//      healthy. A watchdog that could not see the ledger called it fine.
//   4. Then ledger.ts, river-geometry.ts and admin-auth.ts — six more instances,
//      inside the subsystem written to catch exactly this.
//
// Four occurrences is not four mistakes. It is one mistake that the shape of
// the client makes easy and the shape of a code review makes invisible, because
// the correct line and the broken line differ by seven characters.
//
// So the fix is not another round of spot corrections. It is this module, plus
// scripts/security/trust-supabase-error-handling.test.ts, which fails CI when a
// Supabase call in the trust subsystem discards its error. The helper makes the
// right thing easy; the guard makes the wrong thing loud.
//
// ── Why throwing is the correct response ─────────────────────────────────
//
// Throwing routes straight into reconcile.ts's `check_error` refusal: the run
// is recorded as failed, nothing is resolved on the strength of it, and a
// reconcile_anomaly finding is filed at critical severity. That is precisely the
// handling an unreadable database deserves.
//
// The alternative — degrade to an empty result and carry on — is how the four
// failures above happened. "I could not tell" must never be quieter than
// "I looked, and it is bad".

/** The shape every PostgREST terminator resolves to. */
export interface PostgrestResult<T> {
  data: T;
  error: { message?: string; code?: string; details?: string | null } | null;
  count?: number | null;
}

/**
 * Thrown when a query could not be answered.
 *
 * A distinct class rather than a bare Error so a caller that genuinely needs to
 * distinguish "the database refused" from "the check found something wrong" can
 * do so. Nothing does yet; the ledger treats both as a failed run on purpose.
 */
export class TrustDbError extends Error {
  constructor(
    readonly context: string,
    readonly cause: PostgrestResult<unknown>['error'],
  ) {
    super(`${context}: ${cause?.message ?? 'unknown database error'}`);
    this.name = 'TrustDbError';
  }
}

/**
 * `context` is not decoration.
 *
 * These throws surface as `error_detail` on a trust_runs row and in the detail
 * of a critical reconcile_anomaly finding — read weeks later by someone asking
 * why a check stopped. "could not read trust_findings for gauge_wiring" answers
 * that; "unknown database error" restarts the investigation.
 */
async function unwrap<T>(
  query: PromiseLike<PostgrestResult<T>>,
  context: string,
): Promise<PostgrestResult<T>> {
  const result = await query;
  if (result.error) throw new TrustDbError(context, result.error);
  return result;
}

/** A multi-row select. Missing rows are `[]`; an unreadable table throws. */
export async function mustRows<T>(
  query: PromiseLike<PostgrestResult<T[] | null>>,
  context: string,
): Promise<T[]> {
  const { data } = await unwrap(query, context);
  return data ?? [];
}

/**
 * A `.maybeSingle()` select. Null means "no such row", which is a real answer.
 *
 * Deliberately NOT collapsed with mustRows: the difference between "no row" and
 * "could not read" is the entire point of this module, and only the error half
 * distinguishes them.
 */
export async function mustRow<T>(
  query: PromiseLike<PostgrestResult<T | null>>,
  context: string,
): Promise<T | null> {
  const { data } = await unwrap(query, context);
  return data ?? null;
}

/**
 * A `head: true, count: 'exact'` select.
 *
 * The reason this is not `count ?? 0`: a failed count returns null, and
 * `null ?? 0` is zero — which river-geometry.ts then read as "this river has no
 * gauges" and filed as a data-quality finding. A database hiccup became a
 * finding against correct data.
 */
export async function mustCount(
  query: PromiseLike<PostgrestResult<unknown>>,
  context: string,
): Promise<number> {
  const { count } = await unwrap(query, context);
  return count ?? 0;
}

/** An `.rpc()` call. Returns whatever the function returned. */
export async function mustRpc<T>(
  query: PromiseLike<PostgrestResult<T>>,
  context: string,
): Promise<T> {
  const { data } = await unwrap(query, context);
  return data;
}

/**
 * An insert or update whose returned rows are not wanted — but whose failure is.
 *
 * The form this replaces is the worst of the lot, because it does not even
 * destructure:
 *
 *     await supabase.from('trust_findings').update(row).eq('id', id);
 *
 * That reads like a statement that either works or throws. It is neither: a
 * constraint violation, a revoked grant or a dropped column resolves quietly,
 * and the ledger goes on to report the write in its raised/resolved counts.
 */
export async function mustWrite(
  query: PromiseLike<PostgrestResult<unknown>>,
  context: string,
): Promise<void> {
  await unwrap(query, context);
}

/**
 * An insert or update whose returned row IS wanted — `.select(...).single()`.
 *
 * Separate from mustRow because `.single()` errors when it matches no rows,
 * which for a write means the write did not land. That is a failure, not a
 * null, and it must not be softened into one.
 */
export async function mustWriteReturning<T>(
  query: PromiseLike<PostgrestResult<T>>,
  context: string,
): Promise<T> {
  const { data } = await unwrap(query, context);
  return data;
}
