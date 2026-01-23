// src/app/sitemap.ts
// Dynamic sitemap generation for SEO optimization
// Ensures all river pages are indexed by search engines

import { MetadataRoute } from 'next';
import { createClient } from '@/lib/supabase/server';

// Base URL for the site - use environment variable or fallback
const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://floatme.app';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const supabase = await createClient();

  // Fetch all rivers with their updated_at timestamps
  const { data: rivers, error } = await supabase
    .from('rivers')
    .select('slug, updated_at')
    .order('name', { ascending: true });

  if (error) {
    console.error('Error fetching rivers for sitemap:', error);
    // Return basic sitemap if database fails
    return [
      {
        url: BASE_URL,
        lastModified: new Date(),
        changeFrequency: 'daily',
        priority: 1,
      },
    ];
  }

  // Static pages
  const staticPages: MetadataRoute.Sitemap = [
    {
      url: BASE_URL,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 1,
    },
    {
      url: `${BASE_URL}/simple`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.5,
    },
  ];

  // Dynamic river pages
  const riverPages: MetadataRoute.Sitemap = (rivers || []).map((river) => ({
    url: `${BASE_URL}/rivers/${river.slug}`,
    lastModified: river.updated_at ? new Date(river.updated_at) : new Date(),
    changeFrequency: 'daily' as const,
    priority: 0.8,
  }));

  return [...staticPages, ...riverPages];
}
