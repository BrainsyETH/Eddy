// src/lib/entitlement.ts
// Eddy+ entitlement guard for consumer (iOS) API routes.
//
// Two shapes, mirroring the existing guards in this codebase:
//   * requireEntitlement(request)  — imperative, like requireAdminAuth()
//   * withEntitlement(handler)     — HOF, like withX402Route()
//
// Entitlement state is NEVER a stored boolean: it is derived from the latest
// RevenueCat event's expires_at (see /api/webhooks/revenuecat). Grace periods
// arrive as an extended expires_at, so honoring expires_at also honors grace.
//
// Environment gating (Phase 0 decision — single Supabase project serves web +
// iOS): rows written by StoreKit sandbox / TestFlight purchases are tagged
// environment='SANDBOX' and are IGNORED unless ALLOW_SANDBOX_ENTITLEMENTS is
// set. That flag belongs on preview/dev deploys only — with it unset in
// production, a sandbox purchase can never unlock the paid product.

import { NextRequest, NextResponse } from 'next/server';
import { requirePermanentUser, type AuthedRequest } from '@/lib/supabase/request';

export const DEFAULT_ENTITLEMENT_ID = 'eddy_plus';

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
  return process.env.ALLOW_SANDBOX_ENTITLEMENTS === 'true';
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
      error: 'Eddy+ subscription required',
      code: reason,
      // The app turns this into the paywall; keep it machine-readable.
      entitlementId: DEFAULT_ENTITLEMENT_ID,
    },
    { status: 402, headers: { 'Cache-Control': 'private, no-store' } }
  );
}

/**
 * Authenticate the caller and require an active Eddy+ entitlement.
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
