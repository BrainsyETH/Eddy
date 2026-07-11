// src/app/blog/feed.xml/route.ts
// RSS 2.0 feed for the blog. Linked via <link rel="alternate"> on the home
// and blog index pages; lets readers, aggregators, and AI crawlers subscribe
// to new guides without polling the sitemap.

import { createAdminClient } from '@/lib/supabase/admin';

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://eddy.guide';

// Same 1-hour cadence as the sitemap's weekly-ish blog churn; keeps Supabase
// out of the hot path for feed pollers.
export const revalidate = 3600;

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export async function GET() {
  const supabase = createAdminClient();

  const { data: posts, error } = await supabase
    .from('blog_posts')
    .select('slug, title, description, category, published_at')
    .eq('status', 'published')
    .lte('published_at', new Date().toISOString())
    .order('published_at', { ascending: false })
    .limit(50);

  if (error) {
    console.error('Error fetching blog posts for RSS feed:', error);
    return new Response('Feed temporarily unavailable', { status: 503 });
  }

  const items = (posts || [])
    .map((post) => {
      const url = `${BASE_URL}/blog/${post.slug}`;
      const pubDate = post.published_at ? new Date(post.published_at).toUTCString() : '';
      return [
        '    <item>',
        `      <title>${escapeXml(post.title)}</title>`,
        `      <link>${url}</link>`,
        `      <guid isPermaLink="true">${url}</guid>`,
        post.description ? `      <description>${escapeXml(post.description)}</description>` : null,
        post.category ? `      <category>${escapeXml(post.category)}</category>` : null,
        pubDate ? `      <pubDate>${pubDate}</pubDate>` : null,
        '    </item>',
      ]
        .filter(Boolean)
        .join('\n');
    })
    .join('\n');

  const lastBuildDate = posts?.[0]?.published_at
    ? new Date(posts[0].published_at).toUTCString()
    : new Date().toUTCString();

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Eddy's Thoughts - Float Trip Guides &amp; Resources</title>
    <link>${BASE_URL}/blog</link>
    <description>Expert guides and tips for planning the perfect float trip. Water conditions, access points, and the best times to float.</description>
    <language>en-us</language>
    <lastBuildDate>${lastBuildDate}</lastBuildDate>
    <atom:link href="${BASE_URL}/blog/feed.xml" rel="self" type="application/rss+xml"/>
${items}
  </channel>
</rss>
`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
    },
  });
}
