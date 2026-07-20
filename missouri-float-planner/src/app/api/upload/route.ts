// src/app/api/upload/route.ts
// POST /api/upload - Public image upload endpoint for community submissions
// Validates file type/size and stores in the PRIVATE quarantine bucket.
// Nothing uploaded here is publicly reachable until a moderator verifies the
// report it belongs to (audit F15) — the response carries the storage path,
// not a URL.

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { normalizeCommunityImage } from '@/lib/uploads/community-image';
import { QUARANTINE_BUCKET } from '@/lib/uploads/visual-moderation';
import { randomUUID } from 'node:crypto';

export const dynamic = 'force-dynamic';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_SIZE = 10 * 1024 * 1024; // 10MB

function json(body: { error?: string; success?: boolean; path?: string }, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'private, no-store' },
  });
}

export async function POST(request: NextRequest) {
  try {
    // Rate limit: 10 uploads per IP per 15 minutes (service-role write to Storage)
    const rateLimitResult = await rateLimit(`upload:${getClientIp(request)}`, 10, 15 * 60 * 1000, { failClosed: true });
    if (rateLimitResult) return rateLimitResult;

    const contentType = request.headers.get('content-type') || '';
    if (!contentType.toLowerCase().startsWith('multipart/form-data')) {
      return json({ error: 'Content-Type must be multipart/form-data' }, 415);
    }

    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return json({ error: 'Malformed multipart form data' }, 400);
    }
    const candidate = formData.get('file');
    const file = candidate instanceof File ? candidate : null;

    if (!file) {
      return json({ error: 'No file provided' }, 400);
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return json({ error: 'Invalid file type. Allowed: JPEG, PNG, WebP' }, 400);
    }

    if (file.size > MAX_SIZE) {
      return json({ error: 'File too large. Maximum size is 10MB' }, 400);
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Don't trust the client-supplied MIME type — verify the actual file
    // signature (magic bytes) matches one of the allowed image formats.
    if (!hasAllowedImageSignature(buffer)) {
      return json({ error: 'File content is not a valid JPEG, PNG, or WebP image' }, 400);
    }

    let normalized: Buffer;
    try {
      normalized = await normalizeCommunityImage(buffer);
    } catch {
      return json({ error: 'Image could not be safely decoded' }, 400);
    }

    const supabase = createAdminClient();

    // Generate unique filename under community-visuals folder. The same path
    // is reused verbatim in the public bucket if the photo is later approved.
    const month = new Date().toISOString().slice(0, 7);
    const fileName = `community-visuals/${month}/${randomUUID()}.webp`;

    // Upload as a Blob, not the raw Node Buffer. storage-js routes a Blob
    // through its multipart path, which every runtime encodes as binary. A raw
    // Buffer body goes through fetch's body handling instead, where sharp's
    // pooled output Buffer failed the serverless runtime's binary-body
    // detection and was coerced to UTF-8 text — silently replacing every byte
    // >0x7F with U+FFFD and storing an undecodable image (broken previews for
    // every community photo). Wrapping in a Blob copies the exact bytes and
    // sidesteps that path entirely.
    const uploadBody = new Blob([new Uint8Array(normalized)], { type: 'image/webp' });

    const { data, error } = await supabase.storage
      .from(QUARANTINE_BUCKET)
      .upload(fileName, uploadBody, {
        contentType: 'image/webp',
        cacheControl: '31536000',
        upsert: false,
      });

    if (error) {
      console.error('Upload error:', error);
      return json({ error: 'Upload failed. Please try again.' }, 500);
    }

    // Deliberately no URL: the object is private until moderation publishes it.
    return json({
      success: true,
      path: data.path,
    });
  } catch (error) {
    console.error('Error uploading image:', error);
    return json({ error: 'Internal server error' }, 500);
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

  // WebP: "RIFF" .... "WEBP"
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return true;

  return false;
}
