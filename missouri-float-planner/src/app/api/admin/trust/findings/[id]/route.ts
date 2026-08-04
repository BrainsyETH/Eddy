// src/app/api/admin/trust/findings/[id]/route.ts
// PATCH — snooze, resolve, or reopen one finding.
//
// The only mutations v1 offers. There is no approval workflow and nothing here
// changes canonical data: the operator fixes the underlying problem by hand and
// the next check run notices. Resolving by hand is for the cases a check cannot
// see — a finding that was never real, or one fixed outside the data.

import { NextRequest, NextResponse } from 'next/server';
import { invalidIdResponse, isValidUUID, logAdminAction, requireAdminAuth } from '@/lib/admin-auth';
import { isOperatorResolution, OPERATOR_RESOLUTIONS } from '@/lib/trust/resolution';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

const ACTIONS = ['snooze', 'resolve', 'reopen'] as const;
type Action = (typeof ACTIONS)[number];

const MAX_SNOOZE_DAYS = 90;
/** Matches the bulk route, so the same sentence satisfies either path. */
const MIN_REASON_LENGTH = 8;

/**
 * Which single-finding actions have to say why.
 *
 * Closing or re-opening a finding is a judgement about data quality that no
 * check made — the route header has always said so — and a status transition
 * alone does not record the judgement, only its result. Six weeks later
 * "resolved" answers what happened and nothing about whether it was ever real.
 *
 * Snooze is deliberately exempt. It is bounded at 90 days, it self-expires, and
 * it is the cheapest and most-used control on the page; a prompt on every
 * "not now" is how an operator learns to stop using the console, which is the
 * failure mode bulk/route.ts's header is entirely about. A reason is still
 * recorded when one is supplied.
 */
const REASON_REQUIRED: ReadonlySet<Action> = new Set<Action>(['resolve', 'reopen']);

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authError = requireAdminAuth(request);
  if (authError) return authError;

  const { id } = await params;
  if (!isValidUUID(id)) return invalidIdResponse();

  try {
    const body = await request.json().catch(() => ({}));
    const action: Action = body.action;

    if (!ACTIONS.includes(action)) {
      return NextResponse.json(
        { error: `action must be one of ${ACTIONS.join(', ')}` },
        { status: 400 },
      );
    }

    const reason: string = typeof body.reason === 'string' ? body.reason.trim() : '';
    if (REASON_REQUIRED.has(action) && reason.length < MIN_REASON_LENGTH) {
      return NextResponse.json(
        {
          error: `A reason of at least ${MIN_REASON_LENGTH} characters is required to ${action} a finding.`,
        },
        { status: 400 },
      );
    }

    // Closing a finding must say WHICH kind of closing it is.
    //
    // "Somebody fixed the river" and "the check was wrong" are opposite
    // outcomes — one is the system working, the other is it crying wolf — and
    // status='resolved' scores them identically. The MVP gate's false-positive
    // rate is computed from this field and from nothing else, so a resolve that
    // does not carry one is not a smaller record, it is a missing measurement.
    if (action === 'resolve' && !isOperatorResolution(body.resolution)) {
      return NextResponse.json(
        { error: `resolution must be one of ${OPERATOR_RESOLUTIONS.join(', ')}` },
        { status: 400 },
      );
    }

    const supabase = createAdminClient();
    const { data: existing, error: loadError } = await supabase
      .from('trust_findings')
      .select('id, title, status, check_id')
      .eq('id', id)
      .maybeSingle();

    if (loadError) {
      console.error('Error loading trust finding:', loadError);
      return NextResponse.json({ error: 'Could not load finding' }, { status: 500 });
    }
    if (!existing) {
      return NextResponse.json({ error: 'Finding not found' }, { status: 404 });
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
      // A bounded snooze on purpose. An indefinite one is a delete with extra
      // steps, and the finding would never be heard from again even if the
      // problem got worse.
      const until = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
      update = { status: 'snoozed', snoozed_until: until, resolved_at: null };
    } else if (action === 'resolve') {
      update = {
        status: 'resolved',
        resolved_at: nowIso,
        snoozed_until: null,
        resolution: body.resolution,
      };
    } else {
      update = { status: 'open', resolved_at: null, snoozed_until: null };
    }

    const { data, error } = await supabase
      .from('trust_findings')
      .update(update)
      .eq('id', id)
      .select('id, status, snoozed_until, resolved_at')
      .single();

    if (error) {
      console.error('Error updating trust finding:', error);
      return NextResponse.json({ error: 'Could not update finding' }, { status: 500 });
    }

    // Manually closing a finding is a judgement about data quality that no check
    // made. It belongs in the audit log next to the other canonical edits.
    //
    // AWAITED. This was fire-and-forget, which on Vercel means the function can
    // be frozen the instant the response is sent — with the insert still in
    // flight. Every manual resolve, snooze and reopen could therefore leave no
    // record at all, and the one action whose entire purpose is to record a
    // human judgement was the one most likely to lose it.
    const audit = await logAdminAction({
      action: `trust_finding_${action}`,
      entityType: 'trust_finding',
      entityId: id,
      entityName: existing.title,
      details: {
        checkId: existing.check_id,
        from: existing.status,
        to: data.status,
        ...(action === 'resolve' ? { resolution: body.resolution } : {}),
        ...(reason ? { reason } : {}),
      },
    });

    return NextResponse.json({
      finding: {
        id: data.id,
        status: data.status,
        snoozedUntil: data.snoozed_until,
        resolvedAt: data.resolved_at,
      },
      // The finding IS updated — reversing it would be worse than saying so —
      // but the operator is told the trail is incomplete rather than shown a
      // clean success over a missing record.
      auditLogged: audit.ok,
      ...(audit.ok
        ? {}
        : { warning: `Finding updated, but the audit record failed to write: ${audit.error}` }),
    });
  } catch (error) {
    console.error('Error in trust finding PATCH:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
