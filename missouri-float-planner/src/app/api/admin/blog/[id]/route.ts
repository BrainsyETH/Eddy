// src/app/api/admin/blog/[id]/route.ts
// GET /api/admin/blog/[id] - Get single blog post for editing
// PUT /api/admin/blog/[id] - Update blog post
// DELETE /api/admin/blog/[id] - Delete blog post

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from('blog_posts')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      console.error('Error fetching blog post:', error);
      if (error.code === 'PGRST116') {
        return NextResponse.json(
          { error: 'Blog post not found' },
          { status: 404 }
        );
      }
      return NextResponse.json(
        { error: 'Could not fetch blog post' },
        { status: 500 }
      );
    }

    const formatted = {
      id: data.id,
      slug: data.slug,
      title: data.title,
      description: data.description,
      content: data.content,
      category: data.category,
      featuredImageUrl: data.featured_image_url,
      ogImageUrl: data.og_image_url,
      metaKeywords: data.meta_keywords,
      readTimeMinutes: data.read_time_minutes,
      status: data.status,
      publishedAt: data.published_at,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };

    return NextResponse.json({ post: formatted });
  } catch (error) {
    console.error('Error in get blog post endpoint:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const {
      title,
      slug,
      description,
      content,
      category,
      featuredImageUrl,
      ogImageUrl,
      metaKeywords,
      readTimeMinutes,
      status,
      publishedAt,
    } = body;

    const supabase = createAdminClient();

    // Build update object with only provided fields
    const updateData: Record<string, unknown> = {};

    if (title !== undefined) {
      if (typeof title !== 'string' || title.trim().length === 0) {
        return NextResponse.json(
          { error: 'Title cannot be empty' },
          { status: 400 }
        );
      }
      updateData.title = title.trim();
    }

    if (slug !== undefined) {
      if (typeof slug !== 'string' || slug.trim().length === 0) {
        return NextResponse.json(
          { error: 'Slug cannot be empty' },
          { status: 400 }
        );
      }
      updateData.slug = slug.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/^-|-$/g, '');
    }

    if (description !== undefined) {
      updateData.description = description === '' ? null : description;
    }

    if (content !== undefined) {
      updateData.content = content === '' ? null : content;
    }

    if (category !== undefined) {
      const validCategories = ['Guides', 'Tips', 'News', 'Safety', 'River Profiles', 'Gear Reviews', 'Trip Reports'];
      if (!validCategories.includes(category)) {
        return NextResponse.json(
          { error: `Invalid category. Must be one of: ${validCategories.join(', ')}` },
          { status: 400 }
        );
      }
      updateData.category = category;
    }

    if (featuredImageUrl !== undefined) {
      updateData.featured_image_url = featuredImageUrl === '' ? null : featuredImageUrl;
    }

    if (ogImageUrl !== undefined) {
      updateData.og_image_url = ogImageUrl === '' ? null : ogImageUrl;
    }

    if (metaKeywords !== undefined) {
      updateData.meta_keywords = Array.isArray(metaKeywords) ? metaKeywords : null;
    }

    if (readTimeMinutes !== undefined) {
      updateData.read_time_minutes = readTimeMinutes === '' || readTimeMinutes === null ? null : parseInt(readTimeMinutes, 10);
    }

    if (status !== undefined) {
      const validStatuses = ['draft', 'published', 'scheduled'];
      if (!validStatuses.includes(status)) {
        return NextResponse.json(
          { error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` },
          { status: 400 }
        );
      }
      updateData.status = status;

      // Auto-set published_at when publishing if not already set
      if (status === 'published' && publishedAt === undefined) {
        // Check current post to see if it already has a published_at
        const { data: currentPost } = await supabase
          .from('blog_posts')
          .select('published_at')
          .eq('id', id)
          .single();

        if (!currentPost?.published_at) {
          updateData.published_at = new Date().toISOString();
        }
      }
    }

    if (publishedAt !== undefined) {
      updateData.published_at = publishedAt === '' || publishedAt === null ? null : publishedAt;
    }

    // Check if we have anything to update
    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: 'No valid fields provided to update' },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from('blog_posts')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating blog post:', error);
      if (error.code === '23505') {
        return NextResponse.json(
          { error: 'A blog post with this slug already exists' },
          { status: 409 }
        );
      }
      return NextResponse.json(
        { error: 'Could not update blog post' },
        { status: 500 }
      );
    }

    const formatted = {
      id: data.id,
      slug: data.slug,
      title: data.title,
      description: data.description,
      content: data.content,
      category: data.category,
      featuredImageUrl: data.featured_image_url,
      ogImageUrl: data.og_image_url,
      metaKeywords: data.meta_keywords,
      readTimeMinutes: data.read_time_minutes,
      status: data.status,
      publishedAt: data.published_at,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };

    return NextResponse.json({ post: formatted });
  } catch (error) {
    console.error('Error in update blog post endpoint:', error);
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

    const { error } = await supabase
      .from('blog_posts')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting blog post:', error);
      return NextResponse.json(
        { error: 'Could not delete blog post' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in delete blog post endpoint:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
