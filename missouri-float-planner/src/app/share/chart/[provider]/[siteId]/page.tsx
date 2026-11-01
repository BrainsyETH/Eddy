import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import GaugeDetailView from '@/components/gauge/GaugeDetailView';
import {
  parseChartShare,
  shareStation,
  shareParams,
  chartImagePath,
  chartShareAppPath,
  chartSharePath,
  chartShareTitle,
  chartStatisticLabel,
  gaugeSharePath,
} from '@shared/chart-share';
import { getUsaceDam } from '@/lib/flow-providers/usace-registry';
import { getStationName } from '@/lib/gauges/station-name';
import { appBannerMetadata } from '@/lib/app-discovery';
import { SHARE_IMAGES } from '@/lib/seo';

type Props = {
  params: Promise<{ provider: string; siteId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};
export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { provider, siteId } = await params;
  const state = parseChartShare(provider, siteId, shareParams(await searchParams));
  const station = shareStation(provider, siteId);
  // The title is the most prominent line of a Messages or Slack preview, so it
  // names the station and the dates rather than a site number. A catalog
  // outage must not fail the page; the site number is the fallback.
  const name = state ? await getStationName(siteId).catch(() => null) : null;
  const title = state ? chartShareTitle(name, state) : `USGS ${siteId} · Shared chart`;
  const description = state
    ? `${state.unit === 'cfs' ? 'Flow' : 'Gauge height'} chart from Eddy · ${chartStatisticLabel(state.statistic)}. USGS provisional values may be revised.`
    : 'A fixed date window from Eddy. USGS provisional values may be revised.';
  // A malformed link still unfurls with an image, the gauge artwork.
  const images = state
    ? [{ url: chartImagePath(state, true), width: 1200, height: 630, alt: title }]
    : [{ url: SHARE_IMAGES.gauge.url, width: 1200, height: 630, alt: SHARE_IMAGES.gauge.alt }];
  const url = state ? chartSharePath(state) : `/share/chart/${encodeURIComponent(provider)}/${encodeURIComponent(siteId)}`;
  return {
    title,
    description,
    robots: { index: false, follow: true },
    openGraph: { type: 'website', siteName: 'Eddy', url, title, description, images },
    twitter: { card: 'summary_large_image', title, description, images },
    // Safari's banner opens the same screen a universal link would: the gauge
    // with the shared view, or flagged as unavailable when it can't be restored.
    ...(station ? appBannerMetadata(chartShareAppPath(station, state)) : {}),
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
