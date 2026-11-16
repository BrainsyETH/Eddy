import { withAdminMutation } from '@/lib/admin/mutation-audit';
import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth, logAdminAction } from '@/lib/admin-auth';
import { createAdminClient } from '@/lib/supabase/admin';
export const dynamic = 'force-dynamic';
export async function GET(request: NextRequest) {
  const denied = await requireAdminAuth(request);
  if (denied) return denied;
  const { data, error } = await createAdminClient()
    .from('admin_memberships')
    .select('*')
    .order('name');
  if (error)
    return NextResponse.json(
      {
        error:
          'Team access is not available. Apply the admin workspace migration before adding accounts.',
      },
      { status: 503 },
    );
  return NextResponse.json({
    members: data,
    recoveryEnabled: process.env.ADMIN_ALLOW_RECOVERY_ACCESS !== 'false',
  });
}
async function handlePUT(request: NextRequest) {
  const denied = await requireAdminAuth(request);
  if (denied) return denied;
  const body = await request.json().catch(() => null);
  if (
    !body ||
    typeof body.email !== 'string' ||
    typeof body.name !== 'string' ||
    !['owner', 'editor', 'moderator'].includes(body.role) ||
    typeof body.active !== 'boolean'
  )
    return NextResponse.json(
      { error: 'Enter a verified account email, name, role and access state.' },
      { status: 400 },
    );
  const { data, error } = await createAdminClient().rpc(
    'set_admin_membership',
    {
      p_email: body.email,
      p_name: body.name,
      p_role: body.role,
      p_active: body.active,
      p_expected: body.expectedUpdatedAt ?? null,
    },
  );
  if (error)
    return NextResponse.json(
      {
        error:
          error.code === 'P0001'
            ? error.message
            : 'Could not update access. Reload and try again.',
      },
      { status: 409 },
    );
  const audit = await logAdminAction({
    request,
    action: 'update_access',
    entityType: 'admin_member',
    entityId: data.after.user_id,
    entityName: data.after.name,
    details: { before: data.before, after: data.after },
  });
  return NextResponse.json({ member: data.after, auditRecorded: audit.ok });
}

export const PUT = withAdminMutation(handlePUT);
