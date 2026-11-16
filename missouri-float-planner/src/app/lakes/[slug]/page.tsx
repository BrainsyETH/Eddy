import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import LakeDetail from '@/components/lake/LakeDetail';
import { stateName } from '@/lib/navigation/states';
import PlaceHeader from '@/components/lake/PlaceHeader';
import SiteFooter from '@/components/ui/SiteFooter';
import { getLake, poolDamFor } from '@/lib/lakes/registry';
import { lakePageHref } from '@/lib/lakes/public-pages';
import { loadLakeSection } from '@/lib/lakes/section';
import { loadDamPageSnapshot } from '@/lib/data/dam-page-snapshot';
import { publicPageMetadata, SHARE_IMAGES } from '@/lib/seo';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const lake = getLake(slug), href = lakePageHref(slug);
  if (!lake || !href) return { title: 'Lake not found', robots: { index: false, follow: false } };
  return publicPageMetadata(`${lake.name} Levels & Boat Launches`, `See ${lake.name} water levels, recent changes and reviewed boat launches, with directions and a link to dam conditions.`, href, SHARE_IMAGES.site);
}

export default async function LakePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const lake = getLake(slug);
  if (!lake || !lakePageHref(slug)) notFound();
  const damEntry = poolDamFor(lake);
  if (!damEntry) notFound();
  await connection();
  const renderedAt = Date.now();
  const dam = await loadDamPageSnapshot(damEntry.id, renderedAt);
  const section = await loadLakeSection(damEntry.id, dam?.metrics.poolElevation, renderedAt);
  if (!section) notFound();
  return <div className="min-h-screen bg-neutral-50"><div className="mx-auto max-w-7xl px-4 pb-10 pt-5 sm:px-6 lg:px-8">
    <PlaceHeader lakeSlug={lake.slug} kind="lake" title={lake.name}><p>{lake.states.map(stateName).join(' / ')} · <Link className="inline-block min-h-11 content-center underline underline-offset-4" href={`/dams/${damEntry.id}`}>{damEntry.name}</Link></p></PlaceHeader>
    <div className="place-content">
      <LakeDetail lake={section} damId={damEntry.id} damName={damEntry.name} renderedAt={renderedAt} />
    </div>
  </div><SiteFooter maxWidth="max-w-7xl" /></div>;
}
