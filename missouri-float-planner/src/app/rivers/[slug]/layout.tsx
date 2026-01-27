// src/app/rivers/[slug]/layout.tsx
// Layout for river detail pages
// Exports generateMetadata for dynamic social media preview tags
// Metadata is generated here (server component) so the page.tsx
// can remain a pure client component without SSR issues

import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://eddy.guide';

// Force dynamic rendering - this page fetches live data from Supabase
export const dynamic = 'force-dynamic';

interface RiverLayoutProps {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: RiverLayoutProps): Promise<Metadata> {
  // Wrap everything in try-catch to ensure the page never 500s due to metadata
  try {
    const resolvedParams = await params;
    const slug = resolvedParams?.slug;

    if (!slug) {
      return {
        title: 'River',
        description: 'Plan your float trip on Missouri rivers.',
        openGraph: {
          images: [{ url: `${BASE_URL}/api/og`, width: 1200, height: 630, type: 'image/png' }],
        },
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
      return {
        title: 'River Not Found',
        openGraph: {
          images: [{ url: `${BASE_URL}/api/og`, width: 1200, height: 630, type: 'image/png' }],
        },
      };
    }

    // Fetch current conditions for the river (non-critical - gracefully degrade)
    let conditionCode = 'unknown';
    let gaugeHeight = '';
    let flowDesc = '';

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: conditionData } = await (supabase.rpc as any)('get_river_condition', {
        p_river_id: river.id,
      });

      if (conditionData && conditionData.length > 0) {
        const cond = conditionData[0];
        conditionCode = cond.condition_code || 'unknown';
        if (cond.gauge_height_ft) {
          gaugeHeight = parseFloat(cond.gauge_height_ft).toFixed(2);
        }
        flowDesc = cond.condition_label || '';
      }
    } catch (condError) {
      // Conditions are non-critical for metadata - continue with defaults
      console.warn('Failed to fetch conditions for river metadata:', condError);
    }

    const conditionLabels: Record<string, string> = {
      optimal: 'Optimal',
      low: 'Low - Floatable',
      very_low: 'Very Low',
      high: 'High Water',
      too_low: 'Too Low',
      dangerous: 'Dangerous',
      unknown: '',
    };

    const conditionText = conditionLabels[conditionCode] || '';
    const conditionSuffix = conditionText ? ` - ${conditionText}` : '';
    const lengthMiles = river.length_miles ? parseFloat(river.length_miles).toFixed(1) : '';

    const title = `${river.name}${conditionSuffix}`;
    const description = `${river.name} float trip info${conditionText ? `: Currently ${conditionText.toLowerCase()}` : ''}. ${lengthMiles ? `${lengthMiles} miles` : ''}${river.difficulty_rating ? `, ${river.difficulty_rating}` : ''}${river.region ? ` in ${river.region}` : ''}. Real-time water conditions, access points, float times, and weather.`;

    // Build OG image URL with explicit param setting
    const ogParams = new URLSearchParams();
    ogParams.set('name', river.name);
    ogParams.set('condition', conditionCode);
    if (lengthMiles) ogParams.set('length', lengthMiles);
    if (river.difficulty_rating) ogParams.set('difficulty', river.difficulty_rating);
    if (river.region) ogParams.set('region', river.region);
    if (gaugeHeight) ogParams.set('gaugeHeight', gaugeHeight);
    if (flowDesc) ogParams.set('flowDesc', flowDesc);

    const ogImageUrl = `${BASE_URL}/api/og/river?${ogParams.toString()}`;
    const pageUrl = `${BASE_URL}/rivers/${slug}`;

    return {
      title,
      description,
      openGraph: {
        type: 'website',
        title: `${river.name} - Float Trip Conditions & Info`,
        description,
        url: pageUrl,
        siteName: 'Eddy',
        images: [
          {
            url: ogImageUrl,
            width: 1200,
            height: 630,
            type: 'image/png',
            alt: `${river.name} current conditions and float trip info`,
          },
        ],
      },
      twitter: {
        card: 'summary_large_image',
        title: `${river.name}${conditionSuffix}`,
        description,
        images: [
          {
            url: ogImageUrl,
            width: 1200,
            height: 630,
          },
        ],
      },
    };
  } catch (error) {
    console.error('Error generating river metadata:', error);
    const fallbackOgImage = `${BASE_URL}/api/og`;
    return {
      title: 'River',
      description: 'Plan your float trip on Missouri rivers.',
      openGraph: {
        type: 'website',
        title: 'River | Eddy',
        description: 'Plan your float trip on Missouri rivers.',
        siteName: 'Eddy',
        images: [
          {
            url: fallbackOgImage,
            width: 1200,
            height: 630,
            type: 'image/png',
            alt: 'Eddy - Missouri Float Trip Planner',
          },
        ],
      },
      twitter: {
        card: 'summary_large_image',
        title: 'River | Eddy',
        description: 'Plan your float trip on Missouri rivers.',
        images: [
          {
            url: fallbackOgImage,
            width: 1200,
            height: 630,
          },
        ],
      },
    };
  }
}

export default function RiverLayout({ children }: RiverLayoutProps) {
  return children;
}
