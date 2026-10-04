// src/app/plan/page.tsx
// Unified float planner. River is selected via ?river=<slug> search param,
// allowing one canonical planner page across all rivers.

import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { getServiceAreaBounds } from '@/lib/geo/region-bounds';
import PlanPageClient from './PlanPageClient';

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://eddy.guide';

// /plan reads ?river=…&putIn=…&takeOut=… so it must render per-request.
export const dynamic = 'force-dynamic';

interface Props {
  searchParams: Promise<{
    river?: string;
    putIn?: string;
    takeOut?: string;
    vessel?: string;
  }>;
}

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  try {
    const resolved = await searchParams;
    const slug = resolved?.river;

    // No river selected — generic landing metadata
    if (!slug) {
      const title = 'Plan a Float Trip';
      const description = 'Pick a river, choose your put-in and take-out, and Eddy will calculate your float plan with live conditions, distance, and estimated time.';
      return {
        title,
        description,
        alternates: { canonical: `${BASE_URL}/plan` },
        openGraph: {
          type: 'website',
          title,
          description,
          url: `${BASE_URL}/plan`,
          siteName: 'Eddy',
        },
        twitter: {
          card: 'summary_large_image',
          title,
          description,
        },
      };
    }

    const supabase = await createClient();
    const { data: river, error } = await supabase
      .from('rivers')
      .select('id, name, slug, length_miles, description, difficulty_rating, region')
      .eq('slug', slug)
      .single();

    if (error || !river) {
      return { title: 'Plan a Float Trip' };
    }

    const putInId = resolved.putIn;
    const takeOutId = resolved.takeOut;
    const isShare = putInId && takeOutId;

    if (isShare) {
      let putInName = '';
      let takeOutName = '';
      try {
        const [a, b] = await Promise.all([
          supabase.from('access_points').select('name').eq('id', putInId).single(),
          supabase.from('access_points').select('name').eq('id', takeOutId).single(),
        ]);
        putInName = a.data?.name || 'Start';
        takeOutName = b.data?.name || 'End';
      } catch {
        // ignore
      }

      const title = `${putInName} → ${takeOutName} | ${river.name}`;
      const description = `Float ${river.name} from ${putInName} to ${takeOutName}. Open for current conditions and trip estimates.`;

      const pageUrl = `${BASE_URL}/plan?river=${slug}&putIn=${putInId}&takeOut=${takeOutId}`;

      return {
        title,
        description,
        alternates: { canonical: pageUrl },
        openGraph: {
          type: 'website',
          title,
          description,
          url: pageUrl,
          siteName: 'Eddy',
        },
        twitter: {
          card: 'summary_large_image',
          title,
          description,
        },
      };
    }

    const title = `Plan a Float on the ${river.name}`;
    const ogTitle = `Plan a Float on the ${river.name}`;
    const description = `Plan a float on the ${river.name}. Pick access points and Eddy calculates distance, float time, and live conditions.`;
    const pageUrl = `${BASE_URL}/plan?river=${slug}`;

    return {
      title,
      description,
      alternates: { canonical: pageUrl },
      openGraph: {
        type: 'website',
        title: ogTitle,
        description,
        url: pageUrl,
        siteName: 'Eddy',
      },
      twitter: {
        card: 'summary_large_image',
        title: ogTitle,
        description,
      },
    };
  } catch (err) {
    console.error('Error generating /plan metadata:', err);
    return {
      title: 'Plan a Float Trip',
      description: 'Plan your next Ozark float trip with Eddy.',
    };
  }
}

export default async function PlanPage({ searchParams }: Props) {
  const resolved = await searchParams;
  const slug = resolved?.river ?? null;

  let guidePost: { slug: string; title: string } | null = null;
  if (slug) {
    const supabase = await createClient();
    const { data: guide } = await supabase
      .from('blog_posts')
      .select('slug, title')
      .eq('river_slug', slug)
      .eq('status', 'published')
      .lte('published_at', new Date().toISOString())
      .order('published_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (guide) guidePost = guide;
  }

  // The default map frame when no river is chosen. Derived from the live
  // catalog rather than a constant: the previous hardcoded box started at
  // 36.4°N, which put the Buffalo, Caddo and Mulberry below the first thing a
  // new visitor sees on the "where can I float?" screen. getServiceAreaBounds
  // unions the active rivers with the historic Missouri box, so it can only
  // grow as the catalog does.
  const area = await getServiceAreaBounds();
  const defaultBounds: [number, number, number, number] = [
    area.minLng,
    area.minLat,
    area.maxLng,
    area.maxLat,
  ];

  return (
    <PlanPageClient
      initialRiverSlug={slug}
      guidePost={guidePost}
      defaultBounds={defaultBounds}
    />
  );
}
