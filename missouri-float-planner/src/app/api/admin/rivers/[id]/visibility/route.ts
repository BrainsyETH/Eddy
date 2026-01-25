// src/app/api/admin/rivers/[id]/visibility/route.ts
// PATCH /api/admin/rivers/[id]/visibility - Toggle river visibility

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { active } = body;

    if (typeof active !== 'boolean') {
      return NextResponse.json(
        { error: 'active must be a boolean' },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    const { data: river, error } = await supabase
      .from('rivers')
      .update({ active })
      .eq('id', id)
      .select('id, name, slug, active')
      .single();

    if (error) {
      console.error('Error updating river visibility:', error);
      return NextResponse.json(
        { error: 'Could not update river visibility' },
        { status: 500 }
      );
    }

    return NextResponse.json({ river });
  } catch (error) {
    console.error('Error in river visibility endpoint:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
