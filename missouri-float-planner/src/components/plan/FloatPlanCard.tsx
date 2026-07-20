'use client';

// src/components/plan/FloatPlanCard.tsx
// Merged journey card showing put-in and take-out side by side with float details

import { useState, useRef, useEffect, useCallback, useId } from 'react';
import Image from 'next/image';
import AccessPointPhoto from '@/components/access-point/AccessPointPhoto';
import { ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Share2, Download, X, GripHorizontal, Flag, Store, Lightbulb, Tent, Droplets, Phone, Flame, Trash2, MapPin, Mountain, Landmark, Eye, CircleDot, Star, Info, Check, AlertTriangle, RefreshCw } from 'lucide-react';
import type { AccessPoint, FloatPlan, ConditionCode, NearbyService } from '@/types/api';
import { useVesselTypes } from '@/hooks/useVesselTypes';
import { formatFloatTimeRangeCompact } from '@/lib/calculations/floatTime';
import PlanFreshnessNotice from '@/components/plan/PlanFreshnessNotice';
import { POI_TYPES, ACCESS_POINT_TYPE_ORDER, CONDITION_SHORT_LABELS } from '@/constants';
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
    case 'flowing':
    case 'good':
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

// Condition display config. Labels come from the canonical condition system
// (CONDITION_SHORT_LABELS → shared/condition-system.ts) so this card can never
// drift from the rest of the app; only the solid-badge color treatment (which is
// specific to this component) is defined locally. Hues match the canonical
// palette (too_low = stone, unknown = neutral/gray).
const CONDITION_CONFIG: Record<ConditionCode, {
  label: string;
  emoji: string;
  bgClass: string;
  textClass: string;
  borderClass: string;
}> = {
  flowing: {
    label: CONDITION_SHORT_LABELS.flowing,
    emoji: '✓',
    bgClass: 'bg-emerald-500',
    textClass: 'text-white',
    borderClass: 'border-emerald-400',
  },
  good: {
    label: CONDITION_SHORT_LABELS.good,
    emoji: '✓',
    bgClass: 'bg-lime-500',
    textClass: 'text-white',
    borderClass: 'border-lime-400',
  },
  low: {
    label: CONDITION_SHORT_LABELS.low,
    emoji: '↓',
    bgClass: 'bg-yellow-500',
    textClass: 'text-neutral-900',
    borderClass: 'border-yellow-400',
  },
  too_low: {
    label: CONDITION_SHORT_LABELS.too_low,
    emoji: '⚠',
    bgClass: 'bg-stone-500',
    textClass: 'text-white',
    borderClass: 'border-stone-400',
  },
  high: {
    label: CONDITION_SHORT_LABELS.high,
    emoji: '⚡',
    bgClass: 'bg-orange-500',
    textClass: 'text-white',
    borderClass: 'border-orange-400',
  },
  dangerous: {
    label: CONDITION_SHORT_LABELS.dangerous,
    emoji: '🚫',
    bgClass: 'bg-red-600',
    textClass: 'text-white',
    borderClass: 'border-red-400',
  },
  unknown: {
    label: CONDITION_SHORT_LABELS.unknown,
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
  isError?: boolean;
  onRetry?: () => void;
  isLastValidFallback?: boolean;
  lastValidAt?: number | null;
  putInPoint: AccessPoint | null;
  takeOutPoint: AccessPoint | null;
  onClearPutIn: () => void;
  onClearTakeOut: () => void;
  onShare: () => void;
  onDownloadImage: () => void;
  shareStatus?: 'idle' | 'copied' | 'saving';
  riverSlug: string;
  riverName?: string;
  vesselTypeId: string | null;
  onVesselChange: (id: string) => void;
  captureRef?: React.RefObject<HTMLDivElement | null>;
  onReportIssue?: (point: AccessPoint) => void;
  pointsAlongRoute?: RouteItem[];
}

// Helper: compact logistics line for share card
function getLogisticsLine(point: AccessPoint): string {
  const parts: string[] = [];
  if (point.roadSurface && point.roadSurface.length > 0) {
    parts.push(formatRoadSurface(point.roadSurface[0]));
  }
  if (point.parkingCapacity) {
    parts.push(formatParkingCapacity(point.parkingCapacity));
  }
  if (point.npsCampground) {
    parts.push('Campground');
  } else if (point.facilities) {
    const f = point.facilities.toLowerCase();
    if (f.includes('restroom') || f.includes('privy') || f.includes('toilet')) parts.push('Restrooms');
    else parts.push('Facilities');
  }
  return parts.join(' · ');
}

// Solid hex fills per condition for the exported card. The on-screen UI uses
// Tailwind classes, but the downloaded image is built with inline styles so
// html2canvas renders the neo-brutalist treatment (solid fills, black borders,
// hard offset shadows) crisply and predictably.
const CAPTURE_CONDITION_STYLE: Record<ConditionCode, { bg: string; text: string }> = {
  flowing: { bg: '#10b981', text: '#ffffff' },
  good: { bg: '#84CC16', text: '#1A3D23' },
  low: { bg: '#EAB308', text: '#2D2A24' },
  too_low: { bg: '#857D70', text: '#ffffff' },
  high: { bg: '#F97316', text: '#ffffff' },
  dangerous: { bg: '#DC2626', text: '#ffffff' },
  unknown: { bg: '#857D70', text: '#ffffff' },
};

// Shareable float card — the branded, downloadable "trip ticket" (captured to
// PNG via html2canvas). Neo-brutalist to match the site: thick black borders,
// hard offset shadows, warm palette, display headings. Rendered off-screen; the
// wrapper padding is deliberate so the inner card's offset shadow is captured.
export function ShareableFloatCard({
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
  captureRef: React.RefObject<HTMLDivElement | null>;
}) {
  const conditionCode: ConditionCode = plan.condition.code || 'unknown';
  const conditionConfig = CONDITION_CONFIG[conditionCode] || CONDITION_CONFIG.unknown;
  const condStyle = CAPTURE_CONDITION_STYLE[conditionCode] || CAPTURE_CONDITION_STYLE.unknown;
  const putInLogistics = getLogisticsLine(putInPoint);
  const takeOutLogistics = getLogisticsLine(takeOutPoint);
  const INK = '#2D2A24'; // neutral-900

  const flowValue = plan.condition.thresholdUnit === 'cfs'
    ? (plan.condition.dischargeCfs != null ? plan.condition.dischargeCfs.toLocaleString() : '—')
    : (plan.condition.gaugeHeightFt != null ? plan.condition.gaugeHeightFt.toFixed(1) : '—');
  const flowUnit = plan.condition.thresholdUnit === 'cfs' ? 'cfs' : 'ft';
  const flowLabel = plan.condition.thresholdUnit === 'cfs' ? 'Flow' : 'Gauge';

  const statTile = (value: string, unit: string | null, label: string) => (
    <div
      style={{
        flex: 1,
        textAlign: 'center',
        padding: '10px 4px',
        background: '#F7F6F3',
        border: `2px solid ${INK}`,
        borderRadius: 10,
        boxShadow: '3px 3px 0 #DBD5CA',
      }}
    >
      <p style={{ fontFamily: 'var(--font-display), system-ui, sans-serif', fontSize: 22, fontWeight: 800, color: INK, lineHeight: 1 }}>
        {value}
        {unit && <span style={{ fontSize: 13, color: '#A49C8E', marginLeft: 2 }}>{unit}</span>}
      </p>
      <p style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: 1, color: '#857D70', fontWeight: 700, marginTop: 5 }}>{label}</p>
    </div>
  );

  return (
    <div
      ref={captureRef}
      className="absolute left-[-9999px] top-0"
      style={{ width: 472, padding: 22, background: '#EDEBE6', fontFamily: 'system-ui, -apple-system, sans-serif' }}
    >
      {/* Inner card with hard offset shadow */}
      <div style={{ background: '#ffffff', border: `3px solid ${INK}`, borderRadius: 16, boxShadow: '8px 8px 0 #0F2D35', overflow: 'hidden' }}>
        {/* Header — solid teal, black bottom border */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            padding: '16px 18px',
            background: '#163F4A',
            borderBottom: `3px solid ${INK}`,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Image
              src={getEddyImageForCondition(conditionCode)}
              alt="Eddy"
              width={44}
              height={44}
              className="object-contain"
            />
            <div>
              <h1 style={{ fontFamily: 'var(--font-display), system-ui, sans-serif', fontSize: 22, fontWeight: 800, color: '#ffffff', lineHeight: 1 }}>
                {riverName || 'Float Plan'}
              </h1>
              <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, color: '#A3D1DB', textTransform: 'uppercase', marginTop: 5 }}>
                eddy.guide
              </p>
            </div>
          </div>
          <div style={{ padding: '6px 12px', background: condStyle.bg, border: `2px solid ${INK}`, borderRadius: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 800, color: condStyle.text, textTransform: 'uppercase', letterSpacing: 0.3 }}>
              {conditionConfig.label}
            </span>
          </div>
        </div>

        {/* Main card body */}
        <div style={{ background: '#ffffff', padding: '16px 18px' }}>
          {/* Stats row */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
            {statTile(plan.distance.formatted, null, 'Distance')}
            {statTile(plan.floatTime?.formatted || '--', null, 'Est. Time')}
            {statTile(flowValue, flowUnit, flowLabel)}
          </div>

          {/* Route with logistics */}
          <div style={{ display: 'flex', alignItems: 'stretch', gap: 12 }}>
            {/* Connector dots */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 6, paddingBottom: 6 }}>
              <div style={{ width: 14, height: 14, borderRadius: 999, background: '#4EB86B', border: `2px solid ${INK}` }} />
              <div style={{ width: 3, flex: 1, background: INK, margin: '4px 0' }} />
              <div style={{ width: 14, height: 14, borderRadius: 999, background: '#F07052', border: `2px solid ${INK}` }} />
            </div>

            {/* Route details */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {/* Put-in */}
              <div style={{ background: '#EDFAF1', border: `2px solid ${INK}`, borderRadius: 10, padding: '10px 12px' }}>
                <p style={{ fontSize: 10, fontWeight: 800, color: '#347A47', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  Put-in · Mile {putInPoint.riverMile.toFixed(1)}
                </p>
                <p style={{ fontWeight: 800, color: INK, fontSize: 15, marginTop: 2 }}>{putInPoint.name}</p>
                {putInLogistics && <p style={{ fontSize: 11, color: '#6B6459', marginTop: 4 }}>{putInLogistics}</p>}
              </div>

              {/* Take-out */}
              <div style={{ background: '#FEF5F3', border: `2px solid ${INK}`, borderRadius: 10, padding: '10px 12px' }}>
                <p style={{ fontSize: 10, fontWeight: 800, color: '#CC3E2B', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  Take-out · Mile {takeOutPoint.riverMile.toFixed(1)}
                </p>
                <p style={{ fontWeight: 800, color: INK, fontSize: 15, marginTop: 2 }}>{takeOutPoint.name}</p>
                {takeOutLogistics && <p style={{ fontSize: 11, color: '#6B6459', marginTop: 4 }}>{takeOutLogistics}</p>}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 18px',
            background: '#F7F6F3',
            borderTop: `3px solid ${INK}`,
          }}
        >
          <p style={{ fontSize: 11, color: '#6B6459', fontWeight: 700 }}>Plan your float at eddy.guide</p>
          {plan.condition.gaugeName && (
            <p style={{ fontSize: 11, color: '#857D70' }}>{plan.condition.gaugeName}</p>
          )}
        </div>
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
  const contentId = useId();

  return (
    <div className="border-t border-neutral-100">
      <button
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-controls={contentId}
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
        <div id={contentId} className="pb-3 text-sm text-neutral-600">
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

// Along Your Route section — shared between desktop, mobile, and sidebar
export function AlongYourRoute({ items }: { items: RouteItem[] }) {
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
              aria-expanded={isExpanded}
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
                {(item.description || item.npsUrl || item.imageUrl) && (
                  isExpanded
                    ? <ChevronUp size={14} className="text-neutral-300 flex-shrink-0" />
                    : <ChevronDown size={14} className="text-neutral-300 flex-shrink-0" />
                )}
              </div>

              {/* Expanded detail */}
              {isExpanded && (item.description || item.npsUrl || item.imageUrl) && (
                <div className="px-3 pb-2.5 pt-0 space-y-2">
                  {item.imageUrl && (
                    <div className="relative w-full aspect-[16/9] rounded-md overflow-hidden bg-neutral-100">
                      <Image
                        src={item.imageUrl}
                        alt={item.name}
                        fill
                        className="object-cover"
                        sizes="350px"
                      />
                    </div>
                  )}
                  {item.description && (
                    <p className="text-xs text-neutral-500 leading-relaxed">{item.description}</p>
                  )}
                  {item.npsUrl && (
                    <a
                      href={item.npsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex items-center gap-1 text-xs text-teal-600 hover:underline"
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
          <AccessPointPhoto
            src={allImages[currentImageIndex]}
            alt={point.name}
            className="absolute inset-0 w-full h-full object-cover"
          />
          {allImages.length > 1 && (
            <>
              <button
                onClick={() => setCurrentImageIndex(i => (i - 1 + allImages.length) % allImages.length)}
                className="absolute left-2 top-1/2 -translate-y-1/2 p-2 bg-black/50 text-white rounded-full hover:bg-black/70"
                aria-label="Previous image"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                onClick={() => setCurrentImageIndex(i => (i + 1) % allImages.length)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-black/50 text-white rounded-full hover:bg-black/70"
                aria-label="Next image"
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
          aria-expanded={isExpanded}
          className="w-full px-3 py-1.5 flex items-center justify-between text-xs hover:bg-neutral-50 border-t border-neutral-100"
        >
          <span className="text-neutral-500 font-medium">Description</span>
          {isExpanded ? <ChevronUp size={14} className="text-neutral-400" /> : <ChevronDown size={14} className="text-neutral-400" />}
        </button>
      )}

      {/* Details Content */}
      {(isExpanded || !showExpandToggle) && (
        <div className="p-3 border-t border-neutral-100">
          {/* Description text */}
          {point.description && (
            <p className="text-sm text-neutral-600 mb-3">{point.description}</p>
          )}

          {/* Access & Facilities — combined section */}
          {((point.roadSurface && point.roadSurface.length > 0) || point.roadAccess || point.parkingCapacity || point.parkingInfo || point.facilities || nps) && (
            <CollapsibleDetailSection title="Access & Facilities" iconUrl={DETAIL_ICONS.road} defaultOpen={true}>
              <div className="space-y-3">
                {/* Road Access */}
                {((point.roadSurface && point.roadSurface.length > 0) || point.roadAccess) && (
                  <div>
                    <div className="flex items-center gap-1.5 mb-1">
                      <Image src={DETAIL_ICONS.road} alt="" width={14} height={14} />
                      <span className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">Road</span>
                    </div>
                    {point.roadSurface && point.roadSurface.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 items-center mb-1">
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
                      <p className="text-sm text-neutral-600">{point.roadAccess}</p>
                    )}
                  </div>
                )}

                {/* Parking */}
                {(point.parkingCapacity || point.parkingInfo) && (
                  <div>
                    <div className="flex items-center gap-1.5 mb-1">
                      <Image src={DETAIL_ICONS.parking} alt="" width={14} height={14} />
                      <span className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">Parking</span>
                    </div>
                    {point.parkingCapacity && (
                      <p className="text-sm font-medium text-neutral-700">{formatParkingCapacity(point.parkingCapacity)}</p>
                    )}
                    {point.parkingInfo && (
                      <p className="text-sm text-neutral-600">{point.parkingInfo}</p>
                    )}
                  </div>
                )}

                {/* Facilities */}
                {(point.facilities || nps) && (
                  <div>
                    <div className="flex items-center gap-1.5 mb-1">
                      <Image src={DETAIL_ICONS.facilities} alt="" width={14} height={14} />
                      <span className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">Facilities</span>
                    </div>
                    {point.facilities && (
                      <p className="text-sm text-neutral-600">{point.facilities}</p>
                    )}

                    {/* NPS Campground Info */}
                    {nps && (
                      <div className="mt-2 p-2.5 bg-neutral-50 rounded-lg space-y-2">
                        <div className="flex items-center gap-1.5">
                          <Image src={DETAIL_ICONS.camping} alt="" width={14} height={14} />
                          <span className="text-xs font-semibold text-neutral-600">NPS Campground</span>
                        </div>
                        {nps.fees.length > 0 && (
                          <div className="space-y-0.5">
                            {nps.fees.map((fee, i) => (
                              <div key={i} className="flex justify-between items-start gap-3">
                                <span className="text-xs text-neutral-600">{fee.title}</span>
                                <span className="text-xs text-neutral-900 font-semibold whitespace-nowrap">
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
                            <span className="text-xs text-primary-700 font-medium">Reserve on Recreation.gov</span>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-primary-600 flex-shrink-0">
                              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
                            </svg>
                          </a>
                        )}
                        {nps.totalSites > 0 && (
                          <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs">
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
                            className="flex items-center gap-1.5 text-xs text-primary-600 hover:underline"
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
                            </svg>
                            View on NPS.gov
                          </a>
                        )}
                      </div>
                    )}
                  </div>
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
                        <span className="font-medium text-sm min-w-0 break-words">{service.name}</span>
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
      <div className="px-3 py-2 border-t border-neutral-100">
        <div className="grid grid-cols-4 gap-1">
          {generateNavLinks(
            { lat: point.coordinates.lat, lng: point.coordinates.lng, label: point.name },
            point.directionsOverride
          ).map((link: NavLink) => (
            <button
              key={link.app}
              onClick={() => handleNavClick(link, detectPlatform())}
              className="flex items-center justify-center gap-1.5 py-1.5 px-1 bg-neutral-50 border border-neutral-200 rounded-md hover:border-primary-400 hover:bg-primary-50 transition-colors"
            >
              <div className="flex items-center justify-center w-4 h-4 flex-shrink-0">
                {NAV_APP_ICONS[link.app] ? (
                  <Image
                    src={NAV_APP_ICONS[link.app]}
                    alt={link.label}
                    width={16}
                    height={16}
                    className="rounded-sm object-contain"
                  />
                ) : (
                  <span className="text-xs">{link.icon}</span>
                )}
              </div>
              <span className="text-[10px] font-medium text-neutral-600">{link.label}</span>
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
              aria-pressed={selectedVesselTypeId === canoeVessel.id}
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
              aria-pressed={selectedVesselTypeId === raftVessel.id}
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

      {/* Float Summary — ONE hero number. The estimator's whole job is
          "how long will this take"; time gets the stage and distance is a
          caption, instead of two equal-weight stats fighting for it. */}
      <div className="bg-neutral-50 rounded-xl px-3 py-3 mb-3 text-center">
        {isLoading || recalculating ? (
          <div className="flex items-center justify-center h-9">
            <div className="w-4 h-4 border-2 border-primary-500 border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : (
          <p className="text-2xl font-bold text-neutral-900 leading-tight tabular-nums">
            {plan.floatTime?.timeRange
              ? formatFloatTimeRangeCompact(plan.floatTime.timeRange.min, plan.floatTime.timeRange.max)
              : plan.floatTime?.formatted || '--'}
          </p>
        )}
        <p className="text-xs text-neutral-500 mt-1 flex items-center justify-center gap-1">
          {plan.distance.formatted} on the water
          <span
            className="relative group/tip inline-flex rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"
            tabIndex={0}
            role="button"
            aria-label="Float time estimate reflects continuous paddling and does not account for stops, swimming, or slowdowns."
          >
            <Info className="w-3 h-3 text-neutral-400 cursor-help" aria-hidden="true" />
            <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5 text-xs text-white bg-neutral-800 rounded-lg shadow-lg w-48 text-center opacity-0 pointer-events-none group-hover/tip:opacity-100 group-hover/tip:pointer-events-auto group-focus-within/tip:opacity-100 transition-opacity z-50 normal-case tracking-normal">
              Estimate reflects continuous paddling and does not account for stops, swimming, or slowdowns.
            </span>
          </span>
        </p>
      </div>

      {/* Upstream Warning */}
      {isUpstream && (
        <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg mb-3 text-xs">
          <span className="text-red-500">⚠</span>
          <span className="text-red-700 font-medium">Upstream route - you&apos;ll paddle against current</span>
        </div>
      )}

      {/* Conditions — one calm strip: the verdict is the message; the
          gauge reading is a single muted line, not a second stats row
          competing with the time estimate above. */}
      <div className={`rounded-xl ${conditionConfig.bgClass} px-3 py-2.5 mb-3 flex items-center gap-2.5`}>
        <Image
          src={getEddyImageForCondition(conditionCode)}
          alt={conditionConfig.label}
          width={40}
          height={40}
          className="flex-shrink-0"
        />
        <div className="min-w-0 flex-1">
          <p className={`text-sm font-bold ${conditionConfig.textClass}`}>{conditionConfig.label}</p>
          <p className={`text-[11px] ${conditionConfig.textClass} opacity-80 truncate`}>
            {[
              plan.condition.gaugeHeightFt != null ? `${plan.condition.gaugeHeightFt.toFixed(1)} ft` : null,
              plan.condition.dischargeCfs != null ? `${plan.condition.dischargeCfs.toLocaleString()} cfs` : null,
              plan.condition.gaugeName || null,
            ]
              .filter(Boolean)
              .join(' · ') || 'No live gauge reading'}
          </p>
        </div>
        {plan.condition.usgsUrl && (
          <a
            href={plan.condition.usgsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={`flex-shrink-0 text-[10px] font-bold uppercase tracking-wider ${conditionConfig.textClass} underline-offset-2 hover:underline`}
          >
            USGS ↗
          </a>
        )}
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
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M7 17m-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0"/>
                <path d="M17 17m-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0"/>
                <path d="M5 17H3v-6l2-5h9l4 5h1a2 2 0 0 1 2 2v4h-2m-4 0H9"/>
                <path d="M14 6l-4 5h9"/>
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-neutral-800">Drive Route</p>
              <p className="text-xs text-neutral-500">View in Google Maps</p>
            </div>
          </div>
          <ChevronRight size={18} className="text-primary-400 group-hover:text-primary-600 transition-colors" />
        </a>
      </div>

      {/* Road Access Warnings */}
      {plan.warnings.length > 0 && (
        <div className="space-y-1 mt-3">
          {plan.warnings.map((warning, idx) => (
            <p key={idx} className="text-xs text-red-600 flex items-center gap-1">
              <span>⚠</span> {warning}
            </p>
          ))}
        </div>
      )}

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
  shareStatus = 'idle',
  onReportIssue,
  pointsAlongRoute = [],
  isLastValidFallback = false,
  lastValidAt = null,
  onRetry,
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
  shareStatus?: 'idle' | 'copied' | 'saving';
  onReportIssue?: (point: AccessPoint) => void;
  pointsAlongRoute?: RouteItem[];
  isLastValidFallback?: boolean;
  lastValidAt?: number | null;
  onRetry?: () => void;
}) {
  // Three snap points instead of two: 'peek' keeps the route summary and
  // vessel toggle on screen while most of the map (and the drawn route) stays
  // visible — the state users actually want while deciding on a float.
  type SheetState = 'collapsed' | 'peek' | 'expanded';
  // Lead with the decision on phones. Peek keeps enough map visible for
  // orientation while exposing time, distance, and endpoints immediately.
  const [sheetState, setSheetState] = useState<SheetState>('peek');
  const [putInExpanded, setPutInExpanded] = useState(false);
  const [takeOutExpanded, setTakeOutExpanded] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    startY: number;
    startHeight: number;
    lastY: number;
    lastT: number;
    vUp: number; // smoothed upward velocity, px/ms (+ = dragging up)
    moved: boolean;
  } | null>(null);
  // Set on release when the gesture actually dragged, so the synthetic click
  // that follows a touch can't also fire the tap handlers and override the snap
  // (this double-handling was a big part of the "takes two actions" feel).
  const suppressClickRef = useRef(false);
  const [sheetHeight, setSheetHeight] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const { data: vesselTypes } = useVesselTypes();
  const canoeVessel = vesselTypes?.find(v => v.slug === 'canoe');
  const raftVessel = vesselTypes?.find(v => v.slug === 'raft');

  // Heights for the sheet states (window.innerHeight tracks the visual
  // viewport, so browser-toolbar collapse is already accounted for)
  const COLLAPSED_HEIGHT = 65;
  const PEEK_HEIGHT = typeof window !== 'undefined' ? Math.round(window.innerHeight * 0.42) : 320;
  const EXPANDED_HEIGHT = typeof window !== 'undefined' ? Math.round(window.innerHeight * 0.85) : 600;

  const heightFor = useCallback((state: SheetState) => (
    state === 'expanded' ? EXPANDED_HEIGHT : state === 'peek' ? PEEK_HEIGHT : COLLAPSED_HEIGHT
  ), [EXPANDED_HEIGHT, PEEK_HEIGHT]);

  // Reset height when the snap state changes
  useEffect(() => {
    setSheetHeight(heightFor(sheetState));
  }, [sheetState, heightFor]);

  // Handle touch start for drag
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    // Clear any stale suppression from a prior gesture whose synthetic click
    // never arrived, so this new tap isn't wrongly swallowed.
    suppressClickRef.current = false;
    setIsDragging(true);
    dragRef.current = {
      startY: touch.clientY,
      startHeight: sheetHeight ?? heightFor(sheetState),
      lastY: touch.clientY,
      lastT: e.timeStamp,
      vUp: 0,
      moved: false,
    };
  }, [sheetHeight, sheetState, heightFor]);

  // Handle touch move for drag — track velocity so the release can tell a
  // deliberate flick from a slow drag.
  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    const touch = e.touches[0];
    const deltaY = drag.startY - touch.clientY;
    if (Math.abs(deltaY) > 6) drag.moved = true;

    // Instantaneous upward velocity, lightly smoothed so one jittery sample
    // can't dominate the flick decision on release.
    const dt = e.timeStamp - drag.lastT;
    if (dt > 0) {
      const vUp = (drag.lastY - touch.clientY) / dt;
      drag.vUp = drag.vUp * 0.4 + vUp * 0.6;
    }
    drag.lastY = touch.clientY;
    drag.lastT = e.timeStamp;

    const newHeight = Math.max(
      COLLAPSED_HEIGHT,
      Math.min(EXPANDED_HEIGHT, drag.startHeight + deltaY)
    );
    setSheetHeight(newHeight);
  }, [EXPANDED_HEIGHT]);

  // Handle touch end — velocity-aware snap. A confident flick travels all the
  // way in its direction (collapsed → expanded in ONE gesture); a gentle
  // release settles to the nearest snap after a little momentum carry.
  const handleTouchEnd = useCallback(() => {
    setIsDragging(false);
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag || sheetHeight === null) return;
    // A real drag must not also be treated as a tap by the click handlers.
    if (drag.moved) suppressClickRef.current = true;

    const order: SheetState[] = ['collapsed', 'peek', 'expanded'];
    const STRONG_FLICK = 0.6; // px/ms — decisive flick opens/closes fully
    const PROJECTION_MS = 90;  // momentum carry for gentle releases

    let target: SheetState;
    if (Math.abs(drag.vUp) >= STRONG_FLICK) {
      target = drag.vUp > 0 ? 'expanded' : 'collapsed';
    } else {
      const projected = sheetHeight + drag.vUp * PROJECTION_MS;
      target = order.reduce((best, s) =>
        Math.abs(heightFor(s) - projected) < Math.abs(heightFor(best) - projected) ? s : best
      );
    }
    setSheetState(target);
    setSheetHeight(heightFor(target));
  }, [sheetHeight, heightFor]);

  // Tap handlers that must yield to a preceding drag (see suppressClickRef).
  const handleTapToState = useCallback((state: SheetState) => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    setSheetState(state);
  }, []);

  const isOpen = sheetState !== 'collapsed';

  const conditionCode: ConditionCode = plan.condition.code || 'unknown';
  const conditionConfig = CONDITION_CONFIG[conditionCode] || CONDITION_CONFIG.unknown;
  const isUpstream = plan.putIn.riverMile > plan.takeOut.riverMile;

  const compactTime = plan.floatTime
    ? plan.floatTime.timeRange
      ? formatFloatTimeRangeCompact(plan.floatTime.timeRange.min, plan.floatTime.timeRange.max)
      : formatFloatTimeRangeCompact(plan.floatTime.minutes, plan.floatTime.minutes)
    : null;

  return (
    <div
      ref={sheetRef}
      data-plan-sheet
      role="region"
      aria-labelledby="mobile-float-plan-title"
      aria-busy={isLoading}
      // z-40: below the site header menu, river picker, photo/feedback modals,
      // and fullscreen map (all z-50) — the sheet used to win those ties by
      // DOM order and drew over every one of them.
      className={`fixed bottom-0 left-0 right-0 z-40 rounded-t-3xl shadow-2xl overflow-hidden lg:hidden ${
        isOpen
          ? 'bg-white border-t border-neutral-200'
          : 'bg-[#1e3a5f] border-t border-[#2a4d7a]'
      }`}
      // Safe-area inset keeps the sheet clear of the home indicator / gesture bar.
      // While dragging, height tracks the finger 1:1 (no transition); on release
      // a springy ease settles it to the snap for a fluid slide instead of a
      // linear glide.
      style={{
        height: `calc(${sheetHeight ?? COLLAPSED_HEIGHT}px + env(safe-area-inset-bottom, 0px))`,
        transition: isDragging
          ? 'none'
          : 'height 380ms cubic-bezier(0.22, 1, 0.36, 1), background-color 260ms ease-out, border-color 260ms ease-out',
        willChange: 'height',
      }}
    >
      {isOpen ? (
        <>
          {/* Drag Handle - open */}
          <div
            className="flex justify-center py-3 cursor-grab active:cursor-grabbing touch-none"
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onTouchCancel={handleTouchEnd}
            onClick={() => handleTapToState('collapsed')}
          >
            <GripHorizontal size={24} className="text-neutral-300" />
          </div>

          {/* Title row. Deliberately minimal: route names, distance, and time
              live ONCE in the route summary card below, not repeated here. */}
          <div className="px-4 pb-3">
            <div className="flex items-center justify-between">
              <h2 id="mobile-float-plan-title" className="text-xs font-bold uppercase tracking-wider text-neutral-500">Float Plan</h2>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className={`px-2 py-1 rounded text-xs font-bold ${conditionConfig.bgClass} ${conditionConfig.textClass}`}>
                  {conditionConfig.label}
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setSheetState(sheetState === 'peek' ? 'expanded' : 'collapsed');
                  }}
                  aria-label={sheetState === 'peek' ? 'Expand float plan' : 'Collapse float plan'}
                  aria-expanded={true}
                  className="p-1"
                >
                  {sheetState === 'peek'
                    ? <ChevronUp size={20} className="text-neutral-900" />
                    : <ChevronDown size={20} className="text-neutral-900" />}
                </button>
              </div>
            </div>
          </div>
        </>
      ) : (
        /* Collapsed: single compact row with drag pill + text + mileage + chevron */
        <div
          role="button"
          tabIndex={0}
          aria-expanded={false}
          aria-label="Expand float plan"
          className="flex flex-col items-center cursor-grab active:cursor-grabbing touch-none"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onTouchCancel={handleTouchEnd}
          onClick={() => handleTapToState('peek')}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setSheetState('peek');
            }
          }}
        >
          <div className="w-10 h-1 rounded-full bg-white/30 mt-2.5 mb-2" />
          <div className="flex items-center justify-between w-full px-4 pb-2">
            <span className="text-sm font-bold text-white">Your Float Plan</span>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-white/80">
                {plan.distance.miles} mi{compactTime ? ` · ${compactTime}` : ''}
              </span>
              <ChevronUp size={18} className="text-white/70" />
            </div>
          </div>
        </div>
      )}

      {/* Sheet Content (peek shows the route summary; scroll for the rest) */}
      <div className="overflow-y-auto px-4 pb-safe" style={{ height: `calc(100% - 84px)` }}>
        {isLastValidFallback && lastValidAt ? (
          <div className="mb-3">
            <PlanFreshnessNotice savedAt={lastValidAt} isChecking={isLoading} onRetry={onRetry} />
          </div>
        ) : isLoading && (
          <div
            role="status"
            aria-live="polite"
            className="mb-3 flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-900"
          >
            <RefreshCw className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 animate-spin" aria-hidden="true" />
            <span><strong>Updating this plan.</strong> Previous values are shown only for reference until the new calculation finishes.</span>
          </div>
        )}
        {/* Route Summary with Vessel Toggle */}
        <div className={`bg-neutral-50 rounded-xl p-3 mb-4 transition-opacity ${isLoading ? 'opacity-60' : ''}`}>
          <div className="flex items-center gap-3 mb-2">
            <div className="flex flex-col items-center">
              <div className="w-2.5 h-2.5 rounded-full bg-support-500"></div>
              <div className="w-0.5 h-5 bg-gradient-to-b from-support-400 to-accent-400"></div>
              <div className="w-2.5 h-2.5 rounded-full bg-accent-500"></div>
            </div>
            <div className="flex-1">
              <p className="text-xs font-medium text-neutral-700">{putInPoint.name}</p>
              <p className="text-xs font-medium text-neutral-700 mt-0.5">{takeOutPoint.name}</p>
            </div>
            <div className="text-right">
              {/* Time leads — it's the number a paddler is here for. */}
              <p className="text-lg font-bold text-neutral-900 tabular-nums">{compactTime || '--'}</p>
              <p className="text-xs text-neutral-600">{plan.distance.formatted}</p>
            </div>
          </div>

          {/* Vessel Toggle */}
          {canoeVessel && raftVessel && (
            <div className="flex justify-center pt-2 border-t border-neutral-200">
              <div className="inline-flex items-center rounded-lg p-1 bg-white border border-neutral-200">
                <button
                  onClick={() => onVesselChange(canoeVessel.id)}
                  disabled={isLoading}
                  aria-pressed={vesselTypeId === canoeVessel.id}
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
                  aria-pressed={vesselTypeId === raftVessel.id}
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
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M7 17m-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0"/>
                  <path d="M17 17m-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0"/>
                  <path d="M5 17H3v-6l2-5h9l4 5h1a2 2 0 0 1 2 2v4h-2m-4 0H9"/>
                  <path d="M14 6l-4 5h9"/>
                </svg>
              </div>
              <span className="text-sm font-medium text-neutral-800">Drive Route</span>
            </div>
            <ChevronRight size={16} className="text-primary-400" />
          </a>
        </div>

        {/* Road Access Warnings */}
        {plan.warnings.length > 0 && (
          <div className="space-y-1 mb-4">
            {plan.warnings.map((warning, idx) => (
              <p key={idx} className="text-xs text-red-600 flex items-center gap-1">
                <span>⚠</span> {warning}
              </p>
            ))}
          </div>
        )}

        {/* Along Your Route */}
        {pointsAlongRoute.length > 0 && (
          <div className="mb-4">
            <AlongYourRoute items={pointsAlongRoute} />
          </div>
        )}

        {/* 3. River Conditions — one calm strip (matches desktop): verdict
            first, the gauge reading as a single muted line instead of a
            row of oversized numbers. */}
        <div className="mb-4">
          <p className="text-xs font-bold uppercase tracking-wider text-neutral-500 mb-2">River Conditions</p>
          <div className={`rounded-xl ${conditionConfig.bgClass} px-3 py-3 flex items-center gap-3`}>
            <Image
              src={getEddyImageForCondition(conditionCode)}
              alt={conditionConfig.label}
              width={44}
              height={44}
              className="flex-shrink-0"
            />
            <div className="min-w-0 flex-1">
              <p className={`text-base font-bold ${conditionConfig.textClass}`}>{conditionConfig.label}</p>
              <p className={`text-xs ${conditionConfig.textClass} opacity-80 truncate`}>
                {[
                  plan.condition.gaugeHeightFt != null ? `${plan.condition.gaugeHeightFt.toFixed(1)} ft` : null,
                  plan.condition.dischargeCfs != null ? `${plan.condition.dischargeCfs.toLocaleString()} cfs` : null,
                  plan.condition.gaugeName || null,
                ]
                  .filter(Boolean)
                  .join(' · ') || 'No live gauge reading'}
              </p>
            </div>
            {plan.condition.usgsUrl && (
              <a
                href={plan.condition.usgsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={`flex-shrink-0 text-[10px] font-bold uppercase tracking-wider ${conditionConfig.textClass} underline-offset-2 hover:underline`}
              >
                USGS ↗
              </a>
            )}
          </div>
        </div>

        {/* Share Buttons */}
        {!isLastValidFallback && <div className="flex gap-3 pb-4">
          <button
            onClick={onShare}
            className={`flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border-2 text-sm font-medium transition-colors ${
              shareStatus === 'copied'
                ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                : 'border-neutral-200 text-neutral-700 hover:bg-neutral-50'
            }`}
          >
            {shareStatus === 'copied' ? <Check size={16} /> : <Share2 size={16} />}
            {shareStatus === 'copied' ? 'Copied!' : 'Share'}
          </button>
          <button
            onClick={onDownloadImage}
            className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border-2 border-primary-200 bg-primary-50 text-sm font-medium text-primary-700 hover:bg-primary-100"
          >
            <Download size={16} />
            Image
          </button>
        </div>}
      </div>
    </div>
  );
}

export default function FloatPlanCard({
  plan,
  isLoading,
  isError = false,
  onRetry,
  isLastValidFallback = false,
  lastValidAt = null,
  putInPoint,
  takeOutPoint,
  onClearPutIn,
  onClearTakeOut,
  onShare,
  onDownloadImage,
  shareStatus = 'idle',
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

  // Both points selected but the plan calculation failed (commonly a dropped
  // rural connection) - show a compact, recoverable error instead of nothing.
  if (hasBothPoints && !displayPlan && isError) {
    return (
      <div
        role="alert"
        className="bg-white rounded-2xl border-2 border-red-200 shadow-lg overflow-hidden p-4 flex items-center gap-3"
      >
        <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-red-800">Couldn&apos;t calculate your float plan</p>
          <p className="text-xs text-red-600">Check your connection and try again.</p>
        </div>
        {onRetry && (
          <button
            onClick={onRetry}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 transition-colors flex-shrink-0"
          >
            <RefreshCw className="w-4 h-4" aria-hidden="true" />
            Try again
          </button>
        )}
      </div>
    );
  }

  // Both points selected but still loading - show skeleton
  if (hasBothPoints && !displayPlan && isLoading) {
    return (
      <>
        {/* Mobile skeleton — the desktop grid below is hidden on small screens,
            so without this the bottom sheet stays empty during the plan fetch. */}
        <div className="lg:hidden bg-white rounded-2xl border-2 border-neutral-200 shadow-lg overflow-hidden animate-pulse" role="status" aria-label="Calculating your float plan">
          <div className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="h-5 bg-neutral-200 rounded w-24"></div>
              <div className="h-5 bg-neutral-200 rounded w-16"></div>
            </div>
            <div className="h-8 bg-neutral-200 rounded w-40"></div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-support-200"></div>
              <div className="flex-1 h-1 bg-neutral-200 rounded"></div>
              <div className="w-3 h-3 rounded-full bg-accent-200"></div>
            </div>
            <div className="h-12 bg-neutral-100 rounded w-full"></div>
            <span className="sr-only">Calculating your float plan…</span>
          </div>
        </div>

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
      </>
    );
  }

  // Both points selected - full journey card
  if (hasBothPoints && displayPlan) {
    return (
      <>
        {/* Desktop Layout - hidden on mobile */}
        <div className="hidden lg:block bg-white rounded-2xl border-2 border-neutral-200 shadow-lg overflow-hidden p-4">
          {isLastValidFallback && lastValidAt && (
            <div className="mb-4">
              <PlanFreshnessNotice savedAt={lastValidAt} isChecking={isLoading} onRetry={onRetry} />
            </div>
          )}
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
          {!isLastValidFallback && <div className="flex justify-end items-center mt-4 pt-4 border-t border-neutral-100">
            {/* Share Buttons */}
            <div className="flex gap-3">
              <button
                onClick={onShare}
                disabled={shareStatus === 'saving'}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg border-2 text-sm font-medium transition-colors ${
                  shareStatus === 'copied'
                    ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                    : 'border-neutral-200 text-neutral-700 hover:bg-neutral-50'
                } ${shareStatus === 'saving' ? 'opacity-70 cursor-wait' : ''}`}
              >
                {shareStatus === 'saving'
                  ? <span className="w-4 h-4 border-2 border-neutral-400 border-t-transparent rounded-full animate-spin" />
                  : shareStatus === 'copied' ? <Check size={16} /> : <Share2 size={16} />}
                {shareStatus === 'saving' ? 'Saving…' : shareStatus === 'copied' ? 'Copied!' : 'Share Link'}
              </button>
              <button
                onClick={onDownloadImage}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border-2 border-primary-200 bg-primary-50 text-sm font-medium text-primary-700 hover:bg-primary-100 transition-colors"
            >
              <Download size={16} />
              Download Image
              </button>
            </div>
          </div>}

          {/* Hidden capture component for image export */}
          {captureRef && !isLastValidFallback && (
            <ShareableFloatCard
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
          shareStatus={shareStatus}
          onReportIssue={onReportIssue}
          pointsAlongRoute={pointsAlongRoute}
          isLastValidFallback={isLastValidFallback}
          lastValidAt={lastValidAt}
          onRetry={onRetry}
        />
      </>
    );
  }

  // No points selected - return null (parent should handle this state)
  return null;
}
