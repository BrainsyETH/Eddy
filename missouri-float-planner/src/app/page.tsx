// src/app/page.tsx
// Landing page for Eddy — redesigned with spacious, modern layout

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { getRivers } from '@/lib/data/rivers';
import { CONDITION_COLORS } from '@/constants';
import FloatEstimator from './FloatEstimator';
import FeaturedRivers from '@/components/home/FeaturedRivers';
import EddySaysReport from '@/components/home/EddySaysReport';
import HeroRiver from '@/components/home/HeroRiver';
import ScrollReveal from '@/components/ui/ScrollReveal';
import SiteFooter from '@/components/ui/SiteFooter';

export const revalidate = 300; // ISR every 5 minutes

export default async function Home() {
  const rivers = await getRivers();

  return (
    <div className="min-h-[calc(100vh-3.5rem)] flex flex-col bg-white">
      {/* ─── Hero with animated river ─── */}
      <HeroRiver />

      {/* ─── Eddy Says ─── */}
      <ScrollReveal className="max-w-6xl mx-auto px-4 sm:px-6 pt-14 md:pt-20 pb-8 w-full">
        <EddySaysReport />
      </ScrollReveal>

      {/* ─── Live Gauge Data ─── */}
      <ScrollReveal className="px-4 sm:px-6 lg:px-16 xl:px-24 pb-8 md:pb-10 w-full" variant="scale">
        <div className="flex items-end justify-between mb-2">
          <h2 className="text-2xl md:text-3xl font-bold text-neutral-900" style={{ fontFamily: 'var(--font-display)' }}>
            Check River Levels
          </h2>
          <Link
            href="/gauges"
            className="hidden sm:flex items-center gap-1.5 text-sm font-medium text-neutral-600 hover:text-neutral-900 transition-colors no-underline"
          >
            View all rivers
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        {/* Featured Rivers (client component with live data) */}
        <FeaturedRivers />
      </ScrollReveal>

      {/* ─── Plan Your Float ─── */}
      <ScrollReveal className="w-full">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 md:py-16">
          <div className="max-w-2xl mx-auto">
            <FloatEstimator rivers={rivers} />
          </div>
        </div>
      </ScrollReveal>

      {/* ─── Embed Widgets CTA ─── */}
      <ScrollReveal className="bg-neutral-50 border-t border-neutral-100 w-full" variant="scale">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-14 md:py-20 text-center">
          <h2 className="text-2xl md:text-3xl font-bold text-neutral-900 mb-2" style={{ fontFamily: 'var(--font-display)' }}>
            Add live data to your site.
          </h2>
          <p className="text-sm text-neutral-500 max-w-md mx-auto mb-8 leading-relaxed">
            Embed real-time gauge readings, condition badges, and Eddy&apos;s analysis directly on your outfitter site, blog, or community page.
          </p>
          <Link
            href="/embed"
            className="inline-flex items-center gap-2 px-6 py-3 bg-accent-500 hover:bg-accent-600 text-white font-semibold rounded-xl transition-colors text-sm no-underline"
          >
            Explore Embed Widgets
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </ScrollReveal>

      {/* ─── Browse All Rivers ─── */}
      <ScrollReveal className="border-t border-neutral-100 w-full" stagger>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-14 md:py-16">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-lg font-bold text-neutral-900" style={{ fontFamily: 'var(--font-display)' }}>
              All Rivers
            </h2>
            <Link
              href="/rivers"
              className="flex items-center gap-1 text-sm font-medium text-neutral-500 hover:text-neutral-900 transition-colors no-underline"
            >
              Explore
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
          <div className="flex flex-wrap gap-2">
            {rivers.map(river => {
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
        </div>
      </ScrollReveal>

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
