'use client';

// src/components/river/RiverGuide.tsx
// Combined Access Points and Points of Interest section

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import CollapsibleSection from '@/components/ui/CollapsibleSection';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import type { AccessPoint } from '@/types/api';

interface RiverGuideProps {
  accessPoints: AccessPoint[];
  riverSlug: string;
  isLoading: boolean;
  defaultOpen?: boolean;
}

interface POI {
  id: string;
  name: string;
  type: string;
  description: string | null;
  riverMile: number;
  coordinates: { lng: number; lat: number } | null;
}

type MarkerItem = {
  id: string;
  name: string;
  type: 'access_point' | 'poi';
  riverMile: number;
  data: AccessPoint | POI;
};

export default function RiverGuide({ accessPoints, riverSlug, isLoading, defaultOpen = false }: RiverGuideProps) {
  const [expandedItem, setExpandedItem] = useState<string | null>(null);

  // Fetch POIs (hazards for now)
  const { data: pois, isLoading: poisLoading } = useQuery({
    queryKey: ['hazards', riverSlug],
    queryFn: async () => {
      const response = await fetch(`/api/rivers/${riverSlug}/hazards`);
      if (!response.ok) return [];
      const data = await response.json();
      return (data.hazards || []) as POI[];
    },
    enabled: !!riverSlug,
  });

  // Combine and sort all items by mile marker
  const allItems: MarkerItem[] = [
    ...accessPoints.map(ap => ({
      id: ap.id,
      name: ap.name,
      type: 'access_point' as const,
      riverMile: ap.riverMile,
      data: ap,
    })),
    ...(pois || []).map(poi => ({
      id: poi.id,
      name: poi.name,
      type: 'poi' as const,
      riverMile: poi.riverMile,
      data: poi,
    })),
  ].sort((a, b) => a.riverMile - b.riverMile);

  const apCount = accessPoints.length;
  const poiCount = pois?.length || 0;
  const totalCount = apCount + poiCount;

  const badge = totalCount > 0 ? (
    <div className="flex items-center gap-2">
      {apCount > 0 && (
        <span className="px-2 py-0.5 rounded text-xs font-medium bg-primary-100 text-primary-700">
          {apCount} Access
        </span>
      )}
      {poiCount > 0 && (
        <span className="px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-700">
          {poiCount} POI
        </span>
      )}
    </div>
  ) : null;

  const loading = isLoading || poisLoading;

  if (loading) {
    return (
      <CollapsibleSection title="River Guide" defaultOpen={defaultOpen} badge={badge}>
        <div className="flex items-center gap-3">
          <LoadingSpinner size="sm" />
          <p className="text-sm text-neutral-500">Loading river guide...</p>
        </div>
      </CollapsibleSection>
    );
  }

  return (
    <CollapsibleSection title="River Guide" defaultOpen={defaultOpen} badge={badge}>
      {/* Legend */}
      <div className="flex items-center gap-4 mb-4 text-xs">
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-primary-500"></span>
          <span className="text-neutral-600">Access Points</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-amber-500"></span>
          <span className="text-neutral-600">Points of Interest</span>
        </div>
      </div>

      {/* Mile markers in a horizontal scrollable row */}
      <div className="flex gap-2 overflow-x-auto pb-2 mb-4 scrollbar-thin">
        {allItems.map((item) => (
          <button
            key={item.id}
            onClick={() => setExpandedItem(expandedItem === item.id ? null : item.id)}
            className={`flex-shrink-0 px-3 py-2 rounded-lg text-sm font-medium transition-colors border-2 ${
              expandedItem === item.id
                ? item.type === 'access_point'
                  ? 'bg-primary-600 text-white border-primary-600'
                  : 'bg-amber-500 text-white border-amber-500'
                : item.type === 'access_point'
                  ? 'bg-primary-50 text-primary-700 border-primary-200 hover:bg-primary-100'
                  : 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'
            }`}
          >
            <span className="block text-xs opacity-75">Mile</span>
            <span className="block font-bold">{item.riverMile.toFixed(1)}</span>
          </button>
        ))}
      </div>

      {/* Expanded item details */}
      {expandedItem && (
        <div className="bg-neutral-50 rounded-lg p-4 animate-in slide-in-from-top-2">
          {(() => {
            const item = allItems.find(i => i.id === expandedItem);
            if (!item) return null;

            if (item.type === 'access_point') {
              const point = item.data as AccessPoint;
              return (
                <>
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-primary-500"></span>
                        <p className="font-semibold text-neutral-900">{point.name}</p>
                      </div>
                      <p className="text-sm text-neutral-500 capitalize ml-4">
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
                    <div className="flex flex-wrap gap-2 mt-3 ml-4">
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
                  <div className="mt-3 space-y-1 text-sm ml-4">
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
            } else {
              const poi = item.data as POI;
              return (
                <>
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                        <p className="font-semibold text-neutral-900">{poi.name}</p>
                      </div>
                      <p className="text-sm text-neutral-500 capitalize ml-4">
                        {poi.type} • Mile {poi.riverMile.toFixed(1)}
                      </p>
                    </div>
                  </div>
                  {poi.description && (
                    <p className="text-sm text-neutral-600 mt-2 ml-4">{poi.description}</p>
                  )}
                </>
              );
            }
          })()}
        </div>
      )}

      {/* Hint when no item selected */}
      {!expandedItem && allItems.length > 0 && (
        <p className="text-sm text-neutral-500 text-center">
          Tap a mile marker above to see details
        </p>
      )}

      {allItems.length === 0 && (
        <p className="text-sm text-neutral-500">No access points or points of interest available.</p>
      )}
    </CollapsibleSection>
  );
}
