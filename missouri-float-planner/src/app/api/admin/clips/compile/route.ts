import { withAdminMutation } from '@/lib/admin/mutation-audit';
import { NextRequest, NextResponse } from 'next/server';
import {
  requireAdminAuth,
  getAdminIdentity,
  isValidUUID,
  logAdminAction,
} from '@/lib/admin-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { triggerCompileHighlights } from '@/lib/social/video-renderer';
import { parseCompileHighlightsInputs } from '@/lib/social/workflow-inputs';
export const dynamic = 'force-dynamic';
async function handlePOST(request: NextRequest) {
  const denied = await requireAdminAuth(request);
  if (denied) return denied;
  const body = await request.json().catch(() => null);
  if (!body || typeof body.jobId !== 'string' || !isValidUUID(body.jobId))
    return NextResponse.json(
      { error: 'A unique job ID is required.' },
      { status: 400 },
    );
  const parsed = parseCompileHighlightsInputs(body);
  if (!parsed.ok)
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  const db = createAdminClient();
  const input = parsed.value;
  const { error: insertError } = await db
    .from('admin_jobs')
    .insert({
      id: body.jobId,
      kind: 'montage',
      state: 'queued',
      actor_id: getAdminIdentity(request)?.id,
      input,
    });
  if (insertError) {
    if (insertError.code !== '23505')
      return NextResponse.json(
        { error: 'Could not record the job. Nothing was dispatched.' },
        { status: 503 },
      );
    const { data: existing, error } = await db
      .from('admin_jobs')
      .select('*')
      .eq('id', body.jobId)
      .single();
    if (error)
      return NextResponse.json(
        { error: 'Could not check the existing job.' },
        { status: 503 },
      );
    if (
      JSON.stringify(Object.entries(existing.input).sort()) !==
      JSON.stringify(Object.entries(input).sort())
    )
      return NextResponse.json(
        { error: 'This job ID belongs to another compilation.' },
        { status: 409 },
      );
    return NextResponse.json({ job: existing });
  }
  let state = 'queued';
  let error: string | null = null;
  try {
    const accepted = await triggerCompileHighlights({
      jobId: body.jobId,
      clipIds: input.clipIds.join(','),
      title: input.title,
      postIds: input.postIds.join(','),
      outputFilename: input.outputFilename || `montage-${body.jobId}`,
    });
    if (!accepted) {
      state = 'failed';
      error =
        'GitHub did not accept the compilation. Check the workflow connection.';
    }
  } catch {
    state = 'unknown';
    error =
      'Dispatch could not be confirmed. Check the workflow before starting another job.';
  }
  if (state !== 'queued')
    await db
      .from('admin_jobs')
      .update({ state, error, updated_at: new Date().toISOString() })
      .eq('id', body.jobId)
      .eq('state', 'queued');
  const { data: job } = await db
    .from('admin_jobs')
    .select('*')
    .eq('id', body.jobId)
    .single();
  await logAdminAction({
    request,
    action: 'compile_montage',
    entityType: 'admin_job',
    entityId: body.jobId,
    details: { after: input, outcome: state },
  });
  return NextResponse.json(
    { job: job ?? { id: body.jobId, state, error } },
    { status: 202 },
  );
}

export const POST = withAdminMutation(handlePOST);
