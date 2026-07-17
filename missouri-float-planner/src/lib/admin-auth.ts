// src/lib/admin-auth.ts
// Server-side admin authentication utilities
// All admin API routes must call requireAdminAuth() before processing requests

import { NextRequest, NextResponse } from 'next/server';
import { createHmac } from 'crypto';

const TOKEN_EXPIRY_MS = 4 * 60 * 60 * 1000; // 4 hours

/**
 * Returns the admin secret used for token derivation.
 * Uses ADMIN_API_SECRET if set, otherwise derives from ADMIN_PASSWORD.
 */
function getAdminSecret(): string | null {
  return process.env.ADMIN_API_SECRET || process.env.ADMIN_PASSWORD || null;
}

/**
 * Creates a time-limited admin token.
 * Token format: <expiry_timestamp>.<hmac_signature>
 * The token never contains the raw password.
 */
export function createAdminToken(): string {
  const secret = getAdminSecret();
  if (!secret) throw new Error('No admin secret configured');

  const expiresAt = Date.now() + TOKEN_EXPIRY_MS;
  const signature = createHmac('sha256', secret)
    .update(`admin:${expiresAt}`)
    .digest('hex');

  return `${expiresAt}.${signature}`;
}

// Machine-readable reason a token was rejected. Surfaced in server logs and the
// 401 response body so an "always unauthorized" report can be pinned to a cause
// (expired session vs. a token signed with a different/rotated secret vs. a
// stale malformed token) instead of a blank "Unauthorized".
type TokenRejection = 'malformed' | 'expired' | 'bad-signature';

/**
 * Validates a time-limited admin token. Returns null when valid, otherwise a
 * short reason describing why it was rejected.
 */
function validateAdminToken(token: string): TokenRejection | null {
  const secret = getAdminSecret();
  if (!secret) return 'bad-signature';

  // NOTE: the legacy "raw secret as bearer token" path was removed — it never
  // expired and let the shared password be replayed indefinitely. Clients must
  // now present a time-limited HMAC token from POST /api/admin/login. A token
  // minted by that old flow (or before a secret rotation) still lives in some
  // browsers' sessionStorage and lands here as 'malformed'/'bad-signature'.

  // Validate time-limited token format: <expiry>.<signature>
  const dotIndex = token.indexOf('.');
  if (dotIndex === -1) return 'malformed';

  const expiresAt = parseInt(token.substring(0, dotIndex), 10);
  const signature = token.substring(dotIndex + 1);

  if (isNaN(expiresAt)) return 'malformed';

  // Check expiration
  if (Date.now() > expiresAt) return 'expired';

  // Verify signature
  const expectedSignature = createHmac('sha256', secret)
    .update(`admin:${expiresAt}`)
    .digest('hex');

  // Constant-time comparison to prevent timing attacks
  if (signature.length !== expectedSignature.length) return 'bad-signature';
  let mismatch = 0;
  for (let i = 0; i < signature.length; i++) {
    mismatch |= signature.charCodeAt(i) ^ expectedSignature.charCodeAt(i);
  }
  return mismatch === 0 ? null : 'bad-signature';
}

/**
 * Verifies the admin Authorization header.
 * Returns null if authorized, or a 401/500 NextResponse if not.
 *
 * Usage in admin API routes:
 *   const authError = requireAdminAuth(request);
 *   if (authError) return authError;
 */
export function requireAdminAuth(request: NextRequest): NextResponse | null {
  const secret = getAdminSecret();

  if (!secret) {
    console.error('[Admin Auth] No admin secret configured (set ADMIN_API_SECRET or ADMIN_PASSWORD)');
    return NextResponse.json(
      { error: 'Server configuration error' },
      { status: 500 }
    );
  }

  const path = request.nextUrl?.pathname;

  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    console.warn(`[Admin Auth] Rejected ${path}: no Bearer token`);
    return NextResponse.json(
      { error: 'Unauthorized', reason: 'no-token' },
      { status: 401 }
    );
  }

  const token = authHeader.substring(7);
  const rejection = validateAdminToken(token);
  if (rejection) {
    // Distinct server log per cause: 'expired' is a normal 4h timeout, while a
    // steady stream of 'bad-signature' points at an ADMIN_API_SECRET /
    // ADMIN_PASSWORD mismatch between the deploy that minted the token and the
    // one validating it (e.g. a rotated or per-environment secret).
    console.warn(`[Admin Auth] Rejected ${path}: token ${rejection}`);
    const message =
      rejection === 'expired'
        ? 'Unauthorized — session expired, please sign in again'
        : 'Unauthorized — invalid token, please sign in again';
    return NextResponse.json(
      { error: message, reason: rejection },
      { status: 401 }
    );
  }

  return null;
}

/**
 * Validates that a string is a valid UUID v4 format.
 * Use this to validate path parameters before passing to Supabase.
 */
export function isValidUUID(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

/**
 * Returns a 400 response for invalid UUID path parameters.
 */
export function invalidIdResponse(): NextResponse {
  return NextResponse.json(
    { error: 'Invalid ID format' },
    { status: 400 }
  );
}

/**
 * Logs an admin action to the admin_activity_log table.
 * Fire-and-forget: errors are caught and logged, never thrown.
 */
export async function logAdminAction(params: {
  action: string;
  entityType: string;
  entityId?: string;
  entityName?: string;
  details?: Record<string, unknown>;
}): Promise<void> {
  try {
    const { createAdminClient } = await import('@/lib/supabase/admin');
    const supabase = createAdminClient();

    await supabase.from('admin_activity_log').insert({
      action: params.action,
      entity_type: params.entityType,
      entity_id: params.entityId || null,
      entity_name: params.entityName || null,
      details: params.details || null,
    });
  } catch (error) {
    console.error('[logAdminAction] Failed to log admin action:', error);
  }
}
