// src/app/api/blog/route.ts
// GET /api/blog - List published blog posts for public consumption

import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const supabase = createAdminClient();

    // Get only published posts where published_at is in the past
    const { data: posts, error } = await supabase
      .from('blog_posts')
      .select('id, slug, title, description, category, featured_image_url, read_time_minutes, published_at')
      .eq('status', 'published')
      .lte('published_at', new Date().toISOString())
      .order('published_at', { ascending: false });

    if (error) {
      console.error('Error fetching blog posts:', error);
      return NextResponse.json(
        { error: 'Could not fetch blog posts' },
        { status: 500 }
      );
    }

    // Format response for public consumption
    const formatted = (posts || []).map((post) => ({
      slug: post.slug,
      title: post.title,
      description: post.description,
      category: post.category,
      featuredImageUrl: post.featured_image_url,
      readTimeMinutes: post.read_time_minutes,
      publishedAt: post.published_at,
    }));

    return NextResponse.json({ posts: formatted });
  } catch (error) {
    console.error('Error in public blog posts endpoint:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
