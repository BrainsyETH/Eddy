// src/app/api/admin/upload/route.ts
// POST /api/admin/upload - Upload images to Vercel Blob storage

import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { requireAdminAuth } from '@/lib/admin-auth';
import { safeStem, sniffImage } from '@/lib/uploads/sniff';

export const dynamic = 'force-dynamic';

// Max file size: 4.5MB (Vercel Blob limit is 4.5MB for Hobby plan)
const MAX_FILE_SIZE = 4.5 * 1024 * 1024;

// One request uploads a handful of photos, not an unbounded batch.
const MAX_FILES = 20;

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

    if (files.length > MAX_FILES) {
      return NextResponse.json(
        { error: `Too many files. Upload at most ${MAX_FILES} at a time.` },
        { status: 400 }
      );
    }

    // Validate and upload each file
    const uploadedUrls: string[] = [];
    const errors: string[] = [];

    for (const file of files) {
      if (typeof file === 'string') continue;

      // Validate file size
      if (file.size > MAX_FILE_SIZE) {
        errors.push(`${file.name}: File too large. Max size: 4.5MB`);
        continue;
      }

      try {
        // The type comes from the file's own bytes. The browser-supplied
        // file.type and the filename's extension are both the uploader's
        // claim, and are not used for the stored name or Content-Type.
        const bytes = new Uint8Array(await file.arrayBuffer());
        const sniffed = sniffImage(bytes);
        if (!sniffed) {
          errors.push(`${file.name}: Not a JPEG, PNG, WebP or GIF image`);
          continue;
        }

        const pathname = `access-points/${Date.now()}-${safeStem(file.name)}.${sniffed.ext}`;

        // Upload to Vercel Blob
        const blob = await put(pathname, Buffer.from(bytes), {
          access: 'public',
          addRandomSuffix: true,
          contentType: sniffed.mime,
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
