'use client';

// src/app/page.tsx
// Landing page for Eddy

import { Suspense, useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { MapPin, Clock, ChevronDown, ArrowRight, Activity } from 'lucide-react';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { useRivers } from '@/hooks/useRivers';
import { useGaugeStations } from '@/hooks/useGaugeStations';
import { useAccessPoints } from '@/hooks/useAccessPoints';
import { computeCondition, getConditionShortLabel } from '@/lib/conditions';
import { CONDITION_COLORS } from '@/constants';
import { buildRiversSummary } from '@/data/eddy-quotes';
import type { EddyUpdateResponse } from '@/app/api/eddy-update/[riverSlug]/route';
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

// Target rivers for the homepage conditions display
const TARGET_RIVER_SLUGS = ['current', 'jacks-fork', 'eleven-point'];

interface RiverConditionRow {
  name: string;
  slug: string;
  conditionCode: ConditionCode;
  conditionLabel: string;
  gaugeHeightFt: number | null;
  dischargeCfs: number | null;
}

function HomeContent() {
  const { data: rivers } = useRivers();
  const { data: gauges } = useGaugeStations();

  // Fetch global Eddy quote (AI-generated, refreshed every 6 hours)
  const [globalQuote, setGlobalQuote] = useState<string | null>(null);
  const [globalQuoteAge, setGlobalQuoteAge] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function fetchGlobalQuote() {
      try {
        const res = await fetch('/api/eddy-update/global');
        if (!res.ok) return;
        const data: EddyUpdateResponse = await res.json();
        if (!cancelled && data.available && data.update) {
          setGlobalQuote(data.update.quoteText);
          const hours = (Date.now() - new Date(data.update.generatedAt).getTime()) / (1000 * 60 * 60);
          if (hours < 1) setGlobalQuoteAge('Updated just now');
          else if (hours < 2) setGlobalQuoteAge('Updated 1 hr ago');
          else setGlobalQuoteAge(`Updated ${Math.round(hours)} hrs ago`);
        }
      } catch {
        // Silently fail — static fallback will be used
      }
    }
    fetchGlobalQuote();
    return () => { cancelled = true; };
  }, []);

  // Static fallback: build summary from loaded river conditions
  const fallbackSummary = useMemo(() => {
    if (!rivers) return null;
    const codes = rivers.map(r => (r.currentCondition?.code ?? null) as ConditionCode | null);
    return buildRiversSummary(codes);
  }, [rivers]);

  const eddySummaryText = globalQuote || fallbackSummary;

  // Compute per-river conditions from gauge data
  const riverConditions = useMemo((): RiverConditionRow[] => {
    if (!rivers || !gauges) return [];

    const targetRivers = rivers.filter(r => TARGET_RIVER_SLUGS.includes(r.slug));

    return targetRivers.map(river => {
      // Find the primary gauge for this river
      const primaryGauge = gauges.find(g =>
        g.thresholds?.some(t => t.riverId === river.id && t.isPrimary)
      );

      if (!primaryGauge) {
        return {
          name: river.name,
          slug: river.slug,
          conditionCode: (river.currentCondition?.code ?? 'unknown') as ConditionCode,
          conditionLabel: getConditionShortLabel((river.currentCondition?.code ?? 'unknown') as ConditionCode),
          gaugeHeightFt: null,
          dischargeCfs: null,
        };
      }

      const threshold = primaryGauge.thresholds?.find(t => t.riverId === river.id && t.isPrimary);
      if (!threshold) {
        return {
          name: river.name,
          slug: river.slug,
          conditionCode: 'unknown' as ConditionCode,
          conditionLabel: 'Unknown',
          gaugeHeightFt: primaryGauge.gaugeHeightFt,
          dischargeCfs: primaryGauge.dischargeCfs,
        };
      }

      const condition = computeCondition(primaryGauge.gaugeHeightFt, threshold, primaryGauge.dischargeCfs);

      return {
        name: river.name,
        slug: river.slug,
        conditionCode: condition.code,
        conditionLabel: getConditionShortLabel(condition.code),
        gaugeHeightFt: primaryGauge.gaugeHeightFt,
        dischargeCfs: primaryGauge.dischargeCfs,
      };
    });
  }, [rivers, gauges]);

  return (
    <div className="min-h-[calc(100vh-3.5rem)] flex flex-col bg-neutral-50">
      {/* Hero */}
      <section className="relative py-16 md:py-24 text-white" style={{ background: 'linear-gradient(to bottom right, #0F2D35, #163F4A, #0F2D35)' }}>
        <div className="max-w-5xl mx-auto px-4 text-center">
          {/* Title */}
          <h1 className="text-5xl md:text-6xl font-bold text-white mb-1" style={{ fontFamily: 'var(--font-display)', color: '#F07052' }}>
            Eddy
          </h1>
          <p className="text-xl md:text-2xl text-white/90 font-medium mb-6">
            Your Ozark Float Trip Companion
          </p>

          {/* Eddy image + speech bubble */}
          <div className="flex flex-col md:flex-row items-center justify-center gap-0 md:gap-0">
            {/* Eddy image */}
            <div className="flex-shrink-0">
              <Image
                src="https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy_the_Otter.png"
                alt="Eddy the Otter"
                width={200}
                height={200}
                className="h-40 md:h-52 w-auto drop-shadow-[0_4px_24px_rgba(240,112,82,0.3)]"
                priority
              />
            </div>

            {/* Speech bubble with tail */}
            {eddySummaryText && (
              <div className="relative max-w-md text-left">
                {/* Tail pointing up on mobile */}
                <div
                  className="md:hidden mx-auto w-0 h-0"
                  style={{
                    borderLeft: '10px solid transparent',
                    borderRight: '10px solid transparent',
                    borderBottom: '10px solid rgba(29, 82, 95, 0.8)',
                  }}
                />
                {/* Tail pointing left on desktop */}
                <div
                  className="hidden md:block absolute top-1/2 -left-2.5 -translate-y-1/2 w-0 h-0"
                  style={{
                    borderTop: '10px solid transparent',
                    borderBottom: '10px solid transparent',
                    borderRight: '10px solid rgba(29, 82, 95, 0.8)',
                  }}
                />
                <div className="rounded-xl px-5 py-4" style={{ backgroundColor: 'rgba(29, 82, 95, 0.8)' }}>
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-xs font-bold tracking-wide uppercase text-white/50">Eddy&apos;s Report</span>
                    {globalQuoteAge && (
                      <span className="text-[10px] text-white/30 ml-auto">{globalQuoteAge}</span>
                    )}
                  </div>
                  <p className="text-sm md:text-base text-white/90 leading-relaxed font-medium">
                    &ldquo;{eddySummaryText}&rdquo;
                  </p>
                  <Link
                    href="/gauges"
                    className="inline-flex items-center gap-1.5 mt-3 px-4 py-2 rounded-lg text-sm font-semibold text-white no-underline transition-colors"
                    style={{ backgroundColor: '#F07052' }}
                  >
                    Check Conditions
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                </div>
              </div>
            )}
          </div>

          {/* Feature pills */}
          <div className="flex flex-wrap justify-center gap-3 mt-8">
            <div className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm text-white font-medium" style={{ backgroundColor: '#1D525F' }}>
              <Clock className="w-4 h-4" />
              <span>Float Time Estimates</span>
            </div>
            <div className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm text-white font-medium" style={{ backgroundColor: '#1D525F' }}>
              <Activity className="w-4 h-4" />
              <span>Accurate River Conditions</span>
            </div>
            <div className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm text-white font-medium" style={{ backgroundColor: '#1D525F' }}>
              <MapPin className="w-4 h-4" />
              <span>Detailed Access Points</span>
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
            <div className="flex flex-col glass-card-dark rounded-2xl p-5 lg:p-6 border border-white/10">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <Image
                    src={EDDY_FLOOD_IMAGE}
                    alt="Eddy the Otter checking water levels"
                    width={120}
                    height={120}
                    className="w-12 h-12 md:w-14 md:h-14 object-contain"
                  />
                  <h2 className="text-xl lg:text-2xl font-bold text-white">River Conditions</h2>
                </div>
              </div>

              {/* Per-River Condition Rows */}
              <div className="space-y-2 mb-4 flex-1">
                {riverConditions.length > 0 ? (
                  riverConditions.map((rc) => (
                    <Link
                      key={rc.slug}
                      href={`/rivers/${rc.slug}`}
                      className="flex items-center justify-between bg-white/10 hover:bg-white/15 rounded-lg px-3 py-2.5 transition-colors no-underline"
                    >
                      <div className="flex items-center gap-2.5">
                        <div
                          className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                          style={{ backgroundColor: CONDITION_COLORS[rc.conditionCode] || CONDITION_COLORS.unknown }}
                        />
                        <span className="text-sm font-medium text-white">{rc.name}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span
                          className="px-2 py-0.5 rounded text-xs font-bold"
                          style={{
                            backgroundColor: `${CONDITION_COLORS[rc.conditionCode] || CONDITION_COLORS.unknown}20`,
                            color: CONDITION_COLORS[rc.conditionCode] || CONDITION_COLORS.unknown,
                          }}
                        >
                          {rc.conditionLabel}
                        </span>
                        <span className="text-sm font-bold text-white/70 tabular-nums w-20 text-right">
                          {rc.gaugeHeightFt !== null ? `${rc.gaugeHeightFt.toFixed(1)} ft` : '--'}
                        </span>
                      </div>
                    </Link>
                  ))
                ) : (
                  [1, 2, 3].map(i => (
                    <div key={i} className="bg-white/10 rounded-lg px-3 py-2.5 h-10 animate-pulse" />
                  ))
                )}
                <p className="text-[10px] text-white/40 mt-1">Primary gauge &middot; USGS data</p>
              </div>

              <Link
                href="/gauges"
                className="group flex items-center justify-between pt-4 border-t border-white/10 no-underline"
              >
                <span className="text-sm font-medium text-primary-300">View Full Dashboard</span>
                <ArrowRight className="w-5 h-5 text-primary-300 group-hover:translate-x-1 transition-transform" />
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
              <Link href="/about" className="hover:text-white transition-colors">About</Link>
              <Link href="/embed" className="hover:text-white transition-colors">Embed Widgets</Link>
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
