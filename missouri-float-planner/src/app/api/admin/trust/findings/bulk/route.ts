// src/app/api/admin/trust/findings/bulk/route.ts
// POST — resolve or snooze every open finding under one check+rule.
//
// The case this exists for: a check breaks and files the same false finding
// against every entity. get_river_geometry_json was absent from production, so
// river_geometry raised geometry_missing 24 times. Clearing that by hand is 24
// clicks, and 24 clicks is how an operator learns to stop reading the list.
//
// Scoped to check + rule rather than to an arbitrary id list, because that is
// the shape the real case takes and it is the shape an operator can verify: one
// cause, one decision, one confirmed count.

import { NextRequest, NextResponse } from 'next/server';
import { logAdminAction, requireAdminAuth } from '@/lib/admin-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { describeRefusal, planBulkAction } from '@/lib/trust/bulk';

export const dynamic = 'force-dynamic';

const ACTIONS = ['resolve', 'snooze'] as const;
type Action = (typeof ACTIONS)[number];

const MAX_SNOOZE_DAYS = 90;

export async function POST(request: NextRequest) {
  const authError = requireAdminAuth(request);
  if (authError) return authError;

  try {
    const body = await request.json().catch(() => ({}));
    const action: Action = body.action;
    const checkId: string = body.checkId;
    const ruleKey: string = body.ruleKey;
    const expectedCount: number = Number(body.expectedCount);
    const reason: string | undefined = body.reason;

    if (!ACTIONS.includes(action)) {
      return NextResponse.json(
        { error: `action must be one of ${ACTIONS.join(', ')}` },
        { status: 400 },
      );
    }
    if (!checkId || !ruleKey) {
      return NextResponse.json({ error: 'checkId and ruleKey are required' }, { status: 400 });
    }
    if (!Number.isInteger(expectedCount) || expectedCount < 0) {
      return NextResponse.json(
        { error: 'expectedCount must be the number of findings you are confirming' },
        { status: 400 },
      );
    }

    const supabase = createAdminClient();

    // Read the set inside the request. Trusting ids sent by the client would
    // make the count guard meaningless — the whole point is to compare what is
    // true now against what the operator was looking at.
    const { data: matched, error: readError } = await supabase
      .from('trust_findings')
      .select('id, title')
      .eq('check_id', checkId)
      .eq('rule_key', ruleKey)
      .eq('status', 'open');

    if (readError) {
      console.error('Error reading trust findings for bulk action:', readError);
      return NextResponse.json({ error: 'Could not read findings' }, { status: 500 });
    }

    const rows: { id: string; title: string }[] = matched ?? [];
    const plan = planBulkAction({
      matchedIds: rows.map((r) => r.id),
      expectedCount,
    });

    if (!plan.ok) {
      // 409, not 400: the request was well-formed, the world moved.
      return NextResponse.json(
        { error: describeRefusal(plan.refusal), refusal: plan.refusal },
        { status: 409 },
      );
    }

    const nowIso = new Date().toISOString();
    let update: Record<string, unknown>;

    if (action === 'snooze') {
      const days = Number(body.days ?? 7);
      if (!Number.isFinite(days) || days < 1 || days > MAX_SNOOZE_DAYS) {
        return NextResponse.json(
          { error: `days must be between 1 and ${MAX_SNOOZE_DAYS}` },
          { status: 400 },
        );
      }
      update = {
        status: 'snoozed',
        snoozed_until: new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString(),
        resolved_at: null,
      };
    } else {
      update = { status: 'resolved', resolved_at: nowIso, snoozed_until: null };
    }

    const { error: writeError } = await supabase
      .from('trust_findings')
      .update(update)
      .in('id', plan.ids);

    if (writeError) {
      console.error('Error applying bulk trust action:', writeError);
      return NextResponse.json({ error: 'Could not update findings' }, { status: 500 });
    }

    // One log row per finding, matching what the single-finding route writes.
    // A bulk action that logged once would make 24 closures look like one
    // decision in the audit trail, which is exactly the visibility this system
    // argues for everywhere else.
    for (const row of rows) {
      logAdminAction({
        action: `trust_finding_${action}`,
        entityType: 'trust_finding',
        entityId: row.id,
        entityName: row.title,
        details: { checkId, ruleKey, via: 'bulk', batchSize: plan.ids.length, reason: reason ?? null },
      });
    }

    return NextResponse.json({ updated: plan.ids.length, action, checkId, ruleKey });
  } catch (error) {
    console.error('Error in bulk trust action:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
