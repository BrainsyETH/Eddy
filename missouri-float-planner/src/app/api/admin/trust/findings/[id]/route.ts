// src/app/api/admin/trust/findings/[id]/route.ts
// PATCH — snooze, resolve, or reopen one finding.
//
// The only mutations v1 offers. There is no approval workflow and nothing here
// changes canonical data: the operator fixes the underlying problem by hand and
// the next check run notices. Resolving by hand is for the cases a check cannot
// see — a finding that was never real, or one fixed outside the data.

import { NextRequest, NextResponse } from 'next/server';
import { invalidIdResponse, isValidUUID, logAdminAction, requireAdminAuth } from '@/lib/admin-auth';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

const ACTIONS = ['snooze', 'resolve', 'reopen'] as const;
type Action = (typeof ACTIONS)[number];

const MAX_SNOOZE_DAYS = 90;

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
      update = { status: 'resolved', resolved_at: nowIso, snoozed_until: null };
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
    logAdminAction({
      action: `trust_finding_${action}`,
      entityType: 'trust_finding',
      entityId: id,
      entityName: existing.title,
      details: { checkId: existing.check_id, from: existing.status, to: data.status },
    });

    return NextResponse.json({
      finding: {
        id: data.id,
        status: data.status,
        snoozedUntil: data.snoozed_until,
        resolvedAt: data.resolved_at,
      },
    });
  } catch (error) {
    console.error('Error in trust finding PATCH:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
