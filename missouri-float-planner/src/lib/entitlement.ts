import { NextRequest, NextResponse } from 'next/server';
import { apiError } from '@/lib/api/errors';
import { requirePermanentUser, type AuthedRequest } from '@/lib/supabase/request';

export interface EntitledRequest extends AuthedRequest {
  entitlement: {
    entitlementId: string;
    expiresAt: string;
  };
}

export async function requireEntitlement(
  request: NextRequest,
  entitlementId = 'eddy_plus',
): Promise<EntitledRequest | NextResponse> {
  const auth = await requirePermanentUser(request);
  if (auth instanceof NextResponse) return auth;

  const { data, error } = await auth.supabase
    .from('entitlements')
    .select('entitlement_id, expires_at')
    .eq('user_id', auth.user.id)
    .eq('entitlement_id', entitlementId)
    .maybeSingle();

  if (error || !data?.expires_at || new Date(data.expires_at).getTime() <= Date.now()) {
    return apiError(402, 'entitlement_required', 'An active Eddy+ subscription is required');
  }

  return {
    ...auth,
    entitlement: { entitlementId: data.entitlement_id, expiresAt: data.expires_at },
  };
}

export function withEntitlement(
  handler: (request: NextRequest, auth: EntitledRequest) => Promise<NextResponse>,
  entitlementId = 'eddy_plus',
) {
  return async (request: NextRequest): Promise<NextResponse> => {
    const auth = await requireEntitlement(request, entitlementId);
    if (auth instanceof NextResponse) return auth;
    return handler(request, auth);
  };
}
