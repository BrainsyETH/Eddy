'use client';

// src/components/river/LogisticsSection.tsx
// Logistics information for access points

import LoadingSpinner from '@/components/ui/LoadingSpinner';
import type { AccessPoint } from '@/types/api';

interface LogisticsSectionProps {
  accessPoints: AccessPoint[];
  isLoading: boolean;
}

export default function LogisticsSection({ accessPoints, isLoading }: LogisticsSectionProps) {
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

  // Group access points by type
  const groupedPoints = accessPoints.reduce((acc, point) => {
    const type = point.type.replace('_', ' ');
    if (!acc[type]) acc[type] = [];
    acc[type].push(point);
    return acc;
  }, {} as Record<string, AccessPoint[]>);

  return (
    <div className="bg-white border-2 border-neutral-200 rounded-lg p-6 shadow-sm">
      <h3 className="text-xl font-bold text-neutral-900 mb-4">Logistics</h3>

      <div className="space-y-6">
        {Object.entries(groupedPoints).map(([type, points]) => (
          <div key={type}>
            <h4 className="font-semibold text-neutral-700 mb-3 capitalize">{type}</h4>
            <div className="space-y-3">
              {points.map((point) => (
                <div key={point.id} className="bg-neutral-50 rounded-lg p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="font-semibold text-neutral-900">{point.name}</p>
                      <p className="text-sm text-neutral-500">Mile {point.riverMile.toFixed(1)}</p>
                    </div>
                    {point.feeRequired && (
                      <span className="px-2 py-1 bg-accent-100 text-accent-700 rounded text-xs font-medium">
                        Fee Required
                      </span>
                    )}
                  </div>

                  {/* Amenities */}
                  {point.amenities && point.amenities.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-2">
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

                  {/* Parking Info */}
                  {point.parkingInfo && (
                    <p className="text-xs text-neutral-600 mt-2">Parking: {point.parkingInfo}</p>
                  )}

                  {/* Fee Notes */}
                  {point.feeRequired && point.feeNotes && (
                    <p className="text-xs text-accent-600 mt-2">Fee: {point.feeNotes}</p>
                  )}

                  {/* Description */}
                  {point.description && (
                    <p className="text-sm text-neutral-600 mt-2">{point.description}</p>
                  )}

                  {/* Ownership */}
                  {point.ownership && (
                    <p className="text-xs text-neutral-500 mt-2">Ownership: {point.ownership}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}

        {accessPoints.length === 0 && (
          <p className="text-sm text-neutral-500">No access point information available.</p>
        )}
      </div>
    </div>
  );
}
