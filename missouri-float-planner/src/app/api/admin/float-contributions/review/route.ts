// PUT /api/admin/float-contributions/review — set or clear the review decision
// on one contributed float. Only a trip that is still contributed can be
// reviewed; the decision is evidence for admins and never changes estimates.
import { NextRequest } from 'next/server';
import { getAdminIdentity, requireAdminAuth } from '@/lib/admin-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { jsonPrivate } from '@/lib/api-utils';
import { withAdminMutation } from '@/lib/admin/mutation-audit';
import { parseReviewBody, type ContributionReview } from '@/lib/admin/float-contributions';

export const dynamic = 'force-dynamic';

async function handlePUT(request: NextRequest) {
  const denied = await requireAdminAuth(request);
  if (denied) return denied;
  try {
    const parsed = parseReviewBody(await request.json().catch(() => null));
    if ('error' in parsed) return jsonPrivate({ error: parsed.error }, { status: 400 });
    const { userId, floatId, decision, note } = parsed;
    const supabase = createAdminClient();

    const { data: trip, error: tripError } = await supabase
      .from('float_archive')
      .select('id')
      .eq('user_id', userId)
      .eq('id', floatId)
      .eq('kind', 'completed')
      .eq('contributing', true)
      .eq('deleted', false)
      .maybeSingle();
    if (tripError) throw new Error('lookup failed');
    if (!trip) {
      return jsonPrivate(
        { error: 'This trip is no longer contributed. Refresh the list.' },
        { status: 404 },
      );
    }

    if (decision === null) {
      const { error } = await supabase
        .from('float_contribution_reviews')
        .delete()
        .eq('user_id', userId)
        .eq('float_id', floatId);
      if (error) throw new Error('clear failed');
      return jsonPrivate({ review: null });
    }

    const review = {
      user_id: userId,
      float_id: floatId,
      decision,
      note,
      reviewed_by: getAdminIdentity(request)?.name ?? 'Owner recovery',
      reviewed_at: new Date().toISOString(),
    };
    const { error } = await supabase
      .from('float_contribution_reviews')
      .upsert(review, { onConflict: 'user_id,float_id' });
    if (error) throw new Error('save failed');
    const saved: ContributionReview = {
      decision,
      note,
      reviewedBy: review.reviewed_by,
      reviewedAt: review.reviewed_at,
    };
    return jsonPrivate({ review: saved });
  } catch {
    return jsonPrivate(
      { error: 'Could not save the review. If this persists, check that the review migration is applied.' },
      { status: 503 },
    );
  }
}

export const PUT = withAdminMutation(handlePUT);
