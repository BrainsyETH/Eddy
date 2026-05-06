// src/app/rivers/[slug]/page.tsx
// Server component wrapper — exports generateMetadata (with searchParams for float plan OG)
// and renders the client-side river page

import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import RiverPageClient from './RiverPageClient';

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://eddy.guide';

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ putIn?: string; takeOut?: string; vessel?: string }>;
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  try {
    const [resolvedParams, resolvedSearch] = await Promise.all([params, searchParams]);
    const slug = resolvedParams?.slug;

    if (!slug) {
      return {
        title: 'River',
        description: 'Plan your next float trip with live conditions and access points.',
      };
    }

    const supabase = await createClient();

    // Fetch river basic info
    const { data: river, error: riverError } = await supabase
      .from('rivers')
      .select('id, name, slug, length_miles, description, difficulty_rating, region')
      .eq('slug', slug)
      .single();

    if (riverError || !river) {
      return { title: 'River Not Found' };
    }

    // Check if this is a float plan share URL
    const putInId = resolvedSearch?.putIn;
    const takeOutId = resolvedSearch?.takeOut;
    const isFloatPlanShare = putInId && takeOutId;

    // Fetch current conditions for the river
    let conditionCode = 'unknown';
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: conditionData } = await (supabase.rpc as any)('get_river_condition', {
        p_river_id: river.id,
      });
      if (conditionData && conditionData.length > 0) {
        conditionCode = conditionData[0].condition_code || 'unknown';
      }
    } catch (condError) {
      console.warn('Failed to fetch conditions for river metadata:', condError);
    }

    const conditionLabels: Record<string, string> = {
      flowing: 'Flowing',
      good: 'Good - Floatable',
      low: 'Very Low',
      high: 'High Water',
      too_low: 'Too Low',
      dangerous: 'Dangerous',
      unknown: '',
    };
    const conditionText = conditionLabels[conditionCode] || '';

    // If this is a float plan share, fetch access point names for the title/description
    if (isFloatPlanShare) {
      let putInName = '';
      let takeOutName = '';
      try {
        const [putInResult, takeOutResult] = await Promise.all([
          supabase.from('access_points').select('name').eq('id', putInId).single(),
          supabase.from('access_points').select('name').eq('id', takeOutId).single(),
        ]);
        putInName = putInResult.data?.name || 'Start';
        takeOutName = takeOutResult.data?.name || 'End';
      } catch {
        // Access point fetch failed
      }

      const title = `${putInName} → ${takeOutName} | ${river.name}`;
      const description = conditionText
        ? `Float ${river.name} from ${putInName} to ${takeOutName}. Currently ${conditionText.toLowerCase()}.`
        : `Float ${river.name} from ${putInName} to ${takeOutName}. Plan your trip on Eddy.`;

      const ogImageUrl = `${BASE_URL}/api/og/float?putIn=${putInId}&takeOut=${takeOutId}`;
      const pageUrl = `${BASE_URL}/rivers/${slug}?putIn=${putInId}&takeOut=${takeOutId}`;

      return {
        title,
        description,
        openGraph: {
          type: 'website',
          title,
          description,
          url: pageUrl,
          siteName: 'Eddy',
          images: [{ url: ogImageUrl, width: 1200, height: 630 }],
        },
        twitter: {
          card: 'summary_large_image',
          title,
          description,
          images: [ogImageUrl],
        },
      };
    }

    // Standard river page metadata (no float plan params)
    const lengthMiles = river.length_miles ? parseFloat(river.length_miles).toFixed(1) : '';
    const title = conditionText ? `${river.name} — ${conditionText}` : river.name;
    const ogTitle = `${river.name} | Live Conditions & Float Guide`;

    const descParts: string[] = [];
    if (conditionText) descParts.push(`Currently ${conditionText.toLowerCase()}.`);
    if (lengthMiles) descParts.push(`${lengthMiles} mi`);
    if (river.difficulty_rating) descParts.push(river.difficulty_rating);
    if (river.region) descParts.push(river.region);
    const descMeta = descParts.length > 1
      ? descParts.slice(0, 1).join('') + ' ' + descParts.slice(1).join(', ') + '.'
      : descParts.join(', ') + '.';
    const description = `${descMeta} Access points, float times, gauge data & weather for ${river.name}.`;
    const pageUrl = `${BASE_URL}/rivers/${slug}`;

    return {
      title,
      description,
      alternates: {
        canonical: pageUrl,
        types: {
          'application/json': `${BASE_URL}/api/rivers/${slug}`,
        },
      },
      openGraph: {
        type: 'website',
        title: ogTitle,
        description,
        url: pageUrl,
        siteName: 'Eddy',
        // OG image auto-discovered from opengraph-image.tsx
      },
      twitter: {
        card: 'summary_large_image',
        title: ogTitle,
        description,
        // Twitter image auto-discovered from twitter-image.tsx
      },
    };
  } catch (error) {
    console.error('Error generating river metadata:', error);
    return {
      title: 'River',
      description: 'Plan your next float trip with live conditions and access points.',
      openGraph: {
        type: 'website',
        title: 'River | Eddy',
        description: 'Plan your next float trip with live conditions and access points.',
        siteName: 'Eddy',
      },
      twitter: {
        card: 'summary_large_image',
        title: 'River | Eddy',
        description: 'Plan your next float trip with live conditions and access points.',
      },
    };
  }
}

export default async function RiverPage({ params }: Props) {
  const resolvedParams = await params;
  const slug = resolvedParams?.slug;

  // Fetch river data for structured data JSON-LD
  let riverName = 'River';
  let riverDescription: string | null = null;
  let riverLength: number | null = null;
  let riverDifficulty: string | null = null;
  let riverRegion: string | null = null;
  let riverBounds: number[] | null = null;
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

    const { data } = await supabase
      .from('rivers')
      .select('name, description, length_miles, difficulty_rating, region, geom')
      .eq('slug', slug)
      .single();
    if (data) {
      riverName = data.name;
      riverDescription = data.description;
      riverLength = data.length_miles ? parseFloat(data.length_miles) : null;
      riverDifficulty = data.difficulty_rating;
      riverRegion = data.region;
      // Extract centroid from geometry bounding box if available
      if (data.geom && typeof data.geom === 'object') {
        try {
          const geom = data.geom as GeoJSON.LineString;
          if (geom.coordinates && geom.coordinates.length > 0) {
            const lngs = geom.coordinates.map((c: number[]) => c[0]);
            const lats = geom.coordinates.map((c: number[]) => c[1]);
            riverBounds = [
              (Math.min(...lngs) + Math.max(...lngs)) / 2,
              (Math.min(...lats) + Math.max(...lats)) / 2,
            ];
          }
        } catch {
          // Geometry parsing failed, skip bounds
        }
      }
    }
  }

  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: BASE_URL },
      { '@type': 'ListItem', position: 2, name: 'Rivers', item: `${BASE_URL}/rivers` },
      { '@type': 'ListItem', position: 3, name: riverName, item: `${BASE_URL}/rivers/${slug}` },
    ],
  };

  const descParts: string[] = [];
  if (riverDescription) descParts.push(riverDescription);
  if (riverLength) descParts.push(`${riverLength.toFixed(1)} miles.`);
  if (riverDifficulty) descParts.push(`Difficulty: ${riverDifficulty}.`);
  if (riverRegion) descParts.push(`Located in ${riverRegion}, Missouri.`);
  const fullDescription = descParts.join(' ') || `Float trip guide for ${riverName} in Missouri.`;

  const touristAttractionJsonLd: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'TouristAttraction',
    name: riverName,
    description: fullDescription,
    touristType: ['Float trip', 'Canoeing', 'Kayaking', 'Tubing'],
    isAccessibleForFree: true,
    publicAccess: true,
    url: `${BASE_URL}/rivers/${slug}`,
    ...(riverBounds && {
      geo: {
        '@type': 'GeoCoordinates',
        latitude: riverBounds[1],
        longitude: riverBounds[0],
      },
    }),
    ...(riverRegion && {
      address: {
        '@type': 'PostalAddress',
        addressRegion: 'MO',
        addressCountry: 'US',
      },
    }),
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(touristAttractionJsonLd) }} />
      <RiverPageClient guidePost={guidePost} />
    </>
  );
}
