// Associated gauges redirect in proxy.ts before any HTML is streamed.
// Unassociated numeric stations retain their standalone detail page.

import { appBannerMetadata } from '@/lib/app-discovery';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { createPublicCatalogClient } from '@/lib/supabase/public-read';

export const revalidate = 300;
import GaugeDetailView from '@/components/gauge/GaugeDetailView';

// Local, matching rivers/[state]/[slug]/page.tsx — there is no shared export.
const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://eddy.guide';

interface Props {
  params: Promise<{ slug: string }>;
}

/** The station's own name, for a site id nobody has curated. */
async function getStationName(siteId: string): Promise<string | null> {
  const supabase = createPublicCatalogClient();
  const { data, error } = await supabase
    .from('gauge_stations')
    .select('name')
    .eq('usgs_site_id', siteId)
    .eq('active', true)
    .maybeSingle();
  if (error) throw error;
  return data?.name || null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;

  // Known river slugs redirect in proxy.ts; unknown slugs render a 404.
  if (!slug || !/^\d+$/.test(slug)) {
    return { title: 'Gauge' };
  }

  const name = await getStationName(slug);
  const title = name ? `${name} — USGS gauge` : `USGS gauge ${slug}`;
  const description = `USGS water levels and recent history for ${name ? `${name} (site ${slug})` : `site ${slug}`}. Open for the latest readings.`;
  const pageUrl = `${BASE_URL}/gauges/${slug}`;

  return {
    title,
    ...appBannerMetadata(`/gauge/${encodeURIComponent(slug)}`),
    description,
    alternates: { canonical: pageUrl },
    openGraph: { type: 'website', title, description, url: pageUrl, siteName: 'Eddy' },
    twitter: { card: 'summary_large_image', title, description },
  };
}

export default async function GaugeSlugPage({ params }: Props) {
  const { slug } = await params;

  if (!/^\d+$/.test(slug)) notFound();
  return <GaugeDetailView siteId={slug} />;
}

// Generate public HTML on the first visit, then revalidate it.
export async function generateStaticParams() { return []; }
