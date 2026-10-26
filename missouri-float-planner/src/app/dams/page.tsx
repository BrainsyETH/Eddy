// src/app/dams/page.tsx
// Lakes & Dams — every USACE project Eddy tracks, with its current release,
// lake level and generating state.
//
// This is a first-class surface rather than a section on a river page, because
// most of these dams have no river in Eddy below them. Someone fishing
// Taneycomo does not need Eddy to have onboarded Lake Taneycomo as a float
// river; they need to know Table Rock is generating and how cold the tailwater
// is. That is a dam page, and it needs no river content at all.

import { publicPageMetadata } from '@/lib/seo';
import SectionNavigation from '@/components/layout/SectionNavigation';
import { conditionNavigation } from '@/lib/navigation/site-navigation';
import type { Metadata } from 'next';
import Link from 'next/link';
import SiteFooter from '@/components/ui/SiteFooter';
import DamListCard from '@/components/dam/DamListCard';
import { fetchAllDamSummaries } from '@/lib/data/dams';
import { groupDamsForIndex } from '@/lib/data/dam-grouping';

export const revalidate = 300; // ISR every 5 minutes

export const metadata: Metadata = publicPageMetadata(
  'Lake Levels & Dam Releases',
  'Live USACE lake levels, dam releases and hourly generation schedules across Missouri, Arkansas, Oklahoma, Texas, Kentucky and Tennessee.',
  '/dams',
  '/opengraph-image',
);

export default async function DamsPage() {
  const dams = await fetchAllDamSummaries();
  const groups = groupDamsForIndex(dams);
  const now = Date.now();

  return (
    <div className="min-h-screen bg-gradient-to-b from-neutral-100 to-neutral-50">
      <section
        className="relative overflow-hidden py-8 text-white md:py-10"
        style={{ background: 'linear-gradient(135deg, #0F2D35 0%, #1A4550 50%, #0F2D35 100%)' }}
      >
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <h1
            className="mb-1 text-2xl font-bold md:text-4xl"
            style={{ fontFamily: 'var(--font-display)', color: '#F07052' }}
          >
            Lakes &amp; dams
          </h1>
          <p className="max-w-2xl text-sm text-white/80 md:text-base">
            Check water releases, temperatures, and generation before you head out.
            Choose a dam for the full picture.
          </p>
        </div>
      </section>

      <SectionNavigation label="Conditions" links={conditionNavigation('dams')} />

      <div className="mx-auto max-w-7xl px-4 pb-16 pt-6 sm:px-6 lg:px-8">
        <p className="mb-6 text-xs text-neutral-500">
          Schedules show planned changes at the dam and can change. Water downstream takes time to rise or fall.
        </p>
        {dams.length === 0 ? (
          <p className="rounded-xl border-2 border-neutral-300 bg-white p-5 text-neutral-600">
            Dam readings are unavailable right now. Please try again shortly.
          </p>
        ) : (
          <>
            {groups.map((group) => (
              <section key={group.label} className="mb-10">
                <h2
                  className="mb-3 text-2xl font-bold text-neutral-900"
                  style={{ fontFamily: 'var(--font-display)' }}
                >
                  {group.label}
                </h2>
                <div className="grid gap-4 md:grid-cols-2">
                  {group.dams.map((dam) => (
                    <Link
                      key={dam.id}
                      href={`/dams/${dam.id}`}
                      className="group block min-w-0 rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary-600"
                    >
                      <DamListCard dam={dam} now={now} />
                    </Link>
                  ))}
                </div>
              </section>
            ))}
          </>
        )}

        <p className="mt-8 text-xs text-neutral-500">
          Readings from USACE and Ameren; schedules from SWPA. Releases can change
          without notice. Follow warning sirens and posted signs below every dam.
        </p>
      </div>

      <SiteFooter maxWidth="max-w-7xl" />
    </div>
  );
}
