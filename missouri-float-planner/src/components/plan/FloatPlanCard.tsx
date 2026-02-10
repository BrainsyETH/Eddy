'use client';

// src/components/plan/FloatPlanCard.tsx
// Merged journey card showing put-in and take-out side by side with float details

import { useState, useRef, useEffect, useCallback } from 'react';
import Image from 'next/image';
import { ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Share2, Download, X, GripHorizontal, Flag, Store, Lightbulb, Tent, Droplets, Phone, Flame, Trash2, MapPin, Mountain, Landmark, Eye, CircleDot, Star, Info } from 'lucide-react';
import type { AccessPoint, FloatPlan, ConditionCode, NearbyService } from '@/types/api';
import { useVesselTypes } from '@/hooks/useVesselTypes';
import { POI_TYPES, ACCESS_POINT_TYPE_ORDER } from '@/constants';
import {
  generateNavLinks,
  handleNavClick,
  detectPlatform,
  type NavLink,
} from '@/lib/navigation';

// Navigation app icon URLs from Vercel blob storage
const NAV_APP_ICONS: Record<string, string> = {
  onx: 'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/nav-icons/onx.png',
  gaia: 'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/nav-icons/gaia.jpeg',
  google: 'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/nav-icons/google-maps.png',
  apple: 'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/nav-icons/Apple_Maps_Logo.png',
};

// Detail section icon URLs from Vercel blob storage
const DETAIL_ICONS = {
  road: 'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/detail-icons/road-icon.png',
  parking: 'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/detail-icons/parking-icon.png',
  facilities: 'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/detail-icons/restroom-icon.png',
  camping: 'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/detail-icons/camping-icon.png',
};

// Eddy the Otter condition images from Vercel blob storage
const EDDY_CONDITION_IMAGES: Record<string, string> = {
  green: 'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy_the_Otter_green.png',
  red: 'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy_the_Otter_red.png',
  yellow: 'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy_the_Otter_yellow.png',
  flag: 'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy%20the%20otter%20with%20a%20flag.png',
};

// Get the appropriate Eddy image for a condition code
function getEddyImageForCondition(code: ConditionCode): string {
  switch (code) {
    case 'optimal':
    case 'okay':
      return EDDY_CONDITION_IMAGES.green;
    case 'low':
      return EDDY_CONDITION_IMAGES.yellow;
    case 'high':
    case 'dangerous':
      return EDDY_CONDITION_IMAGES.red;
    case 'too_low':
    case 'unknown':
    default:
      return EDDY_CONDITION_IMAGES.flag;
  }
}

// Condition display config
const CONDITION_CONFIG: Record<ConditionCode, {
  label: string;
  emoji: string;
  bgClass: string;
  textClass: string;
  borderClass: string;
}> = {
  optimal: {
    label: 'Optimal',
    emoji: '✓',
    bgClass: 'bg-emerald-500',
    textClass: 'text-white',
    borderClass: 'border-emerald-400',
  },
  okay: {
    label: 'Okay',
    emoji: '✓',
    bgClass: 'bg-lime-500',
    textClass: 'text-white',
    borderClass: 'border-lime-400',
  },
  low: {
    label: 'Low',
    emoji: '↓',
    bgClass: 'bg-yellow-500',
    textClass: 'text-neutral-900',
    borderClass: 'border-yellow-400',
  },
  too_low: {
    label: 'Too Low',
    emoji: '⚠',
    bgClass: 'bg-neutral-400',
    textClass: 'text-white',
    borderClass: 'border-neutral-300',
  },
  high: {
    label: 'High',
    emoji: '⚡',
    bgClass: 'bg-orange-500',
    textClass: 'text-white',
    borderClass: 'border-orange-400',
  },
  dangerous: {
    label: 'Flood',
    emoji: '🚫',
    bgClass: 'bg-red-600',
    textClass: 'text-white',
    borderClass: 'border-red-400',
  },
  unknown: {
    label: 'Unknown',
    emoji: '?',
    bgClass: 'bg-neutral-500',
    textClass: 'text-white',
    borderClass: 'border-neutral-400',
  },
};

// Sort types by canonical display order
function sortTypes(types: string[]): string[] {
  return [...types].sort((a, b) => {
    const ai = ACCESS_POINT_TYPE_ORDER.indexOf(a as typeof ACCESS_POINT_TYPE_ORDER[number]);
    const bi = ACCESS_POINT_TYPE_ORDER.indexOf(b as typeof ACCESS_POINT_TYPE_ORDER[number]);
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });
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

interface FloatPlanCardProps {
  plan: FloatPlan | null;
  isLoading: boolean;
  putInPoint: AccessPoint | null;
  takeOutPoint: AccessPoint | null;
  onClearPutIn: () => void;
  onClearTakeOut: () => void;
  onShare: () => void;
  onDownloadImage: () => void;
  riverSlug: string;
  riverName?: string;
  vesselTypeId: string | null;
  onVesselChange: (id: string) => void;
  captureRef?: React.RefObject<HTMLDivElement>;
  onReportIssue?: (point: AccessPoint) => void;
  pointsAlongRoute?: RouteItem[];
}

// Shareable capture component - optimized view for image export
function ShareableCapture({
  plan,
  putInPoint,
  takeOutPoint,
  riverName,
  captureRef,
}: {
  plan: FloatPlan;
  putInPoint: AccessPoint;
  takeOutPoint: AccessPoint;
  riverName?: string;
  captureRef: React.RefObject<HTMLDivElement>;
}) {
  const conditionCode: ConditionCode = plan.condition.code || 'unknown';
  const conditionConfig = CONDITION_CONFIG[conditionCode] || CONDITION_CONFIG.unknown;

  return (
    <div
      ref={captureRef}
      className="absolute left-[-9999px] top-0 w-[400px] bg-white p-4"
      style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}
    >
      {/* Header with Eddy mascot and branding */}
      <div className="flex items-center justify-between mb-4 pb-3 border-b border-neutral-200">
        <div className="flex items-center gap-3">
          <Image
            src="/blog/planning-first-trip/eddy-reference.png"
            alt="Eddy the Otter"
            width={48}
            height={48}
            className="object-contain"
          />
          <div>
            <h1 className="text-xl font-bold text-neutral-900">{riverName || 'Float Plan'}</h1>
            <p className="text-sm text-neutral-500">eddy.guide</p>
          </div>
        </div>
        <div className={`px-3 py-1.5 rounded-lg ${conditionConfig.bgClass} flex items-center gap-1.5`}>
          <Image
            src={getEddyImageForCondition(conditionCode)}
            alt={conditionConfig.label}
            width={24}
            height={24}
          />
          <span className={`text-sm font-bold ${conditionConfig.textClass}`}>
            {conditionConfig.label}
          </span>
        </div>
      </div>

      {/* Route Summary */}
      <div className="bg-neutral-50 rounded-xl p-4 mb-4">
        <div className="flex items-center gap-3">
          <div className="flex flex-col items-center">
            <div className="w-4 h-4 rounded-full bg-support-500"></div>
            <div className="w-0.5 h-10 bg-gradient-to-b from-support-400 to-accent-400"></div>
            <div className="w-4 h-4 rounded-full bg-accent-500"></div>
          </div>
          <div className="flex-1 space-y-3">
            <div>
              <p className="text-xs font-bold text-support-600 uppercase">Put-in</p>
              <p className="font-bold text-neutral-900">{putInPoint.name}</p>
              <p className="text-xs text-neutral-500">Mile {putInPoint.riverMile.toFixed(1)}</p>
            </div>
            <div>
              <p className="text-xs font-bold text-accent-600 uppercase">Take-out</p>
              <p className="font-bold text-neutral-900">{takeOutPoint.name}</p>
              <p className="text-xs text-neutral-500">Mile {takeOutPoint.riverMile.toFixed(1)}</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-3xl font-bold text-neutral-900">{plan.distance.formatted}</p>
            <p className="text-lg text-neutral-600">{plan.floatTime?.formatted || '--'}</p>
          </div>
        </div>
      </div>

      {/* Conditions */}
      <div className={`rounded-xl overflow-hidden ${conditionConfig.bgClass}`}>
        <div className="px-4 py-3 flex items-center justify-center gap-2">
          <Image
            src={getEddyImageForCondition(conditionCode)}
            alt={conditionConfig.label}
            width={40}
            height={40}
          />
          <span className={`text-lg font-bold ${conditionConfig.textClass}`}>{conditionConfig.label}</span>
        </div>
        <div className="bg-white/95 px-4 py-3 flex justify-around">
          <div className="text-center">
            <p className="text-xl font-bold text-neutral-800">{plan.condition.gaugeHeightFt?.toFixed(1) ?? '—'}</p>
            <p className="text-[10px] uppercase text-neutral-500 font-medium">Feet</p>
          </div>
          <div className="w-px bg-neutral-200"></div>
          <div className="text-center">
            <p className="text-xl font-bold text-neutral-800">{plan.condition.dischargeCfs?.toLocaleString() ?? '—'}</p>
            <p className="text-[10px] uppercase text-neutral-500 font-medium">CFS</p>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="mt-4 pt-3 border-t border-neutral-200 text-center">
        <p className="text-xs text-neutral-400">Plan your float at eddy.guide</p>
      </div>
    </div>
  );
}

// Collapsible section component for access point details
function CollapsibleDetailSection({
  title,
  iconUrl,
  defaultOpen = false,
  children,
}: {
  title: string;
  iconUrl?: string;
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
        <div className="flex items-center gap-2">
          {iconUrl && (
            <Image src={iconUrl} alt="" width={16} height={16} />
          )}
          <span className="text-sm font-medium text-neutral-700">{title}</span>
        </div>
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

// Unified route item type for along-your-route display
export type RouteItem = {
  id: string;
  name: string;
  riverMile: number;
  type: 'access_point' | 'poi';
  subType: string; // access point type or POI type
  description: string | null;
  imageUrl: string | null;
  npsUrl?: string | null;
};

// POI icon lookup
const POI_ICON_MAP: Record<string, React.ComponentType<{ size?: string | number; className?: string }>> = {
  spring: Droplets,
  cave: Mountain,
  historical_site: Landmark,
  scenic_viewpoint: Eye,
  waterfall: Droplets,
  geological: CircleDot,
  other: Star,
};

// Along Your Route section — shared between desktop and mobile
function AlongYourRoute({ items }: { items: RouteItem[] }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (items.length === 0) return null;

  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-wider text-neutral-500 mb-2">Along Your Route</p>
      <div className="space-y-1.5">
        {items.map((item) => {
          const isExpanded = expandedId === item.id;
          const isPOI = item.type === 'poi';
          const IconComponent = isPOI ? (POI_ICON_MAP[item.subType] || Star) : MapPin;
          const typeLabel = isPOI
            ? (POI_TYPES as Record<string, string>)[item.subType] || 'Point of Interest'
            : item.subType.replace('_', ' ');

          return (
            <button
              key={item.id}
              onClick={() => setExpandedId(isExpanded ? null : item.id)}
              className="w-full text-left rounded-lg border border-neutral-100 hover:border-neutral-200 bg-white transition-colors overflow-hidden"
            >
              <div className="flex items-center gap-2.5 px-3 py-2">
                {/* Icon */}
                <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${
                  isPOI ? 'bg-teal-100' : 'bg-neutral-100'
                }`}>
                  <IconComponent size={14} className={isPOI ? 'text-teal-600' : 'text-neutral-500'} />
                </div>

                {/* Name + type */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-neutral-800 truncate">{item.name}</p>
                  <p className="text-[11px] text-neutral-400 capitalize">{typeLabel}</p>
                </div>

                {/* Mile badge */}
                <span className="text-[11px] font-medium text-neutral-400 flex-shrink-0 tabular-nums">
                  Mi {item.riverMile.toFixed(1)}
                </span>

                {/* Expand chevron */}
                {(item.description || item.npsUrl) && (
                  isExpanded
                    ? <ChevronUp size={14} className="text-neutral-300 flex-shrink-0" />
                    : <ChevronDown size={14} className="text-neutral-300 flex-shrink-0" />
                )}
              </div>

              {/* Expanded detail */}
              {isExpanded && (item.description || item.npsUrl) && (
                <div className="px-3 pb-2.5 pt-0">
                  {item.description && (
                    <p className="text-xs text-neutral-500 leading-relaxed line-clamp-3">{item.description}</p>
                  )}
                  {item.npsUrl && (
                    <a
                      href={item.npsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex items-center gap-1 text-xs text-teal-600 hover:underline mt-1.5"
                    >
                      {(() => {
                        try {
                          const hostname = new URL(item.npsUrl).hostname.replace(/^www\./, '');
                          return `View on ${hostname}`;
                        } catch {
                          return 'View website';
                        }
                      })()}
                    </a>
                  )}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Access Point Detail Card (used in both single and dual selection states)
function AccessPointDetailCard({
  point,
  isPutIn,
  onClear,
  isExpanded,
  onToggleExpand,
  showExpandToggle = true,
  onReportIssue,
}: {
  point: AccessPoint;
  isPutIn: boolean;
  onClear: () => void;
  isExpanded: boolean;
  onToggleExpand: () => void;
  showExpandToggle?: boolean;
  onReportIssue?: () => void;
}) {
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const allImages = [
    ...(point.imageUrls || []),
    ...(point.npsCampground?.images?.map(img => img.url) || []),
  ];
  const hasImages = allImages.length > 0;
  const nps = point.npsCampground;

  const labelColor = isPutIn ? 'bg-support-500' : 'bg-accent-500';
  const labelText = isPutIn ? 'PUT-IN' : 'TAKE-OUT';
  const borderColor = isPutIn ? 'border-support-400' : 'border-accent-400';

  return (
    <div className={`bg-white rounded-xl border-2 ${borderColor} overflow-hidden shadow-md`}>
      {/* Header */}
      <div className="p-3 border-b border-neutral-100">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`px-2 py-0.5 ${labelColor} text-white text-xs font-bold rounded`}>
                {labelText}
              </span>
              <span className="text-xs text-neutral-500">Mile {point.riverMile.toFixed(1)}</span>
            </div>
            <h3 className="font-bold text-neutral-900 text-base mt-1 truncate">{point.name}</h3>
            <p className="text-sm text-neutral-500 capitalize">
              {sortTypes(point.types && point.types.length > 0 ? point.types : [point.type])
                .map(t => t.replace('_', ' '))
                .join(' / ')}
            </p>
          </div>
          <button
            onClick={onClear}
            className="p-1.5 hover:bg-neutral-100 rounded-full flex-shrink-0"
            aria-label="Clear selection"
          >
            <X size={16} className="text-neutral-400" />
          </button>
        </div>
      </div>

      {/* Image */}
      {hasImages && (
        <div className="relative w-full aspect-[16/9] bg-neutral-100">
          <Image
            src={allImages[currentImageIndex]}
            alt={point.name}
            fill
            className="object-cover"
            sizes="(max-width: 768px) 100vw, 33vw"
          />
          {allImages.length > 1 && (
            <>
              <button
                onClick={() => setCurrentImageIndex(i => (i - 1 + allImages.length) % allImages.length)}
                className="absolute left-2 top-1/2 -translate-y-1/2 p-1.5 bg-black/50 text-white rounded-full hover:bg-black/70"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                onClick={() => setCurrentImageIndex(i => (i + 1) % allImages.length)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 bg-black/50 text-white rounded-full hover:bg-black/70"
              >
                <ChevronRight size={16} />
              </button>
              <div className="absolute bottom-2 right-2 px-2 py-0.5 bg-black/60 text-white text-xs rounded">
                {currentImageIndex + 1} / {allImages.length}
              </div>
            </>
          )}
        </div>
      )}

      {/* Description as the expandable toggle (replaces Hide/Show details) */}
      {point.description && showExpandToggle && (
        <button
          onClick={onToggleExpand}
          className="w-full px-3 py-1.5 flex items-center justify-between text-xs hover:bg-neutral-50 border-t border-neutral-100"
        >
          <span className="text-neutral-500 font-medium">Description</span>
          {isExpanded ? <ChevronUp size={14} className="text-neutral-400" /> : <ChevronDown size={14} className="text-neutral-400" />}
        </button>
      )}

      {/* Details Content */}
      {(isExpanded || !showExpandToggle) && (
        <div className="p-3 border-t border-neutral-100">
          {/* Badges - only show non-public and fee */}
          {(!point.isPublic || point.feeRequired) && (
            <div className="flex gap-2 flex-wrap mb-3">
              {!point.isPublic && (
                <span className="px-2 py-0.5 bg-neutral-100 text-neutral-600 text-xs font-medium rounded">Private</span>
              )}
              {point.feeRequired && (
                <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-xs font-medium rounded">Fee Required</span>
              )}
            </div>
          )}

          {/* Description text */}
          {point.description && (
            <p className="text-sm text-neutral-600 mb-3">{point.description}</p>
          )}

          {/* Road Access section */}
          {((point.roadSurface && point.roadSurface.length > 0) || point.roadAccess) && (
            <CollapsibleDetailSection title="Road Access" iconUrl={DETAIL_ICONS.road} defaultOpen={false}>
              <div className="space-y-2">
                {point.roadSurface && point.roadSurface.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 items-center">
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
          {(point.parkingCapacity || point.parkingInfo) && (
            <CollapsibleDetailSection title="Parking" iconUrl={DETAIL_ICONS.parking} defaultOpen={false}>
              <div className="space-y-1.5">
                {point.parkingCapacity && (
                  <span className="text-sm font-medium">{formatParkingCapacity(point.parkingCapacity)}</span>
                )}
                {point.parkingInfo && (
                  <p className="text-sm">{point.parkingInfo}</p>
                )}
              </div>
            </CollapsibleDetailSection>
          )}

          {/* Facilities section (with NPS campground nested inside) */}
          {(point.facilities || nps) && (
            <CollapsibleDetailSection title="Facilities" iconUrl={DETAIL_ICONS.facilities} defaultOpen={false}>
              <div className="space-y-3">
                {point.facilities && (
                  <p>{point.facilities}</p>
                )}

                {/* NPS Campground Info nested inside Facilities */}
                {nps && (
                  <CollapsibleDetailSection title="NPS Campground Info" iconUrl={DETAIL_ICONS.camping} defaultOpen={true}>
                    <div className="space-y-3">
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
                      {nps.reservationUrl && (
                        <a
                          href={nps.reservationUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center justify-between gap-2 p-2 bg-primary-50 rounded-lg hover:bg-primary-100 transition-colors"
                        >
                          <span className="text-sm text-primary-700 font-medium">Reserve on Recreation.gov</span>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-primary-600 flex-shrink-0">
                            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
                          </svg>
                        </a>
                      )}
                      {nps.totalSites > 0 && (
                        <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-sm">
                          <div className="flex justify-between"><span className="text-neutral-500">Total sites</span><span className="font-medium">{nps.totalSites}</span></div>
                          {nps.sitesFirstCome > 0 && <div className="flex justify-between"><span className="text-neutral-500">First-come</span><span className="font-medium">{nps.sitesFirstCome}</span></div>}
                          {nps.sitesReservable > 0 && <div className="flex justify-between"><span className="text-neutral-500">Reservable</span><span className="font-medium">{nps.sitesReservable}</span></div>}
                          {nps.sitesGroup > 0 && <div className="flex justify-between"><span className="text-neutral-500">Group</span><span className="font-medium">{nps.sitesGroup}</span></div>}
                        </div>
                      )}
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
                      {nps.npsUrl && (
                        <a
                          href={nps.npsUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1.5 text-sm text-primary-600 hover:underline"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
                          </svg>
                          View on NPS.gov
                        </a>
                      )}
                    </div>
                  </CollapsibleDetailSection>
                )}
              </div>
            </CollapsibleDetailSection>
          )}

          {/* Nearby Services section */}
          {point.nearbyServices && point.nearbyServices.length > 0 && (
            <CollapsibleDetailSection title="Nearby Services" defaultOpen={false}>
              <div className="space-y-2">
                {point.nearbyServices.map((service: NearbyService, idx: number) => (
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
          {point.localTips && (
            <CollapsibleDetailSection title="Local Tips" defaultOpen={false}>
              <div className="flex items-start gap-2">
                <Lightbulb size={14} className="text-amber-500 mt-0.5 flex-shrink-0" />
                <div
                  className="prose prose-sm max-w-none text-neutral-600"
                  dangerouslySetInnerHTML={{ __html: point.localTips }}
                />
              </div>
            </CollapsibleDetailSection>
          )}
        </div>
      )}

      {/* Navigation Apps - Always visible */}
      <div className="p-3 border-t border-neutral-100">
        <div className="grid grid-cols-4 gap-1.5">
          {generateNavLinks(
            { lat: point.coordinates.lat, lng: point.coordinates.lng, label: point.name },
            point.directionsOverride
          ).map((link: NavLink) => (
            <button
              key={link.app}
              onClick={() => handleNavClick(link, detectPlatform())}
              className="flex flex-col items-center justify-center gap-1 p-2 bg-neutral-50 border border-neutral-200 rounded-lg hover:border-primary-400 hover:bg-primary-50 transition-colors min-h-[56px]"
            >
              <div className="flex items-center justify-center w-6 h-6">
                {NAV_APP_ICONS[link.app] ? (
                  <Image
                    src={NAV_APP_ICONS[link.app]}
                    alt={link.label}
                    width={24}
                    height={24}
                    className="rounded object-contain"
                  />
                ) : (
                  <span className="text-base">{link.icon}</span>
                )}
              </div>
              <span className="text-[10px] font-medium text-neutral-700 text-center">{link.label}</span>
            </button>
          ))}
        </div>

        {/* Report Issue link */}
        {onReportIssue && (
          <div className="mt-2 text-right">
            <button
              onClick={onReportIssue}
              className="inline-flex items-center gap-1 text-xs text-neutral-400 hover:text-accent-500 transition-colors"
            >
              <Flag size={12} />
              Report Issue
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// Single Selection CTA (prompts user to select the other point)
function SelectOtherPointCTA({
  type,
}: {
  type: 'put-in' | 'take-out';
}) {
  return (
    <div className="bg-neutral-50 rounded-xl border-2 border-dashed border-neutral-300 p-6 flex flex-col items-center justify-center text-center min-h-[200px]">
      <div className="w-12 h-12 rounded-full bg-neutral-200 flex items-center justify-center mb-3">
        <span className="text-2xl text-neutral-400">+</span>
      </div>
      <p className="text-sm font-medium text-neutral-600">
        Select a {type}
      </p>
      <p className="text-xs text-neutral-400 mt-1">
        to calculate your float
      </p>
    </div>
  );
}

// Journey Center Section (distance, time, conditions, shuttle)
function JourneyCenter({
  plan,
  isLoading,
  selectedVesselTypeId,
  onVesselChange,
  recalculating,
  pointsAlongRoute = [],
}: {
  plan: FloatPlan;
  isLoading: boolean;
  selectedVesselTypeId: string | null;
  onVesselChange: (id: string) => void;
  recalculating: boolean;
  pointsAlongRoute?: RouteItem[];
}) {
  const { data: vesselTypes } = useVesselTypes();
  const canoeVessel = vesselTypes?.find(v => v.slug === 'canoe');
  const raftVessel = vesselTypes?.find(v => v.slug === 'raft');

  const conditionCode: ConditionCode = plan.condition.code || 'unknown';
  const conditionConfig = CONDITION_CONFIG[conditionCode] || CONDITION_CONFIG.unknown;

  // Check if upstream route
  const isUpstream = plan.putIn.riverMile > plan.takeOut.riverMile;

  return (
    <div className="flex flex-col h-full">
      {/* Vessel Toggle - above estimator */}
      {canoeVessel && raftVessel && (
        <div className="flex justify-center mb-3">
          <div className="inline-flex items-center rounded-lg p-1 border-2 border-neutral-200 bg-neutral-100">
            <button
              onClick={() => onVesselChange(canoeVessel.id)}
              disabled={recalculating}
              className={`px-3 py-1.5 text-sm font-bold rounded-md transition-all ${
                recalculating ? 'opacity-50 cursor-not-allowed' : ''
              } ${
                selectedVesselTypeId === canoeVessel.id
                  ? 'bg-primary-600 text-white shadow-sm'
                  : 'text-neutral-600 hover:bg-neutral-200'
              }`}
            >
              🛶 Canoe
            </button>
            <button
              onClick={() => onVesselChange(raftVessel.id)}
              disabled={recalculating}
              className={`px-3 py-1.5 text-sm font-bold rounded-md transition-all ${
                recalculating ? 'opacity-50 cursor-not-allowed' : ''
              } ${
                selectedVesselTypeId === raftVessel.id
                  ? 'bg-primary-600 text-white shadow-sm'
                  : 'text-neutral-600 hover:bg-neutral-200'
              }`}
            >
              🚣 Raft
            </button>
          </div>
        </div>
      )}

      {/* Float Summary Card */}
      <div className="bg-neutral-50 rounded-xl p-3 mb-3">
        <div className="flex items-center justify-center gap-3 mb-2">
          <div className="w-3 h-3 rounded-full bg-support-500"></div>
          <div className="w-24 h-1 rounded-full bg-gradient-to-r from-support-400 to-accent-400"></div>
          <div className="w-3 h-3 rounded-full bg-accent-500"></div>
        </div>
        <div className="flex items-baseline justify-center gap-3">
          <div className="text-center">
            <p className="text-2xl font-bold text-neutral-900">{plan.distance.formatted}</p>
            <p className="text-[10px] uppercase tracking-wider text-neutral-500">Distance</p>
          </div>
          <span className="text-neutral-300 text-lg">|</span>
          <div className="text-center">
            {isLoading || recalculating ? (
              <div className="flex items-center justify-center h-8">
                <div className="w-4 h-4 border-2 border-primary-500 border-t-transparent rounded-full animate-spin"></div>
              </div>
            ) : (
              <p className="text-2xl font-bold text-neutral-900">{plan.floatTime?.formatted || '--'}</p>
            )}
            <p className="text-[10px] uppercase tracking-wider text-neutral-500 flex items-center gap-0.5">
              Est. Time
              <span className="relative group/tip inline-flex">
                <Info className="w-3 h-3 text-neutral-400 cursor-help" />
                <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5 text-xs text-white bg-neutral-800 rounded-lg shadow-lg w-48 text-center opacity-0 pointer-events-none group-hover/tip:opacity-100 group-hover/tip:pointer-events-auto transition-opacity z-50 normal-case tracking-normal">
                  Estimate reflects continuous paddling and does not account for stops, swimming, or slowdowns.
                </span>
              </span>
            </p>
          </div>
        </div>
      </div>

      {/* Upstream Warning */}
      {isUpstream && (
        <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg mb-3 text-xs">
          <span className="text-red-500">⚠</span>
          <span className="text-red-700 font-medium">Upstream route - you&apos;ll paddle against current</span>
        </div>
      )}

      {/* Conditions - Revamped Card (matching mobile) */}
      <div className={`rounded-2xl overflow-hidden ${conditionConfig.bgClass} mb-3`}>
        {/* Main Status */}
        <div className="px-3 py-2 flex items-center justify-center gap-2">
          <Image
            src={getEddyImageForCondition(conditionCode)}
            alt={conditionConfig.label}
            width={48}
            height={48}
            className="flex-shrink-0"
          />
          <div>
            <p className={`text-lg font-bold ${conditionConfig.textClass}`}>{conditionConfig.label}</p>
            {plan.condition.gaugeName && (
              <p className={`text-[10px] ${conditionConfig.textClass} opacity-75`}>
                {plan.condition.gaugeName}
              </p>
            )}
          </div>
        </div>

        {/* Stats Row */}
        <div className="bg-white rounded-b-2xl px-3 py-2.5">
          <div className="flex items-center justify-around">
            <div className="text-center">
              <p className="text-lg font-bold text-neutral-800">
                {plan.condition.gaugeHeightFt?.toFixed(1) ?? '—'}
              </p>
              <p className="text-[9px] uppercase tracking-wider text-neutral-500 font-medium">Feet</p>
            </div>
            <div className="w-px h-8 bg-neutral-200"></div>
            <div className="text-center">
              <p className="text-lg font-bold text-neutral-800">
                {plan.condition.dischargeCfs?.toLocaleString() ?? '—'}
              </p>
              <p className="text-[9px] uppercase tracking-wider text-neutral-500 font-medium">CFS</p>
            </div>
            {plan.condition.usgsUrl && (
              <>
                <div className="w-px h-8 bg-neutral-200"></div>
                <a
                  href={plan.condition.usgsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex flex-col items-center text-primary-600 hover:text-primary-700"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                    <polyline points="15 3 21 3 21 9"/>
                    <line x1="10" y1="14" x2="21" y2="3"/>
                  </svg>
                  <p className="text-[9px] uppercase tracking-wider font-medium mt-0.5">USGS</p>
                </a>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Shuttle - Minimal button design */}
      <div className="space-y-2">
        <a
          href={(() => {
            const origin = plan.putIn.directionsOverride
              ? encodeURIComponent(plan.putIn.directionsOverride)
              : `${plan.putIn.coordinates.lat},${plan.putIn.coordinates.lng}`;
            const dest = plan.takeOut.directionsOverride
              ? encodeURIComponent(plan.takeOut.directionsOverride)
              : `${plan.takeOut.coordinates.lat},${plan.takeOut.coordinates.lng}`;
            return `https://www.google.com/maps/dir/${origin}/${dest}`;
          })()}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-between w-full px-4 py-2.5 rounded-lg bg-primary-50 hover:bg-primary-100 transition-colors group"
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-primary-600 flex items-center justify-center">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="5" cy="18" r="3"/>
                <circle cx="19" cy="6" r="3"/>
                <path d="M5 15V9a6 6 0 0 1 6-6h0"/>
                <path d="M19 9v6a6 6 0 0 1-6 6h0"/>
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-neutral-800">Shuttle Route</p>
              <p className="text-xs text-neutral-500">View in Google Maps</p>
            </div>
          </div>
          <ChevronRight size={18} className="text-primary-400 group-hover:text-primary-600 transition-colors" />
        </a>
      </div>

      {/* Along Your Route */}
      {pointsAlongRoute.length > 0 && (
        <div className="mt-3">
          <AlongYourRoute items={pointsAlongRoute} />
        </div>
      )}
    </div>
  );
}

// Mobile Bottom Sheet Component
function MobileBottomSheet({
  plan,
  putInPoint,
  takeOutPoint,
  onClearPutIn,
  onClearTakeOut,
  isLoading,
  vesselTypeId,
  onVesselChange,
  onShare,
  onDownloadImage,
  onReportIssue,
  pointsAlongRoute = [],
}: {
  plan: FloatPlan;
  putInPoint: AccessPoint;
  takeOutPoint: AccessPoint;
  onClearPutIn: () => void;
  onClearTakeOut: () => void;
  isLoading: boolean;
  vesselTypeId: string | null;
  onVesselChange: (id: string) => void;
  onShare: () => void;
  onDownloadImage: () => void;
  onReportIssue?: (point: AccessPoint) => void;
  pointsAlongRoute?: RouteItem[];
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [putInExpanded, setPutInExpanded] = useState(false);
  const [takeOutExpanded, setTakeOutExpanded] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startY: number; startHeight: number } | null>(null);
  const [sheetHeight, setSheetHeight] = useState<number | null>(null);

  const { data: vesselTypes } = useVesselTypes();
  const canoeVessel = vesselTypes?.find(v => v.slug === 'canoe');
  const raftVessel = vesselTypes?.find(v => v.slug === 'raft');

  // Heights for the sheet states
  const COLLAPSED_HEIGHT = 65;
  const EXPANDED_HEIGHT = typeof window !== 'undefined' ? window.innerHeight * 0.85 : 600;

  // Reset height when expanded state changes
  useEffect(() => {
    setSheetHeight(isExpanded ? EXPANDED_HEIGHT : COLLAPSED_HEIGHT);
  }, [isExpanded, EXPANDED_HEIGHT]);

  // Handle touch start for drag
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    dragRef.current = {
      startY: touch.clientY,
      startHeight: sheetHeight || (isExpanded ? EXPANDED_HEIGHT : COLLAPSED_HEIGHT),
    };
  }, [sheetHeight, isExpanded, EXPANDED_HEIGHT]);

  // Handle touch move for drag
  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!dragRef.current) return;
    const touch = e.touches[0];
    const deltaY = dragRef.current.startY - touch.clientY;
    const newHeight = Math.max(
      COLLAPSED_HEIGHT,
      Math.min(EXPANDED_HEIGHT, dragRef.current.startHeight + deltaY)
    );
    setSheetHeight(newHeight);
  }, [EXPANDED_HEIGHT]);

  // Handle touch end - snap to collapsed or expanded
  const handleTouchEnd = useCallback(() => {
    if (!dragRef.current || sheetHeight === null) return;
    const threshold = (COLLAPSED_HEIGHT + EXPANDED_HEIGHT) / 2;
    if (sheetHeight > threshold) {
      setIsExpanded(true);
      setSheetHeight(EXPANDED_HEIGHT);
    } else {
      setIsExpanded(false);
      setSheetHeight(COLLAPSED_HEIGHT);
    }
    dragRef.current = null;
  }, [sheetHeight, EXPANDED_HEIGHT]);

  const conditionCode: ConditionCode = plan.condition.code || 'unknown';
  const conditionConfig = CONDITION_CONFIG[conditionCode] || CONDITION_CONFIG.unknown;
  const isUpstream = plan.putIn.riverMile > plan.takeOut.riverMile;

  return (
    <div
      ref={sheetRef}
      className={`fixed bottom-0 left-0 right-0 z-50 rounded-t-3xl shadow-2xl transition-all duration-300 ease-out overflow-hidden lg:hidden ${
        isExpanded
          ? 'bg-white border-t border-neutral-200'
          : 'bg-[#1e3a5f] border-t border-[#2a4d7a]'
      }`}
      style={{ height: sheetHeight || COLLAPSED_HEIGHT }}
    >
      {isExpanded ? (
        <>
          {/* Drag Handle - expanded */}
          <div
            className="flex justify-center py-3 cursor-grab active:cursor-grabbing touch-none"
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onClick={() => setIsExpanded(false)}
          >
            <GripHorizontal size={24} className="text-neutral-300" />
          </div>

          {/* Summary Header - expanded */}
          <div className="px-4 pb-3">
            <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold uppercase tracking-wider text-neutral-500">Float Plan</p>
                <p className="font-bold text-neutral-900 truncate">
                  {putInPoint.name} → {takeOutPoint.name}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                <span className="text-lg font-bold text-neutral-900">{plan.distance.formatted}</span>
                <span className={`px-2 py-1 rounded text-xs font-bold ${conditionConfig.bgClass} ${conditionConfig.textClass}`}>
                  {conditionConfig.label}
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsExpanded(false);
                  }}
                  className="p-1"
                >
                  <ChevronDown size={20} className="text-neutral-900" />
                </button>
              </div>
            </div>
          </div>
        </>
      ) : (
        /* Collapsed: single compact row with drag pill + text + mileage + chevron */
        <div
          className="flex flex-col items-center cursor-grab active:cursor-grabbing touch-none"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onClick={() => setIsExpanded(true)}
        >
          <div className="w-10 h-1 rounded-full bg-white/30 mt-2.5 mb-2" />
          <div className="flex items-center justify-between w-full px-4 pb-2">
            <span className="text-sm font-bold text-white">Your Float Plan</span>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-white/80">{plan.distance.formatted}</span>
              <ChevronUp size={18} className="text-white/70" />
            </div>
          </div>
        </div>
      )}

      {/* Expanded Content */}
      <div className="overflow-y-auto px-4 pb-safe" style={{ height: `calc(100% - 90px)` }}>
        {/* Route Summary with Vessel Toggle */}
        <div className="bg-neutral-50 rounded-xl p-4 mb-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="flex flex-col items-center">
              <div className="w-3 h-3 rounded-full bg-support-500"></div>
              <div className="w-0.5 h-6 bg-gradient-to-b from-support-400 to-accent-400"></div>
              <div className="w-3 h-3 rounded-full bg-accent-500"></div>
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-neutral-700">{putInPoint.name}</p>
              <p className="text-sm font-medium text-neutral-700 mt-1">{takeOutPoint.name}</p>
            </div>
            <div className="text-right">
              <p className="text-xl font-bold text-neutral-900">{plan.distance.formatted}</p>
              <p className="text-sm text-neutral-600">{plan.floatTime?.formatted || '--'}</p>
            </div>
          </div>

          {/* Vessel Toggle */}
          {canoeVessel && raftVessel && (
            <div className="flex justify-center pt-2 border-t border-neutral-200">
              <div className="inline-flex items-center rounded-lg p-1 bg-white border border-neutral-200">
                <button
                  onClick={() => onVesselChange(canoeVessel.id)}
                  disabled={isLoading}
                  className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${
                    isLoading ? 'opacity-50' : ''
                  } ${
                    vesselTypeId === canoeVessel.id
                      ? 'bg-primary-600 text-white'
                      : 'text-neutral-600'
                  }`}
                >
                  🛶 Canoe
                </button>
                <button
                  onClick={() => onVesselChange(raftVessel.id)}
                  disabled={isLoading}
                  className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${
                    isLoading ? 'opacity-50' : ''
                  } ${
                    vesselTypeId === raftVessel.id
                      ? 'bg-primary-600 text-white'
                      : 'text-neutral-600'
                  }`}
                >
                  🚣 Raft
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Upstream Warning */}
        {isUpstream && (
          <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg mb-4 text-xs">
            <span className="text-red-500">⚠</span>
            <span className="text-red-700 font-medium">Upstream route - paddling against current</span>
          </div>
        )}

        {/* 1. Access Point Cards */}
        <div className="space-y-3 mb-4">
          <AccessPointDetailCard
            point={putInPoint}
            isPutIn={true}
            onClear={onClearPutIn}
            isExpanded={putInExpanded}
            onToggleExpand={() => setPutInExpanded(!putInExpanded)}
            onReportIssue={onReportIssue ? () => onReportIssue(putInPoint) : undefined}
          />
          <AccessPointDetailCard
            point={takeOutPoint}
            isPutIn={false}
            onClear={onClearTakeOut}
            isExpanded={takeOutExpanded}
            onToggleExpand={() => setTakeOutExpanded(!takeOutExpanded)}
            onReportIssue={onReportIssue ? () => onReportIssue(takeOutPoint) : undefined}
          />
        </div>

        {/* 2. Shuttle */}
        <div className="space-y-2 mb-4">
          <p className="text-xs font-bold uppercase tracking-wider text-neutral-500 mb-2">Shuttle</p>
          <a
            href={(() => {
              const origin = plan.putIn.directionsOverride
                ? encodeURIComponent(plan.putIn.directionsOverride)
                : `${plan.putIn.coordinates.lat},${plan.putIn.coordinates.lng}`;
              const dest = plan.takeOut.directionsOverride
                ? encodeURIComponent(plan.takeOut.directionsOverride)
                : `${plan.takeOut.coordinates.lat},${plan.takeOut.coordinates.lng}`;
              return `https://www.google.com/maps/dir/${origin}/${dest}`;
            })()}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between w-full px-3 py-2.5 rounded-lg bg-primary-50 hover:bg-primary-100 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="w-7 h-7 rounded-full bg-primary-600 flex items-center justify-center">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="5" cy="18" r="3"/>
                  <circle cx="19" cy="6" r="3"/>
                  <path d="M5 15V9a6 6 0 0 1 6-6h0"/>
                  <path d="M19 9v6a6 6 0 0 1-6 6h0"/>
                </svg>
              </div>
              <span className="text-sm font-medium text-neutral-800">Shuttle Route</span>
            </div>
            <ChevronRight size={16} className="text-primary-400" />
          </a>
        </div>

        {/* Along Your Route */}
        {pointsAlongRoute.length > 0 && (
          <div className="mb-4">
            <AlongYourRoute items={pointsAlongRoute} />
          </div>
        )}

        {/* 3. River Conditions - Revamped Card */}
        <div className="mb-4">
          <p className="text-xs font-bold uppercase tracking-wider text-neutral-500 mb-2">River Conditions</p>
          <div className={`rounded-2xl overflow-hidden ${conditionConfig.bgClass}`}>
            {/* Main Status */}
            <div className="px-4 py-4 text-center">
              <Image
                src={getEddyImageForCondition(conditionCode)}
                alt={conditionConfig.label}
                width={64}
                height={64}
                className="mx-auto mb-2"
              />
              <p className={`text-xl font-bold ${conditionConfig.textClass}`}>{conditionConfig.label}</p>
              {plan.condition.gaugeName && (
                <p className={`text-xs ${conditionConfig.textClass} opacity-75 mt-1`}>
                  {plan.condition.gaugeName}
                </p>
              )}
            </div>

            {/* Stats Row */}
            <div className="bg-white rounded-b-2xl px-4 py-3">
              <div className="flex items-center justify-around">
                <div className="text-center">
                  <p className="text-2xl font-bold text-neutral-800">
                    {plan.condition.gaugeHeightFt?.toFixed(1) ?? '—'}
                  </p>
                  <p className="text-[10px] uppercase tracking-wider text-neutral-500 font-medium">Feet</p>
                </div>
                <div className="w-px h-10 bg-neutral-200"></div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-neutral-800">
                    {plan.condition.dischargeCfs?.toLocaleString() ?? '—'}
                  </p>
                  <p className="text-[10px] uppercase tracking-wider text-neutral-500 font-medium">CFS</p>
                </div>
                {plan.condition.usgsUrl && (
                  <>
                    <div className="w-px h-10 bg-neutral-200"></div>
                    <a
                      href={plan.condition.usgsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex flex-col items-center text-primary-600 hover:text-primary-700"
                    >
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                        <polyline points="15 3 21 3 21 9"/>
                        <line x1="10" y1="14" x2="21" y2="3"/>
                      </svg>
                      <p className="text-[10px] uppercase tracking-wider font-medium mt-1">USGS</p>
                    </a>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Share Buttons */}
        <div className="flex gap-3 pb-4">
          <button
            onClick={onShare}
            className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border-2 border-neutral-200 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
          >
            <Share2 size={16} />
            Share
          </button>
          <button
            onClick={onDownloadImage}
            className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border-2 border-primary-200 bg-primary-50 text-sm font-medium text-primary-700 hover:bg-primary-100"
          >
            <Download size={16} />
            Image
          </button>
        </div>
      </div>
    </div>
  );
}

export default function FloatPlanCard({
  plan,
  isLoading,
  putInPoint,
  takeOutPoint,
  onClearPutIn,
  onClearTakeOut,
  onShare,
  onDownloadImage,
  riverSlug: _riverSlug,
  riverName,
  vesselTypeId,
  onVesselChange,
  captureRef,
  onReportIssue,
  pointsAlongRoute = [],
}: FloatPlanCardProps) {
  // riverSlug reserved for potential future use
  void _riverSlug;
  // Details expanded by default on desktop
  const [putInExpanded, setPutInExpanded] = useState(true);
  const [takeOutExpanded, setTakeOutExpanded] = useState(true);

  // Use parent's plan directly - vessel changes handled by parent
  const displayPlan = plan;

  const hasBothPoints = putInPoint && takeOutPoint;
  const hasSinglePoint = (putInPoint || takeOutPoint) && !hasBothPoints;

  // Single point selected - show card with CTA
  // Always show put-in side (left/top) then take-out side (right/bottom)
  if (hasSinglePoint) {
    const point = putInPoint || takeOutPoint;
    const isPutIn = !!putInPoint;
    const onClear = isPutIn ? onClearPutIn : onClearTakeOut;

    const pointCard = (
      <AccessPointDetailCard
        point={point!}
        isPutIn={isPutIn}
        onClear={onClear}
        isExpanded={true}
        onToggleExpand={() => {}}
        showExpandToggle={false}
        onReportIssue={onReportIssue ? () => onReportIssue(point!) : undefined}
      />
    );

    const ctaCard = (
      <div className="lg:w-48">
        <SelectOtherPointCTA type={isPutIn ? 'take-out' : 'put-in'} />
      </div>
    );

    return (
      <div className="bg-white rounded-2xl border-2 border-neutral-200 shadow-lg overflow-hidden">
        <div className="p-4">
          <div className="grid grid-cols-1 lg:grid-cols-[1fr,auto] gap-4">
            {/* Put-in side always first (left on desktop, top on mobile) */}
            {isPutIn ? pointCard : ctaCard}
            {/* Take-out side always second */}
            {isPutIn ? ctaCard : pointCard}
          </div>
        </div>
      </div>
    );
  }

  // Both points selected but still loading - show skeleton (desktop only)
  if (hasBothPoints && !displayPlan && isLoading) {
    return (
      <div className="hidden lg:block bg-white rounded-2xl border-2 border-neutral-200 shadow-lg overflow-hidden">
        <div className="p-4">
          <div className="grid grid-cols-[1fr,280px,1fr] gap-4">
            {/* Put-in Card Skeleton */}
            <div className="animate-pulse">
              <div className="h-6 bg-neutral-200 rounded w-20 mb-2"></div>
              <div className="h-8 bg-neutral-200 rounded w-3/4 mb-2"></div>
              <div className="h-40 bg-neutral-100 rounded mb-2"></div>
              <div className="h-4 bg-neutral-200 rounded w-1/2"></div>
            </div>

            {/* Journey Center Skeleton */}
            <div className="animate-pulse flex flex-col items-center justify-center">
              <div className="h-4 bg-neutral-200 rounded w-20 mb-2"></div>
              <div className="h-8 bg-neutral-200 rounded w-32 mb-3"></div>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-3 h-3 rounded-full bg-support-200"></div>
                <div className="w-16 h-1 bg-neutral-200 rounded"></div>
                <div className="w-3 h-3 rounded-full bg-accent-200"></div>
              </div>
              <div className="h-10 bg-neutral-200 rounded w-full mb-3"></div>
              <div className="h-24 bg-neutral-100 rounded w-full mb-3"></div>
              <div className="h-12 bg-neutral-100 rounded w-full mb-2"></div>
              <div className="h-12 bg-neutral-100 rounded w-full"></div>
            </div>

            {/* Take-out Card Skeleton */}
            <div className="animate-pulse">
              <div className="h-6 bg-neutral-200 rounded w-20 mb-2"></div>
              <div className="h-8 bg-neutral-200 rounded w-3/4 mb-2"></div>
              <div className="h-40 bg-neutral-100 rounded mb-2"></div>
              <div className="h-4 bg-neutral-200 rounded w-1/2"></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Both points selected - full journey card
  if (hasBothPoints && displayPlan) {
    return (
      <>
        {/* Desktop Layout - hidden on mobile */}
        <div className="hidden lg:block bg-white rounded-2xl border-2 border-neutral-200 shadow-lg overflow-hidden p-4">
          <div className="grid grid-cols-[1fr,280px,1fr] gap-4">
            {/* Put-in Card */}
            <AccessPointDetailCard
              point={putInPoint}
              isPutIn={true}
              onClear={onClearPutIn}
              isExpanded={putInExpanded}
              onToggleExpand={() => setPutInExpanded(!putInExpanded)}
              onReportIssue={onReportIssue ? () => onReportIssue(putInPoint) : undefined}
            />

            {/* Journey Center */}
            <JourneyCenter
              plan={displayPlan}
              isLoading={isLoading}
              selectedVesselTypeId={vesselTypeId}
              onVesselChange={onVesselChange}
              recalculating={isLoading}
              pointsAlongRoute={pointsAlongRoute}
            />

            {/* Take-out Card */}
            <AccessPointDetailCard
              point={takeOutPoint}
              isPutIn={false}
              onClear={onClearTakeOut}
              isExpanded={takeOutExpanded}
              onToggleExpand={() => setTakeOutExpanded(!takeOutExpanded)}
              onReportIssue={onReportIssue ? () => onReportIssue(takeOutPoint) : undefined}
            />
          </div>

          {/* Actions Row */}
          <div className="flex justify-end items-center mt-4 pt-4 border-t border-neutral-100">
            {/* Share Buttons */}
            <div className="flex gap-3">
              <button
                onClick={onShare}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border-2 border-neutral-200 text-sm font-medium text-neutral-700 hover:bg-neutral-50 transition-colors"
              >
                <Share2 size={16} />
                Share Link
              </button>
              <button
                onClick={onDownloadImage}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border-2 border-primary-200 bg-primary-50 text-sm font-medium text-primary-700 hover:bg-primary-100 transition-colors"
            >
              <Download size={16} />
              Download Image
              </button>
            </div>
          </div>

          {/* Hidden capture component for image export */}
          {captureRef && (
            <ShareableCapture
              plan={displayPlan}
              putInPoint={putInPoint}
              takeOutPoint={takeOutPoint}
              riverName={riverName}
              captureRef={captureRef}
            />
          )}
        </div>

        {/* Mobile Bottom Sheet - renders as fixed overlay, outside desktop container */}
        <MobileBottomSheet
          plan={displayPlan}
          putInPoint={putInPoint}
          takeOutPoint={takeOutPoint}
          onClearPutIn={onClearPutIn}
          onClearTakeOut={onClearTakeOut}
          isLoading={isLoading}
          vesselTypeId={vesselTypeId}
          onVesselChange={onVesselChange}
          onShare={onShare}
          onDownloadImage={onDownloadImage}
          onReportIssue={onReportIssue}
          pointsAlongRoute={pointsAlongRoute}
        />
      </>
    );
  }

  // No points selected - return null (parent should handle this state)
  return null;
}
