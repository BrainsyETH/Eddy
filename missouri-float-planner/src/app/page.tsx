// src/app/page.tsx
// Landing page for Eddy — "Home v2" layout: status-forward hero, two pillar
// cards, a side-by-side Eddy read + live river list, a featured-rivers guide
// band, and an embed CTA. Visual brand (white/coral/Fredoka/otter) is unchanged;
// only the section structure was reworked.

import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { getRiverGuides } from '@/lib/data/rivers';
import EddySaysReport from '@/components/home/EddySaysReport';
import EddyHeroBubble from '@/components/home/EddyHeroBubble';
import FloatingWellNow from '@/components/home/FloatingWellNow';
import SiteFooter from '@/components/ui/SiteFooter';

export const revalidate = 300; // ISR every 5 minutes

const EDDY_CANOE = 'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy%20the%20otter%20in%20a%20cool%20canoe.png';

// Featured rivers for the river-guide band. Current River is the hero feature;
// the rest render as compact cards. Each links to its blog guide post, which
// also supplies the card image (gradient fallback if a river has no post).
const FEATURE_RIVER = {
  slug: 'current',
  name: 'Current River',
  tagline: 'Missouri’s spring-fed classic — clear, cool water and the state’s most popular float.',
};
const SIDE_RIVERS = [
  { slug: 'eleven-point', name: 'Eleven Point' },
  { slug: 'jacks-fork', name: 'Jacks Fork' },
  { slug: 'huzzah', name: 'Huzzah' },
  { slug: 'meramec', name: 'Meramec' },
];
const FEATURED_RIVER_SLUGS = [FEATURE_RIVER.slug, ...SIDE_RIVERS.map((r) => r.slug)];

export default async function Home() {
  const riverGuides = await getRiverGuides(FEATURED_RIVER_SLUGS);
  const guideHref = (slug: string) => {
    const guide = riverGuides[slug];
    return guide ? `/blog/${guide.postSlug}` : '/blog';
  };
  const featureImage = riverGuides[FEATURE_RIVER.slug]?.image ?? null;

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

        <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 py-14 md:py-20">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-10 md:gap-12 items-center">
            <div className="max-w-xl">
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

            {/* Eddy mascot + live quote bubble */}
            <div className="relative flex flex-col items-center gap-5 md:block md:min-h-[380px]">
              {/* Otter — above the bubble on mobile, behind/below it on desktop */}
              <div className="order-1 md:order-none flex justify-center md:absolute md:bottom-0 md:right-0">
                <Image
                  src={EDDY_CANOE}
                  alt="Eddy the Otter"
                  width={320}
                  height={320}
                  className="w-36 sm:w-44 md:w-52 lg:w-60 h-auto animate-float drop-shadow-[0_8px_32px_rgba(240,112,82,0.25)]"
                  priority
                />
              </div>
              {/* Live quote bubble */}
              <div className="order-2 md:order-none w-full max-w-sm md:max-w-none md:absolute md:top-0 md:left-0 md:right-12 z-20">
                <EddyHeroBubble />
              </div>
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
            <h2 className="text-xl md:text-2xl font-bold text-neutral-900 mb-1.5" style={{ fontFamily: 'var(--font-display)' }}>
              River Reports
            </h2>
            <p className="text-sm text-neutral-500 leading-relaxed mb-4">
              Is it floatable right now? Live USGS river data, weather reports, and custom updates for every river.
            </p>
            <span className="mt-auto inline-flex items-center gap-1.5 text-sm font-semibold text-accent-600">
              See what&apos;s running <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
            </span>
          </Link>

          <Link
            href="/plan"
            className="group bg-white border border-neutral-200 rounded-2xl p-6 md:p-7 flex flex-col shadow-soft-md hover:shadow-soft-lg hover:border-neutral-300 transition-all no-underline"
          >
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

      {/* ─── Featured Rivers (the river guide) ─── */}
      <section className="max-w-6xl mx-auto w-full px-4 sm:px-6 pt-14 md:pt-20">
        <div className="mb-6">
          <h2 className="text-2xl md:text-3xl font-bold text-neutral-900 max-w-md" style={{ fontFamily: 'var(--font-display)' }}>
            New to floating? Start here.
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-[1.4fr_1fr] gap-5">
          {/* Featured: Current River */}
          <Link
            href={guideHref(FEATURE_RIVER.slug)}
            className="group relative block rounded-2xl overflow-hidden border border-neutral-200 min-h-[18rem] no-underline"
          >
            {featureImage ? (
              <Image
                src={featureImage}
                alt={FEATURE_RIVER.name}
                fill
                sizes="(min-width: 768px) 56vw, 100vw"
                className="object-cover transition-transform duration-500 group-hover:scale-105"
              />
            ) : (
              <div className="absolute inset-0" style={{ background: 'linear-gradient(135deg, #163F4A 0%, #0F2D35 100%)' }} />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/25 to-transparent" />
            <div className="absolute bottom-0 left-0 right-0 p-6">
              <span className="block text-[11px] font-semibold uppercase tracking-wider text-white/80 mb-2" style={{ fontFamily: 'var(--font-mono)' }}>
                Featured river
              </span>
              <h3 className="text-2xl md:text-3xl font-bold text-white mb-1.5" style={{ fontFamily: 'var(--font-display)' }}>
                {FEATURE_RIVER.name}
              </h3>
              <p className="text-sm text-white/85 max-w-md leading-relaxed mb-3">
                {FEATURE_RIVER.tagline}
              </p>
              <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-white">
                Read the guide <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
              </span>
            </div>
          </Link>

          {/* Side rivers */}
          <div className="flex flex-col gap-3">
            {SIDE_RIVERS.map((river) => {
              const img = riverGuides[river.slug]?.image ?? null;
              return (
                <Link
                  key={river.slug}
                  href={guideHref(river.slug)}
                  className="group bg-white border border-neutral-200 rounded-xl p-3 flex items-center gap-4 hover:border-neutral-300 hover:shadow-soft-sm transition-all no-underline"
                >
                  <div className="relative w-16 h-16 rounded-lg overflow-hidden flex-shrink-0">
                    {img ? (
                      <Image src={img} alt={river.name} fill sizes="64px" className="object-cover" />
                    ) : (
                      <div
                        className="w-full h-full flex items-center justify-center"
                        style={{ background: 'linear-gradient(135deg, #163F4A 0%, #0F2D35 100%)' }}
                      >
                        <span className="text-white/90 text-lg font-bold" style={{ fontFamily: 'var(--font-display)' }}>
                          {river.name.charAt(0)}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-base font-bold text-neutral-900 truncate" style={{ fontFamily: 'var(--font-display)' }}>
                      {river.name}
                    </h3>
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-accent-600">
                      Read guide <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
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
              Run an outfitter or a campground?
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
