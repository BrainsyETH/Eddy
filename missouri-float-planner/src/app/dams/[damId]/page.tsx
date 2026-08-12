// src/app/dams/[damId]/page.tsx
// One dam: current state plus the multi-day hourly generation schedule.
//
// The schedule is the reason this page exists. CWMS's release forecast is a
// daily average and cannot say "the units run 7-11 AM"; SWPA's hourly schedule
// can, and that is what a wading angler plans around.

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import SiteFooter from '@/components/ui/SiteFooter';
import DamStateCard from '@/components/dam/DamStateCard';
import GenerationSchedule from '@/components/dam/GenerationSchedule';
import { fetchDamDetail, listDamIds } from '@/lib/data/dams';
import { getUsaceDam } from '@/lib/flow-providers/usace-registry';

export const revalidate = 300;

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
    title: `${dam.name} — Lake Level & Generation Schedule`,
    description: `Live lake level, release and hourly generation schedule for ${dam.name}${
      dam.lakeName ? ` on ${dam.lakeName}` : ''
    }.`,
  };
}

export default async function DamPage({ params }: { params: Promise<{ damId: string }> }) {
  const { damId } = await params;
  const dam = await fetchDamDetail(damId);
  if (!dam) notFound();

  return (
    <div className="min-h-screen bg-gradient-to-b from-neutral-100 to-neutral-50">
      <div className="mx-auto max-w-3xl px-4 pb-16 pt-6">
        <Link
          href="/dams"
          className="mb-4 inline-flex items-center gap-1 text-sm text-primary-700 hover:text-primary-800"
        >
          <ChevronLeft className="h-4 w-4" />
          All lakes &amp; dams
        </Link>

        <DamStateCard dam={dam} />

        <div className="mt-6">
          <GenerationSchedule schedule={dam.schedule} />
        </div>

        {/* An empty schedule means one of two very different things, and
            conflating them produced a live factual error: Table Rock has a
            four-unit powerhouse, but whenever SWPA's file for that weekday had
            not refreshed yet the fail-closed date check dropped it, and this
            page then announced the plant did not exist — while the index card
            beside it read "Generating". hasTurbines is the registry's answer
            and does not depend on today's fetch succeeding. */}
        {dam.schedule.length === 0 && (
          <p className="mt-6 rounded-xl border-2 border-neutral-300 bg-white p-5 text-sm text-neutral-600">
            {dam.hasTurbines ? (
              <>
                The generation schedule for this project isn&rsquo;t available
                right now — Southwestern Power Administration posts the next
                day&rsquo;s each afternoon, and Eddy will only show one it can
                confirm is current.
                {dam.infoPhone && (
                  <>
                    {' '}
                    For releases right now, call{' '}
                    <a href={`tel:${dam.infoPhone.replace(/\D/g, '')}`} className="font-medium text-primary-700 hover:text-primary-800">
                      {dam.infoPhone}
                    </a>
                    .
                  </>
                )}
              </>
            ) : (
              <>
                This project has no powerhouse, so there is no generation
                schedule — its release is set by gate operation rather than
                power demand, and tends to hold steady for days at a time.
              </>
            )}
          </p>
        )}

        {dam.sources.length > 0 && (
          <p className="mt-6 text-xs text-neutral-500">Source: {dam.sources.join(' · ')}</p>
        )}
      </div>

      <SiteFooter maxWidth="max-w-3xl" />
    </div>
  );
}
