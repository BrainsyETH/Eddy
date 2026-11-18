import Link from 'next/link';
import { centralDayKey } from '@shared/dam-schedule-copy';
import { EddyIcon } from '@/components/ui/EddyIcon';
import FlowTrendChart from '@/components/ui/FlowTrendChart';
import SiteFooter from '@/components/ui/SiteFooter';
import ConditionDaysReport, { type Comparison } from '@/components/condition-days/ConditionDaysReport';
import { StudyPicker } from '@/components/condition-days/StudyPicker';
import { archiveFor, recentReading, resolvePair, seasonFor } from '@/lib/condition-days/data';
import { gaugeCoverage, coverageReasons } from '@/lib/condition-days/gauge-coverage';
import { DEFAULT_SITE, seasonHistory, pairedDays, REPORT_PATH, REPORT_TITLE, stations, summarize } from '@/lib/condition-days/study';
import { publicPageMetadata, SHARE_IMAGES } from '@/lib/seo';
import styles from '@/components/condition-days/report.module.css';

export const metadata = publicPageMetadata(REPORT_TITLE + ' | Eddy Research',
  'Explore when Ozark rivers ran low, good or high across 20 years of USGS flow records. Compare stretches and see how this year stacks up.', REPORT_PATH, SHARE_IMAGES.site);

export default async function ConditionDays({ searchParams }: { searchParams: Promise<{site?: string; compare?: string}> }) {
  const params = await searchParams;
  const companion = gaugeCoverage.find(s => s.site === params.site);
  const station = stations.find(s => s.site === params.site) ?? stations.find(s => s.slug === companion?.slug) ?? stations.find(s => s.site === DEFAULT_SITE)!;
  const other = stations.find(s => s.site === params.compare && s.slug === station.slug && s.site !== station.site);
  return <><div className={styles.page}><div className={styles.inner}>
    <nav className={styles.crumb} aria-label="Breadcrumb"><Link href="/blog#research">← Guides / Research</Link></nav>
    <header className={styles.hero}><div><h1>{REPORT_TITLE}</h1><p>See when your stretch ran low, when it floated well, and how today compares.</p></div><EddyIcon name="checkingGauge" size={105}/></header>
    <StudyPicker station={station} selectedSite={companion?.site ?? station.site} compare={other?.site}/>
    {companion ? <section className={styles.panel}><h2>{companion.label}</h2>
      <p>{coverageReasons[companion.reason]}</p>
      {companion.reason !== 'release' && <FlowTrendChart key={companion.site} gaugeSiteId={companion.site} days={7}
        displayUnit={companion.reason === 'stage' ? 'ft' : 'cfs'} chartClassName="h-48" showProvenance/>}
      <Link className={styles.gaugeLink} href={companion.reason === 'release' ? '/dams/' + companion.site : '/gauges/' + companion.site}>See {companion.label} readings →</Link>
    </section> : <PublishedReport station={station} other={other}/>}
  </div></div><SiteFooter/></>;
}

async function PublishedReport({ station, other }: { station: typeof stations[number]; other?: typeof stations[number] }) {
  const today = centralDayKey();
  const [a, pair, b, otherPair] = await Promise.all([archiveFor(station), resolvePair(station),
    other ? archiveFor(other) : null, other ? resolvePair(other) : null]);
  let compare: Comparison | null = null;
  if (other && b && otherPair && pair) compare = { label: other.label, site: other.site, data: summarize(b, otherPair.thresholds, today), paired: pairedDays(a, b, pair.thresholds, otherPair.thresholds) };
  const [reading, season] = await Promise.all([pair ? recentReading(pair.id, pair.thresholds, pair.floodStageFt, today) : null, seasonFor(station.site, pair?.id ?? null, today)]);
  return <>
    {other && !otherPair && <p>The comparison gauge no longer has reviewed flow ranges.</p>}
    {pair ? <ConditionDaysReport key={station.site} station={station} summary={summarize(a, pair.thresholds, today)} thresholds={pair.thresholds}
      reading={reading} today={today} season={season} history={seasonHistory(a, pair.thresholds, season)} archived={pair.archived} compare={compare}/> :
      <p className={styles.panel}>This gauge no longer has a complete flow rating. Choose another gauge to explore its history.</p>}
  </>;
}
