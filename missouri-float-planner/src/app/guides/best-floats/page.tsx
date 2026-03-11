'use client';

// src/app/guides/best-floats/page.tsx
// Best Float Trips guide — curated recommendations by category

import Link from 'next/link';
import { MapPin, Clock, Users, TreePine, Star, ArrowRight, ChevronDown, ChevronUp, Lightbulb } from 'lucide-react';
import { CURATED_TRIPS, TRIP_CATEGORIES } from '@/data/curated-trips';
import type { CuratedTrip, TripCategory } from '@/data/curated-trips';
import { useState } from 'react';

const crowdLabels = {
  low: { label: 'Quiet', icon: TreePine, color: 'text-support-600' },
  moderate: { label: 'Moderate', icon: Users, color: 'text-yellow-600' },
  high: { label: 'Popular', icon: Users, color: 'text-accent-600' },
};

const difficultyColors = {
  easy: 'bg-support-100 text-support-700',
  moderate: 'bg-yellow-100 text-yellow-700',
  intermediate: 'bg-accent-100 text-accent-700',
};

export default function BestFloatsPage() {
  // Group trips by category
  const categories = Object.entries(TRIP_CATEGORIES) as [TripCategory, { label: string; description: string }][];

  return (
    <div className="min-h-screen bg-neutral-50">
      {/* Header */}
      <section className="py-12 md:py-16" style={{ background: 'linear-gradient(to bottom right, #0F2D35, #163F4A, #0F2D35)' }}>
        <div className="max-w-4xl mx-auto px-4 text-center">
          <Star className="w-10 h-10 text-accent-500 mx-auto mb-3" />
          <h1 className="text-3xl md:text-4xl font-bold text-white mb-2" style={{ fontFamily: 'var(--font-display)' }}>
            Best Float Trips in the Ozarks
          </h1>
          <p className="text-lg text-white/80">
            Opinionated picks from local knowledge — find the perfect float for your style
          </p>
        </div>
      </section>

      {/* Quick Nav */}
      <section className="sticky top-14 z-40 bg-white border-b border-neutral-200 shadow-sm">
        <div className="max-w-4xl mx-auto px-4 py-2 overflow-x-auto">
          <div className="flex gap-2 min-w-max">
            {categories.map(([key, cat]) => {
              const count = CURATED_TRIPS.filter(t => t.category === key).length;
              if (count === 0) return null;
              return (
                <a
                  key={key}
                  href={`#${key}`}
                  className="px-3 py-1.5 rounded-full text-xs font-semibold bg-neutral-100 text-neutral-700 hover:bg-primary-50 hover:text-primary-700 transition-colors whitespace-nowrap no-underline"
                >
                  {cat.label} ({count})
                </a>
              );
            })}
          </div>
        </div>
      </section>

      {/* Trip Categories */}
      <section className="max-w-4xl mx-auto px-4 py-8 space-y-12">
        {categories.map(([categoryKey, category]) => {
          const trips = CURATED_TRIPS.filter(t => t.category === categoryKey);
          if (trips.length === 0) return null;

          return (
            <div key={categoryKey} id={categoryKey}>
              <div className="mb-4">
                <h2 className="text-2xl font-bold text-neutral-900">{category.label}</h2>
                <p className="text-sm text-neutral-600">{category.description}</p>
              </div>

              <div className="space-y-4">
                {trips.map((trip) => (
                  <TripCard key={trip.id} trip={trip} />
                ))}
              </div>
            </div>
          );
        })}

        {/* Bottom CTA */}
        <div className="text-center pt-6 pb-4">
          <p className="text-sm text-neutral-500 mb-4">
            Ready to plan? Pick a float above or use the planner to customize your own trip.
          </p>
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-6 py-3 bg-accent-500 hover:bg-accent-600 text-white font-semibold rounded-xl transition-colors no-underline"
          >
            Open Float Planner
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>
    </div>
  );
}

function TripCard({ trip }: { trip: CuratedTrip }) {
  const [expanded, setExpanded] = useState(false);
  const crowd = crowdLabels[trip.crowdLevel];
  const CrowdIcon = crowd.icon;

  return (
    <div className="bg-white rounded-xl border-2 border-neutral-200 overflow-hidden">
      {/* Card header */}
      <div className="p-5">
        <div className="flex items-start justify-between gap-3 mb-2">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-primary-50 text-primary-700">
                {trip.riverName}
              </span>
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${difficultyColors[trip.difficulty]}`}>
                {trip.difficulty}
              </span>
            </div>
            <h3 className="text-lg font-bold text-neutral-900">
              {trip.putInName} &rarr; {trip.takeOutName}
            </h3>
          </div>
          <Link
            href={`/rivers/${trip.riverSlug}`}
            className="shrink-0 px-3 py-1.5 bg-accent-500 hover:bg-accent-600 text-white text-xs font-semibold rounded-lg transition-colors no-underline"
          >
            Plan this float
          </Link>
        </div>

        <p className="text-sm text-neutral-700 mb-3">{trip.tagline}</p>

        {/* Stats */}
        <div className="flex flex-wrap items-center gap-4 text-xs text-neutral-500">
          <span className="flex items-center gap-1">
            <MapPin className="w-3.5 h-3.5" />
            {trip.distanceMiles} miles
          </span>
          <span className="flex items-center gap-1">
            <Clock className="w-3.5 h-3.5" />
            {trip.estimatedHours} hours
          </span>
          <span className={`flex items-center gap-1 ${crowd.color}`}>
            <CrowdIcon className="w-3.5 h-3.5" />
            {crowd.label}
          </span>
          <span className="text-neutral-400">
            {trip.bestMonths}
          </span>
        </div>

        {/* Expand toggle */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-3 flex items-center gap-1 text-xs font-semibold text-primary-600 hover:text-primary-700"
        >
          {expanded ? 'Show less' : 'Read more & tips'}
          {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="px-5 pb-5 pt-0 border-t border-neutral-100 space-y-4">
          <p className="text-sm text-neutral-700 leading-relaxed">{trip.description}</p>

          {/* Highlights */}
          {trip.highlights.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-neutral-500 mb-2">What You&apos;ll See</h4>
              <div className="flex flex-wrap gap-2">
                {trip.highlights.map((h) => (
                  <span key={h} className="text-xs px-2 py-1 rounded-full bg-primary-50 text-primary-700">
                    {h}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Insider Tips */}
          {trip.tips.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-neutral-500 mb-2 flex items-center gap-1">
                <Lightbulb className="w-3 h-3" />
                Insider Tips
              </h4>
              <ul className="space-y-1">
                {trip.tips.map((tip, i) => (
                  <li key={i} className="text-sm text-neutral-600 flex items-start gap-2">
                    <span className="text-accent-500 mt-0.5">&bull;</span>
                    {tip}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Best For */}
          {trip.bestFor.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-semibold text-neutral-500">Best for:</span>
              {trip.bestFor.map((b) => (
                <span key={b} className="text-xs px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-600 capitalize">
                  {b}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
