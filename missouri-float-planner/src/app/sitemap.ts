// src/app/sitemap.ts
// Dynamic sitemap generation for SEO optimization

import { MetadataRoute } from 'next';
import { createAdminClient } from '@/lib/supabase/admin';
import { riverPath, riverAccessPath, statePath } from '@/lib/navigation/river-path';
import { listDamIds } from '@/lib/data/dams';

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://eddy.guide';

function settled<T>(result: PromiseSettledResult<T>): T | { data: null; error: unknown } {
  return result.status === 'fulfilled' ? result.value : { data: null, error: result.reason };
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Static pages remain discoverable even when a local/preview build
  // intentionally has no production database credentials.
  const staticPages: MetadataRoute.Sitemap = [
    { url: BASE_URL, changeFrequency: 'daily', priority: 1 },
    { url: `${BASE_URL}/app`, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${BASE_URL}/plan`, changeFrequency: 'daily', priority: 0.9 },
    { url: `${BASE_URL}/rivers`, changeFrequency: 'daily', priority: 0.8 },
    { url: `${BASE_URL}/river-map`, changeFrequency: 'daily', priority: 0.7 },
    { url: `${BASE_URL}/dams`, changeFrequency: 'daily', priority: 0.7 },
    // Dam detail pages come from a static registry, so they're listed here
    // rather than in the DB-driven expansion below — the sitemap still builds
    // when Supabase is unreachable.
    ...listDamIds().map((damId) => ({
      url: `${BASE_URL}/dams/${damId}`,
      changeFrequency: 'daily' as const,
      priority: 0.6,
    })),
    { url: `${BASE_URL}/blog`, changeFrequency: 'weekly', priority: 0.7 },
    { url: `${BASE_URL}/about`, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${BASE_URL}/coverage`, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${BASE_URL}/embed`, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${BASE_URL}/privacy`, changeFrequency: 'monthly', priority: 0.3 },
    { url: `${BASE_URL}/support`, changeFrequency: 'monthly', priority: 0.3 },
  ];

  let supabase;
  try {
    supabase = createAdminClient();
  } catch (error) {
    console.warn('Dynamic sitemap entries unavailable during render:', error);
    return staticPages;
  }

  // Fetch rivers, blog posts, and access points in parallel
  const results = await Promise.allSettled([
    supabase
      .from('rivers')
      .select('slug, state, updated_at')
      .eq('active', true)
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

  const riversResult = settled(results[0]);
  const blogResult = settled(results[1]);
  const accessPointsResult = settled(results[2]);
  for (const [index, result] of [riversResult, blogResult, accessPointsResult].entries()) {
    if (result.error) console.error(`Sitemap group ${index} unavailable:`, result.error);
  }

  // State index pages (one per distinct state with rivers). A state page's
  // freshness is the most recently updated river it lists, so recrawls track
  // real content changes instead of bumping on every sitemap fetch.
  const stateLastModified = new Map<string, number>();
  for (const river of riversResult.data || []) {
    if (!river.state) continue;
    const updatedMs = river.updated_at ? new Date(river.updated_at).getTime() : 0;
    if (!stateLastModified.has(river.state) || updatedMs > (stateLastModified.get(river.state) ?? 0)) {
      stateLastModified.set(river.state, updatedMs);
    }
  }
  const stateCodes = Array.from(stateLastModified.keys());
  const statePages: MetadataRoute.Sitemap = stateCodes.map((code) => ({
    url: `${BASE_URL}${statePath(code)}`,
    lastModified: stateLastModified.get(code) ? new Date(stateLastModified.get(code)!) : undefined,
    changeFrequency: 'daily' as const,
    priority: 0.7,
  }));

  // Dynamic river pages (canonical /rivers/<state>/<slug>)
  const riverPages: MetadataRoute.Sitemap = (riversResult.data || []).map((river) => ({
    url: `${BASE_URL}${riverPath(river.state, river.slug)}`,
    lastModified: river.updated_at ? new Date(river.updated_at) : undefined,
    changeFrequency: 'daily' as const,
    priority: 0.8,
  }));

  // Dynamic blog post pages. Prefer updated_at (reflects later edits) and fall
  // back to published_at so an edited post signals a recrawl.
  const blogPages: MetadataRoute.Sitemap = (blogResult.data || []).map((post) => ({
    url: `${BASE_URL}/blog/${post.slug}`,
    lastModified: post.updated_at
      ? new Date(post.updated_at)
      : post.published_at
        ? new Date(post.published_at)
        : undefined,
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
        lastModified: ap.updated_at ? new Date(ap.updated_at as string) : undefined,
        changeFrequency: 'weekly' as const,
        priority: 0.5,
      };
    });

  return [...staticPages, ...statePages, ...riverPages, ...blogPages, ...accessPointPages];
}
