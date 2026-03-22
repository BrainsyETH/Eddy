// src/app/page.tsx
// Landing page for Eddy — redesigned with spacious, modern layout

import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, Shield, Activity, Bell } from 'lucide-react';
import { getRivers } from '@/lib/data/rivers';
import { CONDITION_COLORS } from '@/constants';
import FloatEstimator from './FloatEstimator';
import FeaturedRivers from '@/components/home/FeaturedRivers';
import SiteFooter from '@/components/ui/SiteFooter';

export const revalidate = 300; // ISR every 5 minutes

const EDDY_CANOE = 'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy%20the%20otter%20in%20a%20cool%20canoe.png';
const EDDY_GREEN = 'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy_the_Otter_green.png';

export default async function Home() {
  const rivers = await getRivers();

  return (
    <div className="min-h-[calc(100vh-3.5rem)] flex flex-col bg-white">
      {/* ─── Hero ─── */}
      <section className="relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #0F2D35 0%, #163F4A 40%, #1A4F5C 100%)' }}>
        {/* Topographic wave pattern */}
        <div className="absolute inset-0 opacity-[0.07]">
          <svg className="absolute bottom-0 w-full" viewBox="0 0 1440 320" preserveAspectRatio="none">
            <path fill="white" d="M0,224L48,213.3C96,203,192,181,288,181.3C384,181,480,203,576,218.7C672,235,768,245,864,234.7C960,224,1056,192,1152,181.3C1248,171,1344,181,1392,186.7L1440,192L1440,320L1392,320C1344,320,1248,320,1152,320C1056,320,960,320,864,320C768,320,672,320,576,320C480,320,384,320,288,320C192,320,96,320,48,320L0,320Z" />
          </svg>
          <svg className="absolute bottom-8 w-full" viewBox="0 0 1440 320" preserveAspectRatio="none">
            <path fill="white" d="M0,256L60,240C120,224,240,192,360,186.7C480,181,600,203,720,208C840,213,960,203,1080,186.7C1200,171,1320,149,1380,138.7L1440,128L1440,320L1380,320C1320,320,1200,320,1080,320C960,320,840,320,720,320C600,320,480,320,360,320C240,320,120,320,60,320L0,320Z" />
          </svg>
        </div>

        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-14 md:py-24">
          <div className="flex items-center justify-between gap-8">
            <div className="flex-1 max-w-xl">
              {/* Live badge */}
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 border border-white/20 mb-6">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-xs font-medium text-white/80">Live Flow Updates</span>
              </div>

              <h1
                className="text-4xl md:text-5xl lg:text-6xl font-bold text-white leading-[1.1] mb-4"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                Navigate the{' '}
                <br className="hidden sm:block" />
                <span style={{ color: '#F07052' }}>Current.</span>
              </h1>
              <p className="text-base md:text-lg text-white/60 max-w-lg mb-8 leading-relaxed">
                Real-time USGS gauge data, river analysis, and trip insights for paddlers, tubers, and float enthusiasts.
              </p>

              <div className="flex flex-wrap gap-3">
                <Link
                  href="/rivers"
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-lg text-sm font-semibold transition-all no-underline"
                  style={{ backgroundColor: '#163F4A', color: 'white', border: '2px solid #2D7889' }}
                >
                  Explore Rivers
                </Link>
                <Link
                  href="/map"
                  className="inline-flex items-center gap-2 px-6 py-3 bg-white rounded-lg text-sm font-semibold text-neutral-900 hover:bg-neutral-50 transition-all no-underline"
                >
                  View Live Map
                </Link>
              </div>
            </div>

            {/* Otter mascot */}
            <div className="hidden md:block flex-shrink-0">
              <Image
                src={EDDY_CANOE}
                alt="Eddy the Otter"
                width={320}
                height={320}
                className="w-52 lg:w-64 h-auto drop-shadow-[0_8px_32px_rgba(240,112,82,0.25)]"
                priority
              />
            </div>
          </div>
        </div>
      </section>

      {/* ─── Live Gauge Data ─── */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-14 md:py-20">
        <div className="flex items-end justify-between mb-2">
          <div>
            <h2 className="text-2xl md:text-3xl font-bold text-neutral-900" style={{ fontFamily: 'var(--font-display)' }}>
              Live Gauge Data
            </h2>
            <p className="text-sm text-neutral-500 mt-1">
              Real-time readings from {rivers.length} monitoring stations across Missouri.
            </p>
          </div>
          <Link
            href="/gauges"
            className="hidden sm:flex items-center gap-1.5 text-sm font-medium text-neutral-600 hover:text-neutral-900 transition-colors no-underline"
          >
            View All Gauges
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
        <div className="w-16 h-0.5 bg-neutral-200 mb-8" />

        {/* Featured Rivers (client component with live data) */}
        <FeaturedRivers />

        {/* Explore Gauges CTA */}
        <div className="rounded-2xl overflow-hidden mt-10" style={{ background: 'linear-gradient(135deg, #0F2D35 0%, #1A4F5C 100%)' }}>
          <div className="px-6 py-8 md:px-8 md:py-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div>
              <h3 className="text-xl font-bold text-white mb-1" style={{ fontFamily: 'var(--font-display)' }}>
                Explore Gauges Nearby
              </h3>
              <p className="text-sm text-white/60 max-w-md">
                Check real-time flow data for any river across Missouri to find the best conditions.
              </p>
            </div>
            <Link
              href="/map"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-white rounded-lg text-sm font-semibold text-neutral-900 hover:bg-neutral-100 transition-colors no-underline flex-shrink-0"
            >
              View Interactive Map
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* ─── Expert Analysis ─── */}
      <section className="bg-neutral-50 border-t border-neutral-100">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-14 md:py-20">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12 items-center">
            {/* Eddy's Analysis Card */}
            <div className="bg-white rounded-2xl border border-neutral-200 p-6 md:p-8 shadow-sm">
              <div className="flex items-center gap-3 mb-5">
                <Image
                  src={EDDY_GREEN}
                  alt="Eddy the Otter"
                  width={48}
                  height={48}
                  className="w-12 h-12"
                />
                <div>
                  <p className="text-sm font-bold text-neutral-900">Eddy&apos;s Analysis</p>
                  <p className="text-xs text-neutral-500">AI-powered river insights</p>
                </div>
              </div>
              <blockquote className="text-sm text-neutral-700 leading-relaxed mb-5 italic">
                &ldquo;Several rivers are running above normal this week. Keep an eye on the gauge readings and plan accordingly — optimal windows can shift quickly.&rdquo;
              </blockquote>
              <div className="flex items-center gap-4 text-xs text-neutral-500">
                <span className="tabular-nums">Updated hourly</span>
              </div>
            </div>

            {/* Feature highlights */}
            <div>
              <h2 className="text-2xl md:text-3xl font-bold text-neutral-900 mb-2 leading-tight" style={{ fontFamily: 'var(--font-display)' }}>
                Expert Analysis.<br />
                Friendly Delivery.
              </h2>
              <p className="text-sm text-neutral-500 mb-8 max-w-md leading-relaxed">
                Eddy isn&apos;t just a mascot. He&apos;s an integrated AI guide that processes thousands of USGS data points and community reports to give you the most accurate safety briefing available.
              </p>
              <div className="space-y-5">
                <div className="flex items-start gap-3.5">
                  <div className="w-9 h-9 rounded-lg bg-red-50 flex items-center justify-center flex-shrink-0">
                    <Shield className="w-4.5 h-4.5 text-red-500" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-neutral-900">Hazard Detection</p>
                    <p className="text-xs text-neutral-500 mt-0.5">Real-time conditions matched to threshold data for risk alerts.</p>
                  </div>
                </div>
                <div className="flex items-start gap-3.5">
                  <div className="w-9 h-9 rounded-lg bg-emerald-50 flex items-center justify-center flex-shrink-0">
                    <Activity className="w-4.5 h-4.5 text-emerald-500" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-neutral-900">Real-time Conditions</p>
                    <p className="text-xs text-neutral-500 mt-0.5">Live USGS data cross-referenced for accurate float-or-wait calls.</p>
                  </div>
                </div>
                <div className="flex items-start gap-3.5">
                  <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                    <Bell className="w-4.5 h-4.5 text-blue-500" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-neutral-900">Optimal Window Alerts</p>
                    <p className="text-xs text-neutral-500 mt-0.5">Notifications when a river hits your preferred conditions.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Plan Your Float ─── */}
      <section className="border-t border-neutral-100">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-14 md:py-20">
          <div className="max-w-2xl mx-auto">
            <FloatEstimator rivers={rivers} />
          </div>
        </div>
      </section>

      {/* ─── Stay Ahead CTA ─── */}
      <section className="bg-neutral-50 border-t border-neutral-100">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-14 md:py-20 text-center">
          <h2 className="text-2xl md:text-3xl font-bold text-neutral-900 mb-2" style={{ fontFamily: 'var(--font-display)' }}>
            Stay ahead of the surge.
          </h2>
          <p className="text-sm text-neutral-500 max-w-md mx-auto mb-8 leading-relaxed">
            Get weekly flow predictions, safety analysis, and the best float trip ideas delivered to your inbox every Thursday.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 max-w-md mx-auto">
            <input
              type="email"
              placeholder="Enter your email"
              className="w-full sm:flex-1 px-4 py-3 bg-white border border-neutral-200 rounded-xl text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors"
            />
            <button className="w-full sm:w-auto px-6 py-3 bg-accent-500 hover:bg-accent-600 text-white font-semibold rounded-xl transition-colors text-sm">
              Subscribe
            </button>
          </div>
          <p className="text-[11px] text-neutral-400 mt-3">
            No spam. Unsubscribe anytime.
          </p>
        </div>
      </section>

      {/* ─── Browse All Rivers ─── */}
      <section className="border-t border-neutral-100">
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
