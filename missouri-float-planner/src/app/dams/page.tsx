import type { Metadata } from 'next';
import { connection } from 'next/server';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import SiteFooter from '@/components/ui/SiteFooter';
import DamDirectory from '@/components/dam/DamDirectory';
import { conditionsDamCatalogue } from '@/lib/conditions/dam-catalogue';
import { buildDamDirectoryGroups } from '@/lib/data/dam-directory';
import { readStoredSnapshots } from '@/lib/data/dam-snapshot-store';
import { refreshStaleness } from '@/lib/data/dams';
import { getActiveRiverContexts } from '@/lib/rivers/context';
import { riverPath } from '@/lib/navigation/river-path';
import { publicPageMetadata, SHARE_IMAGES } from '@/lib/seo';

export const metadata: Metadata = publicPageMetadata(
  'Lake Levels, Dam Releases & Generation Schedules',
  'Lake levels, releases and hourly generation schedules for Corps of Engineers and Ameren dams in Missouri, Arkansas, Oklahoma, Texas, Kentucky and Tennessee.',
  '/dams',
  SHARE_IMAGES.site,
);

const POPULAR_DAMS = [
  { id: 'swl-table-rock-dam', name: 'Table Rock', river: 'Lake Taneycomo' },
  { id: 'swl-bull-shoals-dam', name: 'Bull Shoals', river: 'White River' },
  { id: 'swl-norfork-dam', name: 'Norfork', river: 'Norfork tailwater' },
] as const;

const RELATED_RIVERS = [
  { slug: 'white', label: 'White River' },
  { slug: 'taneycomo', label: 'Lake Taneycomo' },
  { slug: 'norfork-tailwater', label: 'Norfork tailwater' },
  { slug: 'black', label: 'Black River' },
] as const;

const QUESTIONS = [
  {
    question: 'What does “hour ending” mean?',
    answer: 'SWPA labels an hour by when it ends. An hour marked 2 PM covers 1–2 PM. Eddy displays the start of each interval.',
  },
  {
    question: 'Does no generation mean no water?',
    answer: 'No. Minimum flow, gate releases and water already moving downstream can keep a river running even when turbines are not generating.',
  },
  {
    question: 'What is minimum flow?',
    answer: 'A release maintained while the powerhouse is otherwise idle. It can still move water through a turbine. Eddy labels it separately where the dam publishes it.',
  },
  {
    question: 'When does the water reach downstream?',
    answer: 'Schedule times are at the dam. Water rises and falls farther downstream later, depending on the river and distance. Never use a turbine schedule alone to decide whether it is safe to wade.',
  },
  {
    question: 'When are generation schedules posted?',
    answer: 'SWPA usually posts each day’s schedule overnight. Weekend and Monday schedules often appear the evening before. Plans can change without notice.',
  },
] as const;

export default async function Page({ searchParams }: { searchParams: Promise<{ q?: string; state?: string }> }) {
  const filters = await searchParams;
  // Render at request time: a cached HTML page could otherwise call yesterday
  // 'today' after midnight. The stored full snapshots include lake elevation;
  // the smaller Conditions summaries deliberately do not.
  await connection();
  const now = Date.now();
  const [stored, activeRivers] = await Promise.all([
    readStoredSnapshots({ now }),
    getActiveRiverContexts().catch(() => []),
  ]);
  // The registry keeps all destinations navigable through data outages.
  const { dams } = conditionsDamCatalogue([...stored.values()].map(snapshot => refreshStaleness(snapshot, now)));
  const groups = buildDamDirectoryGroups(dams);
  const riverLinks = RELATED_RIVERS.flatMap(related => {
    const river = activeRivers.find(entry => entry.slug === related.slug);
    return river ? [{ href: riverPath(river.state, river.slug), label: related.label }] : [];
  });

  return <div className="min-h-screen bg-neutral-50">
    <div className="mx-auto max-w-7xl px-4 pb-14 pt-7 sm:px-6 lg:px-8">
      <header className="mb-8 max-w-4xl">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-primary-700">Lakes &amp; dams</p>
        <h1 className="font-heading text-3xl font-bold leading-tight tracking-tight text-primary-900 md:text-4xl">
          Lake Levels, Dam Releases &amp; Generation Schedules
        </h1>
        <p className="mt-3 max-w-3xl text-base leading-7 text-neutral-700">
          Check lake levels, water releases, and posted generation schedules for dams across Missouri, Arkansas, and beyond.
        </p>
        <p className="mt-2 text-sm leading-6 text-neutral-600">
          Readings from the U.S. Army Corps of Engineers and Ameren. Generation schedules from SWPA. Eddy checks for new readings hourly.
        </p>
      </header>

      <nav aria-label="Popular tailwater dams" className="mb-9">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-heading text-xl font-bold text-primary-900">Popular tailwaters</h2>
          <a href="#all-dams" className="inline-flex min-h-11 items-center text-sm font-medium text-primary-800 underline-offset-4 hover:underline">All dams <ChevronRight className="size-4" aria-hidden="true" /></a>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {POPULAR_DAMS.map(dam => <Link key={dam.id} href={'/dams/' + dam.id}
            className="group flex min-h-20 items-center justify-between gap-3 rounded-xl border border-neutral-200 bg-white px-4 py-3 hover:border-primary-400 hover:bg-secondary-50 focus-visible:outline-2 focus-visible:outline-primary-600">
            <span><span className="block font-heading text-lg font-bold text-primary-900">{dam.name}</span><span className="mt-0.5 block text-xs text-neutral-600">{dam.river}</span></span>
            <ChevronRight className="size-5 shrink-0 text-primary-700 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
          </Link>)}
        </div>
      </nav>

      <DamDirectory groups={groups} renderedAt={now} initialQuery={filters.q ?? ''} initialState={filters.state?.toUpperCase() ?? 'all'} />

      <section aria-labelledby="schedule-help-heading" className="mt-12 max-w-4xl">
        <h2 id="schedule-help-heading" className="font-heading text-2xl font-bold text-primary-900">Understanding generation schedules</h2>
        <p className="mt-2 text-sm text-neutral-700">Posted schedules describe turbine plans, not the water level at a downstream access.</p>
        <div className="mt-4 divide-y divide-neutral-200 rounded-xl border border-neutral-200 bg-white px-4 sm:px-5">
          {QUESTIONS.map(item => <details key={item.question} className="group py-1">
            <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-4 py-3 text-sm font-semibold text-primary-900 focus-visible:outline-2 focus-visible:outline-primary-600 [&::-webkit-details-marker]:hidden">
              {item.question}
              <span aria-hidden="true" className="shrink-0 text-xl font-normal text-primary-700 group-open:hidden">+</span>
              <span aria-hidden="true" className="hidden shrink-0 text-xl font-normal text-primary-700 group-open:block">−</span>
            </summary>
            <p className="max-w-3xl pb-4 pr-6 text-sm leading-6 text-neutral-700">{item.answer}</p>
          </details>)}
        </div>
      </section>

      {riverLinks.length > 0 && <nav aria-label="Related rivers" className="mt-10 border-t border-neutral-200 pt-7">
        <h2 className="font-heading text-xl font-bold text-primary-900">Rivers below the dams</h2>
        <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1">
          {riverLinks.map(river => <Link href={river.href} key={river.href} className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-primary-800 underline-offset-4 hover:underline">
            {river.label}<ChevronRight className="size-4" aria-hidden="true" />
          </Link>)}
        </div>
      </nav>}
      <p className="mt-9 max-w-3xl text-xs leading-5 text-neutral-600">
        Releases can change without notice. Follow warning sirens and posted signs below dams. Check observation times before heading out.
      </p>
    </div>
    <SiteFooter maxWidth="max-w-7xl" />
  </div>;
}
