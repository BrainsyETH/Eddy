// src/app/api/me/route.ts
// DELETE /api/me — delete the caller's account and their owned data.
//
// App Store Guideline 5.1.1(v): an app that lets you create an account must
// let you delete it from inside the app. Not deactivate, not "email support" —
// delete. This is the endpoint the Profile tab calls.
//
// The interesting part is in src/lib/account-deletion.ts, which explains why
// float_plans has to be removed by hand rather than left to the FK cascade.
//
// Anonymous callers are allowed. An anonymous session still owns starred
// rivers server-side, and "forget me" has to work for someone who never signed
// in — they have the least investment in the account and the most reason to
// want it gone.
//
// WHAT THIS DOES NOT DO: cancel an Apple subscription. It cannot — Apple owns
// that relationship and only the user can cancel, in their Apple ID settings.
// The response reports whether an active entitlement existed so the client can
// say so plainly; the client also warns BEFORE calling this, since afterwards
// there is no account left to show a warning in.

import { NextRequest, NextResponse } from 'next/server';
import { jsonPrivate } from '@/lib/api-utils';
import { rateLimit } from '@/lib/rate-limit';
import { requireUser } from '@/lib/supabase/request';
import { createAdminClient } from '@/lib/supabase/admin';
import { deleteAccount } from '@/lib/account-deletion';
import { DEFAULT_ENTITLEMENT_ID, isEntitlementActive } from '@/lib/entitlement';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireUser(request);
    if (auth instanceof NextResponse) return auth;
    const { supabase, user } = auth;

    // Deliberately tight, and fails CLOSED unlike the profile reads: this is
    // the one irreversible operation in the /api/me family. A client bug that
    // retries it in a loop should be stopped, and a limiter outage is a much
    // better reason to refuse than to proceed.
    // Keyed on the USER, never the IP — carrier NAT collapses thousands of
    // mobile subscribers into one bucket.
    const limited = await rateLimit(`me-delete:${user.id}`, 5, 60 * 60 * 1000, {
      failClosed: true,
    });
    if (limited) return limited;

    // Read through the CALLER's client, so it is their own row by RLS.
    const { data: entitlement } = await supabase
      .from('entitlements')
      .select('expires_at, environment')
      .eq('user_id', user.id)
      .eq('entitlement_id', DEFAULT_ENTITLEMENT_ID)
      .maybeSingle();

    const hadActiveEntitlement = isEntitlementActive(entitlement);

    // The deletion itself needs service role: removing an auth user is an
    // admin operation, and a deletion must not be quietly narrowed by a table
    // whose RLS happens not to grant DELETE. Identity was already verified
    // above from the caller's own JWT, and every statement is scoped to it.
    const result = await deleteAccount(createAdminClient(), user.id);

    logger.info('[account] deleted', {
      userId: user.id,
      isAnonymous: user.is_anonymous ?? false,
      hadActiveEntitlement,
      deleted: result.deleted,
    });

    return jsonPrivate({
      ok: true,
      deleted: result.deleted,
      // True means: the account is gone, but Apple will keep billing until
      // they cancel. The client turns this into a specific instruction.
      hadActiveEntitlement,
    });
  } catch (error) {
    // Partial failure lands here. account-deletion.ts orders its work so that
    // this leaves the account intact with its sensitive rows already removed,
    // which is the retryable direction.
    logger.error('[account] deletion failed', error);
    return jsonPrivate(
      { error: 'Could not delete account. Please try again.' },
      { status: 500 }
    );
  }
}
