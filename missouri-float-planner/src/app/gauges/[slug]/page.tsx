// src/app/gauges/[slug]/page.tsx
// Legacy gauge detail route. River conditions now live on the canonical river
// hub at /rivers/[slug], so this route permanently redirects there:
//   • river slug    → /rivers/<slug>
//   • USGS site id  → /rivers/<primary river slug for that gauge>
// A numeric site id with no associated river falls back to the standalone
// single-gauge view.
//
// ── Why this route has metadata despite mostly redirecting ─────────────────
// "Legacy" undersells it: this is the URL the iOS app shares for a gauge, and
// the only one that resolves a bare USGS site number to something a person can
// read. Most requests do redirect, and for those the metadata never renders —
// a crawler follows the 308 and reads the river hub's.
//
// The fall-through does not redirect, and it is the case that matters here: an
// UNCURATED station, which is most of the ~14,000 in the national tier and
// exactly the kind of link someone sends when they want a second opinion on a
// creek Eddy has never rated. That page had no title and no description, so it
// unfurled as the bare site name with the site-wide blurb. opengraph-image.tsx
// beside this file has always drawn a proper card for it; nothing was telling
// anyone what the card was of.

import type { Metadata } from 'next';
import { permanentRedirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import GaugeDetailView from '@/components/gauge/GaugeDetailView';

// Local, matching rivers/[state]/[slug]/page.tsx — there is no shared export.
const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://eddy.guide';

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

/** The station's own name, for a site id nobody has curated. */
async function getStationName(siteId: string): Promise<string | null> {
  try {
    const supabase = createAdminClient();
    const { data } = await supabase
      .from('gauge_stations')
      .select('name')
      .eq('usgs_site_id', siteId)
      .eq('active', true)
      .maybeSingle();
    return data?.name || null;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;

  // Everything non-numeric redirects to a river hub that has its own metadata,
  // so there is nothing here worth computing for it.
  if (!slug || !/^\d+$/.test(slug)) {
    return { title: 'Gauge' };
  }

  const name = await getStationName(slug);
  const title = name ? `${name} — live gauge reading` : `USGS gauge ${slug}`;
  // Says what this page is and, as importantly, what it is NOT. An uncurated
  // station gets a reading and a comparison to its own history; Eddy issues no
  // floatability verdict on a stretch nobody has set thresholds for, and the
  // description is the first place a reader learns that.
  const description = name
    ? `Live USGS reading and recent history for ${name} (site ${slug}). Reference data — Eddy has not rated this gauge for floating.`
    : `Live USGS reading and recent history for site ${slug}. Reference data — Eddy has not rated this gauge for floating.`;
  const pageUrl = `${BASE_URL}/gauges/${slug}`;

  return {
    title,
    description,
    alternates: { canonical: pageUrl },
    openGraph: { type: 'website', title, description, url: pageUrl, siteName: 'Eddy' },
    twitter: { card: 'summary_large_image', title, description },
  };
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
