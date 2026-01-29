'use client';

// src/app/page.tsx
// Landing page for Eddy

import { Suspense, useState, useMemo } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { MapPin, Droplets, Clock, Waves, ChevronDown, Timer, ArrowRight } from 'lucide-react';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { useRivers } from '@/hooks/useRivers';
import { useAccessPoints } from '@/hooks/useAccessPoints';
import { useVesselTypes } from '@/hooks/useVesselTypes';
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
        <div className="max-w-5xl mx-auto px-4 space-y-12">
          {/* Float Estimator */}
          <div>
            <h2 className="text-2xl font-heading font-bold text-neutral-900 mb-6">
              Float Estimator
            </h2>
            <FloatEstimator rivers={rivers || []} />
          </div>

          {/* Plan Your Float */}
          <div>
            <h2 className="text-2xl font-heading font-bold text-neutral-900 mb-6">
              Plan Your Float
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

          {/* Check River Levels */}
          <div>
            <h2 className="text-2xl font-heading font-bold text-neutral-900 mb-6">
              Check River Levels
            </h2>
            <Link
              href="/gauges"
              className="group block bg-white border-2 border-neutral-200 rounded-lg p-5 shadow-sm
                         hover:border-primary-400 hover:shadow-md transition-all no-underline"
            >
              <div className="flex items-center gap-4">
                <div className="flex-shrink-0 w-16 h-16 bg-primary-100 rounded-xl flex items-center justify-center">
                  <Waves className="w-8 h-8 text-primary-600" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-bold text-neutral-900 group-hover:text-primary-700 transition-colors">
                    River Levels Dashboard
                  </h3>
                  <p className="text-sm text-neutral-500 mt-1">
                    Real-time USGS gauge data, flow trends, and current conditions for all Missouri rivers
                  </p>
                </div>
                <ArrowRight className="w-5 h-5 text-neutral-400 group-hover:text-primary-600 transition-colors" />
              </div>
            </Link>
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
  const [selectedVessel, setSelectedVessel] = useState<string>('');

  // Fetch access points for selected river
  const { data: accessPoints = [], isLoading: accessPointsLoading } = useAccessPoints(selectedRiverSlug || null);

  // Fetch vessel types
  const { data: vesselTypes = [] } = useVesselTypes();

  // Calculate float distance and time estimate
  const estimate = useMemo(() => {
    if (!selectedPutIn || !selectedTakeOut || !selectedVessel) return null;

    const putIn = accessPoints.find((ap) => ap.id === selectedPutIn);
    const takeOut = accessPoints.find((ap) => ap.id === selectedTakeOut);
    const vessel = vesselTypes.find((v) => v.id === selectedVessel);

    if (!putIn || !takeOut || !vessel) return null;

    const distance = Math.abs(takeOut.riverMile - putIn.riverMile);
    if (distance === 0) return null;

    // Use vessel's normal speed
    const speedMph = vessel.speeds.normal;
    const timeHours = distance / speedMph;

    // Format time
    const hours = Math.floor(timeHours);
    const minutes = Math.round((timeHours - hours) * 60);

    return {
      distance: distance.toFixed(1),
      timeHours: hours,
      timeMinutes: minutes,
      putInName: putIn.name,
      takeOutName: takeOut.name,
      vesselName: vessel.name,
    };
  }, [selectedPutIn, selectedTakeOut, selectedVessel, accessPoints, vesselTypes]);

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

  return (
    <div className="bg-white border-2 border-neutral-200 rounded-lg p-5 shadow-sm">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* River Select */}
        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-1.5">River</label>
          <div className="relative">
            <select
              value={selectedRiverSlug}
              onChange={(e) => handleRiverChange(e.target.value)}
              className="w-full px-3 py-2.5 bg-white border border-neutral-300 rounded-lg text-neutral-900 appearance-none cursor-pointer focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            >
              <option value="">Select river...</option>
              {rivers.map(river => (
                <option key={river.id} value={river.slug}>{river.name}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400 pointer-events-none" />
          </div>
        </div>

        {/* Put-In Select */}
        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-1.5">Put-In</label>
          <div className="relative">
            <select
              value={selectedPutIn}
              onChange={(e) => handlePutInChange(e.target.value)}
              disabled={!selectedRiverSlug || accessPointsLoading}
              className="w-full px-3 py-2.5 bg-white border border-neutral-300 rounded-lg text-neutral-900 appearance-none cursor-pointer focus:ring-2 focus:ring-primary-500 focus:border-primary-500 disabled:bg-neutral-100 disabled:cursor-not-allowed"
            >
              <option value="">{accessPointsLoading ? 'Loading...' : 'Select put-in...'}</option>
              {accessPoints.map(ap => (
                <option key={ap.id} value={ap.id}>
                  {ap.name} (Mile {ap.riverMile.toFixed(1)})
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400 pointer-events-none" />
          </div>
        </div>

        {/* Take-Out Select */}
        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-1.5">Take-Out</label>
          <div className="relative">
            <select
              value={selectedTakeOut}
              onChange={(e) => setSelectedTakeOut(e.target.value)}
              disabled={!selectedPutIn}
              className="w-full px-3 py-2.5 bg-white border border-neutral-300 rounded-lg text-neutral-900 appearance-none cursor-pointer focus:ring-2 focus:ring-primary-500 focus:border-primary-500 disabled:bg-neutral-100 disabled:cursor-not-allowed"
            >
              <option value="">Select take-out...</option>
              {takeOutOptions.map(ap => (
                <option key={ap.id} value={ap.id}>
                  {ap.name} (Mile {ap.riverMile.toFixed(1)})
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400 pointer-events-none" />
          </div>
        </div>

        {/* Vessel Select */}
        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-1.5">Vessel</label>
          <div className="relative">
            <select
              value={selectedVessel}
              onChange={(e) => setSelectedVessel(e.target.value)}
              className="w-full px-3 py-2.5 bg-white border border-neutral-300 rounded-lg text-neutral-900 appearance-none cursor-pointer focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            >
              <option value="">Select vessel...</option>
              {vesselTypes.map(vessel => (
                <option key={vessel.id} value={vessel.id}>{vessel.name}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400 pointer-events-none" />
          </div>
        </div>
      </div>

      {/* Results */}
      {estimate && (
        <div className="mt-5 pt-5 border-t border-neutral-200">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 px-4 py-2 bg-primary-50 rounded-lg">
                <MapPin className="w-4 h-4 text-primary-600" />
                <span className="text-sm font-medium text-primary-900">{estimate.distance} miles</span>
              </div>
              <div className="flex items-center gap-2 px-4 py-2 bg-primary-50 rounded-lg">
                <Timer className="w-4 h-4 text-primary-600" />
                <span className="text-sm font-medium text-primary-900">
                  {estimate.timeHours > 0 && `${estimate.timeHours}h `}{estimate.timeMinutes}m
                </span>
              </div>
            </div>
            <Link
              href={`/rivers/${selectedRiverSlug}?putIn=${selectedPutIn}&takeOut=${selectedTakeOut}&vessel=${selectedVessel}`}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-primary-600 hover:bg-primary-700 text-white font-medium rounded-lg transition-colors"
            >
              Plan This Trip
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
          <p className="mt-3 text-xs text-neutral-500">
            Estimate based on {estimate.vesselName} at optimal conditions. Actual time may vary based on water levels and stops.
          </p>
        </div>
      )}

      {/* Empty state hint */}
      {!estimate && selectedRiverSlug && !accessPointsLoading && (
        <p className="mt-4 text-sm text-neutral-500 text-center">
          Select put-in, take-out, and vessel type to see your float estimate
        </p>
      )}
    </div>
  );
}
