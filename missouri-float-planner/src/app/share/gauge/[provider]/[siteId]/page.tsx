import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import GaugeDetailView from '@/components/gauge/GaugeDetailView';
import DamPage, { generateMetadata as damMetadata } from '@/app/dams/[damId]/page';
import { generateMetadata as gaugeMetadata } from '@/app/gauges/[slug]/page';
import { linkPreviewAsset } from '@/lib/og/link-preview';
import { shareStation, gaugeSharePath } from '@shared/chart-share';

type Props = { params: Promise<{ provider: string; siteId: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { provider, siteId } = await params;
  const station = shareStation(provider, siteId);
  if (!station) return { title: 'Station not found' };
  const metadata = provider === 'usace' ? await damMetadata({ params: Promise.resolve({ damId: siteId }) })
    : await gaugeMetadata({ params: Promise.resolve({ slug: siteId }) });
  const asset = linkPreviewAsset(provider === 'usace' ? 'dam' : 'gauge', siteId);
  const images = [{ url: `/share/${asset.file}`, width: 1200, height: 630, alt: asset.alt }];
  return { ...metadata, alternates: { canonical: gaugeSharePath(station) }, robots: { index: false, follow: true },
    openGraph: { ...metadata.openGraph, url: gaugeSharePath(station), images }, twitter: { ...metadata.twitter, card: 'summary_large_image', images } };

}
export default async function SharedGaugePage({ params }: Props) {
  const { provider, siteId } = await params;
  const station = shareStation(provider, siteId);
  if (!station) notFound();
  return station.provider === 'usace' ? <DamPage params={Promise.resolve({ damId: siteId })} /> : <GaugeDetailView siteId={siteId} />;
}
