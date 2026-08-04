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
import { requireAdminAuth } from '@/lib/admin-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { describeRefusal, planBulkAction } from '@/lib/trust/bulk';
import { isOperatorResolution, OPERATOR_RESOLUTIONS } from '@/lib/trust/resolution';

export const dynamic = 'force-dynamic';

const ACTIONS = ['resolve', 'snooze'] as const;
type Action = (typeof ACTIONS)[number];

const MAX_SNOOZE_DAYS = 90;
/** Long enough to be a sentence, short enough not to be a chore. */
const MIN_REASON_LENGTH = 8;

export async function POST(request: NextRequest) {
  const authError = requireAdminAuth(request);
  if (authError) return authError;

  try {
    const body = await request.json().catch(() => ({}));
    const action: Action = body.action;
    const checkId: string = body.checkId;
    const ruleKey: string = body.ruleKey;
    const expectedCount: number = Number(body.expectedCount);
    // Required, not optional. The count guard stops the set CHANGING under the
    // operator; it does nothing about a misclick, and a bulk close is the one
    // action here that touches many rows at once. Typing why is the confirmation
    // step, and unlike a yes/no dialog it leaves something worth reading in the
    // activity log six weeks later.
    const reason: string = typeof body.reason === 'string' ? body.reason.trim() : '';

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
    if (reason.length < MIN_REASON_LENGTH) {
      return NextResponse.json(
        { error: `A reason of at least ${MIN_REASON_LENGTH} characters is required to close a group.` },
        { status: 400 },
      );
    }

    // A bulk close is the single most informative event this system produces
    // about its own accuracy, and it was recording the least.
    //
    // The case this route exists for — get_river_geometry_json missing from
    // production, river_geometry raising geometry_missing 24 times — is 24 false
    // positives in one keystroke. Closing them as an undifferentiated "resolved"
    // threw away the clearest possible signal that a check had been wrong, in
    // the exact moment it was most obvious.
    //
    // Only for `resolve`. A bulk snooze closes nothing, so it has no outcome to
    // classify — demanding one there would be a prompt for the sake of symmetry.
    if (action === 'resolve' && !isOperatorResolution(body.resolution)) {
      return NextResponse.json(
        { error: `resolution must be one of ${OPERATOR_RESOLUTIONS.join(', ')}` },
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
      update = {
        status: 'resolved',
        resolved_at: nowIso,
        snoozed_until: null,
        resolution: body.resolution,
      };
    }

    // `.eq('status','open')` is what turns this from a read-then-write into a
    // compare-and-set.
    //
    // The count guard alone only proves the set matched when it was READ. A
    // scheduled reconciliation running between the read and the write can
    // resolve a finding, or an operator can snooze one in another tab, and the
    // bulk update would then overwrite that newer state with a decision made
    // against a world that no longer exists. Re-asserting `open` in the write
    // itself means a row that moved is skipped rather than clobbered.
    //
    // `.select('id')` so the response can report what actually changed instead
    // of what was planned — the same distinction ledger.ts now makes between
    // applied and attempted counts.
    const { data: updatedRows, error: writeError } = await supabase
      .from('trust_findings')
      .update(update)
      .in('id', plan.ids)
      .eq('status', 'open')
      .select('id');

    if (writeError) {
      console.error('Error applying bulk trust action:', writeError);
      return NextResponse.json({ error: 'Could not update findings' }, { status: 500 });
    }

    const updatedIds: string[] = (updatedRows ?? []).map((r: { id: string }) => r.id);
    const skipped = plan.ids.length - updatedIds.length;

    // One log row per finding, matching what the single-finding route writes:
    // a bulk action logging once would make 24 closures look like one decision.
    //
    // Written as ONE awaited insert rather than a loop of fire-and-forget
    // logAdminAction() calls. That helper is async and never awaited elsewhere
    // in the codebase, which is survivable for a single row — but this route
    // would leave N promises in flight when it returns, and a serverless
    // function can be frozen the moment the response is sent. Losing the audit
    // trail for a bulk close is exactly the invisible change this system argues
    // against everywhere else.
    const titleById = new Map(rows.map((r) => [r.id, r.title]));
    const { error: auditError } = await supabase.from('admin_activity_log').insert(
      updatedIds.map((id) => ({
        action: `trust_finding_${action}`,
        entity_type: 'trust_finding',
        entity_id: id,
        entity_name: titleById.get(id) ?? null,
        details: {
          checkId,
          ruleKey,
          via: 'bulk',
          batchSize: updatedIds.length,
          reason,
          ...(action === 'resolve' ? { resolution: body.resolution } : {}),
        },
      })),
    );

    if (auditError) {
      // The findings are already updated. Say so loudly rather than reporting
      // a clean success over a missing audit trail.
      console.error('Bulk trust action applied but audit log failed:', auditError);
    }

    return NextResponse.json({
      updated: updatedIds.length,
      action,
      checkId,
      ruleKey,
      // Rows that moved between the read and the write. Zero is the normal case;
      // anything else means a scheduled run or another tab got there first, and
      // the operator should see the number rather than a count that silently
      // disagrees with the one they confirmed.
      skipped,
      // Reported rather than only logged. "The group was closed" and "the group
      // was closed and nobody will ever know who or why" are different outcomes,
      // and the console showed the same green message for both.
      auditLogged: !auditError,
      ...(auditError
        ? {
            warning: `Findings updated, but the audit records failed to write: ${auditError.message}`,
          }
        : {}),
    });
  } catch (error) {
    console.error('Error in bulk trust action:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
