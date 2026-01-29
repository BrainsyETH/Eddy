// src/app/api/admin/images/[id]/route.ts
// DELETE /api/admin/images/[id] - Delete an uploaded image

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

const BUCKET_NAME = 'images';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Decode the path (it may be URL encoded)
    const filePath = decodeURIComponent(id);

    // Don't allow deleting system images
    if (filePath.startsWith('eddy-')) {
      return NextResponse.json(
        { error: 'Cannot delete system images' },
        { status: 403 }
      );
    }

    const supabase = createAdminClient();

    const { error } = await supabase.storage
      .from(BUCKET_NAME)
      .remove([filePath]);

    if (error) {
      console.error('Delete error:', error);
      return NextResponse.json(
        { error: `Delete failed: ${error.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting image:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
