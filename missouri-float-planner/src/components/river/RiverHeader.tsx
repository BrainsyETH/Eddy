'use client';

// src/components/river/RiverHeader.tsx
// River header with at-a-glance navigability status

import { useRouter } from 'next/navigation';
import type { RiverWithDetails, RiverCondition } from '@/types/api';

interface RiverHeaderProps {
  river: RiverWithDetails;
  condition: RiverCondition | null;
}

export default function RiverHeader({ river, condition }: RiverHeaderProps) {
  const router = useRouter();

  // Determine navigability status
  const getNavigabilityStatus = () => {
    if (!condition) return { label: 'Unknown', color: 'bg-neutral-400', icon: '?' };

    switch (condition.code) {
      case 'optimal':
        return { label: 'Navigable', color: 'bg-support-500', icon: '✓' };
      case 'low':
      case 'very_low':
      case 'too_low':
        return { label: 'Low & Draggy', color: 'bg-amber-500', icon: '↓' };
      case 'high':
        return { label: 'High & Fast', color: 'bg-orange-500', icon: '↑' };
      case 'dangerous':
        return { label: 'Dangerous', color: 'bg-red-600', icon: '⚠' };
      default:
        return { label: 'Unknown', color: 'bg-neutral-400', icon: '?' };
    }
  };

  const navigability = getNavigabilityStatus();

  return (
    <div className="bg-gradient-to-br from-primary-900 via-primary-800 to-primary-900 text-white">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Back button */}
        <button
          onClick={() => router.push('/')}
          className="mb-4 text-primary-300 hover:text-white transition-colors flex items-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Home
        </button>

        {/* Header Content */}
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-6">
          {/* Left: River Info */}
          <div className="flex-1">
            <h1 className="text-4xl md:text-5xl font-bold mb-2">{river.name}</h1>
            {river.description && (
              <p className="text-primary-200 text-lg mb-4">{river.description}</p>
            )}

            {/* River Stats */}
            <div className="flex flex-wrap gap-4 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-primary-300">Length:</span>
                <span className="font-semibold">{river.lengthMiles.toFixed(1)} miles</span>
              </div>
              {river.region && (
                <div className="flex items-center gap-2">
                  <span className="text-primary-300">Region:</span>
                  <span className="font-semibold">{river.region}</span>
                </div>
              )}
              {river.difficultyRating && (
                <div className="flex items-center gap-2">
                  <span className="text-primary-300">Difficulty:</span>
                  <span className="font-semibold">{river.difficultyRating}</span>
                </div>
              )}
            </div>
          </div>

          {/* Right: Navigability Status */}
          <div className="flex flex-col items-end gap-4">
            {/* Navigability Badge */}
            <div className={`${navigability.color} rounded-xl px-6 py-3 shadow-lg`}>
              <div className="flex items-center gap-2">
                <span className="text-2xl">{navigability.icon}</span>
                <div>
                  <p className="text-xs uppercase tracking-wide opacity-90">Navigability</p>
                  <p className="text-xl font-bold">{navigability.label}</p>
                </div>
              </div>
            </div>

            {/* Gauge Summary */}
            {condition && (
              <div className="bg-primary-700/50 backdrop-blur-sm rounded-xl px-4 py-3 min-w-[200px]">
                <p className="text-xs text-support-400 mb-1">USGS Gauge</p>
                {condition.gaugeName && (
                  <p className="text-sm font-semibold mb-2">{condition.gaugeName}</p>
                )}
                <div className="space-y-1">
                  {condition.gaugeHeightFt !== null && (
                    <div className="flex justify-between text-sm">
                      <span className="text-primary-300">Stage:</span>
                      <span className="font-semibold">{condition.gaugeHeightFt.toFixed(2)} ft</span>
                    </div>
                  )}
                  {condition.dischargeCfs !== null && (
                    <div className="flex justify-between text-sm">
                      <span className="text-primary-300">Flow:</span>
                      <span className="font-semibold">{condition.dischargeCfs.toLocaleString()} cfs</span>
                    </div>
                  )}
                </div>
                {condition.readingAgeHours !== null && condition.readingAgeHours < 24 && (
                  <p className="text-xs text-support-400 mt-2">
                    Updated {Math.round(condition.readingAgeHours)}h ago
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
