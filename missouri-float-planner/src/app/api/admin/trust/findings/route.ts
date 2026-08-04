// src/app/api/admin/trust/findings/route.ts
// GET /api/admin/trust/findings — the ledger, filtered and paged.

import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/admin-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { remediationFor } from '@/lib/trust/remediation';

export const dynamic = 'force-dynamic';

const MAX_LIMIT = 200;
const VALID_STATUSES = ['open', 'snoozed', 'resolved'];
const VALID_SEVERITIES = ['critical', 'high', 'medium', 'low'];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toFinding(row: any) {
  return {
    id: row.id,
    fingerprint: row.fingerprint,
    checkId: row.check_id,
    ruleKey: row.rule_key,
    entityType: row.entity_type,
    entityKey: row.entity_key,
    severity: row.severity,
    status: row.status,
    title: row.title,
    detail: row.detail,
    evidence: row.evidence,
    firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at,
    resolvedAt: row.resolved_at,
    snoozedUntil: row.snoozed_until,
    occurrences: row.occurrences,
    // Derived per rule rather than stored per row, so improving the guidance
    // reaches findings that are already open — which are the ones somebody is
    // stuck on. See src/lib/trust/remediation.ts.
    remediation: remediationFor(row.rule_key),
  };
}

export async function GET(request: NextRequest) {
  const authError = requireAdminAuth(request);
  if (authError) return authError;

  try {
    const params = request.nextUrl.searchParams;
    const status = params.get('status');
    const severity = params.get('severity');
    const checkId = params.get('checkId');
    const page = Math.max(1, Number(params.get('page') ?? 1) || 1);
    const limit = Math.min(MAX_LIMIT, Math.max(1, Number(params.get('limit') ?? 50) || 50));

    if (status && !VALID_STATUSES.includes(status)) {
      return NextResponse.json({ error: `status must be one of ${VALID_STATUSES.join(', ')}` }, { status: 400 });
    }
    if (severity && !VALID_SEVERITIES.includes(severity)) {
      return NextResponse.json({ error: `severity must be one of ${VALID_SEVERITIES.join(', ')}` }, { status: 400 });
    }

    const supabase = createAdminClient();
    let query = supabase.from('trust_findings').select('*', { count: 'exact' });

    if (status) query = query.eq('status', status);
    if (severity) query = query.eq('severity', severity);
    if (checkId) query = query.eq('check_id', checkId);

    const from = (page - 1) * limit;
    const { data, count, error } = await query
      // severity_rank, not severity: the text sorts alphabetically and would put
      // low above medium. Explicit ordering is also mandatory with .range() —
      // unordered windows repeat and skip rows, the way it cost
      // sync-gauge-latest ~3,500 stations on its first run.
      .order('severity_rank', { ascending: true })
      .order('last_seen_at', { ascending: false })
      .order('id', { ascending: true })
      .range(from, from + limit - 1);

    if (error) {
      console.error('Error loading trust findings:', error);
      return NextResponse.json({ error: 'Could not load findings' }, { status: 500 });
    }

    return NextResponse.json({
      items: (data ?? []).map(toFinding),
      total: count ?? 0,
      page,
      limit,
    });
  } catch (error) {
    console.error('Error in trust findings route:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
