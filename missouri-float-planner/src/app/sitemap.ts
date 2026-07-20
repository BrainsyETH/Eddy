// src/app/sitemap.ts
// Dynamic sitemap generation for SEO optimization

import { MetadataRoute } from 'next';
import { createAdminClient } from '@/lib/supabase/admin';
import { riverPath, riverAccessPath, statePath } from '@/lib/navigation/river-path';

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://eddy.guide';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const supabase = createAdminClient();

  // Fetch rivers, blog posts, and access points in parallel
  const [riversResult, blogResult, accessPointsResult] = await Promise.all([
    supabase
      .from('rivers')
      .select('slug, state, updated_at')
      .order('name', { ascending: true }),
    supabase
      .from('blog_posts')
      .select('slug, published_at, updated_at')
      .eq('status', 'published')
      .lte('published_at', new Date().toISOString())
      .order('published_at', { ascending: false }),
    supabase
      .from('access_points')
      .select('slug, river_id, updated_at, rivers!inner(slug, state)')
      .eq('approved', true)
      .order('name', { ascending: true }),
  ]);

  if (riversResult.error) {
    console.error('Error fetching rivers for sitemap:', riversResult.error);
    return [{ url: BASE_URL, lastModified: new Date(), changeFrequency: 'daily', priority: 1 }];
  }

  // Static pages
  const staticPages: MetadataRoute.Sitemap = [
    { url: BASE_URL, lastModified: new Date(), changeFrequency: 'daily', priority: 1 },
    { url: `${BASE_URL}/plan`, lastModified: new Date(), changeFrequency: 'daily', priority: 0.9 },
    { url: `${BASE_URL}/rivers`, lastModified: new Date(), changeFrequency: 'daily', priority: 0.8 },
    { url: `${BASE_URL}/river-map`, lastModified: new Date(), changeFrequency: 'daily', priority: 0.7 },
    { url: `${BASE_URL}/blog`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.7 },
    { url: `${BASE_URL}/about`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.6 },
    // Partner-acquisition page for the free embed widgets (the /embed/ widget
    // iframes themselves stay noindexed; only this configurator is public).
    { url: `${BASE_URL}/embed`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.6 },
    { url: `${BASE_URL}/privacy`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.3 },
    { url: `${BASE_URL}/llms.txt`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.4 },
    { url: `${BASE_URL}/api/openapi.json`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.4 },
  ];

  // State index pages (one per distinct state with rivers). A state page's
  // freshness is the most recently updated river it lists, so recrawls track
  // real content changes instead of bumping on every sitemap fetch.
  const stateLastModified = new Map<string, number>();
  for (const river of riversResult.data || []) {
    if (!river.state) continue;
    const updatedMs = river.updated_at ? new Date(river.updated_at).getTime() : 0;
    if (updatedMs > (stateLastModified.get(river.state) ?? 0)) {
      stateLastModified.set(river.state, updatedMs);
    }
  }
  const stateCodes = Array.from(stateLastModified.keys());
  const statePages: MetadataRoute.Sitemap = stateCodes.map((code) => ({
    url: `${BASE_URL}${statePath(code)}`,
    lastModified: stateLastModified.get(code) ? new Date(stateLastModified.get(code)!) : new Date(),
    changeFrequency: 'daily' as const,
    priority: 0.7,
  }));

  // Dynamic river pages (canonical /rivers/<state>/<slug>)
  const riverPages: MetadataRoute.Sitemap = (riversResult.data || []).map((river) => ({
    url: `${BASE_URL}${riverPath(river.state, river.slug)}`,
    lastModified: river.updated_at ? new Date(river.updated_at) : new Date(),
    changeFrequency: 'daily' as const,
    priority: 0.8,
  }));

  // Dynamic add-a-photo pages (one per river) — the shareable, crawlable entry
  // point for community photo submissions.
  const addPhotoPages: MetadataRoute.Sitemap = (riversResult.data || []).map((river) => ({
    url: `${BASE_URL}${riverPath(river.state, river.slug)}/add-photo`,
    lastModified: river.updated_at ? new Date(river.updated_at) : new Date(),
    changeFrequency: 'monthly' as const,
    priority: 0.4,
  }));

  // Dynamic blog post pages. Prefer updated_at (reflects later edits) and fall
  // back to published_at so an edited post signals a recrawl.
  const blogPages: MetadataRoute.Sitemap = (blogResult.data || []).map((post) => ({
    url: `${BASE_URL}/blog/${post.slug}`,
    lastModified: post.updated_at
      ? new Date(post.updated_at)
      : post.published_at
        ? new Date(post.published_at)
        : new Date(),
    changeFrequency: 'weekly' as const,
    priority: 0.6,
  }));

  // Dynamic access point pages (canonical /rivers/<state>/<slug>/access/<accessSlug>)
  const accessPointPages: MetadataRoute.Sitemap = (accessPointsResult.data || [])
    .filter((ap: Record<string, unknown>) => ap.rivers && typeof ap.rivers === 'object')
    .map((ap: Record<string, unknown>) => {
      const river = ap.rivers as Record<string, string>;
      return {
        url: `${BASE_URL}${riverAccessPath(river.state, river.slug, ap.slug as string)}`,
        lastModified: ap.updated_at ? new Date(ap.updated_at as string) : new Date(),
        changeFrequency: 'weekly' as const,
        priority: 0.5,
      };
    });

  return [...staticPages, ...statePages, ...riverPages, ...addPhotoPages, ...blogPages, ...accessPointPages];
}
