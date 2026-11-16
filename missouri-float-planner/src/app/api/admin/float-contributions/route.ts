// GET /api/admin/float-contributions — contributed floats for private review:
// a per-route summary (measured moving pace vs Eddy's estimate), the rivers
// present, and one page of trips with any review decision.
//
// The summary needs every trip, so rows are read up to CONTRIBUTION_FETCH_CAP
// and paged here; `capped` says when that limit was reached.
import { NextRequest } from 'next/server';
import { requireAdminAuth } from '@/lib/admin-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { jsonPrivate } from '@/lib/api-utils';
import {
  CONTRIBUTION_FETCH_CAP,
  CONTRIBUTION_PAGE_SIZE,
  summarizeRoutes,
  type ContributionReview,
  type ContributionTrip,
} from '@/lib/admin/float-contributions';
import type { CompletedFloat } from '@shared/float-archive';

export const dynamic = 'force-dynamic';

/** Payloads are validated on upload; this only keeps a malformed row from breaking the page. */
function isCompletedFloat(p: unknown): p is CompletedFloat {
  const t = p as Partial<CompletedFloat> | null;
  return (
    !!t &&
    typeof t === 'object' &&
    typeof t.id === 'string' &&
    typeof t.riverSlug === 'string' &&
    typeof t.riverName === 'string' &&
    typeof t.takeOutName === 'string' &&
    typeof t.startedAt === 'number' &&
    typeof t.distanceMiles === 'number'
  );
}

export async function GET(request: NextRequest) {
  const denied = await requireAdminAuth(request);
  if (denied) return denied;
  try {
    const params = request.nextUrl.searchParams;
    const page = Math.max(1, Math.min(10000, Number(params.get('page')) || 1));
    const river = (params.get('river') ?? '').slice(0, 100);
    const supabase = createAdminClient();
    const [{ data, error }, reviewResult] = await Promise.all([
      supabase
        .from('float_archive')
        .select('user_id,id,payload,updated_at')
        .eq('kind', 'completed')
        .eq('contributing', true)
        .eq('deleted', false)
        .order('updated_at', { ascending: false })
        .order('user_id')
        .order('id')
        .limit(CONTRIBUTION_FETCH_CAP + 1),
      supabase.from('float_contribution_reviews').select('*'),
    ]);
    if (error) throw new Error('Review unavailable');

    // Reviews are optional: before their migration is applied the page still
    // works, read-only, and says so.
    const reviewsAvailable = !reviewResult.error;
    const reviews = new Map<string, ContributionReview>(
      (reviewResult.data ?? []).map((r) => [
        `${r.user_id}/${r.float_id}`,
        {
          decision: r.decision as ContributionReview['decision'],
          note: r.note,
          reviewedBy: r.reviewed_by,
          reviewedAt: r.reviewed_at,
        },
      ]),
    );

    const rows = data ?? [];
    const all: ContributionTrip[] = rows
      .slice(0, CONTRIBUTION_FETCH_CAP)
      .filter((row) => isCompletedFloat(row.payload))
      .map((row) => ({
        userId: row.user_id,
        floatId: row.id,
        updatedAt: row.updated_at,
        float: row.payload as unknown as CompletedFloat,
        review: reviews.get(`${row.user_id}/${row.id}`) ?? null,
      }));

    const riverCounts = new Map<string, { slug: string; name: string; trips: number }>();
    for (const t of all) {
      const entry = riverCounts.get(t.float.riverSlug) ?? { slug: t.float.riverSlug, name: t.float.riverName, trips: 0 };
      entry.trips++;
      riverCounts.set(t.float.riverSlug, entry);
    }
    const scoped = river ? all.filter((t) => t.float.riverSlug === river) : all;
    const from = (page - 1) * CONTRIBUTION_PAGE_SIZE;

    return jsonPrivate({
      summary: summarizeRoutes(scoped),
      rivers: [...riverCounts.values()].sort((a, b) => a.name.localeCompare(b.name)),
      trips: scoped.slice(from, from + CONTRIBUTION_PAGE_SIZE),
      count: scoped.length,
      accounts: new Set(scoped.map((t) => t.userId)).size,
      page,
      pageSize: CONTRIBUTION_PAGE_SIZE,
      capped: rows.length > CONTRIBUTION_FETCH_CAP,
      reviewsAvailable,
    });
  } catch {
    return jsonPrivate({ error: 'Could not load contributed floats' }, { status: 503 });
  }
}
