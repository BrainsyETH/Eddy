import type { SupabaseClient } from '@supabase/supabase-js';
import { appleCredentialsFromEnv, revokeAppleToken, type AppleCredentials, type RevokeResult } from './revoke';

export type AppleRevocationStatus = 'revoked' | 'pending' | 'missing_token' | 'not_applicable';
export interface PendingRevocation {
  id: string;
  refresh_token: string;
  attempts: number;
}
interface RevocationDeps {
  credentials?: AppleCredentials | null;
  revoke?: (token: string, credentials: AppleCredentials) => Promise<RevokeResult>;
  now?: () => number;
}

export function retryDelayMs(attempts: number): number {
  return Math.min(24 * 60 * 60_000, 5 * 60_000 * 2 ** Math.min(attempts, 9));
}

/** Tokens stay server-side and are never logged. */
export async function processRevocation(
  admin: SupabaseClient,
  row: PendingRevocation,
  deps: RevocationDeps = {},
): Promise<'revoked' | 'pending'> {
  const credentials = deps.credentials === undefined ? appleCredentialsFromEnv() : deps.credentials;
  let result: RevokeResult = { ok: false, error: 'not_configured' };
  if (credentials) {
    try {
      result = await (deps.revoke ?? revokeAppleToken)(row.refresh_token, credentials);
    } catch {
      result = { ok: false, error: 'request_failed' };
    }
  }
  if (result.ok) {
    const { error } = await admin.from('apple_token_revocations').delete().eq('id', row.id);
    if (error) throw new Error('Could not clear completed Apple revocation');
    return 'revoked';
  }
  // Persist fixed classifications only; SDK/network messages can contain secrets.
  const reason = !credentials ? 'not_configured' : 'apple_request_failed';
  const { error } = await admin.from('apple_token_revocations').update({
    attempts: row.attempts + 1,
    next_attempt_at: new Date((deps.now ?? Date.now)() + retryDelayMs(row.attempts)).toISOString(),
    last_error: reason,
  }).eq('id', row.id);
  if (error) throw new Error('Could not schedule Apple revocation retry');
  return 'pending';
}

/** Called only after auth deletion has atomically put the token in the outbox. */
export async function revokeDeletedAccount(
  admin: SupabaseClient,
  userId: string,
  appleAccount: boolean,
): Promise<AppleRevocationStatus> {
  const { data, error } = await admin.from('apple_token_revocations')
    .select('id, refresh_token, attempts').eq('id', userId).maybeSingle();
  if (error) throw new Error('Could not read pending Apple revocation');
  if (!data) return appleAccount ? 'missing_token' : 'not_applicable';
  return processRevocation(admin, data as PendingRevocation);
}

export async function drainAppleRevocations(admin: SupabaseClient, deps: RevocationDeps = {}) {
  const now = deps.now ?? Date.now;
  const { data, error } = await admin.from('apple_token_revocations')
    .select('id, refresh_token, attempts').lte('next_attempt_at', new Date(now()).toISOString())
    .order('next_attempt_at').limit(20);
  if (error) throw new Error('Could not read Apple revocation queue');
  const rows = (data ?? []) as PendingRevocation[];
  let revoked = 0;
  let pending = 0;
  // Small parallel batches keep a failed Apple endpoint within the cron budget.
  for (let offset = 0; offset < rows.length; offset += 5) {
    const results = await Promise.all(rows.slice(offset, offset + 5).map(row => processRevocation(admin, row, deps)));
    revoked += results.filter(result => result === 'revoked').length;
    pending += results.filter(result => result === 'pending').length;
  }
  return { checked: rows.length, revoked, pending };
}
