// src/app/api/admin/upload/route.ts
// POST /api/admin/upload - Upload images to Vercel Blob storage

import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { requireAdminAuth } from '@/lib/admin-auth';

export const dynamic = 'force-dynamic';

// Max file size: 4.5MB (Vercel Blob limit is 4.5MB for Hobby plan)
const MAX_FILE_SIZE = 4.5 * 1024 * 1024;

// Allowed image types
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

export async function POST(request: NextRequest) {
  try {
    const authError = requireAdminAuth(request);
    if (authError) return authError;

    const formData = await request.formData();
    const files = formData.getAll('files') as File[];

    if (!files || files.length === 0) {
      return NextResponse.json(
        { error: 'No files provided' },
        { status: 400 }
      );
    }

    // Validate and upload each file
    const uploadedUrls: string[] = [];
    const errors: string[] = [];

    for (const file of files) {
      // Validate file type
      if (!ALLOWED_TYPES.includes(file.type)) {
        errors.push(`${file.name}: Invalid file type. Allowed: JPEG, PNG, WebP, GIF`);
        continue;
      }

      // Validate file size
      if (file.size > MAX_FILE_SIZE) {
        errors.push(`${file.name}: File too large. Max size: 4.5MB`);
        continue;
      }

      try {
        // Generate a unique filename with timestamp
        const timestamp = Date.now();
        const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
        const pathname = `access-points/${timestamp}-${sanitizedName}`;

        // Upload to Vercel Blob
        const blob = await put(pathname, file, {
          access: 'public',
          addRandomSuffix: true,
        });

        uploadedUrls.push(blob.url);
      } catch (uploadError) {
        console.error('Error uploading file:', uploadError);
        errors.push(`${file.name}: Upload failed`);
      }
    }

    if (uploadedUrls.length === 0 && errors.length > 0) {
      return NextResponse.json(
        { error: 'All uploads failed', errors },
        { status: 400 }
      );
    }

    return NextResponse.json({
      urls: uploadedUrls,
      uploaded: uploadedUrls.length,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error('Error in upload endpoint:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
