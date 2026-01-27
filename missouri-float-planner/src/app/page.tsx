'use client';

// src/app/page.tsx
// Landing page for Float MO

import { Suspense } from 'react';
import Link from 'next/link';
import { Waves, MapPin, Droplets, Clock } from 'lucide-react';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { useRivers } from '@/hooks/useRivers';
import type { ConditionCode } from '@/types/api';

const conditionColors: Record<ConditionCode, string> = {
  optimal: 'bg-support-500',
  low: 'bg-yellow-500',
  very_low: 'bg-amber-500',
  high: 'bg-orange-500',
  too_low: 'bg-red-500',
  dangerous: 'bg-red-600',
  unknown: 'bg-neutral-400',
};

const conditionLabels: Record<ConditionCode, string> = {
  optimal: 'Optimal',
  low: 'Low',
  very_low: 'Very Low',
  high: 'High',
  too_low: 'Too Low',
  dangerous: 'Dangerous',
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
          <div className="mb-6">
            <div className="w-20 h-20 mx-auto rounded-xl border-4 border-neutral-900 shadow-xl flex items-center justify-center" style={{ backgroundColor: '#F07052' }}>
              <Waves className="w-12 h-12 text-white" />
            </div>
          </div>
          <h1 className="text-4xl md:text-5xl font-heading font-bold text-white mb-4">
            Plan Your Missouri{' '}
            <span style={{ color: '#F07052' }}>Float Trip</span>
          </h1>
          <p className="text-lg text-white/80 max-w-xl mx-auto mb-8">
            Real-time water conditions, access points, and float time estimates
            for the best rivers in the Ozarks.
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

      {/* Rivers grid */}
      <section className="flex-1 py-10 md:py-14">
        <div className="max-w-5xl mx-auto px-4">
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
      </section>

      {/* Footer */}
      <footer className="bg-primary-800 border-t-2 border-neutral-900 px-4 py-3">
        <div className="max-w-5xl mx-auto flex items-center justify-between text-sm text-primary-200">
          <p>Float MO &middot; Water data from USGS</p>
          <p className="hidden md:block">Always check local conditions before floating</p>
        </div>
      </footer>
    </div>
  );
}
