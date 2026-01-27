// src/app/plan/[shortCode]/layout.tsx
// Layout for shared plan pages
// Exports generateMetadata for dynamic social media preview tags
// Metadata is generated here (server component) so the page.tsx
// can remain a pure client component without SSR issues

import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';

// Derive base URL from request headers so OG images resolve from the same
// origin that serves the page (avoids cross-domain timeouts when the custom
// domain isn't configured or has DNS issues).
async function getBaseUrl(): Promise<string> {
  try {
    const headersList = await headers();
    const host = headersList.get('host');
    if (host) {
      const proto = headersList.get('x-forwarded-proto') || 'https';
      return `${proto}://${host}`;
    }
  } catch {
    // headers() not available outside request context
  }
  return process.env.NEXT_PUBLIC_BASE_URL
    || process.env.NEXT_PUBLIC_SITE_URL
    || 'https://eddy.guide';
}

interface PlanLayoutProps {
  children: React.ReactNode;
  params: Promise<{ shortCode: string }>;
}

function formatMinutes(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const mins = Math.round(totalMinutes % 60);
  if (hours === 0) return `${mins}min`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

export async function generateMetadata({ params }: PlanLayoutProps): Promise<Metadata> {
  try {
    const BASE_URL = await getBaseUrl();
    const resolvedParams = await params;
    const shortCode = resolvedParams?.shortCode;

    if (!shortCode) {
      return {
        title: 'Float Plan',
        description: 'View and share your Missouri float trip plan.',
        openGraph: {
          images: [{ url: `${BASE_URL}/api/og`, width: 1200, height: 630, type: 'image/png' }],
        },
      };
    }

    const supabase = await createClient();

    // Fetch the saved plan
    const { data: savedPlan, error: planError } = await supabase
      .from('float_plans')
      .select('*')
      .eq('short_code', shortCode)
      .single();

    if (planError || !savedPlan) {
      return {
        title: 'Plan Not Found',
        description: 'This float plan could not be found.',
        openGraph: {
          images: [{ url: `${BASE_URL}/api/og`, width: 1200, height: 630, type: 'image/png' }],
        },
      };
    }

    // Fetch river, access points, vessel type, and gauge station in parallel
    const [riverResult, putInResult, takeOutResult, , gaugeResult] = await Promise.all([
      supabase.from('rivers').select('name, slug, region').eq('id', savedPlan.river_id).single(),
      supabase.from('access_points').select('name').eq('id', savedPlan.start_access_id).single(),
      supabase.from('access_points').select('name').eq('id', savedPlan.end_access_id).single(),
      savedPlan.vessel_type_id
        ? supabase.from('vessel_types').select('name').eq('id', savedPlan.vessel_type_id).single()
        : Promise.resolve({ data: null, error: null }),
      supabase
        .from('river_gauges')
        .select('gauge_stations ( name )')
        .eq('river_id', savedPlan.river_id)
        .eq('is_primary', true)
        .limit(1)
        .maybeSingle(),
    ]);

    const riverName = riverResult.data?.name || 'Missouri River';
    const putInName = putInResult.data?.name || 'Start';
    const takeOutName = takeOutResult.data?.name || 'End';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const gaugeStationRaw = gaugeResult.data?.gauge_stations as any;
    const gaugeName = Array.isArray(gaugeStationRaw)
      ? gaugeStationRaw[0]?.name
      : gaugeStationRaw?.name || '';
    const gaugeHeight = savedPlan.gauge_reading_at_creation
      ? parseFloat(savedPlan.gauge_reading_at_creation).toFixed(2)
      : '';
    const dischargeCfs = savedPlan.discharge_cfs_at_creation
      ? Math.round(parseFloat(savedPlan.discharge_cfs_at_creation)).toString()
      : '';
    const distanceMiles = savedPlan.distance_miles
      ? parseFloat(savedPlan.distance_miles).toFixed(1)
      : '';
    const floatTimeFormatted = savedPlan.estimated_float_minutes
      ? formatMinutes(savedPlan.estimated_float_minutes)
      : '';
    const conditionCode = savedPlan.condition_at_creation || 'unknown';

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

    const title = `${riverName} - ${putInName} to ${takeOutName}`;
    const descParts: string[] = [];
    if (distanceMiles) descParts.push(`${distanceMiles} mi`);
    if (floatTimeFormatted) descParts.push(`~${floatTimeFormatted} float`);
    if (conditionText) descParts.push(`Conditions: ${conditionText}`);

    const description = descParts.length > 0
      ? `${riverName} float plan - ${descParts.join(' | ')} | Check conditions on Eddy.`
      : `${riverName} float plan from ${putInName} to ${takeOutName}. Check conditions on Eddy.`;

    // Build OG image URL
    const ogParams = new URLSearchParams();
    ogParams.set('river', riverName);
    ogParams.set('putIn', putInName);
    ogParams.set('takeOut', takeOutName);
    ogParams.set('condition', conditionCode);
    if (distanceMiles) ogParams.set('distance', `${distanceMiles} mi`);
    if (floatTimeFormatted) ogParams.set('floatTime', floatTimeFormatted);
    if (gaugeName) ogParams.set('gaugeName', gaugeName);
    if (gaugeHeight) ogParams.set('gaugeHeight', gaugeHeight);
    if (dischargeCfs) ogParams.set('dischargeCfs', dischargeCfs);

    const ogImageUrl = `${BASE_URL}/api/og/plan?${ogParams.toString()}`;
    const pageUrl = `${BASE_URL}/plan/${shortCode}`;

    return {
      title,
      description,
      openGraph: {
        type: 'website',
        title: `${riverName} - ${putInName} to ${takeOutName}`,
        description,
        url: pageUrl,
        siteName: 'Eddy',
        images: [
          {
            url: ogImageUrl,
            width: 1200,
            height: 630,
            type: 'image/png',
            alt: `Float plan for ${riverName}: ${putInName} to ${takeOutName}`,
          },
        ],
      },
      twitter: {
        card: 'summary_large_image',
        title: `${riverName}: ${putInName} to ${takeOutName}`,
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
    console.error('Error generating plan metadata:', error);
    const fallbackBase = await getBaseUrl();
    const fallbackOgImage = `${fallbackBase}/api/og`;
    return {
      title: 'Float Plan',
      description: 'View and share your Missouri float trip plan.',
      openGraph: {
        type: 'website',
        title: 'Float Plan | Eddy',
        description: 'View and share your Missouri float trip plan.',
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
        title: 'Float Plan | Eddy',
        description: 'View and share your Missouri float trip plan.',
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

export default function PlanLayout({ children }: PlanLayoutProps) {
  return children;
}
