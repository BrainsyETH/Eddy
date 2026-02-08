'use client';

// src/components/river/AccessPointStrip.tsx
// Horizontal scrollable strip of access points below the map

import { useState, useRef, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { MapPin, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, X, Flag, ExternalLink, Car, ParkingCircle, Store, Lightbulb, Tent, Droplets, Phone, Flame, Trash2 } from 'lucide-react';
import type { AccessPoint, NearbyService } from '@/types/api';
import { ACCESS_POINT_TYPE_ORDER } from '@/constants';

// Sort types by canonical display order
function sortTypes(types: string[]): string[] {
  return [...types].sort((a, b) => {
    const ai = ACCESS_POINT_TYPE_ORDER.indexOf(a as typeof ACCESS_POINT_TYPE_ORDER[number]);
    const bi = ACCESS_POINT_TYPE_ORDER.indexOf(b as typeof ACCESS_POINT_TYPE_ORDER[number]);
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });
}

interface AccessPointStripProps {
  accessPoints: AccessPoint[];
  selectedPutInId: string | null;
  selectedTakeOutId: string | null;
  onSelect: (point: AccessPoint) => void;
  onHover?: (point: AccessPoint) => void;
  onReportIssue?: (point: AccessPoint) => void;
  hideExpandedDetails?: boolean;
  riverSlug: string;
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
  const heroImage = point.imageUrls?.[0] || point.npsCampground?.images?.[0]?.url || null;
  const hasImage = !!heroImage;

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
            src={heroImage!}
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
          {sortTypes(point.types && point.types.length > 0 ? point.types : [point.type])
            .map(t => t.replace('_', ' '))
            .join(' / ')}
        </p>
      </div>
    </button>
  );
}

// Format road surface for display
function formatRoadSurface(surface: string): string {
  const mapping: Record<string, string> = {
    'paved': 'Paved',
    'gravel_maintained': 'Gravel (maintained)',
    'gravel_unmaintained': 'Gravel (unmaintained)',
    'dirt': 'Dirt',
    'seasonal': 'Seasonal',
    '4wd_required': '4WD Required',
  };
  return mapping[surface] || surface.replace('_', ' ');
}

// Format parking capacity for display
function formatParkingCapacity(capacity: string | null): string {
  if (!capacity) return 'Unknown';
  const mapping: Record<string, string> = {
    'roadside': 'Roadside only',
    'limited': 'Limited',
    'unknown': 'Unknown',
    '50+': '50+ vehicles',
  };
  if (mapping[capacity]) return mapping[capacity];
  return `${capacity} vehicles`;
}

// Format nearby service type
function formatServiceType(type: string): string {
  const mapping: Record<string, string> = {
    'outfitter': 'Outfitter',
    'campground': 'Campground',
    'canoe_rental': 'Canoe Rental',
    'shuttle': 'Shuttle Service',
    'lodging': 'Lodging',
  };
  return mapping[type] || type.replace('_', ' ');
}

// Collapsible section component
function CollapsibleDetailSection({
  title,
  defaultOpen = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="border-t border-neutral-100">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between py-2 text-left hover:bg-neutral-50 transition-colors"
      >
        <span className="text-sm font-medium text-neutral-700">{title}</span>
        {isOpen ? (
          <ChevronUp size={16} className="text-neutral-400" />
        ) : (
          <ChevronDown size={16} className="text-neutral-400" />
        )}
      </button>
      {isOpen && (
        <div className="pb-3 text-sm text-neutral-600">
          {children}
        </div>
      )}
    </div>
  );
}

// Expanded detail view (shown when a point is selected)
function ExpandedDetail({
  point,
  isPutIn,
  isTakeOut,
  onClose,
  onReportIssue,
  riverSlug,
}: {
  point: AccessPoint;
  isPutIn: boolean;
  isTakeOut: boolean;
  onClose: () => void;
  onReportIssue?: () => void;
  riverSlug: string;
}) {
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const allImages = [
    ...(point.imageUrls || []),
    ...(point.npsCampground?.images?.map(img => img.url) || []),
  ];
  const hasImages = allImages.length > 0;
  const hasRoadInfo = (point.roadSurface && point.roadSurface.length > 0) || point.roadAccess;
  const hasParkingInfo = point.parkingCapacity || point.parkingInfo;
  const hasNearbyServices = point.nearbyServices && point.nearbyServices.length > 0;
  const hasLocalTips = point.localTips;
  const nps = point.npsCampground;

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
                {sortTypes(point.types && point.types.length > 0 ? point.types : [point.type])
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
            src={allImages[currentImageIndex]}
            alt={point.name}
            fill
            className="object-cover"
            sizes="(max-width: 768px) 100vw, 50vw"
          />
          {allImages.length > 1 && (
            <>
              <button
                onClick={() => setCurrentImageIndex(i => (i - 1 + allImages.length) % allImages.length)}
                className="absolute left-2 top-1/2 -translate-y-1/2 p-2 bg-black/50 text-white rounded-full hover:bg-black/70 transition-colors"
              >
                <ChevronLeft size={20} />
              </button>
              <button
                onClick={() => setCurrentImageIndex(i => (i + 1) % allImages.length)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-black/50 text-white rounded-full hover:bg-black/70 transition-colors"
              >
                <ChevronRight size={20} />
              </button>
              <div className="absolute bottom-2 right-2 px-2 py-1 bg-black/60 text-white text-xs rounded">
                {currentImageIndex + 1} / {allImages.length}
              </div>
            </>
          )}
        </div>
      )}

      {/* Content section */}
      <div className="p-3">
        {/* Badges */}
        <div className="flex gap-2 mb-3">
          {point.isPublic ? (
            <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs font-medium rounded">Public</span>
          ) : (
            <span className="px-2 py-0.5 bg-neutral-100 text-neutral-600 text-xs font-medium rounded">Private</span>
          )}
          {point.feeRequired && (
            <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-xs font-medium rounded">Fee</span>
          )}
        </div>

        {/* Description section - expanded by default if exists */}
        {point.description && (
          <CollapsibleDetailSection title="Description" defaultOpen={true}>
            <p>{point.description}</p>
          </CollapsibleDetailSection>
        )}

        {/* Road Access section */}
        {hasRoadInfo && (
          <CollapsibleDetailSection title="Road Access" defaultOpen={false}>
            <div className="space-y-2">
              {point.roadSurface && point.roadSurface.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  <Car size={14} className="text-neutral-400 mt-0.5" />
                  {point.roadSurface.map((surface, idx) => (
                    <span
                      key={idx}
                      className={`px-2 py-0.5 text-xs rounded ${
                        surface === 'paved' ? 'bg-green-100 text-green-700' :
                        surface === '4wd_required' ? 'bg-amber-100 text-amber-700' :
                        surface === 'seasonal' ? 'bg-blue-100 text-blue-700' :
                        'bg-neutral-100 text-neutral-600'
                      }`}
                    >
                      {formatRoadSurface(surface)}
                    </span>
                  ))}
                </div>
              )}
              {point.roadAccess && (
                <p className="text-sm">{point.roadAccess}</p>
              )}
            </div>
          </CollapsibleDetailSection>
        )}

        {/* Parking section */}
        {hasParkingInfo && (
          <CollapsibleDetailSection title="Parking" defaultOpen={false}>
            <div className="space-y-1.5">
              {point.parkingCapacity && (
                <div className="flex items-center gap-1.5">
                  <ParkingCircle size={14} className="text-neutral-400" />
                  <span className="text-sm font-medium">{formatParkingCapacity(point.parkingCapacity)}</span>
                </div>
              )}
              {point.parkingInfo && (
                <p className="text-sm">{point.parkingInfo}</p>
              )}
            </div>
          </CollapsibleDetailSection>
        )}

        {/* NPS Campground section */}
        {nps && (
          <CollapsibleDetailSection title="NPS Campground Info" defaultOpen={true}>
            <div className="space-y-3">
              {/* Fees */}
              {nps.fees.length > 0 && (
                <div className="space-y-1">
                  {nps.fees.map((fee, i) => (
                    <div key={i} className="flex justify-between items-start gap-3">
                      <span className="text-sm text-neutral-600">{fee.title}</span>
                      <span className="text-sm text-neutral-900 font-semibold whitespace-nowrap">
                        ${parseFloat(fee.cost).toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Reservation link */}
              {nps.reservationUrl && (
                <a
                  href={nps.reservationUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between gap-2 p-2 bg-primary-50 rounded-lg hover:bg-primary-100 transition-colors group"
                >
                  <span className="text-sm text-primary-700 font-medium">Reserve on Recreation.gov</span>
                  <ExternalLink className="w-4 h-4 text-primary-600 flex-shrink-0" />
                </a>
              )}

              {/* Site counts */}
              {nps.totalSites > 0 && (
                <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-sm">
                  <div className="flex justify-between"><span className="text-neutral-500">Total</span><span className="font-medium">{nps.totalSites}</span></div>
                  {nps.sitesFirstCome > 0 && <div className="flex justify-between"><span className="text-neutral-500">First-come</span><span className="font-medium">{nps.sitesFirstCome}</span></div>}
                  {nps.sitesReservable > 0 && <div className="flex justify-between"><span className="text-neutral-500">Reservable</span><span className="font-medium">{nps.sitesReservable}</span></div>}
                  {nps.sitesGroup > 0 && <div className="flex justify-between"><span className="text-neutral-500">Group</span><span className="font-medium">{nps.sitesGroup}</span></div>}
                </div>
              )}

              {/* Amenity chips */}
              <div className="flex flex-wrap gap-1.5">
                {nps.amenities.toilets.length > 0 && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-neutral-100 text-neutral-700 rounded text-xs">
                    <Tent className="w-3 h-3" />
                    {nps.amenities.toilets.some(t => t.toLowerCase().includes('flush')) ? 'Flush toilets' :
                     nps.amenities.toilets.some(t => t.toLowerCase().includes('vault')) ? 'Vault toilets' : 'Restrooms'}
                  </span>
                )}
                {nps.amenities.potableWater.length > 0 && !nps.amenities.potableWater.every(w => w === 'No water') && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-neutral-100 text-neutral-700 rounded text-xs">
                    <Droplets className="w-3 h-3" />Water
                  </span>
                )}
                {nps.amenities.cellPhoneReception && nps.amenities.cellPhoneReception !== 'No' && nps.amenities.cellPhoneReception !== 'Unknown' && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-neutral-100 text-neutral-700 rounded text-xs">
                    <Phone className="w-3 h-3" />Cell: {nps.amenities.cellPhoneReception}
                  </span>
                )}
                {nps.amenities.firewoodForSale === 'Yes' && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-neutral-100 text-neutral-700 rounded text-xs">
                    <Flame className="w-3 h-3" />Firewood
                  </span>
                )}
                {nps.amenities.trashCollection && nps.amenities.trashCollection !== 'No' && nps.amenities.trashCollection !== 'Unknown' && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-neutral-100 text-neutral-700 rounded text-xs">
                    <Trash2 className="w-3 h-3" />Trash
                  </span>
                )}
              </div>

              {/* NPS link */}
              {nps.npsUrl && (
                <a
                  href={nps.npsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-sm text-primary-600 hover:underline"
                >
                  <ExternalLink size={14} />
                  View on NPS.gov
                </a>
              )}
            </div>
          </CollapsibleDetailSection>
        )}

        {/* Facilities section */}
        {point.facilities && (
          <CollapsibleDetailSection title="Facilities" defaultOpen={false}>
            <p>{point.facilities}</p>
          </CollapsibleDetailSection>
        )}

        {/* Nearby Services section */}
        {hasNearbyServices && (
          <CollapsibleDetailSection title="Nearby Services" defaultOpen={false}>
            <div className="space-y-2">
              {point.nearbyServices!.map((service: NearbyService, idx: number) => (
                <div key={idx} className="flex items-start gap-2 p-2 bg-neutral-50 rounded-lg">
                  <Store size={14} className="text-neutral-400 mt-0.5 flex-shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{service.name}</span>
                      <span className="text-xs text-neutral-500 bg-neutral-100 px-1.5 py-0.5 rounded">
                        {formatServiceType(service.type)}
                      </span>
                      {service.distance && (
                        <span className="text-xs text-neutral-400">{service.distance}</span>
                      )}
                    </div>
                    {service.phone && (
                      <a href={`tel:${service.phone}`} className="text-xs text-blue-600 hover:underline block mt-0.5">
                        {service.phone}
                      </a>
                    )}
                    {service.website && (
                      <a href={service.website} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline block mt-0.5">
                        Website
                      </a>
                    )}
                    {service.notes && (
                      <p className="text-xs text-neutral-500 mt-0.5">{service.notes}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CollapsibleDetailSection>
        )}

        {/* Local Tips section */}
        {hasLocalTips && (
          <CollapsibleDetailSection title="Local Tips" defaultOpen={false}>
            <div className="flex items-start gap-2">
              <Lightbulb size={14} className="text-amber-500 mt-0.5 flex-shrink-0" />
              <div
                className="prose prose-sm max-w-none text-neutral-600"
                dangerouslySetInnerHTML={{ __html: point.localTips! }}
              />
            </div>
          </CollapsibleDetailSection>
        )}

        {/* Footer links */}
        <div className="flex flex-col gap-2 mt-3 pt-3 border-t border-neutral-100">
          {/* View Full Details link */}
          {point.slug && (
            <Link
              href={`/rivers/${riverSlug}/access/${point.slug}`}
              className="inline-flex items-center justify-center gap-2 w-full py-2 px-4 bg-primary-50 text-primary-700 hover:bg-primary-100 rounded-lg font-medium text-sm transition-colors"
            >
              <ExternalLink size={14} />
              View Full Details
            </Link>
          )}

          <div className="flex items-center justify-between">
            {/* Google Maps link */}
            {point.googleMapsUrl ? (
              <a
                href={point.googleMapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:underline font-medium"
              >
                <MapPin size={14} />
                View on Google Maps
              </a>
            ) : (
              <span />
            )}

            {/* Report Issue link */}
            {onReportIssue && (
              <button
                onClick={onReportIssue}
                className="inline-flex items-center gap-1 text-xs text-neutral-400 hover:text-accent-500 transition-colors"
              >
                <Flag size={12} />
                Report Issue
              </button>
            )}
          </div>
        </div>
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
  onReportIssue,
  hideExpandedDetails = false,
  riverSlug,
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
              onReportIssue={onReportIssue ? () => onReportIssue(putInPoint) : undefined}
              riverSlug={riverSlug}
            />
          )}
          {takeOutPoint && (
            <ExpandedDetail
              point={takeOutPoint}
              isPutIn={false}
              isTakeOut={true}
              onClose={() => onSelect(takeOutPoint)}
              onReportIssue={onReportIssue ? () => onReportIssue(takeOutPoint) : undefined}
              riverSlug={riverSlug}
            />
          )}
        </div>
      )}

    </div>
  );
}
