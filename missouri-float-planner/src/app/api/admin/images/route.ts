// src/app/api/admin/images/route.ts
// GET /api/admin/images - List all images from Supabase Storage
// POST /api/admin/images - Upload a new image

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdminAuth } from '@/lib/admin-auth';

export const dynamic = 'force-dynamic';

const BUCKET_NAME = 'images';

// Pre-defined Eddy images (stored on Vercel Blob)
const EDDY_IMAGES = [
  {
    id: 'eddy-green',
    name: 'Eddy Green (Optimal)',
    url: 'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy_the_Otter_green.png',
    category: 'eddy',
    isSystem: true,
  },
  {
    id: 'eddy-yellow',
    name: 'Eddy Yellow (Caution)',
    url: 'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy_the_Otter_yellow.png',
    category: 'eddy',
    isSystem: true,
  },
  {
    id: 'eddy-red',
    name: 'Eddy Red (Warning)',
    url: 'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy_the_Otter_red.png',
    category: 'eddy',
    isSystem: true,
  },
  {
    id: 'eddy-flag',
    name: 'Eddy with Flag (Unknown)',
    url: 'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy%20the%20otter%20with%20a%20flag.png',
    category: 'eddy',
    isSystem: true,
  },
  {
    id: 'eddy-canoe',
    name: 'Eddy in Canoe',
    url: 'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy-the-otter-canoe-MTAFO8mMzHzjSSN1MZ3H7cLwfkgjC4.png',
    category: 'eddy',
    isSystem: true,
  },
  {
    id: 'eddy-floatie',
    name: 'Eddy on Floatie',
    url: 'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy%20the%20otter%20floatie.png',
    category: 'eddy',
    isSystem: true,
  },
  {
    id: 'eddy-flood',
    name: 'Eddy Flood Warning',
    url: 'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy_the_Otter_flood.png',
    category: 'eddy',
    isSystem: true,
  },
];

export async function GET(request: NextRequest) {
  try {
    const authError = requireAdminAuth(request);
    if (authError) return authError;

    const supabase = createAdminClient();

    // List files from Supabase Storage
    const { data: files, error } = await supabase.storage
      .from(BUCKET_NAME)
      .list('', {
        limit: 100,
        sortBy: { column: 'created_at', order: 'desc' },
      });

    if (error) {
      // If bucket doesn't exist, just return Eddy images
      if (error.message.includes('not found') || error.message.includes('does not exist')) {
        return NextResponse.json({
          images: EDDY_IMAGES,
          bucketExists: false,
        });
      }
      console.error('Error listing images:', error);
      return NextResponse.json(
        { error: 'Could not list images' },
        { status: 500 }
      );
    }

    // Get public URLs for uploaded files
    const uploadedImages = (files || [])
      .filter(file => !file.name.startsWith('.')) // Filter out hidden files
      .map(file => {
        const { data: { publicUrl } } = supabase.storage
          .from(BUCKET_NAME)
          .getPublicUrl(file.name);

        return {
          id: file.id || file.name,
          name: file.name,
          url: publicUrl,
          category: 'uploaded',
          isSystem: false,
          createdAt: file.created_at,
          size: file.metadata?.size,
        };
      });

    return NextResponse.json({
      images: [...EDDY_IMAGES, ...uploadedImages],
      bucketExists: true,
    });
  } catch (error) {
    console.error('Error in images endpoint:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const authError = requireAdminAuth(request);
    if (authError) return authError;

    const supabase = createAdminClient();

    const formData = await request.formData();
    const file = formData.get('file') as File;
    const category = formData.get('category') as string || 'general';

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: 'Invalid file type. Allowed: JPEG, PNG, WebP, GIF' },
        { status: 400 }
      );
    }

    // Validate file size (max 5MB)
    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: 'File too large. Maximum size is 5MB' },
        { status: 400 }
      );
    }

    // Generate unique filename
    const timestamp = Date.now();
    const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
    const fileName = `${category}/${timestamp}-${sanitizedName}`;

    // Convert file to buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Upload to Supabase Storage
    const { data, error } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(fileName, buffer, {
        contentType: file.type,
        upsert: false,
      });

    if (error) {
      console.error('Upload error:', error);
      return NextResponse.json(
        { error: `Upload failed: ${error.message}` },
        { status: 500 }
      );
    }

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from(BUCKET_NAME)
      .getPublicUrl(data.path);

    return NextResponse.json({
      success: true,
      image: {
        id: data.path,
        name: file.name,
        url: publicUrl,
        category,
        isSystem: false,
      },
    });
  } catch (error) {
    console.error('Error uploading image:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
