// src/app/dams/[damId]/page.tsx
// One dam: current state plus the multi-day hourly generation schedule.
//
// The schedule is the reason this page exists. CWMS's release forecast is a
// daily average and cannot say "the units run 7-11 AM"; SWPA's hourly schedule
// can, and that is what a wading angler plans around.

import StationShareButton from '@/components/gauge/StationShareButton';
import { publicPageMetadata, ROUTE_SHARE_IMAGE } from '@/lib/seo';
import { appBannerMetadata } from '@/lib/app-discovery';
import { getDamAppPromotion } from '@/lib/dam-app-promotion';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { ChevronLeft, ArrowRight, Phone, Smartphone } from 'lucide-react';
import SiteFooter from '@/components/ui/SiteFooter';
import Button from '@/components/ui/Button';
import DamDetail from '@/components/dam/DamDetail';
import PlaceHeader from '@/components/lake/PlaceHeader';
import AppLink from '@/components/AppLink';
import { getRiverContext } from '@/lib/rivers/context';
import { riverPath } from '@/lib/navigation/river-path';
import { getUsaceDam } from '@/lib/flow-providers/usace-registry';
import { damAboutSentences, damPageCopy, damStructuredData } from '@/lib/dam-page-copy';
import { jsonLdString } from '@/lib/json-ld';

import { loadDamPageSnapshot } from '@/lib/data/dam-page-snapshot';
import { loadLakeSection } from '@/lib/lakes/section';
import { damLakeExperienceEnabled, lakePageHref } from '@/lib/lakes/public-pages';
import { damScheduleAvailability } from '@/lib/dam-schedule-availability';
import { RELEASE_TIMING_DAM_ID, RELEASE_TIMING_PATH } from '@/lib/release-timing/findings';

// Rendered per request, deliberately not ISR. The schedule's "Today" is
// computed from the render clock, so a cached render served after midnight
// labelled yesterday's date as today. See src/lib/data/dam-page-snapshot.ts.

/** The snapshot's agency abbreviations, spelled out for the page. */
const SOURCE_NAMES: Record<string, string> = {
  'USACE CWMS': 'U.S. Army Corps of Engineers',
  SWPA: 'Southwestern Power Administration',
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ damId: string }>;
}): Promise<Metadata> {
  const { damId } = await params;
  const dam = getUsaceDam(damId);
  if (!dam) return { title: 'Dam not found' };
  // Per-dam copy leads with what people search that dam for; see
  // src/lib/dam-page-copy.ts for why one template no longer serves them all.
  const copy = damPageCopy(dam);
  return {
    ...publicPageMetadata(copy.title, copy.description, `/dams/${damId}`, ROUTE_SHARE_IMAGE),
    ...appBannerMetadata(`/dam/${encodeURIComponent(damId)}`),
  };
}

export default async function DamPage({ params }: { params: Promise<{ damId: string }> }) {
  const { damId } = await params;
  await connection();
  const renderedAt = Date.now();
  const dam = await loadDamPageSnapshot(damId, renderedAt);
  if (!dam) notFound();
  // The lake behind the dam, when Eddy carries it as an entity (ADR 0019).
  // Separate from the snapshot so the stored row and the iOS wire stay as they are.
  const lakeExperienceEnabled = damLakeExperienceEnabled(dam.id);
  const lake = lakeExperienceEnabled ? await loadLakeSection(dam.id, dam.metrics.poolElevation, renderedAt) : null;

  const project = getUsaceDam(dam.id);
  const availability = damScheduleAvailability({
    hasTurbines: dam.hasTurbines,
    hourlySchedule: Boolean(project?.swpaCode),
    forecast: Boolean(dam.generationForecast),
    amerenOperated: project?.amerenMetrics === 'osage',
  });

  // Only offer a river destination that is active. Catalog failure must not
  // prevent the dam readings from rendering.
  const river = dam.tailwater ? await getRiverContext(dam.tailwater.riverSlug).catch(() => null) : null;
  const riverHref = river ? `${riverPath(river.state, river.slug)}${dam.tailwater?.sectionSlug ? `?section=${encodeURIComponent(dam.tailwater.sectionSlug)}` : ''}` : null;

  return (
    <div className="min-h-screen bg-neutral-50">
      <div className="mx-auto max-w-7xl px-4 pb-10 pt-5 sm:px-6 lg:px-8">
        <Link href="/dams" className="mb-3 inline-flex min-h-11 items-center gap-1 text-sm text-primary-700 hover:text-primary-800">
          <ChevronLeft className="size-4" aria-hidden="true" /> All lakes &amp; dams
        </Link>
        {lakeExperienceEnabled && lake ? (
          <PlaceHeader lakeSlug={lake.slug} title={dam.name} actions={<StationShareButton station={{ provider: 'usace', siteId: damId }} title={dam.name} label="Share" />}>
            <p>{[dam.lakeName, river?.name, dam.state].filter(Boolean).join(' · ')}</p>
          </PlaceHeader>
        ) : <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-4xl font-semibold tracking-tight text-primary-800 sm:text-5xl" style={{ fontFamily: 'var(--font-display)' }}>{dam.name}</h1>
            <p className="mt-2 text-sm text-neutral-600">{[dam.lakeName ?? 'Dam conditions', river?.name, dam.state].filter(Boolean).join(' · ')}</p>
          </div>
          <StationShareButton station={{ provider: 'usace', siteId: damId }} title={dam.name} label="Share" />
        </header>}
        <div id="generation" className="scroll-mt-24">
          <DamDetail key={dam.id} dam={dam} renderedAt={renderedAt} availability={availability} lake={lake} lakeExperienceEnabled={lakeExperienceEnabled} lakeHref={lake ? lakePageHref(lake.slug) : undefined} />
        </div>
        <div id="dam-resources" className="dam-resource-links mt-5 flex scroll-mt-24 flex-wrap gap-3 border-t border-neutral-200 pt-5">
          {riverHref && river && <Button href={riverHref} variant="primary" size="sm" className="min-h-11">View {river.name} below the dam <ArrowRight className="size-4 shrink-0" aria-hidden="true" /></Button>}
          {/* Measured findings, not a forecast: how long past releases took to reach the gauge near Norfork. */}
          {dam.id === RELEASE_TIMING_DAM_ID && <Button href={RELEASE_TIMING_PATH} variant="outline" size="sm" className="min-h-11">How long a release takes to reach Norfork <ArrowRight className="size-4 shrink-0" aria-hidden="true" /></Button>}
          {/* Without a posted schedule the generation card already offers the
              release line, so the number is not repeated down here. */}
          {dam.infoPhone && dam.schedule.length > 0 && <Button href={`tel:${dam.infoPhone.replace(/\D/g, '')}`} variant="outline" size="sm" className="min-h-11"><Phone className="size-4 shrink-0" aria-hidden="true" /> Release Line: {dam.infoPhone}</Button>}
          {!getDamAppPromotion(dam.id) && <AppLink trackView data-ga-label="dam_detail" className="btn-outline btn--sm min-h-11"><Smartphone className="size-4" aria-hidden="true" /> Get Eddy for iPhone</AppLink>}
        </div>
        {project && (
          <section aria-labelledby="dam-about-heading" className="mt-6 max-w-3xl">
            <h2 id="dam-about-heading" className="font-heading text-lg font-bold text-primary-800">About {dam.name}</h2>
            <p className="mt-2 text-sm leading-6 text-neutral-700">{damAboutSentences(project).join(' ')}</p>
          </section>
        )}
        {project && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(damStructuredData(project)) }} />}
        {dam.sources.length > 0 && <p className="mt-5 text-xs text-neutral-500">Sources: {dam.sources.map((source) => SOURCE_NAMES[source] ?? source).join(' · ')}</p>}
      </div>
      <SiteFooter maxWidth="max-w-7xl" />
    </div>
  );
}
