/**
 * Admin API: Upload temporary video for Instagram Reels
 *
 * Accepts video upload from agent, stores in Vercel Blob Storage,
 * returns public URL. Meta Graph API fetches the video from this URL
 * to create the Instagram Reel container.
 *
 * Used by: ~/.openclaw/agents/eddy-marketing/scripts/upload-video-to-instagram.sh
 */

import { NextRequest, NextResponse } from 'next/server';
import { put, del, list } from '@vercel/blob';
import { requireAdminAuth } from '@/lib/admin-auth';
import { randomUUID } from 'crypto';

// Max video size: 100MB (Instagram Reels limit)
const MAX_SIZE = 100 * 1024 * 1024;

/**
 * POST /api/admin/upload-temp-video
 *
 * Body: multipart/form-data with "video" field
 * Returns: { url: "https://<blob-store>.public.blob.vercel-storage.com/tmp-reels/<uuid>.mp4" }
 */
export async function POST(request: NextRequest) {
  try {
    const authError = requireAdminAuth(request);
    if (authError) return authError;

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

    // Generate unique path in blob storage
    const ext = videoFile.name.split('.').pop() || 'mp4';
    const filename = `${randomUUID()}.${ext}`;
    const pathname = `tmp-reels/${filename}`;

    // Upload to Vercel Blob Storage
    const blob = await put(pathname, videoFile, {
      access: 'public',
      addRandomSuffix: false,
    });

    console.log(`[TempVideo] Uploaded to Blob: ${blob.url} (${(videoFile.size / 1024 / 1024).toFixed(2)} MB)`);

    return NextResponse.json({
      success: true,
      url: blob.url,
      filename,
      size: videoFile.size,
    });

  } catch (error) {
    console.error('[TempVideo] Upload failed:', error);
    return NextResponse.json(
      { error: 'Upload failed', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/admin/upload-temp-video
 *
 * List temporary videos in blob storage
 */
export async function GET(request: NextRequest) {
  try {
    const authError = requireAdminAuth(request);
    if (authError) return authError;

    const { blobs } = await list({ prefix: 'tmp-reels/' });

    const files = blobs.map((blob) => ({
      filename: blob.pathname.replace('tmp-reels/', ''),
      url: blob.url,
      size: blob.size,
      uploaded: blob.uploadedAt,
    }));

    return NextResponse.json({
      count: files.length,
      files,
    });

  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to list files', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/upload-temp-video?url=<blob-url>
 *
 * Delete a temporary video from blob storage
 */
export async function DELETE(request: NextRequest) {
  try {
    const authError = requireAdminAuth(request);
    if (authError) return authError;

    const { searchParams } = new URL(request.url);
    const blobUrl = searchParams.get('url');

    if (!blobUrl) {
      return NextResponse.json(
        { error: 'url parameter required' },
        { status: 400 }
      );
    }

    await del(blobUrl);

    console.log(`[TempVideo] Deleted: ${blobUrl}`);

    return NextResponse.json({
      success: true,
      message: `Deleted ${blobUrl}`,
    });

  } catch (error) {
    return NextResponse.json(
      { error: 'Delete failed', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
