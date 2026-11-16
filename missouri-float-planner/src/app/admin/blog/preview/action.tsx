'use server';
import { cookies, headers } from 'next/headers';
import { NextRequest } from 'next/server';
import {
  requireAdminAuth,
  isValidUUID,
  ADMIN_SESSION_COOKIE,
} from '@/lib/admin-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { sanitizeRichText } from '@/lib/sanitize';
import BlogPostContent, {
  type BlogPost,
} from '@/components/blog/BlogPostContent';
import { BLOG_CATEGORIES } from '@/lib/admin/blog-publication';
import { guideCover, resolveGuideHero } from '@/lib/photos/guides';
export async function renderBlogPreview(input: Record<string, unknown>) {
  const cookie = (await cookies()).get(ADMIN_SESSION_COOKIE)?.value;
  const host = (await headers()).get('host') ?? 'eddy.guide';
  const req = new NextRequest(`https://${host}/api/admin/blog`, {
    headers: { cookie: `${ADMIN_SESSION_COOKIE}=${cookie ?? ''}` },
  });
  if (await requireAdminAuth(req))
    throw new Error('Sign in again to preview this post.');
  if (
    !input ||
    typeof input !== 'object' ||
    JSON.stringify(input).length > 500000
  )
    throw new Error('Preview content is too large.');
  const str = (key: string) =>
    typeof input[key] === 'string' ? (input[key] as string) : '';
  let existing: BlogPost | null = null;
  if (str('id')) {
    if (!isValidUUID(str('id'))) throw new Error('Invalid post.');
    const { data, error } = await createAdminClient()
      .from('blog_posts')
      .select('*')
      .eq('id', str('id'))
      .single();
    if (error) throw new Error('Could not load this guide.');
    existing = data;
  }
  const post: BlogPost = {
    id: str('id') || 'preview',
    slug: str('slug'),
    title: str('title'),
    description: str('description'),
    content: sanitizeRichText(str('content')),
    category: BLOG_CATEGORIES.includes(str('category'))
      ? str('category')
      : 'Guides',
    featured_image_url: str('featuredImageUrl') || null,
    og_image_url: null,
    meta_keywords: null,
    read_time_minutes: Number(str('readTimeMinutes')) || null,
    published_at: null,
    river_slug: existing?.river_slug ?? null,
    guide_data: existing?.guide_data ?? null,
  };
  if (post.guide_data) {
    const cover = guideCover(post);
    post.featured_image_url = cover.photo?.imageUrl ?? cover.src;
    if (post.guide_data.hero)
      post.guide_data = {
        ...post.guide_data,
        hero: resolveGuideHero(post, post.guide_data.hero),
      };
  }
  return <BlogPostContent post={post} />;
}
