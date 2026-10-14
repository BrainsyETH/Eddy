// src/app/api/admin/reports/[id]/ban-submitter/route.ts
// POST /api/admin/reports/[id]/ban-submitter — ban the account behind a report
// from submitting again, and take down everything it has already sent.
//
// App Store Guideline 1.2's "block abusive users from the service". The ban is
// keyed on the account and its Apple ID (see src/lib/reports/submitter-ban.ts),
// so deleting the account and signing in again does not lift it.
//
// Only reports filed with a session can be banned. The website and builds
// before photo sign-in submit anonymously, and those rows have no user_id: the
// answer for them is Reject, and this route says so instead of pretending.

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdminAuth, isValidUUID, invalidIdResponse, logAdminAction } from '@/lib/admin-auth';
import { applyMediaTransitions } from '@/lib/uploads/apply-media-transitions';
import { isSubmitterBanned, submitterKeys, type SubmitterKeys } from '@/lib/reports/submitter-ban';

export const dynamic = 'force-dynamic';

const MAX_REASON_LEN = 500;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authError = requireAdminAuth(request);
    if (authError) return authError;

    const { id } = await params;
    if (!isValidUUID(id)) return invalidIdResponse();

    const body = (await request.json().catch(() => ({}))) as { reason?: unknown };
    const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, MAX_REASON_LEN) : '';

    const supabase = createAdminClient();

    const { data: report, error: reportError } = await supabase
      .from('community_reports')
      .select('id, user_id')
      .eq('id', id)
      .maybeSingle();
    if (reportError) {
      console.error('[ban-submitter] Could not load report:', reportError.message);
      return NextResponse.json({ error: 'Could not load report' }, { status: 500 });
    }
    if (!report) return NextResponse.json({ error: 'Community report not found' }, { status: 404 });
    if (!report.user_id) {
      return NextResponse.json(
        { error: 'This report was submitted without an account, so there is no one to ban. Reject it instead.' },
        { status: 409 }
      );
    }

    // The Apple key is what survives account deletion. An account that is
    // already gone still gets a user_id ban; it just cannot add the Apple key.
    let keys: SubmitterKeys = { userId: report.user_id, appleSubjectHash: null };
    const { data: account } = await supabase.auth.admin.getUserById(report.user_id);
    if (account?.user) keys = submitterKeys(account.user);

    const alreadyBanned = await isSubmitterBanned(keys, (filter) =>
      supabase.from('banned_submitters').select('id').or(filter).limit(1)
    );
    if (!alreadyBanned) {
      const { error: banError } = await supabase.from('banned_submitters').insert({
        user_id: keys.userId,
        apple_subject_hash: keys.appleSubjectHash,
        source_report_id: report.id,
        reason: reason || null,
      });
      // 23505: a concurrent ban on the same key landed first — same outcome.
      if (banError && banError.code !== '23505') {
        console.error('[ban-submitter] Could not record ban:', banError.message);
        return NextResponse.json({ error: 'Could not ban submitter' }, { status: 500 });
      }
    }

    // Ban first, take down second: if the takedown fails the ban still holds,
    // and repeating the action finishes the job.
    const { data: rows, error: rowsError } = await supabase
      .from('community_reports')
      .select('id, image_path, image_url')
      .eq('user_id', keys.userId)
      .in('status', ['pending', 'verified']);
    if (rowsError) {
      console.error('[ban-submitter] Could not list submitter reports:', rowsError.message);
      return NextResponse.json(
        { error: 'Submitter banned, but their reports could not be listed. Try again to remove them.' },
        { status: 500 }
      );
    }

    const ids = (rows ?? []).map((row) => row.id as string);
    if (ids.length > 0) {
      const { error: updateError } = await supabase
        .from('community_reports')
        .update({ status: 'rejected', updated_at: new Date().toISOString() })
        .in('id', ids);
      if (updateError) {
        console.error('[ban-submitter] Could not reject submitter reports:', updateError.message);
        return NextResponse.json(
          { error: 'Submitter banned, but their reports could not be removed. Try again to remove them.' },
          { status: 500 }
        );
      }
      await applyMediaTransitions(supabase, 'rejected', rows ?? []);
    }

    await logAdminAction({
      action: 'ban_submitter',
      entityType: 'community_report',
      entityId: report.id,
      details: { userId: keys.userId, appleKey: Boolean(keys.appleSubjectHash), removed: ids.length, reason: reason || null },
    });

    return NextResponse.json({ banned: true, alreadyBanned, removed: ids.length });
  } catch (error) {
    console.error('Error in POST ban-submitter:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
