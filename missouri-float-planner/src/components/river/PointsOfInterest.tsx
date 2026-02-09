'use client';

// src/components/river/PointsOfInterest.tsx
// Points of interest along the river (NPS places)

import { useQuery } from '@tanstack/react-query';
import Image from 'next/image';
import { ExternalLink } from 'lucide-react';
import CollapsibleSection from '@/components/ui/CollapsibleSection';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import type { PointOfInterest } from '@/types/nps';

interface PointsOfInterestProps {
  riverSlug: string;
  defaultOpen?: boolean;
}

const POI_TYPE_LABELS: Record<string, string> = {
  spring: 'Spring',
  cave: 'Cave',
  historical_site: 'Historic Site',
  scenic_viewpoint: 'Scenic Viewpoint',
  waterfall: 'Waterfall',
  geological: 'Geological Feature',
  other: 'Point of Interest',
};

const POI_TYPE_COLORS: Record<string, string> = {
  spring: 'bg-blue-100 text-blue-700',
  cave: 'bg-amber-100 text-amber-700',
  historical_site: 'bg-orange-100 text-orange-700',
  scenic_viewpoint: 'bg-emerald-100 text-emerald-700',
  waterfall: 'bg-cyan-100 text-cyan-700',
  geological: 'bg-purple-100 text-purple-700',
  other: 'bg-neutral-100 text-neutral-700',
};

export default function PointsOfInterest({ riverSlug, defaultOpen = false }: PointsOfInterestProps) {
  const { data: pois, isLoading } = useQuery({
    queryKey: ['pois', riverSlug],
    queryFn: async () => {
      const response = await fetch(`/api/rivers/${riverSlug}/pois`);
      if (!response.ok) return [];

      const data = await response.json();
      return (data.pois || []) as PointOfInterest[];
    },
    enabled: !!riverSlug,
  });

  const poiList = pois || [];

  const badge = poiList.length > 0 ? (
    <span className="px-2 py-0.5 rounded text-xs font-medium bg-neutral-200 text-neutral-700">
      {poiList.length}
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
      {poiList.length > 0 ? (
        <div className="space-y-3">
          {poiList.map((poi) => (
            <div key={poi.id} className="bg-neutral-50 rounded-lg p-4">
              <div className="flex items-start justify-between mb-2">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-neutral-900">{poi.name}</p>
                  <span className={`inline-block mt-1 px-2 py-0.5 rounded text-xs font-medium ${POI_TYPE_COLORS[poi.type] || POI_TYPE_COLORS.other}`}>
                    {POI_TYPE_LABELS[poi.type] || poi.type}
                  </span>
                </div>
                {poi.riverMile !== null && (
                  <span className="text-xs text-neutral-500 ml-2 flex-shrink-0">
                    Mile {poi.riverMile.toFixed(1)}
                  </span>
                )}
              </div>

              {poi.description && (
                <p className="text-sm text-neutral-600 mt-2 line-clamp-3">
                  {poi.description}
                </p>
              )}

              {/* NPS image thumbnail */}
              {poi.images && poi.images.length > 0 && (
                <div className="relative mt-2 w-full">
                  <Image
                    src={poi.images[0].url}
                    alt={poi.name}
                    width={600}
                    height={400}
                    className="w-full h-auto rounded-md object-contain"
                    sizes="(max-width: 768px) 100vw, 50vw"
                    unoptimized
                  />
                </div>
              )}

              {/* External link */}
              {poi.npsUrl && (
                <a
                  href={poi.npsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 mt-2 text-xs text-primary-600 hover:text-primary-700 font-medium"
                >
                  {(() => {
                    try {
                      const hostname = new URL(poi.npsUrl).hostname.replace(/^www\./, '');
                      return `Learn more on ${hostname}`;
                    } catch {
                      return 'Learn more';
                    }
                  })()}
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-neutral-50 rounded-lg p-6 text-center">
          <p className="text-sm text-neutral-500">
            No points of interest have been added for this river yet.
          </p>
        </div>
      )}
    </CollapsibleSection>
  );
}
