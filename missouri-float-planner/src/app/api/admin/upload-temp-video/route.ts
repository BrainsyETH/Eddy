/**
 * Admin API: Upload temporary video for Instagram Reels
 * 
 * Accepts video upload from agent, stores temporarily in /tmp/,
 * returns public URL, auto-deletes after 6 hours.
 * 
 * Used by: ~/.openclaw/agents/eddy-marketing/scripts/upload-video-to-instagram.sh
 */

import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { randomUUID } from 'crypto';

// Temporary storage directory (public/tmp/)
const TMP_DIR = join(process.cwd(), 'public', 'tmp');

// Auto-cleanup after 6 hours
const CLEANUP_DELAY_MS = 6 * 60 * 60 * 1000;

/**
 * POST /api/admin/upload-temp-video
 * 
 * Body: multipart/form-data with "video" field
 * Returns: { url: "https://eddy.guide/tmp/<uuid>.mp4" }
 */
export async function POST(request: NextRequest) {
  try {
    // Parse multipart form data
    const formData = await request.formData();
    const videoFile = formData.get('video') as File | null;

    if (!videoFile) {
      return NextResponse.json(
        { error: 'No video file provided' },
        { status: 400 }
      );
    }

    // Validate file type
    if (!videoFile.type.startsWith('video/')) {
      return NextResponse.json(
        { error: 'File must be a video' },
        { status: 400 }
      );
    }

    // Validate file size (max 100MB for Instagram Reels)
    const MAX_SIZE = 100 * 1024 * 1024; // 100MB
    if (videoFile.size > MAX_SIZE) {
      return NextResponse.json(
        { error: 'Video too large (max 100MB)' },
        { status: 400 }
      );
    }

    // Generate unique filename
    const ext = videoFile.name.split('.').pop() || 'mp4';
    const filename = `${randomUUID()}.${ext}`;
    const filePath = join(TMP_DIR, filename);

    // Ensure tmp directory exists
    await mkdir(TMP_DIR, { recursive: true });

    // Write file to disk
    const bytes = await videoFile.arrayBuffer();
    const buffer = Buffer.from(bytes);
    await writeFile(filePath, buffer);

    // Build public URL
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://eddy.guide';
    const publicUrl = `${baseUrl}/tmp/${filename}`;

    // Schedule auto-deletion after 6 hours
    setTimeout(async () => {
      try {
        const { unlink } = await import('fs/promises');
        await unlink(filePath);
        console.log(`[TempVideo] Auto-deleted: ${filename}`);
      } catch (err) {
        console.error(`[TempVideo] Failed to delete ${filename}:`, err);
      }
    }, CLEANUP_DELAY_MS);

    console.log(`[TempVideo] Uploaded: ${filename} (${(videoFile.size / 1024 / 1024).toFixed(2)} MB)`);
    console.log(`[TempVideo] Public URL: ${publicUrl}`);
    console.log(`[TempVideo] Auto-delete scheduled: ${new Date(Date.now() + CLEANUP_DELAY_MS).toISOString()}`);

    return NextResponse.json({
      success: true,
      url: publicUrl,
      filename,
      size: videoFile.size,
      expiresAt: new Date(Date.now() + CLEANUP_DELAY_MS).toISOString()
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
 * Returns list of temporary videos (for debugging)
 */
export async function GET() {
  try {
    const { readdir, stat } = await import('fs/promises');
    
    // Ensure tmp directory exists
    await mkdir(TMP_DIR, { recursive: true });
    
    const files = await readdir(TMP_DIR);
    
    const fileStats = await Promise.all(
      files.map(async (filename) => {
        const filePath = join(TMP_DIR, filename);
        const stats = await stat(filePath);
        
        return {
          filename,
          size: stats.size,
          created: stats.birthtime.toISOString(),
          age: Math.floor((Date.now() - stats.birthtime.getTime()) / 1000 / 60), // minutes
          url: `${process.env.NEXT_PUBLIC_BASE_URL || 'https://eddy.guide'}/tmp/${filename}`
        };
      })
    );

    return NextResponse.json({
      count: files.length,
      files: fileStats
    });

  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to list files', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/upload-temp-video?filename=<uuid>.mp4
 * 
 * Manually delete a temporary video
 */
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const filename = searchParams.get('filename');

    if (!filename) {
      return NextResponse.json(
        { error: 'filename parameter required' },
        { status: 400 }
      );
    }

    // Security: prevent path traversal
    if (filename.includes('..') || filename.includes('/')) {
      return NextResponse.json(
        { error: 'Invalid filename' },
        { status: 400 }
      );
    }

    const { unlink } = await import('fs/promises');
    const filePath = join(TMP_DIR, filename);
    
    await unlink(filePath);

    console.log(`[TempVideo] Manually deleted: ${filename}`);

    return NextResponse.json({
      success: true,
      message: `Deleted ${filename}`
    });

  } catch (error) {
    return NextResponse.json(
      { error: 'Delete failed', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
