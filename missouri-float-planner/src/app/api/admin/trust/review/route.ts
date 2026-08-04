// src/app/api/admin/trust/review/route.ts
// GET — how the ledger is scoring against the Trust MVP gate.
//
// The gate in docs/EDDY_AGENT_FRAMEWORK_PLAN.md is four weeks of operation with
// fewer than 20% false positives among REVIEWED findings, the known
// safety-critical set closed and staying closed, and a queue that stays
// bounded. Every one of those was previously answerable only by writing SQL by
// hand, which means in practice it was answerable by nobody, which means the
// gate was decoration.
//
// This is the whole gate on one endpoint, so passing or failing it is a thing
// the console can state rather than a thing somebody remembers to compute.

import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/admin-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { mustRow, mustRows } from '@/lib/trust/db';
import { rateIsMeaningful, reviewMetrics, MIN_REVIEWS_FOR_RATE } from '@/lib/trust/resolution';
import { assessBaseline, SAFETY_BASELINE } from '@/lib/trust/baseline';
import { SHADOW_OPERATION_DAYS } from '@/lib/trust/decay';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const authError = requireAdminAuth(request);
  if (authError) return authError;

  try {
    const supabase = createAdminClient();
    const now = new Date();

    // Only closed rows carry a resolution, and the column is indexed for
    // exactly this filter.
    const closed = await mustRows<{ resolution: string | null }>(
      supabase.from('trust_findings').select('resolution').eq('status', 'resolved'),
      'could not read resolved findings',
    );

    const metrics = reviewMetrics(closed);

    // The baseline is judged against what is OPEN right now. A known
    // safety-critical defect that closed and came back is open again, and that
    // is the only state that matters here.
    const open = await mustRows<{ rule_key: string; entity_key: string; check_id: string }>(
      supabase
        .from('trust_findings')
        .select('rule_key, entity_key, check_id')
        .in('status', ['open', 'snoozed']),
      'could not read open findings',
    );

    const baseline = assessBaseline(SAFETY_BASELINE, open);

    // "Four weeks of real operation" is measured from the ledger's own first
    // run, not from a date in a document. A redeployment does not restart it and
    // nobody has to remember when it began.
    const firstRun = await mustRow<{ started_at: string }>(
      supabase
        .from('trust_runs')
        .select('started_at')
        .order('started_at', { ascending: true })
        .limit(1)
        .maybeSingle(),
      'could not read the first trust run',
    );

    const startedAt = firstRun?.started_at ? new Date(firstRun.started_at) : null;
    const daysOperating = startedAt
      ? Math.floor((now.getTime() - startedAt.getTime()) / 86_400_000)
      : 0;

    const openCount = open.length;

    return NextResponse.json({
      gate: {
        // Every criterion reports `null` rather than `false` when it cannot yet
        // be judged. "Not measured" and "failing" are different answers, and
        // rendering the first as the second is how a dashboard trains an
        // operator to ignore it.
        operationDays: { value: daysOperating, required: SHADOW_OPERATION_DAYS, met: daysOperating >= SHADOW_OPERATION_DAYS },
        falsePositives: {
          rate: metrics.falsePositiveRate,
          reviewed: metrics.reviewed,
          minimumReviews: MIN_REVIEWS_FOR_RATE,
          meaningful: rateIsMeaningful(metrics),
          met: rateIsMeaningful(metrics) ? metrics.meetsGate : null,
        },
        safetyBaseline: {
          total: baseline.total,
          regressed: baseline.regressed.map((e) => ({
            id: e.id,
            summary: e.summary,
            closedBy: e.closedBy,
          })),
          met: baseline.allClosed,
        },
        boundedQueue: { open: openCount, met: null },
      },
      tally: metrics.tally,
      startedAt: startedAt?.toISOString() ?? null,
    });
  } catch (error) {
    console.error('Error computing trust review metrics:', error);
    return NextResponse.json(
      {
        error: 'Could not compute review metrics',
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
