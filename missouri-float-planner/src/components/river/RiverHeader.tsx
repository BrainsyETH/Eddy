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

  return (
    <div className="text-white" style={{ background: 'linear-gradient(to bottom right, #0F2D35, #163F4A, #0F2D35)' }}>
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Back button */}
        <button
          onClick={() => router.push('/')}
          className="mb-4 hover:text-white transition-colors flex items-center gap-2"
          style={{ color: '#72B5C4' }}
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
            <h1 className="text-4xl md:text-5xl font-bold mb-2 text-white">{river.name}</h1>
            {river.description && (
              <p className="text-lg mb-4" style={{ color: '#A3D1DB' }}>{river.description}</p>
            )}

            {/* River Stats */}
            <div className="flex flex-wrap gap-4 text-sm">
              <div className="flex items-center gap-2">
                <span style={{ color: '#72B5C4' }}>Length:</span>
                <span className="font-semibold text-white">{river.lengthMiles.toFixed(1)} miles</span>
              </div>
              {river.region && (
                <div className="flex items-center gap-2">
                  <span style={{ color: '#72B5C4' }}>Region:</span>
                  <span className="font-semibold text-white">{river.region}</span>
                </div>
              )}
              {river.difficultyRating && (
                <div className="flex items-center gap-2">
                  <span style={{ color: '#72B5C4' }}>Difficulty:</span>
                  <span className="font-semibold text-white">{river.difficultyRating}</span>
                </div>
              )}
            </div>
          </div>

          {/* Right: Gauge Summary */}
          <div className="flex flex-col items-end gap-4">
            {/* Gauge Summary */}
            {condition && (
              <div className="backdrop-blur-sm rounded-xl px-4 py-3 min-w-[200px]" style={{ backgroundColor: 'rgba(29, 82, 95, 0.7)' }}>
                <p className="text-xs mb-1" style={{ color: '#4EB86B' }}>USGS Gauge</p>
                {condition.gaugeName && (
                  <p className="text-sm font-semibold mb-2 text-white">{condition.gaugeName}</p>
                )}
                <div className="space-y-1">
                  {condition.gaugeHeightFt !== null && (
                    <div className="flex justify-between text-sm">
                      <span style={{ color: '#72B5C4' }}>Stage:</span>
                      <span className="font-semibold text-white">{condition.gaugeHeightFt.toFixed(2)} ft</span>
                    </div>
                  )}
                  {condition.dischargeCfs !== null && (
                    <div className="flex justify-between text-sm">
                      <span style={{ color: '#72B5C4' }}>Flow:</span>
                      <span className="font-semibold text-white">{condition.dischargeCfs.toLocaleString()} cfs</span>
                    </div>
                  )}
                </div>
                {condition.readingAgeHours !== null && condition.readingAgeHours < 24 && (
                  <p className="text-xs mt-2" style={{ color: '#4EB86B' }}>
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
