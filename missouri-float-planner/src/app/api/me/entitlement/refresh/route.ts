// src/app/api/me/entitlement/refresh/route.ts
// POST /api/me/entitlement/refresh — reconcile the caller's entitlement with
// RevenueCat, on demand.
//
// ── Why the app needs to be able to ask ───────────────────────────────────
//
// Everywhere else, entitlement reaches us by webhook and the app simply waits
// (waitForEntitlement in the iOS client). That works because a purchase always
// produces an event carrying the state it implies.
//
// A RESTORE onto a new account does not. It produces a TRANSFER, which carries
// no entitlement state at all, and if the account that originally bought has
// since been deleted there is nothing left on our side to resolve it against —
// the row cascaded away with the auth user. Waiting, in that case, means
// waiting until the next renewal: up to a year on the annual plan, while being
// billed for it. See src/lib/revenuecat/api.ts for the full account.
//
// So the app asks. Note what it does NOT do: it never tells us what it bought.
// It asks the server to go and ask RevenueCat about the caller's own id, which
// keeps the webhook route's guarantee intact — a tampered client still cannot
// grant itself Eddy Premium, because RevenueCat has to agree.
//
// reconcileEntitlement() can only grant or extend, never revoke (see the expiry
// guard there), so this endpoint cannot be used to take anyone's access away
// either — including the caller's own.

import { NextRequest, NextResponse } from 'next/server';
import { jsonPrivate } from '@/lib/api-utils';
import { rateLimit } from '@/lib/rate-limit';
import { requirePermanentUser } from '@/lib/supabase/request';
import { createAdminClient } from '@/lib/supabase/admin';
import { DEFAULT_ENTITLEMENT_ID } from '@/lib/entitlement';
import { reconcileEntitlement } from '@/lib/revenuecat/api';
import type { MeEntitlementRefreshResponse } from '@/types/api';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    // Permanent accounts only, and definitionally so: the appUserID IS the
    // Supabase user id, and the app refuses to configure RevenueCat for an
    // anonymous one (eddy-ios/src/lib/purchases.ts). There is nothing to ask
    // RevenueCat about.
    const auth = await requirePermanentUser(request);
    if (auth instanceof NextResponse) return auth;
    const { user } = auth;

    // Fails CLOSED, unlike /api/me/profile. This one reaches a paid third-party
    // API on every call, so an unbounded retry loop is somebody else's bill.
    // Ten in fifteen minutes is far more than a restore needs and far less than
    // a loop would make.
    //
    // And it REQUIRES the global limiter: failClosed alone still falls back to
    // a per-instance map when Upstash is not configured, which for this route
    // means ten per fifteen minutes per lambda, times the fan-out. Without
    // Upstash in production this answers 503 — loudly, in the logs — and the
    // Restore button goes on to poll /api/me/profile as it always did, so the
    // webhook path still resolves the entitlement. Configure
    // UPSTASH_REDIS_REST_URL/TOKEN in the Vercel project to turn it on.
    const limited = await rateLimit(`entitlement-refresh:${user.id}`, 10, 15 * 60 * 1000, {
      failClosed: true,
      requireGlobalLimiter: true,
    });
    if (limited) return limited;

    const outcome = await reconcileEntitlement(createAdminClient(), {
      userId: user.id,
      entitlementId: DEFAULT_ENTITLEMENT_ID,
    });

    if (outcome.status === 'error') {
      console.error('[entitlement-refresh] reconcile failed:', outcome.detail);
    }

    // 200 for every outcome, including the ones that found nothing. The caller
    // is a Restore button that goes on to poll /api/me/profile regardless; an
    // error status here would turn "RevenueCat was slow" into a failed restore.
    const response: MeEntitlementRefreshResponse = {
      refreshed: outcome.status === 'granted',
      status: outcome.status,
      expiresAt: outcome.expiresAt,
    };
    return jsonPrivate(response);
  } catch (error) {
    console.error('[entitlement-refresh] unexpected failure:', error);
    return jsonPrivate({ error: 'Could not refresh subscription' }, { status: 500 });
  }
}
