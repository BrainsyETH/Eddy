// Homepage: current river conditions, route planning, and river guides.

import Image from 'next/image';
import Link from 'next/link';
import AppLink from '@/components/AppLink';
import { ArrowRight, Search, MapPin } from 'lucide-react';
import type { RiverGuide } from '@/lib/data/rivers';
import RiverMapFeature from '@/components/home/RiverMapFeature';
import EddyHeroBubble from '@/components/home/EddyHeroBubble';
import SiteFooter from '@/components/ui/SiteFooter';
import HomeRiverReports from '@/components/home/HomeRiverReports';
import type { RiverListItem } from '@/types/api';
import type { DamSnapshot } from '@shared/dam-types';

const EDDY_CANOE = 'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy%20the%20otter%20in%20a%20cool%20canoe.png';

// Featured rivers for the river-guide band. Current River is the hero feature;
// the rest render as compact cards. Each links to its blog guide post, which
// also supplies the card image (gradient fallback if a river has no post).
const FEATURE_RIVER = {
  slug: 'current',
  name: 'Current River',
  tagline: 'The Ozarks’ spring-fed classic — clear, cool water and the region’s most popular float.',
};
const SIDE_RIVERS = [
  { slug: 'buffalo', name: 'Buffalo River' },
  { slug: 'eleven-point', name: 'Eleven Point' },
  { slug: 'jacks-fork', name: 'Jacks Fork' },
  { slug: 'huzzah', name: 'Huzzah' },
  { slug: 'meramec', name: 'Meramec' },
];
export const FEATURED_RIVER_SLUGS = [FEATURE_RIVER.slug, ...SIDE_RIVERS.map((r) => r.slug)];

export default function HomePage({ riverGuides, featuredReports, featuredDams, renderedAt, damsUnavailable, floatSearchEnabled }: {
  riverGuides: Record<string, RiverGuide | null>;
  featuredReports: RiverListItem[];
  featuredDams: DamSnapshot[];
  renderedAt: number;
  damsUnavailable?: boolean;
  floatSearchEnabled: boolean;
}) {
  const guideHref = (slug: string) => {
    const guide = riverGuides[slug];
    return guide ? `/blog/${guide.postSlug}` : `/rivers/${slug}`;
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

        <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 py-8 md:py-12">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-10 items-center">
            <div className="max-w-xl mx-auto md:mx-0 text-center md:text-left">
              <h1
                className="text-4xl md:text-5xl lg:text-6xl font-bold leading-[1.05] mb-4"
                style={{ fontFamily: 'var(--font-display)', color: '#F07052' }}
              >
                Float with Eddy
              </h1>
              <p className="text-base md:text-lg text-white/80 max-w-lg mx-auto md:mx-0 mb-8 leading-relaxed">
                River conditions and float plans for the Ozarks.
              </p>

              <div className="flex flex-wrap justify-center md:justify-start gap-3">
                <Link
                  href="/rivers"
                  data-ga-event="cta_river_reports"
                  data-ga-label="hero"
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-lg text-sm font-semibold text-white transition-colors no-underline bg-accent-500 hover:bg-accent-600"
                >
                  Check Conditions
                </Link>
                <Link
                  href="/plan"
                  data-ga-event="cta_plan_float"
                  data-ga-label="hero"
                  className="inline-flex items-center gap-2 px-6 py-3 bg-white rounded-lg text-sm font-semibold text-neutral-900 hover:bg-neutral-50 transition-all no-underline"
                >
                  Build a Route
                </Link>
              </div>
            </div>

            {/* Eddy mascot + live quote bubble */}
            <div className="relative flex flex-col items-center gap-3 md:gap-2">
              {/* Otter — below the bubble so the caret points down at Eddy */}
              <div className="order-2 flex justify-center md:self-end md:mr-3">
                <Image
                  src={EDDY_CANOE}
                  alt="Eddy the Otter"
                  width={320}
                  height={320}
                  className="w-28 sm:w-32 h-auto animate-float drop-shadow-[0_8px_32px_rgba(240,112,82,0.25)]"
                  priority
                />
              </div>
              {/* Live quote bubble */}
              <div className="order-1 w-full max-w-sm md:max-w-none z-20">
                <EddyHeroBubble />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section aria-labelledby="river-dam-conditions" className="max-w-6xl mx-auto w-full px-4 sm:px-6 pt-8 md:pt-10">
        <h2 id="river-dam-conditions" className="mb-5 text-2xl md:text-3xl font-bold text-neutral-900" style={{ fontFamily: 'var(--font-display)' }}>River and Dam Conditions</h2>
        <HomeRiverReports rivers={featuredReports} dams={featuredDams} renderedAt={renderedAt} damsUnavailable={damsUnavailable} />
      </section>

      <section aria-labelledby="plan-your-float" className="max-w-6xl mx-auto w-full px-4 sm:px-6 pt-10 md:pt-12">
        <h2 id="plan-your-float" className="mb-5 text-2xl md:text-3xl font-bold text-neutral-900" style={{ fontFamily: 'var(--font-display)' }}>Plan Your Float</h2>
        <div className="grid gap-5 md:grid-cols-2">
          <div className="grid gap-4">
            {floatSearchEnabled && <Link href="/find-float" data-ga-event="cta_find_route" data-ga-label="home_planning" className="flex items-center gap-4 rounded-xl border border-neutral-200 bg-white p-5 no-underline hover:shadow-soft-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary-600">
              <Search className="h-7 w-7 flex-shrink-0 text-primary-600" aria-hidden="true" />
              <div className="flex-1"><h3 className="text-xl font-bold text-neutral-900" style={{ fontFamily: 'var(--font-display)' }}>Find a Route</h3><p className="mt-1 text-sm text-neutral-600">Get suggestions for your time and location</p></div>
              <ArrowRight className="h-4 w-4 text-primary-700" aria-hidden="true" />
            </Link>}
            <Link href="/plan" data-ga-event="cta_plan_float" data-ga-label="home_planning" className="flex items-center gap-4 rounded-xl border border-neutral-200 bg-white p-5 no-underline hover:shadow-soft-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary-600">
              <MapPin className="h-7 w-7 flex-shrink-0 text-primary-600" aria-hidden="true" />
              <div className="flex-1"><h3 className="text-xl font-bold text-neutral-900" style={{ fontFamily: 'var(--font-display)' }}>Build a Route</h3><p className="mt-1 text-sm text-neutral-600">Choose your put-in and take-out</p></div>
              <ArrowRight className="h-4 w-4 text-primary-700" aria-hidden="true" />
            </Link>
          </div>
          <RiverMapFeature />
        </div>
      </section>

      {/* ─── Featured Rivers (the river guide) ─── */}
      <section className="max-w-6xl mx-auto w-full px-4 sm:px-6 pt-10 md:pt-12">
        <div className="mb-6">
          <h2 className="text-2xl md:text-3xl font-bold text-neutral-900 max-w-md" style={{ fontFamily: 'var(--font-display)' }}>
            River Guides
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-[1.4fr_1fr] gap-5">
          {/* Featured: Current River */}
          <Link
            href={guideHref(FEATURE_RIVER.slug)}
            data-ga-event="guide_click"
            data-ga-label={FEATURE_RIVER.slug}
            className="group relative block rounded-2xl overflow-hidden border border-neutral-200 min-h-[18rem] no-underline"
          >
            {featureImage ? (
              <Image
                src={featureImage}
                alt={FEATURE_RIVER.name}
                fill
                sizes="(min-width: 768px) 56vw, 100vw"
                className="object-cover transition-transform duration-slower group-hover:scale-105"
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
                {riverGuides[FEATURE_RIVER.slug] ? 'Read the guide' : 'View River Report'} <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
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
                  data-ga-event="guide_click"
                  data-ga-label={river.slug}
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
                      {riverGuides[river.slug] ? 'Read guide' : 'River report'} <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      <section className="max-w-6xl mx-auto w-full px-4 sm:px-6 py-10 md:py-12">
        <div className="rounded-2xl bg-primary-800 p-6 md:p-8 flex flex-col sm:flex-row sm:items-center justify-between gap-5">
          <div><h2 className="text-2xl font-bold text-white" style={{ fontFamily: 'var(--font-display)' }}>Take Eddy with you</h2><p className="mt-2 text-sm text-primary-100">Track your trip with River Mode and check river levels from your Home Screen.</p></div>
          <AppLink data-ga-event="app_landing_click" data-ga-label="homepage_app" className="inline-flex items-center justify-center gap-2 rounded-lg bg-accent-500 px-5 py-3 text-sm font-semibold text-white no-underline hover:bg-accent-600 whitespace-nowrap">Get Eddy for iPhone <ArrowRight className="h-4 w-4" aria-hidden="true" /></AppLink>
        </div>
      </section>

      {/* ─── Data Attribution ─── */}
      <section className="border-t border-neutral-100">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
          <p className="text-xs text-center text-neutral-400">
            River readings include data from the <strong className="text-neutral-500">United States Geological Survey (USGS)</strong>. Check each report for its latest reading time.
          </p>
        </div>
      </section>

      <SiteFooter maxWidth="max-w-6xl" />
    </div>
  );
}
