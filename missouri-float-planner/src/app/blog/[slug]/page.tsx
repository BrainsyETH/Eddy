import BlogPostContent, { type BlogPost } from '@/components/blog/BlogPostContent';
import { guideEditorialDate } from '@/lib/guides/editorial-date';
import { guideCover, resolveGuideHero } from '@/lib/photos/guides';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { createAdminClient } from '@/lib/supabase/admin';
import { appBannerMetadata } from '@/lib/app-discovery';

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://eddy.guide';

// 5-minute ISR: blog content + the river-keyed Supabase queries don't change
// minute-to-minute, and the live data on the page (Eddy-quote and gauge-report
// iframes) fetches itself independently. Cuts Supabase load ~99% at peak.
export const revalidate = 300;


async function getBlogPost(slug: string): Promise<BlogPost | null> {
  const supabase = createAdminClient();

  const { data: post, error } = await supabase
    .from('blog_posts')
    .select('*')
    .eq('slug', slug)
    .eq('status', 'published')
    .lte('published_at', new Date().toISOString())
    .single();

  if (error || !post) {
    console.error('Error fetching blog post:', error);
    return null;
  }

  const cover = guideCover(post);
  return {
    ...post,
    featured_image_url: cover.photo?.imageUrl ?? cover.src,
    guide_data: post.guide_data?.hero ? {
      ...post.guide_data,
      hero: resolveGuideHero(post, post.guide_data.hero),
    } : post.guide_data,
  };
}

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> }
): Promise<Metadata> {
  const { slug } = await params;
  const post = await getBlogPost(slug);

  if (!post) {
    return {
      title: 'Post Not Found',
    };
  }

  return {
    title: post.title,
    description: post.description || undefined,
    keywords: post.meta_keywords || undefined,
    alternates: {
      canonical: `${BASE_URL}/blog/${slug}`,
      types: {
        'application/json': `${BASE_URL}/api/blog/${slug}`,
      },
    },
    openGraph: {
      title: post.title,
      description: post.description || undefined,
      type: 'article',
      url: `${BASE_URL}/blog/${slug}`,
      siteName: 'Eddy',
      publishedTime: post.published_at || undefined,
      modifiedTime: guideEditorialDate(post.guide_data),
      // Share image comes from the branded opengraph-image.tsx in this segment.
    },
    twitter: {
      card: 'summary_large_image',
      title: post.title,
      description: post.description || undefined,
      // Share image comes from the branded twitter-image.tsx in this segment.
    },
    // Safari's banner opens the guide's river in the app, not the default tab.
    ...appBannerMetadata(post.river_slug ? `/river/${encodeURIComponent(post.river_slug)}` : undefined),
  };
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = await getBlogPost(slug);

  if (!post) {
    notFound();
  }

  return <BlogPostContent post={post} />;
}
