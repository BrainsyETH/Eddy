// src/lib/trust/exceptions.ts
// Accepted production deviations, with an owner and an expiry the ledger honours.
//
// ── What this closes ────────────────────────────────────────────────────
//
// docs/legacy-schema-security-audit.md:53-56 requires every catalog mismatch to
// be recorded as either a forward-only corrective migration OR "an explicitly
// accepted production exception with an owner and expiry".
//
// trust_schema_invariants() does the detecting, and does it well. The governance
// half existed only as prose in TRUST_LEDGER_V1_PLAN.md — a sentence saying the
// live deviations were "recorded as decisions with owners", in a document with
// no owner field, no expiry, and nothing that could tell whether a decision had
// gone stale. A deviation accepted in August and forgotten by December is
// indistinguishable, from the console, from one accepted last week.
//
// ── Why it is a module and not a document ───────────────────────────────
//
// Because an expiry that nothing checks is a wish.
//
// The whole argument of this subsystem is that a control which requires someone
// to remember to look is not a control. A doc-only exception register is exactly
// that: it would sit beside the audit's own "turn each confirmed invariant into
// an automated check when the harness is available" instruction, which sat
// outstanding until schema-invariants.ts was written to close it.
//
// So an exception here does something. While it is live, the finding is filed
// SNOOZED to the exception's expiry date, using the ledger's ordinary snooze
// machinery — so it stays in the record, keeps its history, and is one filter
// click away, but does not sit in the open list pretending nobody has looked at
// it. On the day it expires, classifyExisting() treats the snooze as lapsed and
// the next run wakes the finding at full severity, with the detail saying the
// exception ran out and naming who accepted it.
//
// Nothing has to remember. The deadline is the mechanism.

/**
 * An accepted deviation between what the migrations intend and what production
 * actually has.
 *
 * Every field is required on purpose. An exception without an owner is nobody's
 * problem; one without exit criteria is a permanent state wearing a temporary
 * label.
 */
export interface SchemaException {
  /** Must match an invariant_key returned by trust_schema_invariants(). */
  invariantKey: string;
  /** Who accepted it, and who the ledger names when it expires. */
  owner: string;
  /** ISO date. The day the finding wakes up on its own. */
  expires: string;
  /** Why living with it is currently the right call. */
  rationale: string;
  /** What has to become true for this to be CLOSED rather than renewed. */
  exitCriteria: string;
}

/**
 * The live register.
 *
 * One entry. `feedback_no_public_mutation_grants` was the other standing
 * deviation and is no longer an exception — it was fixed and applied as
 * 20260804181529_revoke_public_write_grants_on_feedback.sql, which is what
 * should happen to these: an exception is a holding position, not a resting
 * place.
 */
export const SCHEMA_EXCEPTIONS: readonly SchemaException[] = [
  {
    invariantKey: 'admin_policies_use_is_admin',
    owner: 'BrainsyETH',
    expires: '2026-11-04',
    rationale:
      'Ten policies across community_reports, nearby_services and service_rivers inline the ' +
      'user_roles lookup instead of calling is_admin(). They gate correctly today: the inline ' +
      'form works while user_roles keeps the `user_id = auth.uid()` branch in its SELECT policy. ' +
      'Rewriting ten policies across three tables in one pass is a larger change than the risk ' +
      'currently justifies, and a mistake in it locks admins out of moderation.',
    exitCriteria:
      'All ten policies call is_admin(), verified by trust_schema_invariants() returning ok for ' +
      'this key on production — not by a migration existing. The hazard is specifically that ' +
      'is_admin() is SECURITY DEFINER and bypasses RLS on user_roles, so tightening that table ' +
      'silently turns every inline check false and locks admins out of tables that still look ' +
      'correctly gated.',
  },
];

export type ExceptionVerdict =
  | { kind: 'none' }
  | { kind: 'active'; exception: SchemaException; expiresAt: Date }
  | { kind: 'expired'; exception: SchemaException; expiresAt: Date };

/**
 * Pure. What the register says about one invariant, right now.
 *
 * Parsed as an end-of-day UTC instant so an exception expiring "2026-11-04" is
 * live for all of the 4th rather than lapsing at midnight — an off-by-one that
 * would wake a finding a day early and teach the operator the dates are
 * approximate.
 */
export function exceptionFor(invariantKey: string, now: Date): ExceptionVerdict {
  const exception = SCHEMA_EXCEPTIONS.find((e) => e.invariantKey === invariantKey);
  if (!exception) return { kind: 'none' };

  const expiresAt = new Date(`${exception.expires}T23:59:59.999Z`);
  if (Number.isNaN(expiresAt.getTime())) {
    // An unparseable date must not read as "never expires". Treating it as
    // already lapsed fails toward visibility, which is the only safe direction
    // for a security exception.
    return { kind: 'expired', exception, expiresAt: new Date(0) };
  }

  return expiresAt.getTime() > now.getTime()
    ? { kind: 'active', exception, expiresAt }
    : { kind: 'expired', exception, expiresAt };
}

/** The sentence appended to a finding whose exception has run out. */
export function expiredExceptionDetail(exception: SchemaException): string {
  return (
    ` — The accepted exception for this invariant expired on ${exception.expires}. ` +
    `${exception.owner} accepted it on the basis that: ${exception.rationale} ` +
    `It closes when: ${exception.exitCriteria} ` +
    `Either fix it, or renew the exception in src/lib/trust/exceptions.ts with a new expiry.`
  );
}

/** The sentence appended to a finding that is currently governed. */
export function activeExceptionDetail(exception: SchemaException): string {
  return (
    ` — Accepted by ${exception.owner} until ${exception.expires}. ${exception.rationale} ` +
    `It closes when: ${exception.exitCriteria}`
  );
}
