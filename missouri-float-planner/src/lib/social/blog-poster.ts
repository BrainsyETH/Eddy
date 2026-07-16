// src/lib/social/blog-poster.ts
// Publishes the weekly blog spotlight — a Facebook-only LINK post to a
// river-guide blog. Facebook renders the Open Graph card from the URL, so the
// whole post is clickable and drives traffic to the site. Facebook-only on
// purpose: Instagram can't do clickable in-feed links.
//
// Rotation is fair: the least-recently-shared published guide goes next
// (blog_posts.last_shared_at; NULL = never shared → first). Shared with the
// post-blog cron and the admin "post blog now" button.

import { hasMetaCredentials, publishLinkToFacebook } from './meta-client';

const SITE = 'https://eddy.guide';

export interface BlogRow {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  og_image_url: string | null;
  featured_image_url: string | null;
  river_slug: string | null;
  last_shared_at: string | null;
}

export interface BlogPostResult {
  ok: boolean;
  skipped?: string;
  blogSlug?: string;
  caption?: string;
  postId?: string;
  error?: string;
}

// Facebook caption for a guide link post. Kept short: the OG card already
// carries the title + image, so the message is just a hook and a nudge. The URL
// is NOT put in the message — the `link` param generates the clickable card.
export function buildBlogCaption(blog: BlogRow): string {
  const hook = (blog.description || '').trim();
  const lines: string[] = [`📖 ${blog.title}`];
  if (hook) lines.push('', hook);
  lines.push('', 'Read the full guide 👇');
  return lines.join('\n');
}

// Publish the next guide as a Facebook link post. Records a social_posts row and
// stamps blog_posts.last_shared_at on success so rotation advances.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function publishBlogFeature(supabase: any): Promise<BlogPostResult> {
  if (!hasMetaCredentials()) {
    return { ok: false, skipped: 'no Facebook credentials' };
  }

  // Least-recently-shared published guide first (NULL last_shared_at first),
  // tie-broken by oldest published.
  const { data: blogs, error } = await supabase
    .from('blog_posts')
    .select('id, slug, title, description, og_image_url, featured_image_url, river_slug, last_shared_at')
    .eq('status', 'published')
    .order('last_shared_at', { ascending: true, nullsFirst: true })
    .order('published_at', { ascending: true })
    .limit(1);

  if (error) return { ok: false, error: error.message };

  const blog = (blogs || [])[0] as BlogRow | undefined;
  if (!blog) return { ok: false, skipped: 'no published blog to share' };

  const url = `${SITE}/blog/${blog.slug}`;
  const caption = buildBlogCaption(blog);
  const coverUrl = blog.og_image_url || blog.featured_image_url || null;

  // Record the row up front (publishing) so a mid-publish crash is visible.
  // media_type is 'image' (the OG image is the row's media); the publish path
  // itself is a link post. The blog URL lives in metadata for retries/auditing.
  const { data: record, error: insertError } = await supabase
    .from('social_posts')
    .insert({
      post_type: 'blog_feature',
      platform: 'facebook',
      river_slug: blog.river_slug || null,
      caption,
      image_url: coverUrl,
      media_type: 'image',
      hashtags: [],
      status: 'publishing',
      metadata: { link_url: url, blog_slug: blog.slug, blog_id: blog.id },
    })
    .select('id')
    .single();

  if (insertError) return { ok: false, error: insertError.message };

  const result = await publishLinkToFacebook({ message: caption, link: url });

  await supabase
    .from('social_posts')
    .update({
      status: result.success ? 'published' : 'failed',
      platform_post_id: result.postId || null,
      published_at: result.success ? new Date().toISOString() : null,
      error_message: result.success ? null : (result.error || 'Unknown error'),
      updated_at: new Date().toISOString(),
    })
    .eq('id', record.id);

  if (result.success) {
    await supabase
      .from('blog_posts')
      .update({ last_shared_at: new Date().toISOString() })
      .eq('id', blog.id);
  }

  return { ok: result.success, blogSlug: blog.slug, caption, postId: result.postId, error: result.error };
}
