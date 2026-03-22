// src/app/gauges/[siteId]/page.tsx
// Individual gauge station page — serves metadata + OG image for social crawlers,
// and renders the full detail view for users.

import { createClient } from '@/lib/supabase/server';
import type { Metadata } from 'next';
import GaugeDetailView from '@/components/gauge/GaugeDetailView';

interface Props {
  params: Promise<{ siteId: string }>;
}

async function getGaugeData(siteId: string) {
  try {
    const supabase = await createClient();

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

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { siteId } = await params;
  const station = await getGaugeData(siteId);
  const name = station?.name || `Gauge ${siteId}`;

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

export default async function GaugeStationPage({ params }: Props) {
  const { siteId } = await params;

  return <GaugeDetailView siteId={siteId} />;
}
