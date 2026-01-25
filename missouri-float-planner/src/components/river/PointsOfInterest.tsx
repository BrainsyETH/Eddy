'use client';

// src/components/river/PointsOfInterest.tsx
// Curated points of interest along the river

import { useQuery } from '@tanstack/react-query';
import CollapsibleSection from '@/components/ui/CollapsibleSection';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

interface PointsOfInterestProps {
  riverSlug: string;
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

export default function PointsOfInterest({ riverSlug, defaultOpen = false }: PointsOfInterestProps) {
  // For MVP, we'll use hazards as POIs (can be expanded later with dedicated POI table)
  const { data: hazards, isLoading } = useQuery({
    queryKey: ['hazards', riverSlug],
    queryFn: async () => {
      const response = await fetch(`/api/rivers/${riverSlug}/hazards`);
      if (!response.ok) return [];

      const data = await response.json();
      return (data.hazards || []) as POI[];
    },
    enabled: !!riverSlug,
  });

  // For MVP, show a placeholder - POIs can be added as a separate feature
  const pois: POI[] = hazards || [];

  const badge = pois.length > 0 ? (
    <span className="px-2 py-0.5 rounded text-xs font-medium bg-neutral-200 text-neutral-700">
      {pois.length}
    </span>
  ) : null;

  if (isLoading) {
    return (
      <CollapsibleSection title="Points of Interest" defaultOpen={defaultOpen} badge={badge}>
        <div className="flex items-center gap-3">
          <LoadingSpinner size="sm" />
          <p className="text-sm text-neutral-500">Loading points of interest...</p>
        </div>
      </CollapsibleSection>
    );
  }

  return (
    <CollapsibleSection title="Points of Interest" defaultOpen={defaultOpen} badge={badge}>
      {pois.length > 0 ? (
        <div className="space-y-3">
          {pois.map((poi) => (
            <div key={poi.id} className="bg-neutral-50 rounded-lg p-4">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <p className="font-semibold text-neutral-900">{poi.name}</p>
                  <p className="text-sm text-neutral-500 capitalize">{poi.type}</p>
                </div>
                <span className="text-xs text-neutral-500">Mile {poi.riverMile.toFixed(1)}</span>
              </div>
              {poi.description && (
                <p className="text-sm text-neutral-600 mt-2">{poi.description}</p>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-neutral-50 rounded-lg p-6 text-center">
          <p className="text-sm text-neutral-500">
            Points of interest will be added soon. Check back for springs, bluffs, caves, and other landmarks!
          </p>
        </div>
      )}
    </CollapsibleSection>
  );
}
