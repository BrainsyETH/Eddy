import type { Metadata } from 'next';
import HomePage, { FEATURED_RIVER_SLUGS } from '@/components/home/HomePage';
import { getRiverGuides } from '@/lib/data/rivers';
import { pageRivers } from '@/lib/data/public-pages';
import { floatSearchLaunch } from '@/lib/float-search-launch';

export const metadata: Metadata = {
  alternates: {
    canonical: '/',
    types: { 'application/rss+xml': '/blog/feed.xml' },
  },
};

export const revalidate = 300; // ISR every 5 minutes

export default async function Home() {
  const [riverGuides, rivers] = await Promise.all([
    getRiverGuides(FEATURED_RIVER_SLUGS),
    pageRivers(),
  ]);
  const featuredReports = ['current', 'meramec', 'buffalo'].flatMap(slug => {
    const river = rivers.find(item => item.slug === slug);
    return river ? [{ slug, name: river.name, path: river.path, photoUrl: river.photoUrl ?? riverGuides[slug]?.image ?? null }] : [];
  });
  return <HomePage riverGuides={riverGuides} featuredReports={featuredReports} floatSearchEnabled={floatSearchLaunch().web} />;
}
