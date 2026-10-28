import type { Metadata } from 'next';
import HomePage, { FEATURED_RIVER_SLUGS } from '@/components/home/HomePage';
import { getRiverGuides } from '@/lib/data/rivers';
import { pageDamSummaries, pageRivers } from '@/lib/data/public-pages';
import { floatSearchLaunch } from '@/lib/float-search-launch';
import { conditionsDamCatalogue } from '@/lib/conditions/dam-catalogue';
import { DAM_DISCOVERY_ORDER } from '@/lib/conditions/directory';

export const metadata: Metadata = {
  alternates: {
    canonical: '/',
    types: { 'application/rss+xml': '/blog/feed.xml' },
  },
};

export const revalidate = 300; // ISR every 5 minutes

export default async function Home() {
  const [riverGuides, rivers, damSummaries] = await Promise.all([
    getRiverGuides(FEATURED_RIVER_SLUGS),
    pageRivers().catch(() => []),
    pageDamSummaries().catch(() => []),
  ]);
  const featuredReports = ['current', 'meramec', 'buffalo', 'eleven-point', 'jacks-fork', 'huzzah'].flatMap(slug => {
    const river = rivers.find(item => item.slug === slug);
    return river ? [river] : [];
  });
  const catalogue = conditionsDamCatalogue(damSummaries);
  const featuredDams = DAM_DISCOVERY_ORDER.flatMap(id => catalogue.dams.filter(dam => dam.id === id));
  return <HomePage riverGuides={riverGuides} featuredReports={featuredReports} featuredDams={featuredDams}
    renderedAt={Date.now()} damsUnavailable={catalogue.damsUnavailable} floatSearchEnabled={floatSearchLaunch().web} />;
}
