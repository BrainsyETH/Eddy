'use client';

// src/components/river/RiverGuide.tsx
// Combined Access Points and Points of Interest section

import { useState, useRef, useCallback, useEffect } from 'react';
import Image from 'next/image';
import { useQuery } from '@tanstack/react-query';
import { MapPin, ChevronLeft, ChevronRight } from 'lucide-react';
import CollapsibleSection from '@/components/ui/CollapsibleSection';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import type { AccessPoint } from '@/types/api';

const EDDY_PLACEHOLDER = 'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy%20the%20otter%20with%20a%20flag.png';

// Swipable Image Gallery Component
function ImageGallery({ images, altPrefix }: { images: string[]; altPrefix: string }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const touchStartX = useRef<number | null>(null);
  const touchEndX = useRef<number | null>(null);

  const goToNext = useCallback(() => {
    setCurrentIndex((prev) => (prev + 1) % images.length);
  }, [images.length]);

  const goToPrev = useCallback(() => {
    setCurrentIndex((prev) => (prev - 1 + images.length) % images.length);
  }, [images.length]);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    touchEndX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = () => {
    if (touchStartX.current === null || touchEndX.current === null) return;

    const diff = touchStartX.current - touchEndX.current;
    const minSwipeDistance = 50;

    if (Math.abs(diff) > minSwipeDistance) {
      if (diff > 0) {
        goToNext();
      } else {
        goToPrev();
      }
    }

    touchStartX.current = null;
    touchEndX.current = null;
  };

  if (images.length === 0) return null;

  return (
    <div className="mt-4">
      {/* Main image with touch support */}
      <div
        className="relative w-full aspect-[4/3] rounded-lg overflow-hidden bg-neutral-200"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <Image
          src={images[currentIndex]}
          alt={`${altPrefix} - Image ${currentIndex + 1}`}
          fill
          className="object-cover"
          sizes="(max-width: 768px) 100vw, 400px"
          priority={currentIndex === 0}
        />

        {/* Navigation arrows (only show if more than 1 image) */}
        {images.length > 1 && (
          <>
            <button
              onClick={(e) => {
                e.stopPropagation();
                goToPrev();
              }}
              className="absolute left-2 top-1/2 -translate-y-1/2 p-2 bg-black/50 hover:bg-black/70 text-white rounded-full transition-colors"
              aria-label="Previous image"
            >
              <ChevronLeft size={20} />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                goToNext();
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-black/50 hover:bg-black/70 text-white rounded-full transition-colors"
              aria-label="Next image"
            >
              <ChevronRight size={20} />
            </button>
          </>
        )}

        {/* Image counter */}
        {images.length > 1 && (
          <div className="absolute bottom-2 right-2 px-2 py-1 bg-black/60 text-white text-xs rounded-full">
            {currentIndex + 1} / {images.length}
          </div>
        )}
      </div>

      {/* Thumbnail strip (only show if more than 1 image) */}
      {images.length > 1 && (
        <div className="flex gap-2 mt-2 overflow-x-auto pb-1">
          {images.map((url, idx) => (
            <button
              key={idx}
              onClick={() => setCurrentIndex(idx)}
              className={`flex-shrink-0 w-14 h-14 relative rounded-lg overflow-hidden transition-all ${
                idx === currentIndex
                  ? 'ring-2 ring-primary-500 ring-offset-1'
                  : 'opacity-60 hover:opacity-100'
              }`}
            >
              <Image
                src={url}
                alt={`${altPrefix} thumbnail ${idx + 1}`}
                fill
                className="object-cover"
                sizes="56px"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

interface RiverGuideProps {
  accessPoints: AccessPoint[];
  riverSlug: string;
  isLoading: boolean;
  defaultOpen?: boolean;
  selectedPutInId?: string | null;
  selectedTakeOutId?: string | null;
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

export default function RiverGuide({
  accessPoints,
  riverSlug,
  isLoading,
  defaultOpen = false,
  selectedPutInId,
  selectedTakeOutId,
}: RiverGuideProps) {
  const [expandedItem, setExpandedItem] = useState<string | null>(null);
  const [lastSelectedId, setLastSelectedId] = useState<string | null>(null);

  // Auto-expand when put-in or take-out is selected
  useEffect(() => {
    // Prioritize the most recently changed selection
    const newSelectedId = selectedTakeOutId || selectedPutInId;

    // Only auto-expand if the selection changed
    if (newSelectedId && newSelectedId !== lastSelectedId) {
      setExpandedItem(newSelectedId);
      setLastSelectedId(newSelectedId);
    } else if (!newSelectedId && lastSelectedId) {
      // Clear if both deselected
      setLastSelectedId(null);
    }
  }, [selectedPutInId, selectedTakeOutId, lastSelectedId]);

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
              const hasImages = point.imageUrls && point.imageUrls.length > 0;
              return (
                <div>
                  {/* Header with title and badges */}
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-primary-500"></span>
                        <p className="font-semibold text-neutral-900">{point.name}</p>
                      </div>
                      <p className="text-sm text-neutral-500 ml-4">
                        <span className="capitalize">
                          {(point.types && point.types.length > 0 ? point.types : [point.type])
                            .map(t => t.replace('_', ' '))
                            .join(' • ')}
                        </span>
                        {' • Mile '}{point.riverMile.toFixed(1)}
                      </p>
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
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
                    {/* Google Maps Link */}
                    {point.googleMapsUrl && (
                      <a
                        href={point.googleMapsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 mt-2 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-sm font-medium transition-colors"
                      >
                        <MapPin size={14} />
                        View on Google Maps
                      </a>
                    )}
                  </div>

                  {/* Image Gallery - Below content */}
                  {hasImages && (
                    <ImageGallery images={point.imageUrls} altPrefix={point.name} />
                  )}
                </div>
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
        <div className="flex flex-col items-center py-6">
          <Image
            src={EDDY_PLACEHOLDER}
            alt="Eddy the Otter"
            width={120}
            height={120}
            className="w-24 h-24 object-contain mb-3 opacity-60"
          />
          <p className="text-sm text-neutral-500 text-center">
            No access points or points of interest available yet.
          </p>
        </div>
      )}
    </CollapsibleSection>
  );
}
