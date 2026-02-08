// src/app/api/admin/blog/route.ts
// GET /api/admin/blog - List all blog posts for admin
// POST /api/admin/blog - Create a new blog post

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdminAuth } from '@/lib/admin-auth';
import { sanitizeRichText } from '@/lib/sanitize';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const authError = requireAdminAuth(request);
    if (authError) return authError;

    const supabase = createAdminClient();

    const { data: posts, error } = await supabase
      .from('blog_posts')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching blog posts:', error);
      return NextResponse.json(
        { error: 'Could not fetch blog posts' },
        { status: 500 }
      );
    }

    // Format response
    const formatted = (posts || []).map((post) => ({
      id: post.id,
      slug: post.slug,
      title: post.title,
      description: post.description,
      content: post.content,
      category: post.category,
      featuredImageUrl: post.featured_image_url,
      ogImageUrl: post.og_image_url,
      metaKeywords: post.meta_keywords,
      readTimeMinutes: post.read_time_minutes,
      status: post.status,
      publishedAt: post.published_at,
      createdAt: post.created_at,
      updatedAt: post.updated_at,
    }));

    return NextResponse.json({ posts: formatted });
  } catch (error) {
    console.error('Error in admin blog posts endpoint:', error);
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

    const body = await request.json();
    const {
      title,
      slug,
      description,
      content,
      category = 'Guides',
      featuredImageUrl,
      ogImageUrl,
      metaKeywords,
      readTimeMinutes,
      status = 'draft',
      publishedAt,
    } = body;

    // Validate required fields
    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      return NextResponse.json(
        { error: 'Title is required' },
        { status: 400 }
      );
    }

    // Generate slug from title if not provided
    const finalSlug = slug || title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

    // Validate category
    const validCategories = ['Guides', 'Tips', 'News', 'Safety', 'River Profiles', 'Gear Reviews', 'Trip Reports'];
    if (!validCategories.includes(category)) {
      return NextResponse.json(
        { error: `Invalid category. Must be one of: ${validCategories.join(', ')}` },
        { status: 400 }
      );
    }

    // Validate status
    const validStatuses = ['draft', 'published', 'scheduled'];
    if (!validStatuses.includes(status)) {
      return NextResponse.json(
        { error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    // Prepare insert data
    const insertData: Record<string, unknown> = {
      title: title.trim(),
      slug: finalSlug,
      description: description || null,
      content: sanitizeRichText(content) || null,
      category,
      featured_image_url: featuredImageUrl || null,
      og_image_url: ogImageUrl || null,
      meta_keywords: metaKeywords || null,
      read_time_minutes: readTimeMinutes || null,
      status,
    };

    // Handle published_at for scheduled/published posts
    if (status === 'published' && !publishedAt) {
      insertData.published_at = new Date().toISOString();
    } else if (publishedAt) {
      insertData.published_at = publishedAt;
    }

    const { data, error } = await supabase
      .from('blog_posts')
      .insert(insertData)
      .select()
      .single();

    if (error) {
      console.error('Error creating blog post:', error);
      if (error.code === '23505') {
        return NextResponse.json(
          { error: 'A blog post with this slug already exists' },
          { status: 409 }
        );
      }
      return NextResponse.json(
        { error: 'Could not create blog post' },
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

    return NextResponse.json({ post: formatted }, { status: 201 });
  } catch (error) {
    console.error('Error in create blog post endpoint:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
