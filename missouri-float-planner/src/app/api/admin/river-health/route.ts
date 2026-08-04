// src/app/api/admin/river-health/route.ts
// GET /api/admin/river-health — Validate river geometry data quality
// Returns per-river diagnostics: coordinate density, length, gauge proximity, etc.
//
// The diagnostics themselves moved to src/lib/trust/checks/river-geometry.ts so
// the scheduled trust check and this page cannot drift apart, and so the rules
// can be unit-tested — they never were while they lived inline here. The
// response shape is unchanged; src/app/admin/data-sync/page.tsx reads it.
//
// This route still reports on EVERY river while the scheduled check looks only
// at active ones. An operator opening the page wants the whole table, including
// the draft river whose geometry is a to-do rather than a finding.

import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/admin-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { collectRiverHealth } from '@/lib/trust/checks/river-geometry';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const authError = requireAdminAuth(request);
  if (authError) return authError;

  try {
    const supabase = createAdminClient();
    const { rows } = await collectRiverHealth(supabase, { activeOnly: false });

    // The check carries issues as {ruleKey, message} so the ledger can
    // fingerprint them; this page has always rendered a plain string list.
    const rivers = rows.map((row) => ({
      ...row,
      issues: row.issues.map((issue) => issue.message),
    }));

    const summary = {
      totalRivers: rivers.length,
      activeRivers: rivers.filter((r) => r.active).length,
      riversWithIssues: rivers.filter((r) => r.issues.length > 0).length,
      totalIssues: rivers.reduce((sum, r) => sum + r.issues.length, 0),
    };

    return NextResponse.json({ summary, rivers });
  } catch (error) {
    console.error('Error in river health check:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
