// src/lib/entitlement.ts
// Eddy Premium entitlement guard for consumer (iOS) API routes.
//
// Two shapes, mirroring the existing guards in this codebase:
//   * requireEntitlement(request)  — imperative, like requireAdminAuth()
//   * withEntitlement(handler)     — HOF, like withX402Route()
//
// Entitlement state is NEVER a stored boolean: it is derived from the latest
// RevenueCat event's expires_at (see /api/webhooks/revenuecat). Grace periods
// arrive as an extended expires_at, so honoring expires_at also honors grace.
//
// ── Environment gating, and why the default flipped ────────────────────────
//
// Rows written by StoreKit sandbox and TestFlight purchases are tagged
// environment='SANDBOX'. The original Phase 0 decision discarded them unless
// ALLOW_SANDBOX_ENTITLEMENTS was set, so that a sandbox purchase could never
// unlock the paid product in production.
//
// THAT RULE WOULD HAVE FAILED APP REVIEW, and silently. App Review buys through
// the sandbox: the reviewer signs in, purchases, RevenueCat sends
// environment='SANDBOX', the webhook writes the row faithfully — and this
// function then answered false, so /api/me/profile reported isActive:false,
// waitForEntitlement never resolved, and Premium stayed locked behind a
// purchase that had just succeeded. "In-app purchase does not work" is a
// guaranteed rejection, and nothing in the app or the dashboard would have
// pointed at this file.
//
// The exposure the old default was protecting against is narrower than it
// reads. A sandbox receipt cannot be minted by the public: sandbox tester
// credentials are issued from this App Store Connect account, and TestFlight
// membership is invited. RevenueCat validates the receipt with Apple before the
// webhook fires. So the set of people who can obtain a SANDBOX entitlement is
// exactly {App Review, testers we invited} — all of whom SHOULD have the paid
// features while testing the paid features.
//
// Sandbox rows are therefore honoured by default. DENY_SANDBOX_ENTITLEMENTS=true
// restores the old behaviour for any environment that wants it; nothing sets it
// today. Kept as an escape hatch rather than deleted, because the day this needs
// reversing is a day nobody will want to be writing new code.

import { NextRequest, NextResponse } from 'next/server';
import { requirePermanentUser, type AuthedRequest } from '@/lib/supabase/request';

/**
 * The RevenueCat entitlement identifier. Dashboard key, not a display string —
 * the product is called "Eddy Premium", this is what RevenueCat sends.
 *
 * THE ONLY DEFINITION ON THIS SIDE. Import it; never retype the literal. A
 * mismatch between this and the RevenueCat dashboard fails silently — rows get
 * written that no query reads, and the paywall simply never unlocks — so the
 * one thing that must not happen is four copies drifting apart.
 *
 * The app holds a second copy (eddy-ios/src/lib/purchases.ts) because Vercel
 * builds with Root Directory = missouri-float-planner/ and cannot import from
 * packages/ at runtime. src/lib/entitlement-id.test.ts asserts the two agree.
 */
export const DEFAULT_ENTITLEMENT_ID = 'eddy_premium';

/** The subset of an `entitlements` row that decides access. */
export interface EntitlementRow {
  entitlement_id?: string | null;
  expires_at?: string | null;
  environment?: string | null;
  will_renew?: boolean | null;
  product_id?: string | null;
  billing_issue_detected_at?: string | null;
}

export function sandboxEntitlementsAllowed(): boolean {
  // Opt OUT, not opt in — see the header. ALLOW_SANDBOX_ENTITLEMENTS is still
  // read so that any environment which already sets it keeps working, but it is
  // no longer required, and it can no longer be the reason a real purchase
  // fails to unlock.
  if (process.env.DENY_SANDBOX_ENTITLEMENTS === 'true') return false;
  return true;
}

/**
 * Pure access decision — exported for tests and for any caller that already
 * has the row in hand (e.g. the push fan-out re-checking at send time).
 */
export function isEntitlementActive(
  row: EntitlementRow | null | undefined,
  opts: { now?: Date; allowSandbox?: boolean } = {}
): boolean {
  if (!row?.expires_at) return false;

  const allowSandbox = opts.allowSandbox ?? sandboxEntitlementsAllowed();
  // Rows predating the environment column, or written by a store that doesn't
  // report one, are treated as production.
  if (row.environment === 'SANDBOX' && !allowSandbox) return false;

  const expiresAt = new Date(row.expires_at);
  if (Number.isNaN(expiresAt.getTime())) return false;

  return expiresAt.getTime() > (opts.now ?? new Date()).getTime();
}

export interface AuthedEntitlement extends AuthedRequest {
  entitlement: EntitlementRow;
}

function paymentRequired(reason: 'no_entitlement' | 'expired'): NextResponse {
  return NextResponse.json(
    {
      error: 'Eddy Premium subscription required',
      code: reason,
      // The app turns this into the paywall; keep it machine-readable.
      entitlementId: DEFAULT_ENTITLEMENT_ID,
    },
    { status: 402, headers: { 'Cache-Control': 'private, no-store' } }
  );
}

/**
 * Authenticate the caller and require an active Eddy Premium entitlement.
 * Returns { supabase, user, entitlement } or a ready-to-send response:
 *   401 — no/invalid token
 *   403 — anonymous session (purchases require a permanent account)
 *   402 — signed in, but no active entitlement (→ show the paywall)
 *
 *   const auth = await requireEntitlement(request);
 *   if (auth instanceof NextResponse) return auth;
 */
export async function requireEntitlement(
  request: NextRequest,
  opts: { entitlementId?: string } = {}
): Promise<AuthedEntitlement | NextResponse> {
  const entitlementId = opts.entitlementId ?? DEFAULT_ENTITLEMENT_ID;

  // Purchases are always tied to a permanent (non-anonymous) identity, so an
  // anonymous caller can never hold an entitlement — reject before querying.
  const auth = await requirePermanentUser(request);
  if (auth instanceof NextResponse) return auth;
  const { supabase, user } = auth;

  const { data: row, error } = await supabase
    .from('entitlements')
    .select('entitlement_id, expires_at, environment, will_renew, product_id, billing_issue_detected_at')
    .eq('user_id', user.id)
    .eq('entitlement_id', entitlementId)
    .maybeSingle();

  if (error) {
    console.error('[Entitlement] Lookup failed:', error);
    return NextResponse.json(
      { error: 'Could not verify subscription' },
      { status: 500, headers: { 'Cache-Control': 'private, no-store' } }
    );
  }

  if (!row) return paymentRequired('no_entitlement');
  if (!isEntitlementActive(row)) return paymentRequired('expired');

  return { supabase, user, entitlement: row };
}

type StaticRouteContext = { params: Promise<Record<string, never>> };

/**
 * Wrap a route handler so it only runs for entitled callers. The handler
 * receives the authenticated context as a third argument, so it never
 * re-authenticates:
 *
 *   export const GET = withEntitlement(async (request, context, { supabase, user }) => { … });
 */
export function withEntitlement<C = StaticRouteContext>(
  handler: (request: NextRequest, context: C, auth: AuthedEntitlement) => Promise<NextResponse>,
  opts: { entitlementId?: string } = {}
) {
  return async function entitlementHandler(request: NextRequest, context: C): Promise<NextResponse> {
    const auth = await requireEntitlement(request, opts);
    if (auth instanceof NextResponse) return auth;
    return handler(request, context, auth);
  };
}
