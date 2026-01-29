'use client';

// src/app/page.tsx
// Landing page for Eddy

import { Suspense, useState, useMemo } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { MapPin, Droplets, Clock, Waves, ChevronDown, ArrowRight } from 'lucide-react';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { useRivers } from '@/hooks/useRivers';
import { useAccessPoints } from '@/hooks/useAccessPoints';
import type { ConditionCode } from '@/types/api';

// Matches GaugeOverview labels and colors
const conditionColors: Record<ConditionCode, string> = {
  optimal: 'bg-emerald-500',
  low: 'bg-lime-500',
  very_low: 'bg-yellow-500',
  high: 'bg-orange-500',
  too_low: 'bg-neutral-400',
  dangerous: 'bg-red-600',
  unknown: 'bg-neutral-400',
};

const conditionLabels: Record<ConditionCode, string> = {
  optimal: 'Optimal',
  low: 'Okay',
  very_low: 'Low',
  high: 'High',
  too_low: 'Too Low',
  dangerous: 'Flood',
  unknown: 'Unknown',
};

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

function HomeContent() {
  const { data: rivers, isLoading, error } = useRivers();

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
                <div className="flex-shrink-0 w-12 h-12 md:w-14 md:h-14 bg-white/10 rounded-xl flex items-center justify-center">
                  <Waves className="w-7 h-7 text-primary-300" />
                </div>
                <h2 className="text-xl lg:text-2xl font-bold text-white">Check River Levels</h2>
              </div>
              <p className="text-sm text-primary-200 mb-4 flex-1">
                Real-time USGS gauge data, flow trends, and current conditions for Ozark rivers.
              </p>
              <div className="flex items-center justify-between pt-4 border-t border-white/10">
                <span className="text-sm font-medium text-primary-300">View Dashboard</span>
                <ArrowRight className="w-5 h-5 text-primary-300 group-hover:translate-x-1 transition-transform" />
              </div>
            </Link>
          </div>

          {/* Rivers Section - Full width below */}
          <div>
            <h2 className="text-2xl font-heading font-bold text-neutral-900 mb-6">
              Choose a River
            </h2>

            {isLoading && (
              <div className="flex justify-center py-12">
                <LoadingSpinner size="lg" />
              </div>
            )}

            {error && (
              <div className="text-center py-12">
                <p className="text-neutral-600 mb-4">Unable to load rivers. Please try again.</p>
                <button onClick={() => window.location.reload()} className="btn-primary">
                  Retry
                </button>
              </div>
            )}

            {rivers && (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {rivers.map((river) => (
                  <Link
                    key={river.id}
                    href={`/rivers/${river.slug}`}
                    className="group block bg-white border-2 border-neutral-200 rounded-lg p-5 shadow-sm
                               hover:border-primary-400 hover:shadow-md transition-all no-underline"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <h3 className="text-lg font-bold text-neutral-900 group-hover:text-primary-700 transition-colors">
                        {river.name}
                      </h3>
                      {river.currentCondition && (
                        <span className={`flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-full ${
                          river.currentCondition.code === 'optimal'
                            ? 'bg-support-100 text-support-700'
                            : river.currentCondition.code === 'unknown'
                            ? 'bg-neutral-100 text-neutral-600'
                            : river.currentCondition.code === 'dangerous' || river.currentCondition.code === 'too_low'
                            ? 'bg-red-50 text-red-700'
                            : 'bg-yellow-50 text-yellow-700'
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${conditionColors[river.currentCondition.code]}`} />
                          {conditionLabels[river.currentCondition.code]}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-neutral-500">
                      <span>{river.lengthMiles.toFixed(1)} miles</span>
                      {river.region && <span>{river.region}</span>}
                      {river.difficultyRating && <span>{river.difficultyRating}</span>}
                    </div>
                    <div className="mt-3 text-sm font-medium text-primary-600 group-hover:text-primary-700">
                      View river &rarr;
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-primary-800 border-t-2 border-neutral-900 px-4 py-3">
        <div className="max-w-5xl mx-auto flex items-center justify-between text-sm text-primary-200">
          <p>Eddy &middot; Water data from USGS</p>
          <p className="hidden md:block">Always check local conditions before floating</p>
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
              className="w-full px-3 py-2.5 bg-white/10 border border-white/20 rounded-lg text-white appearance-none cursor-pointer focus:ring-2 focus:ring-primary-400 focus:border-primary-400 backdrop-blur-sm"
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
                className="w-full px-3 py-2.5 bg-white/10 border border-white/20 rounded-lg text-white appearance-none cursor-pointer focus:ring-2 focus:ring-primary-400 focus:border-primary-400 backdrop-blur-sm disabled:opacity-50 disabled:cursor-not-allowed text-sm"
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
                className="w-full px-3 py-2.5 bg-white/10 border border-white/20 rounded-lg text-white appearance-none cursor-pointer focus:ring-2 focus:ring-primary-400 focus:border-primary-400 backdrop-blur-sm disabled:opacity-50 disabled:cursor-not-allowed text-sm"
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
