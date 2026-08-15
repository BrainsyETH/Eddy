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
import DamGenerationHero from '@/components/dam/DamGenerationHero';
import DamPatternStrip from '@/components/dam/DamPatternStrip';
import GenerationForecast from '@/components/dam/GenerationForecast';
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

  // One instant for the whole page, minted here and handed to every client
  // section. Letting each of them call the clock would let the timeline and the
  // pattern strip disagree about which hour is "now" on the same screen.
  const renderedAt = Date.now();

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

        {/* The order is the hierarchy a fisherman reads in: what the powerhouse
            is doing now, when it changes, today and the days ahead, the rhythm
            it has kept all week — and only then the lake, the temperature and
            the rest of the project. Everything above the pattern strip answers
            a question somebody is asking before they load the truck. */}
        <h1 className="text-2xl font-bold text-neutral-900" style={{ fontFamily: 'var(--font-display)' }}>
          {dam.name}
        </h1>
        <p className="mb-4 text-xs text-neutral-500">
          {dam.lakeName ?? 'USACE project'} · {dam.state}
        </p>

        <DamGenerationHero dam={dam} />

        <div className="mt-6">
          <GenerationSchedule
            schedule={dam.schedule}
            reference={dam.generationReference}
            renderedAt={renderedAt}
          />
        </div>

        {/* The forecast sits where the schedule would: it answers the same
            "today and the days ahead" question, from a different kind of
            source — a district's operating forecast rather than a power
            marketer's loading schedule. No dam currently has both. */}
        {dam.generationForecast && (
          <div className="mt-6">
            <GenerationForecast forecast={dam.generationForecast} renderedAt={renderedAt} />
          </div>
        )}

        {dam.pattern && dam.pattern.length > 0 && (
          <div className="mt-6">
            <DamPatternStrip
              pattern={dam.pattern}
              schedule={dam.schedule}
              reference={dam.generationReference}
              generationFloorCfs={dam.generationFloorCfs}
              renderedAt={renderedAt}
            />
          </div>
        )}

        <div className="mt-6">
          <DamStateCard dam={dam} secondary />
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
            {/* Four states, not two. "SWPA hasn't refreshed yet" is a claim
                about a dam SWPA schedules — on a Nashville project, whose
                power SEPA markets with no public loading page, it would
                promise a schedule that is never coming; on Bagnell, which is
                not federal at all, even the SEPA sentence would name the
                wrong operator. The registry separates them, and this is a
                server component, so it can ask it directly. */}
            {getUsaceDam(dam.id)?.amerenMetrics === 'osage' ? (
              <>
                Bagnell Dam is operated by Ameren Missouri under a FERC
                license, and no hourly generation schedule is published —
                releases can begin at any time, and the dam sounds a warning
                siren before starting or stopping generators. The readings
                above are observed at the dam.
                {dam.infoPhone && (
                  <>
                    {' '}
                    For Ameren&rsquo;s recorded daily operations report, call{' '}
                    <a
                      href={`tel:${dam.infoPhone.replace(/\D/g, '')}`}
                      className="font-medium text-primary-700 hover:text-primary-800"
                    >
                      {dam.infoPhone}
                    </a>
                    .
                  </>
                )}
              </>
            ) : dam.hasTurbines && !getUsaceDam(dam.id)?.swpaCode ? (
              dam.generationForecast ? (
                <>
                  No public hourly loading schedule exists for this project —
                  its power is marketed by the Southeastern Power
                  Administration, which does not post one. The Corps&rsquo; own
                  operating forecast above is the forward view.
                </>
              ) : (
                <>
                  No public hourly loading schedule exists for this project —
                  its power is marketed by the Southeastern Power
                  Administration, which does not post one. Everything Eddy shows
                  for this dam is measured at the dam, not scheduled.
                </>
              )
            ) : dam.hasTurbines ? (
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
