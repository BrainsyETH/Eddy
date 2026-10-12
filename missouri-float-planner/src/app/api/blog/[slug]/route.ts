// src/app/api/blog/[slug]/route.ts
// GET /api/blog/[slug] - Get single published blog post by slug

import { guideCover, publicGuideImage } from '@/lib/photos/guides';
import { NextRequest, NextResponse } from 'next/server';
import { cdnCacheHeaders } from '@/lib/api-utils';
import { createAdminClient } from '@/lib/supabase/admin';
import { withX402Route } from '@/lib/x402-config';

export const dynamic = 'force-dynamic';

async function _GET(
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

    const cover = guideCover(data);
    const formatted = {
      id: data.id,
      slug: data.slug,
      title: data.title,
      description: data.description,
      content: data.content,
      category: data.category,
      featuredImageUrl: publicGuideImage(cover.src),
      featuredImageAlt: cover.alt ?? data.title,
      imageCredit: cover.photo ? {
        author: cover.photo.author, sourceUrl: cover.photo.sourceUrl,
        license: cover.photo.license, licenseUrl: cover.photo.licenseUrl,
        caption: cover.photo.caption, changes: cover.photo.changes,
      } : null,
      ogImageUrl: data.og_image_url,
      metaKeywords: data.meta_keywords,
      readTimeMinutes: data.read_time_minutes,
      publishedAt: data.published_at,
    };

    return NextResponse.json({ post: formatted }, { headers: cdnCacheHeaders(300, 3600) });
  } catch (error) {
    console.error('Error in get blog post endpoint:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export const GET = withX402Route<{ params: Promise<{ slug: string }> }>(_GET, '/api/blog/:slug');
