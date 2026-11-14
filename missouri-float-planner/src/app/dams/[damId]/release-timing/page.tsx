// src/app/dams/[damId]/release-timing/page.tsx
// How long a Bull Shoals release takes to reach the gauge near Norfork.
//
// A findings page, not a forecast: what 695 measured releases did, and, in
// "How close was Eddy?", each estimate the release-arrival trial saved
// beforehand next to what the gauge then recorded. Estimates appear only after
// their outcome (src/lib/arrival-trial/public-results.ts). One dam has this
// page; every other dam id is not found.

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import ReleaseTimingReport from '@/components/release-timing/ReleaseTimingReport';
import styles from '@/components/release-timing/release-timing.module.css';
import SiteFooter from '@/components/ui/SiteFooter';
import { loadPublicResults } from '@/lib/arrival-trial/public-results';
import { getUsaceDam } from '@/lib/flow-providers/usace-registry';
import { FINDINGS, hoursText, RELEASE_TIMING_DAM_ID, RELEASE_TIMING_PATH } from '@/lib/release-timing/findings';
import { publicPageMetadata, ROUTE_SHARE_IMAGE } from '@/lib/seo';
import { createAdminClient } from '@/lib/supabase/admin';

// New results arrive about once a day per release, a day late by design.
export const revalidate = 1800;

const TITLE = 'How long a Bull Shoals release takes to reach Norfork';

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
  const high = F.height[F.height.length - 1];
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
          <header>
            <p className="text-xs font-semibold uppercase tracking-wider text-secondary-700">Our findings · Bull Shoals Dam</p>
            <h1 className="mt-2 text-balance text-3xl font-semibold tracking-tight text-primary-800 sm:text-5xl" style={{ fontFamily: 'var(--font-display)' }}>{TITLE}</h1>
            <p className="mt-3 max-w-2xl text-lg leading-relaxed text-neutral-600">
              We followed <b className="font-semibold text-neutral-900">{F.scored.toLocaleString('en-US')}</b> release increases 41.5 miles down the White River, from the dam to the gauge near Norfork.
            </p>
            <p className="mt-2 text-sm text-neutral-500">Measured {span}</p>
          </header>
        </div>

        <div className={styles.facts}>
          <div className={styles.fact}><strong>About {hoursText(F.normalAll.median)} h</strong><span>typical, on a normal river</span></div>
          <div className={styles.fact}><strong>{hoursText(F.size[F.size.length - 1].median)} to {hoursText(F.size[0].median)} h</strong><span>biggest releases to smallest</span></div>
          <div className={styles.fact}><strong>{hoursText(F.normalAll.median - high.median)} h sooner</strong><span>when the river was already high</span></div>
        </div>

        <ReleaseTimingReport results={await results()} />

        <p className={styles.warn} role="note">
          <b>What the river did, not a forecast.</b> Releases change without notice, and water can rise faster than anything shown here. Don’t use this page to decide whether it is safe to wade or launch.
        </p>

        <details id="how-we-measured" className={styles.method}>
          <summary>How we measured</summary>
          <div>
            <ul>
              <li><b>Releases:</b> hourly, from the U.S. Army Corps of Engineers.</li>
              <li><b>River level:</b> every 15 minutes, from USGS gauge 07057370.</li>
              <li><b>An increase:</b> 2,000 cfs or more within three hours, after six steady hours.</li>
              <li><b>A rise:</b> the gauge a tenth of a foot above its three-hour low.</li>
              <li><b>Counted:</b> {F.increases.toLocaleString('en-US')} increases, {span}. {F.scored.toLocaleString('en-US')} matched exactly one rise with a complete gauge record.</li>
              <li><b>A normal river:</b> release began under 1,500 cfs, gauge under 7 ft, no smaller increase in the 20 hours before. {F.normal.toLocaleString('en-US')} releases.</li>
              <li><b>Map timing:</b> gauge times scaled by distance from the dam, assuming steady travel.</li>
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

        <details id="still-testing" className={styles.method}>
          <summary>What we are still testing</summary>
          <div>
            <p>We have not shown that an arrival can be called ahead of time.</p>
            <ul>
              <li><b>2022 to 2024:</b> a formula built on other years landed within two hours about 9 times in 10. About 1 in 10 came more than two hours early, mostly on a high river.</li>
              <li><b>2019 to 2021:</b> a stricter rule applied to only 39 releases. Too few to judge.</li>
              <li><b>Now:</b> Eddy saves an estimate at each increase, before the river answers, and checks it against the gauge a day later. Results appear above, under “How close was Eddy?”</li>
            </ul>
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
