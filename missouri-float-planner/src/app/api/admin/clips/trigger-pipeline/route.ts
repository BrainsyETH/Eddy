import { withAdminMutation } from '@/lib/admin/mutation-audit';
// src/app/api/admin/clips/trigger-pipeline/route.ts
// POST — Dispatch the YouTube clip pipeline GitHub Actions workflow

import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/admin-auth';
import { triggerClipPipeline } from '@/lib/social/video-renderer';
import { parseClipPipelineInputs } from '@/lib/social/workflow-inputs';

export const dynamic = 'force-dynamic';

async function handlePOST(request: NextRequest) {
  const authError = await requireAdminAuth(request);
  if (authError) return authError;

  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  // These values become GitHub Actions workflow inputs. Refuse anything that
  // is not the expected shape before it leaves this server.
  const parsed = parseClipPipelineInputs(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const result = await triggerClipPipeline(parsed.value);

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error || 'Failed to dispatch clip pipeline workflow' },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, message: 'Clip pipeline dispatched' });
}

export const POST = withAdminMutation(handlePOST);
