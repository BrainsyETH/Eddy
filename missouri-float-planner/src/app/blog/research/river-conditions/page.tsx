import Link from 'next/link';
import { centralDayKey } from '@shared/dam-schedule-copy';
import { EddyIcon } from '@/components/ui/EddyIcon';
import SiteFooter from '@/components/ui/SiteFooter';
import ConditionDaysReport, { type Comparison } from '@/components/condition-days/ConditionDaysReport';
import { StudyPicker } from '@/components/condition-days/StudyPicker';
import { archiveFor, recentReading, resolvePair, seasonFor } from '@/lib/condition-days/data';
import { DEFAULT_SITE, pairedDays, REPORT_PATH, REPORT_TITLE, stations, summarize } from '@/lib/condition-days/study';
import { publicPageMetadata, SHARE_IMAGES } from '@/lib/seo';
import styles from '@/components/condition-days/report.module.css';

export const metadata = publicPageMetadata(REPORT_TITLE + ' | Eddy Research',
  'Explore when Ozark rivers ran low, good or high across 20 years of USGS flow records. Compare stretches and see how this year stacks up.', REPORT_PATH, SHARE_IMAGES.site);

export default async function ConditionDays({ searchParams }: { searchParams: Promise<{site?: string; compare?: string}> }) {
  const params = await searchParams;
  const station = stations.find(s => s.site === params.site) ?? stations.find(s => s.site === DEFAULT_SITE)!;
  const other = stations.find(s => s.site === params.compare && s.slug === station.slug && s.site !== station.site);
  const today = centralDayKey();
  const [a, pair, b, otherPair] = await Promise.all([archiveFor(station), resolvePair(station),
    other ? archiveFor(other) : null, other ? resolvePair(other) : null]);
  let compare: Comparison | null = null;
  if (other && b && otherPair && pair) compare = { label: other.label, site: other.site, data: summarize(b, otherPair.thresholds, today), paired: pairedDays(a, b, pair.thresholds, otherPair.thresholds) };
  const [reading, season] = await Promise.all([pair ? recentReading(pair.id, pair.thresholds, pair.floodStageFt, today) : null, seasonFor(station.site, pair?.id ?? null, today)]);
  return <><div className={styles.page}><div className={styles.inner}>
    <nav className={styles.crumb} aria-label="Breadcrumb"><Link href="/blog#research">← Guides / Research</Link></nav>
    <header className={styles.hero}><div><h1>{REPORT_TITLE}</h1><p>See when your stretch ran low, when it floated well, and how today compares.</p></div><EddyIcon name="checkingGauge" size={105}/></header>
    <StudyPicker station={station} compare={other?.site}/>
    {other && !otherPair && <p>The comparison gauge no longer has reviewed flow ranges.</p>}
    {pair ? <ConditionDaysReport key={station.site} station={station} summary={summarize(a, pair.thresholds, today)} thresholds={pair.thresholds}
      reading={reading} today={today} season={season} archived={pair.archived} compare={compare}/> :
      <p className={styles.panel}>This gauge no longer has a complete flow rating. Choose another gauge to explore its history.</p>}
  </div></div><SiteFooter/></>;
}
