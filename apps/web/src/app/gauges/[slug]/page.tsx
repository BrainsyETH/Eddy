// src/app/gauges/[slug]/page.tsx
// Dual-mode route: handles both numeric USGS siteId (redirects to river) and river slugs (renders detail)

import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import type { Metadata } from 'next';
import GaugeDetailView from '@/components/gauge/GaugeDetailView';
import RiverGaugeDetail from '@/components/gauge/RiverGaugeDetail';

interface Props {
  params: Promise<{ slug: string }>;
}

async function getGaugeData(siteId: string) {
  try {
    const supabase = createAdminClient();
    const { data: station } = await supabase
      .from('gauge_stations')
      .select('id, usgs_site_id, name')
      .eq('usgs_site_id', siteId)
      .eq('active', true)
      .single();
    return station;
  } catch {
    return null;
  }
}

async function getRiverData(slug: string) {
  try {
    const supabase = createAdminClient();
    const { data: river } = await supabase
      .from('rivers')
      .select('id, name, slug')
      .eq('slug', slug)
      .eq('active', true)
      .single();
    return river;
  } catch {
    return null;
  }
}

async function getPrimaryRiverSlugForGauge(siteId: string): Promise<string | null> {
  try {
    const supabase = createAdminClient();
    const { data: station } = await supabase
      .from('gauge_stations')
      .select('id')
      .eq('usgs_site_id', siteId)
      .eq('active', true)
      .single();

    if (!station) return null;

    const { data: rg } = await supabase
      .from('river_gauges')
      .select('rivers!inner(slug)')
      .eq('gauge_station_id', station.id)
      .eq('is_primary', true)
      .limit(1)
      .maybeSingle();

    if (!rg) return null;
    const river = rg.rivers as unknown as { slug: string };
    return river.slug || null;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;

  if (/^\d+$/.test(slug)) {
    // Numeric = USGS site ID
    const station = await getGaugeData(slug);
    const name = station?.name || `Gauge ${slug}`;
    return {
      title: `${name} | Eddy`,
      description: `Real-time water levels and flow data for ${name}. Current gauge height, discharge (CFS), and conditions.`,
      openGraph: {
        title: `${name} | Eddy`,
        description: `Real-time water levels and flow data for ${name}.`,
      },
      twitter: {
        card: 'summary_large_image',
        title: `${name} | Eddy`,
        description: `Real-time water levels and flow data for ${name}.`,
      },
    };
  }

  // Alphabetic = river slug
  const river = await getRiverData(slug);
  const name = river?.name || slug;
  return {
    title: `${name} River Levels | Eddy`,
    description: `Real-time gauge data and conditions for ${name}. View current water levels, flow trends, and Eddy's float report.`,
    openGraph: {
      title: `${name} River Levels | Eddy`,
      description: `Real-time gauge data and conditions for ${name}.`,
    },
    twitter: {
      card: 'summary_large_image',
      title: `${name} River Levels | Eddy`,
      description: `Real-time gauge data and conditions for ${name}.`,
    },
  };
}

export default async function GaugeSlugPage({ params }: Props) {
  const { slug } = await params;

  if (/^\d+$/.test(slug)) {
    // Numeric = USGS site ID — redirect to river page
    const riverSlug = await getPrimaryRiverSlugForGauge(slug);
    if (riverSlug) {
      redirect(`/gauges/${riverSlug}`);
    }
    // Fallback: render individual gauge detail if no river found
    return <GaugeDetailView siteId={slug} />;
  }

  // River slug — render river gauge detail
  return <RiverGaugeDetail riverSlug={slug} />;
}
