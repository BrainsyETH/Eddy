// src/lib/reports/submitter-ban.ts
// Who a report came from, and whether a moderator has banned them.
//
// App Store Guideline 1.2 asks for a way to block abusive users. The iOS app
// requires Sign in with Apple before a photo can be submitted, so a report
// arrives with a verified account; this module turns that account into the
// keys stored in public.banned_submitters (migration 20261014185949) and
// answers whether either key is banned.
//
// The Apple key exists because an account is cheap to replace: deleting it and
// signing in again with the same Apple ID creates a fresh user_id. The Apple
// `sub` is stable for an Apple ID within this app, so it is what keeps a ban.
// Only its hash is stored; nothing here needs the subject back.

import { createHash } from 'node:crypto';

export interface SubmitterKeys {
  userId: string;
  appleSubjectHash: string | null;
}

interface IdentityLike {
  id?: string | null;
  provider?: string | null;
  identity_data?: Record<string, unknown> | null;
}

export function hashAppleSubject(subject: string): string {
  return createHash('sha256').update(`apple:${subject}`).digest('hex');
}

/** The ban keys for a verified Supabase user. */
export function submitterKeys(user: { id: string; identities?: IdentityLike[] | null }): SubmitterKeys {
  const apple = (user.identities ?? []).find((identity) => identity.provider === 'apple');
  const dataSub = apple?.identity_data?.sub;
  const subject = typeof dataSub === 'string' && dataSub ? dataSub : apple?.id || null;
  return {
    userId: user.id,
    appleSubjectHash: subject ? hashAppleSubject(subject) : null,
  };
}

/** PostgREST `or` filter matching a ban on either key. Both values are uuid/hex, so no escaping is needed. */
export function banMatchFilter(keys: SubmitterKeys): string {
  const clauses = [`user_id.eq.${keys.userId}`];
  if (keys.appleSubjectHash) clauses.push(`apple_subject_hash.eq.${keys.appleSubjectHash}`);
  return clauses.join(',');
}

export class SubmitterBanLookupError extends Error {
  constructor(cause: unknown) {
    super('Could not check submitter ban', { cause });
    this.name = 'SubmitterBanLookupError';
  }
}

/**
 * True when either key is banned. A failed lookup THROWS rather than answering
 * false: a ban that silently stops applying whenever the table is unreachable
 * is not a ban, so the route answers 503 instead.
 */
export async function isSubmitterBanned(
  keys: SubmitterKeys,
  lookup: (filter: string) => PromiseLike<{ data: unknown[] | null; error: unknown }>,
): Promise<boolean> {
  let result: { data: unknown[] | null; error: unknown };
  try {
    result = await lookup(banMatchFilter(keys));
  } catch (error) {
    throw new SubmitterBanLookupError(error);
  }
  if (result.error) throw new SubmitterBanLookupError(result.error);
  return (result.data?.length ?? 0) > 0;
}
