/**
 * Admin API: Upload clip to permanent Vercel Blob storage
 *
 * Unlike upload-temp-video (which stores in tmp-reels/ and gets deleted),
 * this stores clips permanently in reels/ for CDN serving and future reuse.
 *
 * Used by: ~/.openclaw/workspace/upload-clip.sh
 * Also used by: process-youtube-queue.sh (CDN upload after clip creation)
 */

import { NextRequest, NextResponse } from 'next/server';
import { put, list } from '@vercel/blob';
import { requireAdminAuth } from '@/lib/admin-auth';

// Max video size: 100MB
const MAX_SIZE = 100 * 1024 * 1024;

/**
 * POST /api/admin/upload-clip
 *
 * Body: multipart/form-data with "video" field
 * Optional query params: ?river=current&date=2026-03-25
 * Returns: { url: "https://<blob>.public.blob.vercel-storage.com/reels/2026-03-25/<hash>.mp4" }
 */
export async function POST(request: NextRequest) {
  try {
    const authError = requireAdminAuth(request);
    if (authError) return authError;

    const { searchParams } = new URL(request.url);
    const dateFolder = searchParams.get('date') || new Date().toISOString().slice(0, 10);

    const formData = await request.formData();
    const videoFile = formData.get('video') as File | null;

    if (!videoFile) {
      return NextResponse.json(
        { error: 'No video file provided' },
        { status: 400 }
      );
    }

    if (!videoFile.type.startsWith('video/')) {
      return NextResponse.json(
        { error: 'File must be a video' },
        { status: 400 }
      );
    }

    if (videoFile.size > MAX_SIZE) {
      return NextResponse.json(
        { error: `Video too large (${(videoFile.size / 1024 / 1024).toFixed(1)}MB, max 100MB)` },
        { status: 400 }
      );
    }

    // Generate path: reels/YYYY-MM-DD/<hash>.mp4
    const hash = crypto.randomUUID().replace(/-/g, '').slice(0, 12);
    const pathname = `reels/${dateFolder}/${hash}.mp4`;

    // Upload to Vercel Blob — permanent, public, cached for 1 year
    const blob = await put(pathname, videoFile, {
      access: 'public',
      addRandomSuffix: false,
      cacheControlMaxAge: 31536000, // 1 year
    });

    console.log(`[UploadClip] Stored: ${blob.url} (${(videoFile.size / 1024 / 1024).toFixed(2)} MB)`);

    return NextResponse.json({
      success: true,
      url: blob.url,
      pathname,
      size: videoFile.size,
    });

  } catch (error) {
    console.error('[UploadClip] Upload failed:', error);
    return NextResponse.json(
      { error: 'Upload failed', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/admin/upload-clip?prefix=reels/2026-03-25
 *
 * List clips in blob storage (for debugging/inventory)
 */
export async function GET(request: NextRequest) {
  try {
    const authError = requireAdminAuth(request);
    if (authError) return authError;

    const { searchParams } = new URL(request.url);
    const prefix = searchParams.get('prefix') || 'reels/';

    const { blobs } = await list({ prefix });

    const files = blobs.map((blob) => ({
      pathname: blob.pathname,
      url: blob.url,
      size: blob.size,
      uploaded: blob.uploadedAt,
    }));

    const totalSize = files.reduce((sum, f) => sum + f.size, 0);

    return NextResponse.json({
      count: files.length,
      totalSizeMB: (totalSize / 1024 / 1024).toFixed(1),
      files,
    });

  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to list files', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
