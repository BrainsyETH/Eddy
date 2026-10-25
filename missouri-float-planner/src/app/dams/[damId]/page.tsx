// src/app/dams/[damId]/page.tsx
// One dam: current state plus the multi-day hourly generation schedule.
//
// The schedule is the reason this page exists. CWMS's release forecast is a
// daily average and cannot say "the units run 7-11 AM"; SWPA's hourly schedule
// can, and that is what a wading angler plans around.

import { publicPageMetadata } from '@/lib/seo';
import { appBannerMetadata } from '@/lib/app-discovery';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft, ArrowUpRight, Phone, Smartphone } from 'lucide-react';
import SiteFooter from '@/components/ui/SiteFooter';
import Button from '@/components/ui/Button';
import DamDetail from '@/components/dam/DamDetail';
import AppLink from '@/components/AppLink';
import { getRiverContext } from '@/lib/rivers/context';
import { riverPath } from '@/lib/navigation/river-path';
import { listDamIds } from '@/lib/data/dams';
import { getUsaceDam } from '@/lib/flow-providers/usace-registry';

import { pageDam } from '@/lib/data/public-pages';

export const revalidate = 60;

/** The snapshot's agency abbreviations, spelled out for the page. */
const SOURCE_NAMES: Record<string, string> = {
  'USACE CWMS': 'U.S. Army Corps of Engineers',
  SWPA: 'Southwestern Power Administration',
};

export function generateStaticParams() {
  return listDamIds().map((damId) => ({ damId }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ damId: string }>;
}): Promise<Metadata> {
  const { damId } = await params;
  const dam = getUsaceDam(damId);
  if (!dam) return { title: 'Dam not found' };
  // Anglers search for the schedule by name, so dams with an hourly SWPA
  // schedule lead with it.
  const scheduled = Boolean(dam.swpaCode);
  return {
    ...publicPageMetadata(
      scheduled
        ? `${dam.name} Generation Schedule, Lake Level & Releases`
        : `${dam.name} — Lake Level & Releases`,
      `${scheduled ? 'Hourly generation schedule, current' : 'Current'} release in cfs, lake level and conditions below ${dam.name}${
        dam.lakeName ? ` on ${dam.lakeName}` : ''
      }.`,
      `/dams/${damId}`,
    ),
    ...appBannerMetadata(`/dam/${encodeURIComponent(damId)}`),
  };
}

export default async function DamPage({ params }: { params: Promise<{ damId: string }> }) {
  const { damId } = await params;
  const dam = await pageDam(damId);
  if (!dam) notFound();

  const project = getUsaceDam(dam.id);
  const availability = project?.amerenMetrics === 'osage'
    ? { title: 'No hourly schedule published', detail: 'Ameren operates this dam. Releases can begin at any time, and the dam sounds a warning siren before starting or stopping generators. The recorded operations line provides current information.' }
    : !dam.hasTurbines
      ? { title: 'Gate-operated releases', detail: 'This dam has no powerhouse. Releases are controlled by gate operation, so there is no generation schedule.' }
      : !project?.swpaCode
        ? { title: 'No hourly schedule published', detail: dam.generationForecast ? 'The operating forecast below provides the forward view for this dam.' : 'Eddy shows observed readings for this dam. No public hourly loading schedule is available.' }
        : { title: 'Schedule currently unavailable', detail: 'The Southwestern Power Administration (SWPA) posts upcoming schedules each afternoon. Eddy shows only dates it can confirm; an unavailable schedule does not mean generation has stopped.' };

  // Only offer a river destination that is active. Catalog failure must not
  // prevent the dam readings from rendering.
  const river = dam.tailwater ? await getRiverContext(dam.tailwater.riverSlug).catch(() => null) : null;
  const riverHref = river ? `${riverPath(river.state, river.slug)}${dam.tailwater?.sectionSlug ? `?section=${encodeURIComponent(dam.tailwater.sectionSlug)}` : ''}` : null;
  const renderedAt = Date.now();

  return (
    <div className="min-h-screen bg-neutral-50">
      <div className="mx-auto max-w-7xl px-4 pb-10 pt-5 sm:px-6 lg:px-8">
        <Link href="/dams" className="mb-3 inline-flex min-h-11 items-center gap-1 text-sm text-primary-700 hover:text-primary-800">
          <ChevronLeft className="size-4" aria-hidden="true" /> All lakes &amp; dams
        </Link>
        <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-4xl font-semibold tracking-tight text-primary-800 sm:text-5xl" style={{ fontFamily: 'var(--font-display)' }}>{dam.name}</h1>
            <p className="mt-2 text-sm text-neutral-600">{[dam.lakeName ?? 'Dam conditions', river?.name, dam.state].filter(Boolean).join(' · ')}</p>
          </div>
          <nav aria-label="Dam sections" className="flex gap-2 text-sm">
            <Button href="#dam-resources" variant="ghost" size="sm" className="min-h-11">{dam.infoPhone ? 'Release line & links' : 'Related links'}</Button>
          </nav>
        </header>
        <div id="generation" className="scroll-mt-24">
          <DamDetail key={dam.id} dam={dam} renderedAt={renderedAt} availability={availability} />
        </div>
        <div id="dam-resources" className="dam-resource-links mt-5 flex scroll-mt-24 flex-wrap gap-3 border-t border-neutral-200 pt-5">
          {riverHref && river && <Button href={riverHref} variant="primary" size="sm" className="min-h-11">View {river.name} below the dam <ArrowUpRight className="size-4 shrink-0" aria-hidden="true" /></Button>}
          {dam.infoPhone && <Button href={`tel:${dam.infoPhone.replace(/\D/g, '')}`} variant="outline" size="sm" className="min-h-11"><Phone className="size-4 shrink-0" aria-hidden="true" /> Recorded release line · {dam.infoPhone}</Button>}
          <AppLink data-ga-event="app_landing_click" data-ga-label="dam_detail" className="btn-outline btn--sm min-h-11"><Smartphone className="size-4" aria-hidden="true" /> Eddy for iPhone</AppLink>
        </div>
        {dam.sources.length > 0 && <p className="mt-5 text-xs text-neutral-500">Sources: {dam.sources.map((source) => SOURCE_NAMES[source] ?? source).join(' · ')}</p>}
      </div>
      <SiteFooter maxWidth="max-w-7xl" />
    </div>
  );
}
