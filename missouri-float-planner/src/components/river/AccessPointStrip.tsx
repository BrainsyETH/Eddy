'use client';

// src/components/river/AccessPointStrip.tsx
// Horizontal scrollable strip of access points below the map

import { useState, useRef, useEffect } from 'react';
import Image from 'next/image';
import { MapPin, ChevronLeft, ChevronRight, X } from 'lucide-react';
import type { AccessPoint } from '@/types/api';

interface AccessPointStripProps {
  accessPoints: AccessPoint[];
  selectedPutInId: string | null;
  selectedTakeOutId: string | null;
  onSelect: (point: AccessPoint) => void;
  onHover?: (point: AccessPoint) => void;
  hideExpandedDetails?: boolean;
}

// Compact card for the horizontal strip
function AccessPointCard({
  point,
  isPutIn,
  isTakeOut,
  onClick,
  onHover,
}: {
  point: AccessPoint;
  isPutIn: boolean;
  isTakeOut: boolean;
  onClick: () => void;
  onHover?: () => void;
}) {
  const hasImage = point.imageUrls && point.imageUrls.length > 0;

  let borderClass = 'border-neutral-200';
  let bgClass = 'bg-white';
  let labelText = '';

  if (isPutIn) {
    borderClass = 'border-green-500 border-2';
    bgClass = 'bg-green-50';
    labelText = 'PUT-IN';
  } else if (isTakeOut) {
    borderClass = 'border-red-500 border-2';
    bgClass = 'bg-red-50';
    labelText = 'TAKE-OUT';
  }

  return (
    <button
      onClick={onClick}
      onMouseEnter={onHover}
      className={`flex-shrink-0 w-36 rounded-xl overflow-hidden shadow-sm ${borderClass} ${bgClass} transition-all hover:shadow-md active:scale-95`}
    >
      {/* Image or placeholder */}
      <div className="relative h-20 bg-neutral-100">
        {hasImage ? (
          <Image
            src={point.imageUrls[0]}
            alt={point.name}
            fill
            className="object-cover"
            sizes="144px"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <MapPin className="w-8 h-8 text-neutral-300" />
          </div>
        )}
        {/* Selection label */}
        {labelText && (
          <div className={`absolute top-1 left-1 px-1.5 py-0.5 rounded text-[10px] font-bold ${
            isPutIn ? 'bg-green-500 text-white' : 'bg-red-500 text-white'
          }`}>
            {labelText}
          </div>
        )}
        {/* Mile marker badge */}
        <div className="absolute bottom-1 right-1 px-1.5 py-0.5 bg-black/60 text-white text-[10px] font-medium rounded">
          Mile {point.riverMile.toFixed(1)}
        </div>
      </div>
      {/* Info */}
      <div className="p-2">
        <p className="text-xs font-semibold text-neutral-900 truncate">{point.name}</p>
        <p className="text-[10px] text-neutral-500 capitalize truncate">
          {(point.types && point.types.length > 0 ? point.types : [point.type])
            .map(t => t.replace('_', ' '))
            .join(' / ')}
        </p>
      </div>
    </button>
  );
}

// Expanded detail view (shown when a point is selected)
function ExpandedDetail({
  point,
  isPutIn,
  isTakeOut,
  onClose,
}: {
  point: AccessPoint;
  isPutIn: boolean;
  isTakeOut: boolean;
  onClose: () => void;
}) {
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const hasImages = point.imageUrls && point.imageUrls.length > 0;

  return (
    <div className="bg-white rounded-xl shadow-lg border border-neutral-200 overflow-hidden">
      {/* Header with title and close button */}
      <div className="p-3 border-b border-neutral-100">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              {isPutIn && (
                <span className="px-2 py-0.5 bg-green-500 text-white text-xs font-bold rounded">PUT-IN</span>
              )}
              {isTakeOut && (
                <span className="px-2 py-0.5 bg-red-500 text-white text-xs font-bold rounded">TAKE-OUT</span>
              )}
              <h3 className="font-semibold text-neutral-900 text-base">{point.name}</h3>
            </div>
            <p className="text-sm text-neutral-500 mt-0.5">
              <span className="capitalize">
                {(point.types && point.types.length > 0 ? point.types : [point.type])
                  .map(t => t.replace('_', ' '))
                  .join(' / ')}
              </span>
              {' · Mile '}{point.riverMile.toFixed(1)}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-neutral-100 rounded-full flex-shrink-0"
          >
            <X size={18} className="text-neutral-400" />
          </button>
        </div>
      </div>

      {/* Enlarged centered image */}
      {hasImages && (
        <div className="relative w-full aspect-[16/9] bg-neutral-100">
          <Image
            src={point.imageUrls[currentImageIndex]}
            alt={point.name}
            fill
            className="object-cover"
            sizes="(max-width: 768px) 100vw, 50vw"
          />
          {point.imageUrls.length > 1 && (
            <>
              <button
                onClick={() => setCurrentImageIndex(i => (i - 1 + point.imageUrls.length) % point.imageUrls.length)}
                className="absolute left-2 top-1/2 -translate-y-1/2 p-2 bg-black/50 text-white rounded-full hover:bg-black/70 transition-colors"
              >
                <ChevronLeft size={20} />
              </button>
              <button
                onClick={() => setCurrentImageIndex(i => (i + 1) % point.imageUrls.length)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-black/50 text-white rounded-full hover:bg-black/70 transition-colors"
              >
                <ChevronRight size={20} />
              </button>
              <div className="absolute bottom-2 right-2 px-2 py-1 bg-black/60 text-white text-xs rounded">
                {currentImageIndex + 1} / {point.imageUrls.length}
              </div>
            </>
          )}
        </div>
      )}

      {/* Content section */}
      <div className="p-3">
        {/* Badges */}
        <div className="flex gap-2 mb-2">
          {point.isPublic ? (
            <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs font-medium rounded">Public</span>
          ) : (
            <span className="px-2 py-0.5 bg-neutral-100 text-neutral-600 text-xs font-medium rounded">Private</span>
          )}
          {point.feeRequired && (
            <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-xs font-medium rounded">Fee</span>
          )}
        </div>

        {/* Quick info */}
        <div className="text-sm text-neutral-600 space-y-1.5">
          {point.description && (
            <p className="line-clamp-3">{point.description}</p>
          )}
          {point.parkingInfo && (
            <p><span className="font-medium">Parking:</span> {point.parkingInfo}</p>
          )}
          {point.roadAccess && (
            <p><span className="font-medium">Road Access:</span> {point.roadAccess}</p>
          )}
          {point.facilities && (
            <p><span className="font-medium">Facilities:</span> {point.facilities}</p>
          )}
        </div>

        {/* Google Maps link */}
        {point.googleMapsUrl && (
          <a
            href={point.googleMapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 mt-3 text-sm text-blue-600 hover:underline font-medium"
          >
            <MapPin size={14} />
            View on Google Maps
          </a>
        )}
      </div>
    </div>
  );
}

export default function AccessPointStrip({
  accessPoints,
  selectedPutInId,
  selectedTakeOutId,
  onSelect,
  onHover,
  hideExpandedDetails = false,
}: AccessPointStripProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showLeftArrow, setShowLeftArrow] = useState(false);
  const [showRightArrow, setShowRightArrow] = useState(false);

  // Check scroll position to show/hide arrows
  const updateArrows = () => {
    if (!scrollRef.current) return;
    const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
    setShowLeftArrow(scrollLeft > 10);
    setShowRightArrow(scrollLeft < scrollWidth - clientWidth - 10);
  };

  useEffect(() => {
    updateArrows();
    const ref = scrollRef.current;
    if (ref) {
      ref.addEventListener('scroll', updateArrows);
      return () => ref.removeEventListener('scroll', updateArrows);
    }
  }, [accessPoints]);

  const scroll = (direction: 'left' | 'right') => {
    if (!scrollRef.current) return;
    const scrollAmount = 300;
    scrollRef.current.scrollBy({
      left: direction === 'left' ? -scrollAmount : scrollAmount,
      behavior: 'smooth',
    });
  };

  const handleCardClick = (point: AccessPoint) => {
    // Trigger selection (parent handles put-in/take-out logic)
    onSelect(point);
  };

  // Get both put-in and take-out points for side-by-side display
  const putInPoint = selectedPutInId ? accessPoints.find(ap => ap.id === selectedPutInId) : null;
  const takeOutPoint = selectedTakeOutId ? accessPoints.find(ap => ap.id === selectedTakeOutId) : null;
  const hasBothSelected = putInPoint && takeOutPoint;

  if (accessPoints.length === 0) {
    return null;
  }

  return (
    <div className="relative">
      {/* Scroll arrows */}
      {showLeftArrow && (
        <button
          onClick={() => scroll('left')}
          className="absolute left-0 top-[60px] -translate-y-1/2 z-10 p-1.5 bg-white/90 shadow-md rounded-full hover:bg-white"
        >
          <ChevronLeft size={20} className="text-neutral-600" />
        </button>
      )}
      {showRightArrow && (
        <button
          onClick={() => scroll('right')}
          className="absolute right-0 top-[60px] -translate-y-1/2 z-10 p-1.5 bg-white/90 shadow-md rounded-full hover:bg-white"
        >
          <ChevronRight size={20} className="text-neutral-600" />
        </button>
      )}

      {/* Horizontal scroll container */}
      <div
        ref={scrollRef}
        className="flex gap-2 overflow-x-auto pb-2 px-2 scrollbar-hide"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {accessPoints.map((point) => (
          <AccessPointCard
            key={point.id}
            point={point}
            isPutIn={point.id === selectedPutInId}
            isTakeOut={point.id === selectedTakeOutId}
            onClick={() => handleCardClick(point)}
            onHover={onHover ? () => onHover(point) : undefined}
          />
        ))}
      </div>

      {/* Expanded detail panel - side by side on desktop when both selected */}
      {!hideExpandedDetails && (putInPoint || takeOutPoint) && (
        <div className={`mt-2 px-2 ${hasBothSelected ? 'grid grid-cols-1 lg:grid-cols-2 gap-3' : ''}`}>
          {putInPoint && (
            <ExpandedDetail
              point={putInPoint}
              isPutIn={true}
              isTakeOut={false}
              onClose={() => onSelect(putInPoint)}
            />
          )}
          {takeOutPoint && (
            <ExpandedDetail
              point={takeOutPoint}
              isPutIn={false}
              isTakeOut={true}
              onClose={() => onSelect(takeOutPoint)}
            />
          )}
        </div>
      )}

    </div>
  );
}
