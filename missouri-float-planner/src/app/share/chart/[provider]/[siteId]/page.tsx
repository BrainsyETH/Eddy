import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import GaugeDetailView from '@/components/gauge/GaugeDetailView';
import {
  parseChartShare,
  shareStation,
  shareParams,
  chartImagePath,
  gaugeSharePath,
} from '@shared/chart-share';
import { getUsaceDam } from '@/lib/flow-providers/usace-registry';

type Props = {
  params: Promise<{ provider: string; siteId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};
export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { provider, siteId } = await params;
  const state = parseChartShare(provider, siteId, shareParams(await searchParams));
  const title = `USGS ${siteId} · Shared chart`;
  const description = 'A fixed date window from Eddy. USGS provisional values may be revised.';
  const images = state
    ? [{ url: chartImagePath(state, true), width: 1200, height: 630, alt: title }]
    : undefined;
  return {
    title,
    description,
    robots: { index: false, follow: true },
    openGraph: { title, description, images },
    twitter: { card: 'summary_large_image', title, description, images },
  };
}
export default async function SharedChartPage({ params, searchParams }: Props) {
  const { provider, siteId } = await params;
  const station = shareStation(provider, siteId);
  if (!station) notFound();
  if (station.provider === 'usace') {
    if (!getUsaceDam(siteId)) notFound();
    redirect(gaugeSharePath(station));
  }
  const state = parseChartShare(provider, siteId, shareParams(await searchParams));
  return (
    <GaugeDetailView
      key={state ? JSON.stringify(state) : siteId}
      siteId={siteId}
      initialShareState={state ?? undefined}
      shareUnavailable={!state}
    />
  );
}
