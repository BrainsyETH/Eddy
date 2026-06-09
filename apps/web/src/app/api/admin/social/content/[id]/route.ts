// src/app/api/admin/social/content/[id]/route.ts
// PUT/DELETE for individual social custom content snippets

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdminAuth } from '@/lib/admin-auth';

export const dynamic = 'force-dynamic';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = requireAdminAuth(request);
  if (authError) return authError;

  const { id } = await params;
  const body = await request.json();
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from('social_custom_content')
    .update({
      content_type: body.content_type,
      text: body.text,
      active: body.active,
      start_date: body.start_date || null,
      end_date: body.end_date || null,
      platforms: body.platforms,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select('*')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json(data);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = requireAdminAuth(request);
  if (authError) return authError;

  const { id } = await params;
  const supabase = createAdminClient();

  const { error } = await supabase
    .from('social_custom_content')
    .delete()
    .eq('id', id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
