'use client';

// src/components/river/LogisticsSection.tsx
// Logistics information for access points - sorted by mile marker

import { useState } from 'react';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import type { AccessPoint } from '@/types/api';

interface LogisticsSectionProps {
  accessPoints: AccessPoint[];
  isLoading: boolean;
}

export default function LogisticsSection({ accessPoints, isLoading }: LogisticsSectionProps) {
  const [expandedPoint, setExpandedPoint] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="bg-white border-2 border-neutral-200 rounded-lg p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <LoadingSpinner size="sm" />
          <p className="text-sm text-neutral-500">Loading logistics...</p>
        </div>
      </div>
    );
  }

  // Sort access points by mile marker (upstream to downstream)
  const sortedPoints = [...accessPoints].sort((a, b) => a.riverMile - b.riverMile);

  return (
    <div className="bg-white border-2 border-neutral-200 rounded-lg p-6 shadow-sm">
      <h3 className="text-xl font-bold text-neutral-900 mb-4">Access Points</h3>

      {/* Mile markers in a horizontal scrollable row */}
      <div className="flex gap-2 overflow-x-auto pb-2 mb-4 scrollbar-thin">
        {sortedPoints.map((point) => (
          <button
            key={point.id}
            onClick={() => setExpandedPoint(expandedPoint === point.id ? null : point.id)}
            className={`flex-shrink-0 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              expandedPoint === point.id
                ? 'bg-primary-600 text-white'
                : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
            }`}
          >
            <span className="block text-xs opacity-75">Mile</span>
            <span className="block font-bold">{point.riverMile.toFixed(1)}</span>
          </button>
        ))}
      </div>

      {/* Expanded point details */}
      {expandedPoint && (
        <div className="bg-neutral-50 rounded-lg p-4 animate-in slide-in-from-top-2">
          {(() => {
            const point = sortedPoints.find(p => p.id === expandedPoint);
            if (!point) return null;
            return (
              <>
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="font-semibold text-neutral-900">{point.name}</p>
                    <p className="text-sm text-neutral-500 capitalize">
                      {point.type.replace('_', ' ')} • Mile {point.riverMile.toFixed(1)}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {point.isPublic ? (
                      <span className="px-2 py-1 bg-support-100 text-support-700 rounded text-xs font-medium">
                        Public
                      </span>
                    ) : (
                      <span className="px-2 py-1 bg-neutral-200 text-neutral-600 rounded text-xs font-medium">
                        Private
                      </span>
                    )}
                    {point.feeRequired && (
                      <span className="px-2 py-1 bg-accent-100 text-accent-700 rounded text-xs font-medium">
                        Fee
                      </span>
                    )}
                  </div>
                </div>

                {/* Amenities */}
                {point.amenities && point.amenities.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-3">
                    {point.amenities.map((amenity, idx) => (
                      <span
                        key={idx}
                        className="px-2 py-1 bg-white text-neutral-600 rounded text-xs border border-neutral-200"
                      >
                        {amenity}
                      </span>
                    ))}
                  </div>
                )}

                {/* Additional info */}
                <div className="mt-3 space-y-1 text-sm">
                  {point.parkingInfo && (
                    <p className="text-neutral-600">
                      <span className="font-medium">Parking:</span> {point.parkingInfo}
                    </p>
                  )}
                  {point.feeRequired && point.feeNotes && (
                    <p className="text-accent-600">
                      <span className="font-medium">Fee:</span> {point.feeNotes}
                    </p>
                  )}
                  {point.description && (
                    <p className="text-neutral-600">{point.description}</p>
                  )}
                </div>
              </>
            );
          })()}
        </div>
      )}

      {/* Hint when no point selected */}
      {!expandedPoint && sortedPoints.length > 0 && (
        <p className="text-sm text-neutral-500 text-center">
          Tap a mile marker above to see access point details
        </p>
      )}

      {accessPoints.length === 0 && (
        <p className="text-sm text-neutral-500">No access point information available.</p>
      )}
    </div>
  );
}
