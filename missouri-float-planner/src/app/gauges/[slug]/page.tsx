// src/app/gauges/[slug]/page.tsx
// Legacy gauge detail route. River conditions now live on the canonical river
// hub at /rivers/[slug], so this route permanently redirects there:
//   • river slug    → /rivers/<slug>
//   • USGS site id  → /rivers/<primary river slug for that gauge>
// A numeric site id with no associated river falls back to the standalone
// single-gauge view.

import { permanentRedirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import GaugeDetailView from '@/components/gauge/GaugeDetailView';

interface Props {
  params: Promise<{ slug: string }>;
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

export default async function GaugeSlugPage({ params }: Props) {
  const { slug } = await params;

  // Numeric = USGS site id → send to that gauge's river hub
  if (/^\d+$/.test(slug)) {
    const riverSlug = await getPrimaryRiverSlugForGauge(slug);
    if (riverSlug) permanentRedirect(`/rivers/${riverSlug}`);
    // Orphan gauge with no associated river — keep the standalone gauge view.
    return <GaugeDetailView siteId={slug} />;
  }

  // River slug → canonical river hub (conditions render inline there)
  permanentRedirect(`/rivers/${slug}`);
}
