import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth, isValidUUID } from '@/lib/admin-auth';
import { createAdminClient } from '@/lib/supabase/admin';
export const dynamic = 'force-dynamic';
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = await requireAdminAuth(request);
  if (denied) return denied;
  const { id } = await params;
  if (!isValidUUID(id))
    return NextResponse.json({ error: 'Invalid job ID' }, { status: 400 });
  const { data, error } = await createAdminClient()
    .from('admin_jobs')
    .select('*')
    .eq('id', id)
    .eq('kind', 'montage')
    .maybeSingle();
  if (error)
    return NextResponse.json(
      { error: 'Could not check job status.' },
      { status: 503 },
    );
  if (!data)
    return NextResponse.json({ error: 'Job not found.' }, { status: 404 });
  const stale =
    ['queued', 'running'].includes(data.state) &&
    Date.now() - Date.parse(data.updated_at) > 30 * 60000;
  return NextResponse.json({
    job: {
      ...data,
      ...(stale
        ? {
            state: 'unknown',
            error:
              'No completion update in 30 minutes. Check the workflow; do not assume it stopped.',
          }
        : {}),
    },
  });
}
