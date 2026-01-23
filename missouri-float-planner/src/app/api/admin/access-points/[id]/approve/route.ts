// src/app/api/admin/access-points/[id]/approve/route.ts
// POST /api/admin/access-points/[id]/approve - Approve an access point for public visibility
// DELETE /api/admin/access-points/[id]/approve - Unapprove an access point

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from('access_points')
      .update({
        approved: true,
        approved_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select('id, name, approved')
      .single();

    if (error) {
      console.error('Error approving access point:', error);
      return NextResponse.json(
        { error: 'Could not approve access point' },
        { status: 500 }
      );
    }

    console.log(`Access point approved: ${data.name} (${data.id})`);

    return NextResponse.json({
      success: true,
      accessPoint: data,
      message: 'Access point is now visible in the public app',
    });
  } catch (error) {
    console.error('Error in approve endpoint:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from('access_points')
      .update({
        approved: false,
        approved_at: null,
      })
      .eq('id', id)
      .select('id, name, approved')
      .single();

    if (error) {
      console.error('Error unapproving access point:', error);
      return NextResponse.json(
        { error: 'Could not unapprove access point' },
        { status: 500 }
      );
    }

    console.log(`Access point unapproved: ${data.name} (${data.id})`);

    return NextResponse.json({
      success: true,
      accessPoint: data,
      message: 'Access point is now hidden from the public app',
    });
  } catch (error) {
    console.error('Error in unapprove endpoint:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
