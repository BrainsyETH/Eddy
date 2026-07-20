// src/app/api/upload/route.ts
// POST /api/upload - Public image upload endpoint for community submissions
// Validates file type/size and stores in Supabase Storage

import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';
import { createAdminClient } from '@/lib/supabase/admin';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

const BUCKET_NAME = 'images';
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_SIZE = 10 * 1024 * 1024; // 10MB

export async function POST(request: NextRequest) {
  try {
    // Rate limit: 10 uploads per IP per 15 minutes (service-role write to Storage)
    const rateLimitResult = await rateLimit(`upload:${getClientIp(request)}`, 10, 15 * 60 * 1000);
    if (rateLimitResult) return rateLimitResult;

    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: 'Invalid file type. Allowed: JPEG, PNG, WebP, GIF' },
        { status: 400 }
      );
    }

    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { error: 'File too large. Maximum size is 10MB' },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Don't trust the client-supplied MIME type — verify the actual file
    // signature (magic bytes) matches one of the allowed image formats.
    if (!hasAllowedImageSignature(buffer)) {
      return NextResponse.json(
        { error: 'File content is not a valid JPEG, PNG, WebP, or GIF image' },
        { status: 400 }
      );
    }

    // Strip metadata (including GPS) before storing to the public bucket.
    // .rotate() bakes EXIF orientation into the pixels first so photos still
    // display upright, then sharp drops all metadata by default; resize caps
    // dimensions (defense against decompression bombs + smaller files). GIF is
    // passed through untouched — it has no EXIF/GPS block and sharp would
    // flatten its animation. Fail closed: a processing error rejects the upload
    // rather than storing the original (which could still carry location data).
    let uploadBuffer = buffer;
    if (file.type !== 'image/gif') {
      try {
        uploadBuffer = await sharp(buffer, { animated: true })
          .rotate()
          .resize({ width: 2400, height: 2400, fit: 'inside', withoutEnlargement: true })
          .toBuffer();
      } catch (err) {
        console.error('Image processing failed:', err);
        return NextResponse.json(
          { error: 'Could not process the image. Please try another photo.' },
          { status: 400 }
        );
      }
    }

    const supabase = createAdminClient();

    // Generate unique filename under community-visuals folder
    const timestamp = Date.now();
    const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
    const fileName = `community-visuals/${timestamp}-${sanitizedName}`;

    const { data, error } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(fileName, uploadBuffer, {
        contentType: file.type,
        upsert: false,
      });

    if (error) {
      console.error('Upload error:', error);
      return NextResponse.json(
        { error: 'Upload failed. Please try again.' },
        { status: 500 }
      );
    }

    const { data: { publicUrl } } = supabase.storage
      .from(BUCKET_NAME)
      .getPublicUrl(data.path);

    return NextResponse.json({
      success: true,
      url: publicUrl,
    });
  } catch (error) {
    console.error('Error uploading image:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * Checks the file's leading bytes against known image magic numbers.
 * Guards against a forged Content-Type by inspecting the actual bytes.
 */
function hasAllowedImageSignature(buf: Buffer): boolean {
  if (buf.length < 12) return false;

  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return true;

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 &&
    buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a
  ) return true;

  // GIF: "GIF87a" or "GIF89a"
  if (buf.toString('ascii', 0, 6) === 'GIF87a' || buf.toString('ascii', 0, 6) === 'GIF89a') return true;

  // WebP: "RIFF" .... "WEBP"
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return true;

  return false;
}
