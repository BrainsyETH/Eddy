// src/app/coverage/page.tsx
// "What Eddy covers" — the public explanation of a distinction that is a safety
// property first and a marketing one second.
//
// Eddy shows water at two depths. On a CURATED river it makes recommendations:
// a float verdict, a float time, where to put in, who to call. On a REFERENCE
// gauge it reports a measurement and a forecast and recommends nothing, because
// nobody has researched what "good" means on that water. Both appear in the same
// app, in the same visual language, and a reader who assumes the second is the
// first would be launching on a number Eddy never vouched for.
//
// Every figure here is read from the database at request time via
// `@/lib/coverage`. Nothing on this page is typed by hand — that is the whole
// point of it existing, and the reason it can be linked as an answer rather
// than re-audited each time the roster changes.

import type { Metadata } from 'next';
import Link from 'next/link';
import { Gauge, MapPin, Waves, AlertTriangle, Tent, Building2, Database } from 'lucide-react';
import SiteFooter from '@/components/ui/SiteFooter';
import { jsonLdString } from '@/lib/json-ld';
import { getCoverageCounts, getCuratedRivers, curatedStates, type CoverageCount } from '@/lib/coverage';

// ISR, matching /rivers and /dams. Coverage changes when a river is onboarded,
// so a five-minute window is generous; the point is that the page is REBUILT
// from the database rather than frozen at deploy, which is what let the previous
// hardcoded roster survive two dozen onboardings.
export const revalidate = 300;

export const metadata: Metadata = {
  title: 'What Eddy Covers',
  description:
    'Eddy curates float conditions, access points and logistics for Ozark rivers in Missouri and Arkansas, and carries live USGS readings and forecasts for reference gauges nationwide. Here is exactly what each means.',
  alternates: { canonical: '/coverage' },
};

/**
 * Counts render with thousands separators, and a null renders as an em dash.
 *
 * The dash is deliberate: it reads as "not available right now" rather than as
 * a quantity. Printing 0 for a failed query would be a confident lie in the one
 * place on the site whose entire job is not telling those.
 */
function figure(count: CoverageCount): string {
  return count === null ? '—' : count.toLocaleString('en-US');
}

const card = 'bg-white border border-neutral-200 rounded-xl p-5 shadow-sm';
const statValue = 'text-3xl font-bold text-neutral-900 tabular-nums';
const statLabel = 'text-sm font-semibold text-neutral-700 mt-1';
const statNote = 'text-xs text-neutral-500 mt-2 leading-relaxed';

export default async function CoveragePage() {
  const [counts, rivers] = await Promise.all([getCoverageCounts(), getCuratedRivers()]);
  const states = curatedStates(rivers);
  const stateNames = states
    .map((code) => (code === 'MO' ? 'Missouri' : code === 'AR' ? 'Arkansas' : code))
    .join(' and ');

  return (
    <div className="min-h-screen bg-neutral-50">
      <section
        className="relative py-12 md:py-16 text-white"
        style={{ background: 'linear-gradient(to bottom right, #0F2D35, #163F4A, #0F2D35)' }}
      >
        <div className="max-w-3xl mx-auto px-4 text-center">
          <h1
            className="text-4xl md:text-5xl font-bold mb-3"
            style={{ fontFamily: 'var(--font-display)', color: '#F07052' }}
          >
            What Eddy Covers
          </h1>
          <p className="text-white/80 max-w-2xl mx-auto leading-relaxed">
            Eddy does two different things with water, and it matters which one you are
            looking at.
          </p>
        </div>
      </section>

      <div className="max-w-3xl mx-auto px-4 py-12 space-y-12">
        {/* ── The two tiers ─────────────────────────────────────────── */}
        <section>
          <h2 className="text-2xl font-bold text-neutral-900 mb-4">Two kinds of water</h2>
          <div className="grid md:grid-cols-2 gap-4">
            <div className={`${card} border-l-4 border-l-primary-500`}>
              <div className="flex items-center gap-2 mb-2">
                <Waves className="w-5 h-5 text-primary-600" />
                <h3 className="font-bold text-neutral-900">Curated rivers</h3>
              </div>
              <p className="text-3xl font-bold text-neutral-900 tabular-nums mb-2">
                {figure(counts.curatedRivers)}
              </p>
              <p className="text-neutral-700 text-sm leading-relaxed">
                Rivers Eddy has researched in {stateNames || 'Missouri and Arkansas'}. Each one
                has float thresholds calibrated against outfitter and agency guidance, access
                points verified against official sources, mapped hazards, float-time estimates
                by vessel, and shuttle logistics.
              </p>
              <p className="text-sm font-semibold text-primary-700 mt-3">
                Eddy makes recommendations here.
              </p>
            </div>

            <div className={`${card} border-l-4 border-l-neutral-400`}>
              <div className="flex items-center gap-2 mb-2">
                <Database className="w-5 h-5 text-neutral-600" />
                <h3 className="font-bold text-neutral-900">Reference gauges</h3>
              </div>
              <p className="text-3xl font-bold text-neutral-900 tabular-nums mb-2">
                {figure(counts.referenceGauges)}
              </p>
              <p className="text-neutral-700 text-sm leading-relaxed">
                Live USGS stream gauges across the United States. Eddy shows the reading, how
                it is trending, where it sits against its own history, and the National Weather
                Service forecast where one is published.
              </p>
              <p className="text-sm font-semibold text-neutral-700 mt-3">
                Eddy reports the measurement and recommends nothing.
              </p>
            </div>
          </div>

          <div className="mt-4 bg-amber-50 border border-amber-200 rounded-xl p-4 flex gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-amber-900 leading-relaxed">
              <strong>Why the line is drawn there.</strong> A float verdict is not a reading —
              it is a reading compared against a level someone researched for that specific
              stretch of that specific river. Eddy will not attach a verdict to a gauge nobody
              has done that work for, because a guess and a researched call would then look
              identical on the same badge, and the badge is what people launch on.
            </p>
          </div>
        </section>

        {/* ── Live vs researched ────────────────────────────────────── */}
        <section>
          <h2 className="text-2xl font-bold text-neutral-900 mb-4">
            Live data vs. researched guidance
          </h2>
          <p className="text-neutral-700 leading-relaxed mb-4">
            Everything Eddy shows is one of two things, and they age very differently.
          </p>
          <div className="space-y-3">
            <div className={card}>
              <h3 className="font-bold text-neutral-900 mb-1">
                Live — machine-read, refreshed continuously
              </h3>
              <p className="text-neutral-700 text-sm leading-relaxed">
                Gauge height and discharge from the USGS Water Services API, forecasts from the
                National Weather Service, reservoir levels and generation schedules from the
                US Army Corps of Engineers and Southwestern Power Administration, and weather.
                Eddy pulls these on a schedule and does not edit them. When a reading is older
                than expected, the reading is labelled stale rather than quietly shown as
                current.
              </p>
            </div>
            <div className={card}>
              <h3 className="font-bold text-neutral-900 mb-1">
                Researched — written by a person, and dated
              </h3>
              <p className="text-neutral-700 text-sm leading-relaxed">
                Float thresholds, access-point coordinates and directions, hazards, float-time
                models, and outfitter and campground listings. These come from agency sources
                (NPS, Missouri Department of Conservation, US Forest Service, state parks,
                Recreation.gov), from outfitter guidance, and from Eddy&apos;s own review. They
                are correct as of when they were checked, not as of right now — a river can
                change with one flood, and a business can close between seasons.
              </p>
            </div>
          </div>
          <p className="text-sm text-neutral-600 mt-4 leading-relaxed">
            Eddy&apos;s written daily read combines the two: it is generated from live readings
            and the researched thresholds for that river. It is a summary of data, not a
            substitute for judgement, and it never turns an unrated gauge into a rated one.
          </p>
        </section>

        {/* ── What curation actually includes ───────────────────────── */}
        <section>
          <h2 className="text-2xl font-bold text-neutral-900 mb-4">
            What a curated river carries
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div className={card}>
              <Gauge className="w-5 h-5 text-primary-600 mb-2" />
              <p className={statValue}>{figure(counts.ratedGauges)}</p>
              <p className={statLabel}>Rated gauges</p>
              <p className={statNote}>
                Carry a floatability ladder, so they produce a verdict and not just a number.
                A river may have several — one per reach.
              </p>
            </div>
            <div className={card}>
              <MapPin className="w-5 h-5 text-primary-600 mb-2" />
              <p className={statValue}>{figure(counts.accessPoints)}</p>
              <p className={statLabel}>Access points</p>
              <p className={statNote}>
                Put-ins and take-outs verified against an official source and approved for
                display. Pending pins are not counted.
              </p>
            </div>
            <div className={card}>
              <AlertTriangle className="w-5 h-5 text-primary-600 mb-2" />
              <p className={statValue}>{figure(counts.hazards)}</p>
              <p className={statLabel}>Mapped hazards</p>
              <p className={statNote}>
                Recorded hazards on curated rivers. Absence of a hazard here is not evidence
                that a stretch is clear.
              </p>
            </div>
            <div className={card}>
              <Tent className="w-5 h-5 text-primary-600 mb-2" />
              <p className={statValue}>{figure(counts.campgrounds)}</p>
              <p className={statLabel}>Campgrounds</p>
              <p className={statNote}>
                National Park Service campgrounds synced from the NPS API, plus private
                campgrounds researched by Eddy.
              </p>
            </div>
            <div className={card}>
              <Building2 className="w-5 h-5 text-primary-600 mb-2" />
              <p className={statValue}>{figure(counts.services)}</p>
              <p className={statLabel}>Outfitters &amp; lodging</p>
              <p className={statNote}>
                Outfitters, campgrounds, cabins and lodges. Businesses known to have closed
                permanently are excluded.
              </p>
            </div>
            <div className={card}>
              <Waves className="w-5 h-5 text-primary-600 mb-2" />
              <p className={statValue}>{figure(counts.curatedRivers)}</p>
              <p className={statLabel}>Curated rivers</p>
              <p className={statNote}>
                Listed in full below. Coverage grows river by river, and this page moves with
                it.
              </p>
            </div>
          </div>
        </section>

        {/* ── The roster ────────────────────────────────────────────── */}
        <section>
          <h2 className="text-2xl font-bold text-neutral-900 mb-4">The curated rivers</h2>
          {rivers.length ? (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {rivers.map((river) => (
                <Link
                  key={river.slug}
                  href={river.path}
                  className="bg-white border-2 border-neutral-200 rounded-lg px-4 py-3 font-semibold text-neutral-900 shadow-sm hover:shadow-md hover:border-primary-300 transition-all no-underline"
                >
                  {river.name}
                  <span className="block text-xs font-normal text-neutral-500 mt-0.5">
                    {river.state}
                  </span>
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-neutral-600">
              The river list is temporarily unavailable.{' '}
              <Link href="/rivers" className="text-primary-600 font-medium">
                Browse rivers
              </Link>
              .
            </p>
          )}
        </section>

        {/* ── Asking for more ───────────────────────────────────────── */}
        <section className={card}>
          <h2 className="text-xl font-bold text-neutral-900 mb-2">
            Want a river curated?
          </h2>
          <p className="text-neutral-700 text-sm leading-relaxed">
            Curating a river means researching its thresholds, placing and verifying its access
            points, and mapping its hazards — so it happens river by river rather than by
            importing a list. If a river matters to you,{' '}
            <Link href="/support" className="text-primary-600 font-medium">
              tell us
            </Link>
            . Outfitters and campgrounds who want live conditions on their own site can use the{' '}
            <Link href="/embed" className="text-primary-600 font-medium">
              free widgets
            </Link>
            , and developers can read these same figures from{' '}
            <code className="text-xs bg-neutral-100 px-1.5 py-0.5 rounded">/api/coverage</code>.
          </p>
        </section>

        <p className="text-xs text-neutral-500 leading-relaxed">
          Every number on this page is read from Eddy&apos;s database when the page loads, not
          written into the page. Eddy is a planning tool: conditions change faster than any
          website, and you are responsible for your own safety on the river.
        </p>
      </div>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdString({
            '@context': 'https://schema.org',
            '@type': 'FAQPage',
            mainEntity: [
              {
                '@type': 'Question',
                name: 'What is the difference between a curated river and a reference gauge on Eddy?',
                acceptedAnswer: {
                  '@type': 'Answer',
                  text: 'A curated river has been researched: it carries float-condition thresholds calibrated against outfitter and agency guidance, verified access points, mapped hazards, float-time estimates and shuttle logistics, and Eddy makes recommendations on it. A reference gauge is any other live USGS stream gauge Eddy ingests nationwide — Eddy shows its reading, trend and National Weather Service forecast, but attaches no float recommendation, because no one has researched what a good level means on that water.',
                },
              },
              {
                '@type': 'Question',
                name: 'Which data on Eddy is live and which is researched?',
                acceptedAnswer: {
                  '@type': 'Answer',
                  text: 'Live data is machine-read on a schedule and unedited: USGS gauge height and discharge, National Weather Service forecasts, US Army Corps of Engineers reservoir levels and Southwestern Power Administration generation schedules, and weather. Researched guidance is written by a person and correct as of when it was checked: float thresholds, access-point coordinates and directions, hazards, float-time models, and outfitter and campground listings.',
                },
              },
            ],
          }),
        }}
      />

      <SiteFooter maxWidth="max-w-3xl" />
    </div>
  );
}
