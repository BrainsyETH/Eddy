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
import DamDetail from '@/components/dam/DamDetail';
import AppLink from '@/components/AppLink';
import { getRiverContext } from '@/lib/rivers/context';
import { riverPath } from '@/lib/navigation/river-path';
import { listDamIds } from '@/lib/data/dams';
import { getUsaceDam } from '@/lib/flow-providers/usace-registry';

import { pageDam } from '@/lib/data/public-pages';

export const revalidate = 60;

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
  return {
    ...publicPageMetadata(
      `${dam.name} — Lake Level & Releases`,
      `Lake level, release and generation information for ${dam.name}${
        dam.lakeName ? ` on ${dam.lakeName}` : ''
      }. Open for current updates.`,
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
        : { title: 'Schedule currently unavailable', detail: 'SWPA posts upcoming schedules each afternoon. Eddy shows only dates it can confirm; an unavailable schedule does not mean generation has stopped.' };

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
            <h1 className="text-3xl font-bold tracking-tight text-neutral-900 sm:text-4xl" style={{ fontFamily: 'var(--font-display)' }}>{dam.name}</h1>
            <p className="mt-1 text-sm text-neutral-500">{dam.lakeName ?? 'Dam conditions'} · {dam.state}</p>
          </div>
          <nav aria-label="Dam sections" className="flex gap-2 text-sm">
            <a href="#generation" className="inline-flex min-h-11 items-center rounded-full bg-primary-100 px-4 font-medium text-primary-800">{dam.hasTurbines ? 'Generation' : 'Releases'}</a>
            <a href="#dam-resources" className="inline-flex min-h-11 items-center rounded-full px-4 text-neutral-600 hover:bg-neutral-100">Useful links</a>
          </nav>
        </header>
        <div id="generation" className="scroll-mt-24">
          <DamDetail key={dam.id} dam={dam} renderedAt={renderedAt} availability={availability} />
        </div>
        <div id="dam-resources" className="mt-5 flex scroll-mt-24 flex-wrap gap-3 border-t border-neutral-200 pt-5">
          {riverHref && river && <Link href={riverHref} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary-800 px-4 py-2 text-sm font-medium text-white hover:bg-primary-900">View {river.name} below the dam <ArrowUpRight className="size-4" aria-hidden="true" /></Link>}
          {dam.infoPhone && <a href={`tel:${dam.infoPhone.replace(/\D/g, '')}`} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-700"><Phone className="size-4" aria-hidden="true" /> Recorded release line · {dam.infoPhone}</a>}
          <AppLink data-ga-event="app_landing_click" data-ga-label="dam_detail" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-primary-700"><Smartphone className="size-4" aria-hidden="true" /> Eddy for iPhone</AppLink>
        </div>
        {dam.sources.length > 0 && <p className="mt-5 text-xs text-neutral-500">Sources: {dam.sources.join(' · ')}</p>}
      </div>
      <SiteFooter maxWidth="max-w-7xl" />
    </div>
  );
}
