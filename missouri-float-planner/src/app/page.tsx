// src/app/page.tsx
// Landing page for Eddy — "Home v2" layout: status-forward hero, two pillar
// cards, a side-by-side Eddy read + live river list, a river-guide band, river
// pills, and an embed CTA. Visual brand (white/coral/Fredoka/otter) is unchanged;
// only the section structure was reworked.

import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { getRivers } from '@/lib/data/rivers';
import { CONDITION_COLORS } from '@/constants';
import EddySaysReport from '@/components/home/EddySaysReport';
import FloatingWellNow from '@/components/home/FloatingWellNow';
import SiteFooter from '@/components/ui/SiteFooter';

export const revalidate = 300; // ISR every 5 minutes

const EDDY_CANOE = 'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy%20the%20otter%20in%20a%20cool%20canoe.png';

// "Running clean" = ideal/floatable conditions, used for the hero status pill.
const CLEAN_CODES = new Set<string>(['flowing', 'good']);

// Evergreen river-guide entries. Placeholder copy + links until dedicated guide
// posts exist; tiles are tinted from the theme palette.
const GUIDES = [
  { glyph: '🎒', kicker: 'Gear', title: 'What to pack for a day float', tile: 'bg-support-100 text-support-700' },
  { glyph: '🧭', kicker: 'Routes', title: 'Picking the right put-in & take-out', tile: 'bg-accent-100 text-accent-700' },
  { glyph: '⚠️', kicker: 'Safety', title: 'When a river is too high to float', tile: 'bg-secondary-100 text-secondary-700' },
];

export default async function Home() {
  const rivers = await getRivers();
  const totalCount = rivers.length;
  const cleanCount = rivers.filter((r) => CLEAN_CODES.has(r.currentCondition?.code ?? 'unknown')).length;

  return (
    <div className="min-h-[calc(100vh-3.5rem)] flex flex-col bg-white">
      {/* ─── Hero ─── */}
      <section className="relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #0F2D35 0%, #163F4A 40%, #1A4F5C 100%)' }}>
        {/* Topographic wave pattern */}
        <div className="absolute inset-0 opacity-[0.07] pointer-events-none">
          <svg className="absolute bottom-0 w-full" viewBox="0 0 1440 320" preserveAspectRatio="none">
            <path fill="white" d="M0,224L48,213.3C96,203,192,181,288,181.3C384,181,480,203,576,218.7C672,235,768,245,864,234.7C960,224,1056,192,1152,181.3C1248,171,1344,181,1392,186.7L1440,192L1440,320L1392,320C1344,320,1248,320,1152,320C1056,320,960,320,864,320C768,320,672,320,576,320C480,320,384,320,288,320C192,320,96,320,48,320L0,320Z" />
          </svg>
          <svg className="absolute bottom-8 w-full" viewBox="0 0 1440 320" preserveAspectRatio="none">
            <path fill="white" d="M0,256L60,240C120,224,240,192,360,186.7C480,181,600,203,720,208C840,213,960,203,1080,186.7C1200,171,1320,149,1380,138.7L1440,128L1440,320L1380,320C1320,320,1200,320,1080,320C960,320,840,320,720,320C600,320,480,320,360,320C240,320,120,320,60,320L0,320Z" />
          </svg>
        </div>

        <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 py-14 md:py-24">
          <div className="flex items-center justify-between gap-8">
            <div className="flex-1 max-w-xl">
              {/* Live status pill */}
              {totalCount > 0 && (
                <div className="inline-flex items-center gap-2 mb-6 px-3.5 py-1.5 rounded-full text-xs font-semibold text-support-100 bg-support-500/15 border border-support-400/20 backdrop-blur-sm">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full rounded-full bg-support-400 opacity-75 animate-ping" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-support-400" />
                  </span>
                  {cleanCount} of {totalCount} rivers running clean today
                </div>
              )}

              <h1
                className="text-4xl md:text-5xl lg:text-6xl font-bold text-white leading-[1.1] mb-4"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                Plan Your Next{' '}
                <br className="hidden sm:block" />
                <span style={{ color: '#F07052' }}>Float.</span>
              </h1>
              <p className="text-base md:text-lg text-white/80 max-w-lg mb-8 leading-relaxed">
                Real-time USGS gauge data, river analysis, and trip insights for paddlers, anglers, and float enthusiasts.
              </p>

              <div className="flex flex-wrap gap-3">
                <Link
                  href="/plan"
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-lg text-sm font-semibold text-white transition-all no-underline hover:brightness-110"
                  style={{ backgroundColor: '#F07052' }}
                >
                  Plan Your Float
                </Link>
                <Link
                  href="/rivers"
                  className="inline-flex items-center gap-2 px-6 py-3 bg-white rounded-lg text-sm font-semibold text-neutral-900 hover:bg-neutral-50 transition-all no-underline"
                >
                  River Reports
                </Link>
              </div>
            </div>

            {/* Otter mascot — visible on all screen sizes */}
            <div className="flex-shrink-0">
              <Image
                src={EDDY_CANOE}
                alt="Eddy the Otter"
                width={320}
                height={320}
                className="w-20 md:w-52 lg:w-64 h-auto drop-shadow-[0_8px_32px_rgba(240,112,82,0.25)]"
                priority
              />
            </div>
          </div>
        </div>
      </section>

      {/* ─── Two Pillars (overlap the hero) ─── */}
      <section className="relative z-20 max-w-6xl mx-auto w-full px-4 sm:px-6 -mt-10 md:-mt-16">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <Link
            href="/rivers"
            className="group bg-white border border-neutral-200 rounded-2xl p-6 md:p-7 flex flex-col shadow-soft-md hover:shadow-soft-lg hover:border-neutral-300 transition-all no-underline"
          >
            <span className="text-[11px] font-semibold uppercase tracking-wider text-support-600 mb-3" style={{ fontFamily: 'var(--font-mono)' }}>
              01 · Status
            </span>
            <h2 className="text-xl md:text-2xl font-bold text-neutral-900 mb-1.5" style={{ fontFamily: 'var(--font-display)' }}>
              River Reports
            </h2>
            <p className="text-sm text-neutral-500 leading-relaxed mb-4">
              Is it floatable right now? Live USGS levels, trends, and Eddy&apos;s plain-English read for every river.
            </p>
            <span className="mt-auto inline-flex items-center gap-1.5 text-sm font-semibold text-accent-600">
              See what&apos;s running <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
            </span>
          </Link>

          <Link
            href="/plan"
            className="group bg-white border border-neutral-200 rounded-2xl p-6 md:p-7 flex flex-col shadow-soft-md hover:shadow-soft-lg hover:border-neutral-300 transition-all no-underline"
          >
            <span className="text-[11px] font-semibold uppercase tracking-wider text-accent-600 mb-3" style={{ fontFamily: 'var(--font-mono)' }}>
              02 · Action
            </span>
            <h2 className="text-xl md:text-2xl font-bold text-neutral-900 mb-1.5" style={{ fontFamily: 'var(--font-display)' }}>
              Plan a Float
            </h2>
            <p className="text-sm text-neutral-500 leading-relaxed mb-4">
              Pick a put-in and take-out. Get float time, mileage, and shuttle — then a link to share with your crew.
            </p>
            <span className="mt-auto inline-flex items-center gap-1.5 text-sm font-semibold text-accent-600">
              Build a trip <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
            </span>
          </Link>
        </div>
      </section>

      {/* ─── Eddy's Read + Floating Well Now ─── */}
      <section className="max-w-6xl mx-auto w-full px-4 sm:px-6 pt-14 md:pt-20">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-stretch">
          {/* Eddy's read */}
          <EddySaysReport />

          {/* Live river list */}
          <div className="bg-white border border-neutral-200 rounded-2xl p-5 md:p-6 shadow-sm flex flex-col">
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-base font-bold text-neutral-900" style={{ fontFamily: 'var(--font-display)' }}>
                Floating well now
              </h2>
              <Link
                href="/rivers"
                className="inline-flex items-center gap-1 text-xs font-semibold text-neutral-500 hover:text-neutral-800 transition-colors no-underline"
              >
                All rivers <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
            <FloatingWellNow />
          </div>
        </div>
      </section>

      {/* ─── River Guide (evergreen) ─── */}
      <section className="max-w-6xl mx-auto w-full px-4 sm:px-6 pt-14 md:pt-20">
        <div className="flex items-end justify-between gap-6 flex-wrap mb-6">
          <div>
            <span className="block text-[11px] font-semibold uppercase tracking-wider text-neutral-400 mb-2" style={{ fontFamily: 'var(--font-mono)' }}>
              The river guide
            </span>
            <h2 className="text-2xl md:text-3xl font-bold text-neutral-900 max-w-md" style={{ fontFamily: 'var(--font-display)' }}>
              New to floating? Start here.
            </h2>
          </div>
          <p className="text-sm text-neutral-500 max-w-sm leading-relaxed">
            Everything that doesn&apos;t change with the weather — how to read a level, what to pack, and how to pick your stretch.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-[1.3fr_1fr] gap-5">
          {/* Featured guide */}
          <Link
            href="/blog"
            className="group bg-white border border-neutral-200 rounded-2xl overflow-hidden flex flex-col hover:shadow-soft-lg hover:border-neutral-300 transition-all no-underline"
          >
            <div className="relative h-44 md:h-52 overflow-hidden" style={{ background: 'linear-gradient(135deg, #163F4A 0%, #0F2D35 100%)' }}>
              <svg className="absolute bottom-0 w-full opacity-20" viewBox="0 0 1440 320" preserveAspectRatio="none">
                <path fill="white" d="M0,224L48,213.3C96,203,192,181,288,181.3C384,181,480,203,576,218.7C672,235,768,245,864,234.7C960,224,1056,192,1152,181.3C1248,171,1344,181,1392,186.7L1440,192L1440,320L0,320Z" />
              </svg>
              <span className="absolute bottom-3 left-3 text-[11px] font-medium text-white/85 bg-black/25 px-2.5 py-1 rounded-md" style={{ fontFamily: 'var(--font-mono)' }}>
                Conditions 101
              </span>
            </div>
            <div className="p-6">
              <h3 className="text-lg md:text-xl font-bold text-neutral-900 mb-1.5 leading-snug" style={{ fontFamily: 'var(--font-display)' }}>
                How to read a river level (and why it matters)
              </h3>
              <p className="text-sm text-neutral-500 leading-relaxed">
                What &ldquo;2.8 ft&rdquo; and &ldquo;runnable&rdquo; actually mean, how thresholds work, and when a river&apos;s too low to bother — or too high to be safe.
              </p>
            </div>
          </Link>

          {/* Compact guides */}
          <div className="flex flex-col gap-3">
            {GUIDES.map((g) => (
              <Link
                key={g.title}
                href="/blog"
                className="group bg-white border border-neutral-200 rounded-xl p-4 flex items-center gap-4 hover:border-neutral-300 hover:shadow-soft-sm transition-all no-underline"
              >
                <span className={`w-11 h-11 rounded-xl flex items-center justify-center text-lg flex-shrink-0 ${g.tile}`}>
                  {g.glyph}
                </span>
                <div className="min-w-0">
                  <span className="block text-[10px] font-semibold uppercase tracking-wider text-neutral-400" style={{ fontFamily: 'var(--font-mono)' }}>
                    {g.kicker}
                  </span>
                  <h3 className="text-sm font-bold text-neutral-800 leading-snug mt-0.5" style={{ fontFamily: 'var(--font-display)' }}>
                    {g.title}
                  </h3>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Jump to a River ─── */}
      <section className="max-w-6xl mx-auto w-full px-4 sm:px-6 pt-14 md:pt-20">
        <h2 className="text-lg font-bold text-neutral-900 mb-4" style={{ fontFamily: 'var(--font-display)' }}>
          Jump to a river
        </h2>
        <div className="flex flex-wrap gap-2">
          {rivers.map((river) => {
            const condCode = river.currentCondition?.code ?? 'unknown';
            const dotColor = CONDITION_COLORS[condCode] || CONDITION_COLORS.unknown;
            return (
              <Link
                key={river.id}
                href={`/rivers/${river.slug}`}
                className="inline-flex items-center gap-2 px-3.5 py-2 bg-white border border-neutral-200 rounded-full text-sm font-medium text-neutral-700 hover:border-neutral-300 hover:shadow-sm transition-all no-underline"
              >
                <span
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: dotColor }}
                />
                {river.name}
              </Link>
            );
          })}
        </div>
      </section>

      {/* ─── Embed CTA ─── */}
      <section className="max-w-6xl mx-auto w-full px-4 sm:px-6 pt-14 md:pt-20 pb-14 md:pb-20">
        <div
          className="rounded-2xl p-8 md:p-10 grid grid-cols-1 md:grid-cols-[1fr_auto] gap-6 items-center"
          style={{ background: 'linear-gradient(135deg, #0F2D35 0%, #163F4A 100%)' }}
        >
          <div>
            <h2 className="text-xl md:text-2xl font-bold text-white mb-2" style={{ fontFamily: 'var(--font-display)' }}>
              Add live data to your site.
            </h2>
            <p className="text-sm text-white/70 max-w-xl leading-relaxed">
              Embed real-time gauge readings, condition badges, and Eddy&apos;s analysis directly on your outfitter site, blog, or community page.
            </p>
          </div>
          <Link
            href="/embed"
            className="inline-flex items-center justify-center gap-2 px-6 py-3 text-white font-semibold rounded-xl text-sm no-underline whitespace-nowrap transition-all hover:brightness-110"
            style={{ backgroundColor: '#F07052' }}
          >
            Explore Embed Widgets <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>

      {/* ─── Data Attribution ─── */}
      <section className="border-t border-neutral-100">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
          <p className="text-xs text-center text-neutral-400">
            All gauge data provided by the <strong className="text-neutral-500">United States Geological Survey (USGS)</strong> through their Water Services API. Readings updated hourly, typically lagging real-time by 15-60 minutes.
          </p>
        </div>
      </section>

      <SiteFooter maxWidth="max-w-6xl" />
    </div>
  );
}
