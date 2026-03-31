// src/app/sitemap.ts
// Dynamic sitemap generation for SEO optimization

import { MetadataRoute } from 'next';
import { createAdminClient } from '@/lib/supabase/admin';

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://eddy.guide';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const supabase = createAdminClient();

  // Fetch rivers, blog posts, and access points in parallel
  const [riversResult, blogResult, accessPointsResult] = await Promise.all([
    supabase
      .from('rivers')
      .select('slug, updated_at')
      .order('name', { ascending: true }),
    supabase
      .from('blog_posts')
      .select('slug, published_at')
      .eq('status', 'published')
      .lte('published_at', new Date().toISOString())
      .order('published_at', { ascending: false }),
    supabase
      .from('access_points')
      .select('slug, river_id, rivers!inner(slug)')
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
    { url: `${BASE_URL}/rivers`, lastModified: new Date(), changeFrequency: 'daily', priority: 0.8 },
    { url: `${BASE_URL}/gauges`, lastModified: new Date(), changeFrequency: 'daily', priority: 0.7 },
    { url: `${BASE_URL}/blog`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.7 },
    { url: `${BASE_URL}/about`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.6 },
    { url: `${BASE_URL}/privacy`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.3 },
    { url: `${BASE_URL}/llms.txt`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.4 },
    { url: `${BASE_URL}/api/openapi.json`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.4 },
  ];

  // Dynamic river pages
  const riverPages: MetadataRoute.Sitemap = (riversResult.data || []).map((river) => ({
    url: `${BASE_URL}/rivers/${river.slug}`,
    lastModified: river.updated_at ? new Date(river.updated_at) : new Date(),
    changeFrequency: 'daily' as const,
    priority: 0.8,
  }));

  // Dynamic blog post pages
  const blogPages: MetadataRoute.Sitemap = (blogResult.data || []).map((post) => ({
    url: `${BASE_URL}/blog/${post.slug}`,
    lastModified: post.published_at ? new Date(post.published_at) : new Date(),
    changeFrequency: 'weekly' as const,
    priority: 0.6,
  }));

  // Dynamic access point pages
  const accessPointPages: MetadataRoute.Sitemap = (accessPointsResult.data || [])
    .filter((ap: Record<string, unknown>) => ap.rivers && typeof ap.rivers === 'object')
    .map((ap: Record<string, unknown>) => ({
      url: `${BASE_URL}/rivers/${(ap.rivers as Record<string, string>).slug}/access/${ap.slug}`,
      lastModified: new Date(),
      changeFrequency: 'weekly' as const,
      priority: 0.5,
    }));

  return [...staticPages, ...riverPages, ...blogPages, ...accessPointPages];
}
