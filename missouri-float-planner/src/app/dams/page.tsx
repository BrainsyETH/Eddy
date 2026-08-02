// src/app/dams/page.tsx
// Lakes & Dams — every USACE project Eddy tracks, with its current release,
// lake level and generating state.
//
// This is a first-class surface rather than a section on a river page, because
// most of these dams have no river in Eddy below them. Someone fishing
// Taneycomo does not need Eddy to have onboarded Lake Taneycomo as a float
// river; they need to know Table Rock is generating and how cold the tailwater
// is. That is a dam page, and it needs no river content at all.

import type { Metadata } from 'next';
import Link from 'next/link';
import SiteFooter from '@/components/ui/SiteFooter';
import DamStateCard from '@/components/dam/DamStateCard';
import { fetchAllDamSnapshots } from '@/lib/data/dams';
import { groupDamsForIndex } from '@/lib/data/dam-grouping';

export const revalidate = 300; // ISR every 5 minutes

export const metadata: Metadata = {
  title: 'Lake Levels & Dam Releases',
  // Deliberately not a list of dam names. The previous description enumerated
  // all nine and was already wrong the moment a tenth was added; a description
  // that cannot go stale beats one that has to be maintained in step with the
  // registry.
  description:
    'Live USACE lake levels, dam releases and hourly generation schedules for federal hydropower and flood-control projects across Missouri, Arkansas, Oklahoma and Texas.',
};

export default async function DamsPage() {
  const dams = await fetchAllDamSnapshots();
  const groups = groupDamsForIndex(dams);

  return (
    <div className="min-h-screen bg-gradient-to-b from-neutral-100 to-neutral-50">
      <section
        className="relative overflow-hidden py-8 text-white md:py-10"
        style={{ background: 'linear-gradient(135deg, #0F2D35 0%, #1A4550 50%, #0F2D35 100%)' }}
      >
        <div className="mx-auto max-w-5xl px-4">
          <h1
            className="mb-1 text-2xl font-bold md:text-4xl"
            style={{ fontFamily: 'var(--font-display)', color: '#F07052' }}
          >
            Lake Levels &amp; Dam Releases
          </h1>
          <p className="max-w-2xl text-sm text-white/80 md:text-base">
            Below a dam, the Corps decides what the river does — not the weather.
            Live levels and releases, plus the hourly generation schedule posted
            each afternoon.
          </p>
        </div>
      </section>

      <main className="mx-auto max-w-5xl px-4 pb-16 pt-8">
        {dams.length === 0 ? (
          <p className="rounded-xl border-2 border-neutral-300 bg-white p-5 text-neutral-600">
            Dam data is unavailable right now. The Corps&rsquo; data service may be
            down — try again shortly.
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
                <div className="space-y-4">
                  {group.dams.map((dam) => (
                    <Link
                      key={dam.id}
                      href={`/dams/${dam.id}`}
                      className="block transition-transform hover:-translate-y-0.5"
                    >
                      <DamStateCard dam={dam} />
                    </Link>
                  ))}
                </div>
              </section>
            ))}
          </>
        )}

        <p className="mt-8 text-xs text-neutral-500">
          Lake levels and releases from the USACE Corps Water Management System.
          Generation schedules from Southwestern Power Administration. Both can
          change without notice — never wade or anchor below a dam without
          checking the horn and posted warnings.
        </p>
      </main>

      <SiteFooter maxWidth="max-w-5xl" />
    </div>
  );
}
