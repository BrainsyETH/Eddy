// src/lib/reports/ban-submitter.ts
// The steps behind POST /api/admin/reports/[id]/ban-submitter, against a port
// so the failure paths can be tested without Supabase.
//
// Two properties the route depends on:
//
// 1. A ban is never recorded weaker than it should be. The Apple key is what
//    survives account deletion, and it comes from the Auth service. An Auth
//    outage is therefore an error — not "account has no Apple identity" — and
//    a retry of a ban that lacks the key adds it.
// 2. A retry finishes the takedown. Rejecting a report and deleting its photo
//    are separate steps; a rejected row that still references media is
//    outstanding cleanup, so it is selected again until the delete succeeds.

import {
  isSubmitterBanned,
  submitterKeys,
  type SubmitterKeys,
} from '@/lib/reports/submitter-ban';

type DbError = { code?: string; message: string } | null;

export interface SubmitterReportRow {
  id: string;
  status: string;
  image_path: string | null;
  image_url: string | null;
}

export interface BanPort {
  getAccount(userId: string): Promise<{
    user: { id: string; identities?: Array<{ id?: string | null; provider?: string | null; identity_data?: Record<string, unknown> | null }> | null } | null;
    error: { status?: number; code?: string; message?: string } | null;
  }>;
  findBan(filter: string): PromiseLike<{ data: unknown[] | null; error: unknown }>;
  insertBan(row: { user_id: string; apple_subject_hash: string | null; source_report_id: string; reason: string | null }): PromiseLike<{ error: DbError }>;
  /** Set the Apple key on this user's ban row when it has none. */
  backfillAppleHash(userId: string, appleSubjectHash: string): PromiseLike<{ error: DbError }>;
  listSubmitterReports(userId: string): PromiseLike<{ data: SubmitterReportRow[] | null; error: DbError }>;
  rejectReports(ids: string[]): PromiseLike<{ error: DbError }>;
  takedownMedia(rows: SubmitterReportRow[]): Promise<{ removed: number; failed: number }>;
}

export type BanResult =
  | { ok: true; alreadyBanned: boolean; appleKey: boolean; rejected: number; mediaRemoved: number }
  | { ok: false; status: number; banned: boolean; error: string };

/** Auth's answer for an account that no longer exists, as opposed to one it could not look up. */
export function isMissingAccount(error: { status?: number; code?: string }): boolean {
  return error.status === 404 || error.code === 'user_not_found';
}

export async function banSubmitter(
  input: { userId: string; sourceReportId: string; reason: string | null },
  port: BanPort,
): Promise<BanResult> {
  const account = await port.getAccount(input.userId);
  let keys: SubmitterKeys;
  if (account.error) {
    if (!isMissingAccount(account.error)) {
      return {
        ok: false,
        status: 503,
        banned: false,
        error: 'Could not reach the account service, so nothing was banned. Try again.',
      };
    }
    // Deleted account: its user_id is all there is left to ban.
    keys = { userId: input.userId, appleSubjectHash: null };
  } else {
    keys = account.user ? submitterKeys(account.user) : { userId: input.userId, appleSubjectHash: null };
  }

  const alreadyBanned = await isSubmitterBanned(keys, (filter) => port.findBan(filter));
  if (!alreadyBanned) {
    const { error } = await port.insertBan({
      user_id: keys.userId,
      apple_subject_hash: keys.appleSubjectHash,
      source_report_id: input.sourceReportId,
      reason: input.reason,
    });
    // 23505: a concurrent ban on the same key landed first — same outcome.
    if (error && error.code !== '23505') {
      return { ok: false, status: 500, banned: false, error: 'Could not ban submitter' };
    }
  }
  // Idempotent, and the repair for a ban first recorded without the key.
  // 23505 means another ban row already holds this Apple key: still banned.
  if (keys.appleSubjectHash) {
    const { error } = await port.backfillAppleHash(keys.userId, keys.appleSubjectHash);
    if (error && error.code !== '23505') {
      return {
        ok: false,
        status: 500,
        banned: true,
        error: 'Submitter banned, but the Apple ID could not be added to the ban. Try again.',
      };
    }
  }

  // Ban first, take down second: the ban holds even if what follows fails.
  const { data: rows, error: listError } = await port.listSubmitterReports(keys.userId);
  if (listError) {
    return {
      ok: false,
      status: 500,
      banned: true,
      error: 'Submitter banned, but their reports could not be listed. Try again to remove them.',
    };
  }
  const live = (rows ?? []).filter((row) => row.status === 'pending' || row.status === 'verified');
  // Every row still referencing media, rejected ones included: a rejected row
  // keeps its references only while an earlier delete is unfinished.
  const withMedia = (rows ?? []).filter((row) => row.image_path || row.image_url);

  if (live.length > 0) {
    const { error } = await port.rejectReports(live.map((row) => row.id));
    if (error) {
      return {
        ok: false,
        status: 500,
        banned: true,
        error: 'Submitter banned, but their reports could not be removed. Try again to remove them.',
      };
    }
  }

  const media = withMedia.length > 0 ? await port.takedownMedia(withMedia) : { removed: 0, failed: 0 };
  if (media.failed > 0) {
    return {
      ok: false,
      status: 500,
      banned: true,
      error: `Submitter banned and reports removed, but ${media.failed} photo${media.failed === 1 ? '' : 's'} could not be deleted from storage. Try again to finish.`,
    };
  }

  return {
    ok: true,
    alreadyBanned,
    appleKey: Boolean(keys.appleSubjectHash),
    rejected: live.length,
    mediaRemoved: media.removed,
  };
}
