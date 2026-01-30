'use client';

// src/app/page.tsx
// Landing page for Eddy

import { Suspense, useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { MapPin, Droplets, Clock, ChevronDown, ArrowRight, BookOpen } from 'lucide-react';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { useRivers } from '@/hooks/useRivers';
import { useAccessPoints } from '@/hooks/useAccessPoints';
import type { ConditionCode } from '@/types/api';

const EDDY_FLOOD_IMAGE = 'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy_the_Otter_flood.png';

function HomeLoading() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center bg-neutral-50">
      <div className="text-center">
        <LoadingSpinner size="lg" />
        <p className="mt-4 text-neutral-600">Loading...</p>
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <Suspense fallback={<HomeLoading />}>
      <HomeContent />
    </Suspense>
  );
}

// Gauge condition stats type
interface GaugeStats {
  tooLow: number;
  low: number;
  okay: number;
  optimal: number;
  high: number;
  flood: number;
}

function HomeContent() {
  const { data: rivers } = useRivers();
  const [gaugeStats, setGaugeStats] = useState<GaugeStats | null>(null);

  // Fetch gauge stats for the River Levels card
  useEffect(() => {
    async function fetchGaugeStats() {
      try {
        const response = await fetch('/api/gauges');
        if (response.ok) {
          const data = await response.json();
          // Calculate stats from gauges
          const stats: GaugeStats = { tooLow: 0, low: 0, okay: 0, optimal: 0, high: 0, flood: 0 };
          data.gauges?.forEach((gauge: { gaugeHeightFt: number | null; thresholds?: Array<{ isPrimary?: boolean; levelTooLow: number | null; levelLow: number | null; levelOptimalMin: number | null; levelOptimalMax: number | null; levelHigh: number | null; levelDangerous: number | null }> }) => {
            const threshold = gauge.thresholds?.find(t => t.isPrimary) || gauge.thresholds?.[0];
            if (!threshold || gauge.gaugeHeightFt === null) return;

            const h = gauge.gaugeHeightFt;
            if (threshold.levelDangerous !== null && h >= threshold.levelDangerous) {
              stats.flood++;
            } else if (threshold.levelHigh !== null && h >= threshold.levelHigh) {
              stats.high++;
            } else if (threshold.levelOptimalMin !== null && threshold.levelOptimalMax !== null && h >= threshold.levelOptimalMin && h <= threshold.levelOptimalMax) {
              stats.optimal++;
            } else if (threshold.levelLow !== null && h >= threshold.levelLow) {
              stats.okay++;
            } else if (threshold.levelTooLow !== null && h >= threshold.levelTooLow) {
              stats.low++;
            } else {
              stats.tooLow++;
            }
          });
          setGaugeStats(stats);
        }
      } catch (error) {
        console.error('Failed to fetch gauge stats:', error);
      }
    }
    fetchGaugeStats();
  }, []);

  return (
    <div className="min-h-[calc(100vh-3.5rem)] flex flex-col bg-neutral-50">
      {/* Hero */}
      <section className="relative py-16 md:py-24 text-white" style={{ background: 'linear-gradient(to bottom right, #0F2D35, #163F4A, #0F2D35)' }}>
        <div className="max-w-5xl mx-auto px-4 text-center">
          <div className="mb-2">
            <Image
              src="https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy_the_Otter.png"
              alt="Eddy the Otter"
              width={200}
              height={200}
              className="mx-auto h-52 md:h-64 w-auto drop-shadow-[0_4px_24px_rgba(240,112,82,0.3)]"
              priority
            />
          </div>
          <h1 className="text-5xl md:text-6xl font-bold text-white mb-1" style={{ fontFamily: 'var(--font-display)', color: '#F07052' }}>
            Eddy
          </h1>
          <p className="text-xl md:text-2xl text-white/90 font-medium mb-8">
            Your Ozark Float Trip Companion
          </p>

          {/* Feature pills */}
          <div className="flex flex-wrap justify-center gap-3">
            <div className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm text-white font-medium" style={{ backgroundColor: '#1D525F' }}>
              <MapPin className="w-4 h-4" />
              <span>30+ Access Points</span>
            </div>
            <div className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm text-white font-medium" style={{ backgroundColor: '#1D525F' }}>
              <Droplets className="w-4 h-4" />
              <span>Live USGS Gauges</span>
            </div>
            <div className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm text-white font-medium" style={{ backgroundColor: '#1D525F' }}>
              <Clock className="w-4 h-4" />
              <span>Float Time Estimates</span>
            </div>
          </div>
        </div>
      </section>

      {/* Main content */}
      <section className="flex-1 py-10 md:py-14">
        <div className="max-w-5xl mx-auto px-4 space-y-10">
          {/* Top Row: Float Estimator + Check River Levels side by side */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Float Estimator - Half width */}
            <FloatEstimator rivers={rivers || []} />

            {/* Check River Levels - Half width */}
            <Link
              href="/gauges"
              className="group flex flex-col glass-card-dark rounded-2xl p-5 lg:p-6 border border-white/10
                         hover:border-primary-400/50 transition-all no-underline"
            >
              <div className="flex items-center gap-3 mb-4">
                <Image
                  src={EDDY_FLOOD_IMAGE}
                  alt="Eddy the Otter checking water levels"
                  width={120}
                  height={120}
                  className="w-12 h-12 md:w-14 md:h-14 object-contain"
                />
                <h2 className="text-xl lg:text-2xl font-bold text-white">Check River Levels</h2>
              </div>

              {/* Condition Stats Grid */}
              <div className="grid grid-cols-3 gap-2 mb-4 flex-1">
                <div className="bg-white rounded-lg p-2.5 flex flex-col items-center justify-center">
                  <span className="text-xl font-bold text-neutral-500">{gaugeStats?.tooLow ?? '-'}</span>
                  <span className="text-[11px] font-semibold text-neutral-400">Too Low</span>
                </div>
                <div className="bg-white rounded-lg p-2.5 flex flex-col items-center justify-center">
                  <span className="text-xl font-bold text-yellow-500">{gaugeStats?.low ?? '-'}</span>
                  <span className="text-[11px] font-semibold text-yellow-500/80">Low</span>
                </div>
                <div className="bg-white rounded-lg p-2.5 flex flex-col items-center justify-center">
                  <span className="text-xl font-bold text-lime-500">{gaugeStats?.okay ?? '-'}</span>
                  <span className="text-[11px] font-semibold text-lime-500/80">Okay</span>
                </div>
                <div className="bg-white rounded-lg p-2.5 flex flex-col items-center justify-center">
                  <span className="text-xl font-bold text-emerald-500">{gaugeStats?.optimal ?? '-'}</span>
                  <span className="text-[11px] font-semibold text-emerald-500/80">Optimal</span>
                </div>
                <div className="bg-white rounded-lg p-2.5 flex flex-col items-center justify-center">
                  <span className="text-xl font-bold text-orange-500">{gaugeStats?.high ?? '-'}</span>
                  <span className="text-[11px] font-semibold text-orange-500/80">High</span>
                </div>
                <div className="bg-white rounded-lg p-2.5 flex flex-col items-center justify-center">
                  <span className="text-xl font-bold text-red-500">{gaugeStats?.flood ?? '-'}</span>
                  <span className="text-[11px] font-semibold text-red-500/80">Flood</span>
                </div>
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-white/10">
                <span className="text-sm font-medium text-primary-300">View Dashboard</span>
                <ArrowRight className="w-5 h-5 text-primary-300 group-hover:translate-x-1 transition-transform" />
              </div>
            </Link>
          </div>

          {/* Float Trip Guides Section */}
          <div>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-heading font-bold text-neutral-900">
                Float Trip Guides
              </h2>
              <Link
                href="/blog"
                className="text-sm font-medium text-primary-600 hover:text-primary-700 flex items-center gap-1"
              >
                View all guides
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {/* Featured Blog Post */}
              <Link
                href="/blog/best-float-rivers-missouri-2026"
                className="group block bg-white border-2 border-neutral-200 rounded-xl p-6 shadow-sm
                           hover:border-primary-400 hover:shadow-md transition-all no-underline"
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className="p-2 rounded-lg bg-primary-100">
                    <BookOpen className="w-5 h-5 text-primary-600" />
                  </div>
                  <span className="px-3 py-1 rounded-full text-xs font-semibold bg-primary-100 text-primary-700">
                    Guide
                  </span>
                  <span className="text-xs text-neutral-500">12 min read</span>
                </div>

                <h3 className="text-lg font-bold text-neutral-900 mb-2 group-hover:text-primary-700 transition-colors">
                  Best Float Rivers in Missouri: Complete Guide 2026
                </h3>

                <p className="text-sm text-neutral-600 mb-4">
                  Discover the top 8 float rivers in Missouri, from beginner-friendly creeks to scenic Ozark waterways. Compare difficulty, scenery, and access points.
                </p>

                <div className="flex items-center gap-1 text-sm font-medium text-primary-600 group-hover:text-primary-700">
                  Read guide
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </div>
              </Link>

              {/* More Guides CTA */}
              <Link
                href="/blog"
                className="group flex flex-col items-center justify-center bg-gradient-to-br from-primary-50 to-primary-100 border-2 border-primary-200 rounded-xl p-6
                           hover:border-primary-400 hover:shadow-md transition-all no-underline min-h-[200px]"
              >
                <div className="p-3 rounded-full bg-primary-200 mb-4">
                  <BookOpen className="w-8 h-8 text-primary-600" />
                </div>
                <h3 className="text-lg font-bold text-primary-800 mb-2">
                  Explore All Guides
                </h3>
                <p className="text-sm text-primary-600 text-center mb-4">
                  Tips, tricks, and everything you need for your next float trip
                </p>
                <span className="flex items-center gap-1 text-sm font-semibold text-primary-700 group-hover:gap-2 transition-all">
                  Browse guides
                  <ArrowRight className="w-4 h-4" />
                </span>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-primary-800 border-t-2 border-neutral-900 px-4 py-6">
        <div className="max-w-5xl mx-auto">
          {/* Safety Disclaimer */}
          <div className="mb-4 p-4 bg-primary-700/50 rounded-lg border border-primary-600/30">
            <p className="text-sm text-primary-100 text-center">
              <strong className="text-white">Safety First:</strong> Eddy is a planning guide only. Always consult local outfitters and authorities for current conditions before floating. Water levels can change rapidly. Wear life jackets and never float alone.
            </p>
          </div>

          {/* Footer Links */}
          <div className="flex flex-col md:flex-row items-center justify-between gap-3 text-sm text-primary-200">
            <div className="flex items-center gap-4">
              <p>Eddy &middot; Water data from USGS</p>
              <Link href="/privacy" className="hover:text-white transition-colors">Privacy Policy</Link>
            </div>
            <p className="text-center md:text-right text-primary-300">
              &copy; {new Date().getFullYear()} eddy.guide &middot; For informational purposes only
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}

// Float Estimator Component
const EDDY_CANOE_IMAGE = 'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy%20the%20otter%20in%20a%20cool%20canoe.png';

interface FloatEstimatorProps {
  rivers: Array<{
    id: string;
    name: string;
    slug: string;
    lengthMiles: number;
    currentCondition?: { code: ConditionCode } | null;
  }>;
}

function FloatEstimator({ rivers }: FloatEstimatorProps) {
  const [selectedRiverSlug, setSelectedRiverSlug] = useState<string>('');
  const [selectedPutIn, setSelectedPutIn] = useState<string>('');
  const [selectedTakeOut, setSelectedTakeOut] = useState<string>('');

  // Fetch access points for selected river
  const { data: accessPoints = [], isLoading: accessPointsLoading } = useAccessPoints(selectedRiverSlug || null);

  // Filter take-out options to only show points downstream of put-in
  const takeOutOptions = useMemo(() => {
    if (!selectedPutIn) return accessPoints;
    const putIn = accessPoints.find((ap) => ap.id === selectedPutIn);
    if (!putIn) return accessPoints;
    return accessPoints.filter((ap) => ap.riverMile > putIn.riverMile);
  }, [selectedPutIn, accessPoints]);

  // Reset selections when river changes
  const handleRiverChange = (slug: string) => {
    setSelectedRiverSlug(slug);
    setSelectedPutIn('');
    setSelectedTakeOut('');
  };

  // Reset take-out when put-in changes
  const handlePutInChange = (id: string) => {
    setSelectedPutIn(id);
    setSelectedTakeOut('');
  };

  // Check if form is complete
  const canSubmit = selectedRiverSlug && selectedPutIn && selectedTakeOut;

  return (
    <div className="glass-card-dark rounded-2xl p-5 lg:p-6 border border-white/10 flex flex-col">
      {/* Header with Eddy */}
      <div className="flex items-center gap-3 mb-4">
        <Image
          src={EDDY_CANOE_IMAGE}
          alt="Eddy the Otter in a canoe"
          width={120}
          height={120}
          className="w-12 h-12 md:w-14 md:h-14 object-contain"
        />
        <h2 className="text-xl lg:text-2xl font-bold text-white">Plan Your Float</h2>
      </div>

      {/* Selectors - Stacked vertically for compact layout */}
      <div className="space-y-3 flex-1">
        {/* River Select */}
        <div>
          <label className="block text-sm font-semibold text-white mb-1.5">River</label>
          <div className="relative">
            <select
              value={selectedRiverSlug}
              onChange={(e) => handleRiverChange(e.target.value)}
              className="w-full px-3 py-2.5 bg-white/25 border border-white/30 rounded-lg text-white appearance-none cursor-pointer focus:ring-2 focus:ring-primary-400 focus:border-primary-400 backdrop-blur-sm"
            >
              <option value="" className="bg-neutral-800">Select river...</option>
              {rivers.map(river => (
                <option key={river.id} value={river.slug} className="bg-neutral-800">{river.name}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/60 pointer-events-none" />
          </div>
        </div>

        {/* Put-In and Take-Out in a row */}
        <div className="grid grid-cols-2 gap-3">
          {/* Put-In Select */}
          <div>
            <label className="block text-sm font-semibold text-white mb-1.5">Put-In</label>
            <div className="relative">
              <select
                value={selectedPutIn}
                onChange={(e) => handlePutInChange(e.target.value)}
                disabled={!selectedRiverSlug || accessPointsLoading}
                className="w-full px-3 py-2.5 bg-white/25 border border-white/30 rounded-lg text-white appearance-none cursor-pointer focus:ring-2 focus:ring-primary-400 focus:border-primary-400 backdrop-blur-sm disabled:opacity-50 disabled:cursor-not-allowed text-sm"
              >
                <option value="" className="bg-neutral-800">{accessPointsLoading ? 'Loading...' : 'Select...'}</option>
                {accessPoints.map(ap => (
                  <option key={ap.id} value={ap.id} className="bg-neutral-800">
                    {ap.name}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/60 pointer-events-none" />
            </div>
          </div>

          {/* Take-Out Select */}
          <div>
            <label className="block text-sm font-semibold text-white mb-1.5">Take-Out</label>
            <div className="relative">
              <select
                value={selectedTakeOut}
                onChange={(e) => setSelectedTakeOut(e.target.value)}
                disabled={!selectedPutIn}
                className="w-full px-3 py-2.5 bg-white/25 border border-white/30 rounded-lg text-white appearance-none cursor-pointer focus:ring-2 focus:ring-primary-400 focus:border-primary-400 backdrop-blur-sm disabled:opacity-50 disabled:cursor-not-allowed text-sm"
              >
                <option value="" className="bg-neutral-800">Select...</option>
                {takeOutOptions.map(ap => (
                  <option key={ap.id} value={ap.id} className="bg-neutral-800">
                    {ap.name}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/60 pointer-events-none" />
            </div>
          </div>
        </div>
      </div>

      {/* Submit Button */}
      <div className="mt-4 pt-4 border-t border-white/10">
        {canSubmit ? (
          <Link
            href={`/rivers/${selectedRiverSlug}?putIn=${selectedPutIn}&takeOut=${selectedTakeOut}`}
            className="flex items-center justify-center gap-2 w-full px-6 py-3 bg-accent-500 hover:bg-accent-600 text-white font-semibold rounded-xl transition-colors shadow-lg"
          >
            View Trip Details
            <ArrowRight className="w-5 h-5" />
          </Link>
        ) : (
          <button
            disabled
            className="flex items-center justify-center gap-2 w-full px-6 py-3 bg-white/10 text-white/50 font-semibold rounded-xl cursor-not-allowed"
          >
            Select all options above
          </button>
        )}
      </div>
    </div>
  );
}
