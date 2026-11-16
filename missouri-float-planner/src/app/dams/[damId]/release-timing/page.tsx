// src/app/dams/[damId]/release-timing/page.tsx
// How long a Bull Shoals release takes to reach the gauge near Norfork.
//
// A findings page, not a forecast. A short introduction leads to how long it takes (the
// map), how close Eddy has been (each estimate the release-arrival trial saved
// beforehand next to what the gauge then recorded), and what changes it. A
// research log shows where the work stands. Estimates appear only after their
// outcome (src/lib/arrival-trial/public-results.ts). One dam has this page;
// every other dam id is not found.

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import ReleaseTimingIntro, { RELEASE_TIMING_TITLE } from '@/components/release-timing/ReleaseTimingIntro';
import ReleaseTimingReport from '@/components/release-timing/ReleaseTimingReport';
import ResearchLog from '@/components/release-timing/ResearchLog';
import styles from '@/components/release-timing/release-timing.module.css';
import SiteFooter from '@/components/ui/SiteFooter';
import { loadPublicResults } from '@/lib/arrival-trial/public-results';
import { getUsaceDam } from '@/lib/flow-providers/usace-registry';
import { FINDINGS, hoursText, RELEASE_TIMING_DAM_ID, RELEASE_TIMING_PATH } from '@/lib/release-timing/findings';
import { publicPageMetadata, ROUTE_SHARE_IMAGE } from '@/lib/seo';
import { createAdminClient } from '@/lib/supabase/admin';

// New results arrive about once a day per release, a day late by design.
export const revalidate = 1800;

const TITLE = RELEASE_TIMING_TITLE;

export async function generateMetadata({ params }: { params: Promise<{ damId: string }> }): Promise<Metadata> {
  const { damId } = await params;
  if (damId !== RELEASE_TIMING_DAM_ID) return { title: 'Page not found' };
  const typical = hoursText(FINDINGS.normalAll.median);
  return publicPageMetadata(
    TITLE,
    `We followed ${FINDINGS.scored} Bull Shoals release increases 41.5 miles down the White River. On a normal river the gauge near Norfork began rising about ${typical} hours later.`,
    RELEASE_TIMING_PATH,
    ROUTE_SHARE_IMAGE,
  );
}

async function results() {
  try {
    return await loadPublicResults(createAdminClient());
  } catch {
    return null;
  }
}

export default async function ReleaseTimingPage({ params }: { params: Promise<{ damId: string }> }) {
  const { damId } = await params;
  const dam = damId === RELEASE_TIMING_DAM_ID ? getUsaceDam(damId) : null;
  if (!dam) notFound();
  const F = FINDINGS;
  const trial = await results();
  const groups = [
    ...F.size.map((band) => ({ ...band, label: `${band.label} generator${band.label === 'About 1' ? '' : 's'}, normal river` })),
    ...F.height.map((band) => ({ ...band, label: `Gauge ${band.label.toLowerCase()}` })),
    ...F.baseline.map((band) => ({ ...band, label: `Release before: ${band.label.toLowerCase()}` })),
  ];
  const span = `${F.years[0]} to ${F.years[1]}`;

  return (
    <div className="min-h-screen bg-neutral-50">
      <div className="mx-auto grid max-w-6xl gap-5 px-4 pb-10 pt-5 sm:px-6 lg:px-8">
        <div>
          <Link href={`/dams/${damId}`} className="mb-3 inline-flex min-h-11 items-center gap-1 text-sm text-primary-700 hover:text-primary-800">
            <ChevronLeft className="size-4" aria-hidden="true" /> {dam.name}
          </Link>
        </div>

        <ReleaseTimingIntro />

        <ReleaseTimingReport results={trial} />

        <ResearchLog results={trial} />

        <details id="how-we-measured" className={styles.method}>
          <summary>How we measured</summary>
          <div>
            <ul>
              <li><b>Releases:</b> hourly, from the U.S. Army Corps of Engineers.</li>
              <li><b>River level:</b> every 15 minutes, from USGS gauge 07057370.</li>
              <li><b>An increase:</b> after six steady hours, a first hour at least 1,000 cfs higher, reaching 2,000 cfs or more within three hours.</li>
              <li><b>Not counted yet:</b> releases that start more slowly than that. Releases are published as hourly averages, so one that begins late in an hour can look like a slow start.</li>
              <li><b>A rise:</b> the gauge a tenth of a foot above its three-hour low.</li>
              <li><b>Counted:</b> {F.increases.toLocaleString('en-US')} increases, {span}. {F.scored.toLocaleString('en-US')} matched exactly one rise with a complete gauge record.</li>
              <li><b>A normal river:</b> release began under 1,500 cfs, gauge under 7 ft, no smaller increase in the 20 hours before. {F.normal.toLocaleString('en-US')} releases.</li>
              <li><b>Rough guide upstream:</b> the gauge’s typical time scaled by distance from the dam, assuming steady travel, to the nearest half hour. Not measured.</li>
              <li><b>Typical window:</b> 10th to 90th percentiles of historical timings. The marker is the median, not a forecast.</li>
            </ul>
            <div className={styles.tableWrap}>
              <table>
                <thead>
                  <tr><th>Group</th><th className={styles.num}>Releases</th><th className={styles.num}>Typical</th><th className={styles.num}>Typical window</th><th className={styles.num}>Earliest</th></tr>
                </thead>
                <tbody>
                  {groups.map((row) => (
                    <tr key={row.label}>
                      <td>{row.label}</td>
                      <td className={styles.num}>{row.n.toLocaleString('en-US')}</td>
                      <td className={styles.num}>{row.median.toFixed(2)} h</td>
                      <td className={styles.num}>{row.p10.toFixed(1)} to {row.p90.toFixed(1)} h</td>
                      <td className={styles.num}>{row.min.toFixed(1)} h</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </details>

        <p className="text-xs leading-relaxed text-neutral-500">
          Data: U.S. Army Corps of Engineers and U.S. Geological Survey. Recent USGS readings are provisional. River miles follow Eddy’s White River line from the dam.
        </p>
      </div>
      <SiteFooter maxWidth="max-w-6xl" />
    </div>
  );
}
