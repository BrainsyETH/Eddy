// src/app/api/blog/[slug]/route.ts
// GET /api/blog/[slug] - Get single published blog post by slug

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const supabase = createAdminClient();

    // Get published post by slug
    const { data, error } = await supabase
      .from('blog_posts')
      .select('*')
      .eq('slug', slug)
      .eq('status', 'published')
      .lte('published_at', new Date().toISOString())
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
      publishedAt: data.published_at,
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
