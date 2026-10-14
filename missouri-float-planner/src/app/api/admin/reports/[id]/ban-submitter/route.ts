// src/app/api/admin/reports/[id]/ban-submitter/route.ts
// POST /api/admin/reports/[id]/ban-submitter — ban the account behind a report
// from submitting again, and take down everything it has already sent.
//
// App Store Guideline 1.2's "block abusive users from the service". The ban is
// keyed on the account and its Apple ID (see src/lib/reports/submitter-ban.ts),
// so deleting the account and signing in again does not lift it. The steps and
// their failure handling live in src/lib/reports/ban-submitter.ts; this route
// wires them to Supabase.
//
// Only reports filed with a session can be banned. The website and builds
// before photo sign-in submit anonymously, and those rows have no user_id: the
// answer for them is Reject, and this route says so instead of pretending.

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdminAuth, isValidUUID, invalidIdResponse, logAdminAction } from '@/lib/admin-auth';
import { applyMediaTransitions } from '@/lib/uploads/apply-media-transitions';
import { banSubmitter, type SubmitterReportRow } from '@/lib/reports/ban-submitter';
import { SubmitterBanLookupError } from '@/lib/reports/submitter-ban';

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

    const result = await banSubmitter(
      { userId: report.user_id, sourceReportId: report.id, reason: reason || null },
      {
        getAccount: async (userId) => {
          const { data, error } = await supabase.auth.admin.getUserById(userId);
          return { user: data?.user ?? null, error };
        },
        findBan: (filter) => supabase.from('banned_submitters').select('id').or(filter).limit(1),
        insertBan: (row) => supabase.from('banned_submitters').insert(row),
        backfillAppleHash: (userId, hash) =>
          supabase
            .from('banned_submitters')
            .update({ apple_subject_hash: hash })
            .eq('user_id', userId)
            .is('apple_subject_hash', null),
        listSubmitterReports: (userId) =>
          supabase
            .from('community_reports')
            .select('id, status, image_path, image_url')
            .eq('user_id', userId)
            .returns<SubmitterReportRow[]>(),
        rejectReports: (ids) =>
          supabase
            .from('community_reports')
            .update({ status: 'rejected', updated_at: new Date().toISOString() })
            .in('id', ids),
        takedownMedia: (rows) => applyMediaTransitions(supabase, 'rejected', rows),
      },
    );

    if (!result.ok) {
      console.error('[ban-submitter]', result.error, { reportId: report.id });
      return NextResponse.json({ error: result.error, banned: result.banned }, { status: result.status });
    }

    await logAdminAction({
      action: 'ban_submitter',
      entityType: 'community_report',
      entityId: report.id,
      details: {
        userId: report.user_id,
        appleKey: result.appleKey,
        rejected: result.rejected,
        mediaRemoved: result.mediaRemoved,
        reason: reason || null,
      },
    });

    return NextResponse.json({
      banned: true,
      alreadyBanned: result.alreadyBanned,
      removed: result.rejected,
      mediaRemoved: result.mediaRemoved,
    });
  } catch (error) {
    if (error instanceof SubmitterBanLookupError) {
      console.error('[ban-submitter] Ban lookup unavailable:', error.cause);
      return NextResponse.json({ error: 'Could not check existing bans. Try again.' }, { status: 503 });
    }
    console.error('Error in POST ban-submitter:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
