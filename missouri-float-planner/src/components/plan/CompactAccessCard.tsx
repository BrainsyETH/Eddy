'use client';

// src/components/plan/CompactAccessCard.tsx
// Compact access point card for the plan sidebar — shows key logistics at a glance
// with expandable details for full info

import { useState } from 'react';
import Image from 'next/image';
import { X, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Flag, Lightbulb, Store, Tent, Droplets, Flame } from 'lucide-react';
import type { AccessPoint, NearbyService } from '@/types/api';
import { ACCESS_POINT_TYPE_ORDER } from '@/constants';
import {
  generateNavLinks,
  handleNavClick,
  detectPlatform,
  type NavLink,
} from '@/lib/navigation';

// Navigation app icon URLs
const NAV_APP_ICONS: Record<string, string> = {
  onx: 'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/nav-icons/onx.png',
  gaia: 'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/nav-icons/gaia.jpeg',
  google: 'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/nav-icons/google-maps.png',
  apple: 'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/nav-icons/Apple_Maps_Logo.png',
};

const DETAIL_ICONS = {
  road: 'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/detail-icons/road-icon.png',
  parking: 'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/detail-icons/parking-icon.png',
  facilities: 'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/detail-icons/restroom-icon.png',
  camping: 'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/detail-icons/camping-icon.png',
};

function formatRoadSurface(surface: string): string {
  const mapping: Record<string, string> = {
    'paved': 'Paved',
    'gravel_maintained': 'Gravel',
    'gravel_unmaintained': 'Gravel (rough)',
    'dirt': 'Dirt',
    'seasonal': 'Seasonal',
    '4wd_required': '4WD',
  };
  return mapping[surface] || surface.replace('_', ' ');
}

function formatParkingCapacity(capacity: string | null): string {
  if (!capacity) return 'Unknown';
  const mapping: Record<string, string> = {
    'roadside': 'Roadside',
    'limited': 'Limited',
    'unknown': 'Unknown',
    '50+': '50+',
  };
  if (mapping[capacity]) return mapping[capacity];
  return `${capacity}`;
}

function formatServiceType(type: string): string {
  const mapping: Record<string, string> = {
    'outfitter': 'Outfitter',
    'campground': 'Campground',
    'canoe_rental': 'Canoe Rental',
    'shuttle': 'Shuttle',
    'lodging': 'Lodging',
  };
  return mapping[type] || type.replace('_', ' ');
}

function sortTypes(types: string[]): string[] {
  return [...types].sort((a, b) => {
    const ai = ACCESS_POINT_TYPE_ORDER.indexOf(a as typeof ACCESS_POINT_TYPE_ORDER[number]);
    const bi = ACCESS_POINT_TYPE_ORDER.indexOf(b as typeof ACCESS_POINT_TYPE_ORDER[number]);
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });
}

interface CompactAccessCardProps {
  point: AccessPoint;
  isPutIn: boolean;
  onClear: () => void;
  onReportIssue?: () => void;
}

export default function CompactAccessCard({
  point,
  isPutIn,
  onClear,
  onReportIssue,
}: CompactAccessCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  const labelColor = isPutIn ? 'bg-support-500' : 'bg-accent-500';
  const labelText = isPutIn ? 'PUT-IN' : 'TAKE-OUT';
  const borderColor = isPutIn ? 'border-support-300' : 'border-accent-300';
  const nps = point.npsCampground;

  const allImages = [
    ...(point.imageUrls || []),
    ...(nps?.images?.map(img => img.url) || []),
  ];

  // Build logistics chips
  const logisticsChips: { icon: string; label: string }[] = [];
  if (point.roadSurface && point.roadSurface.length > 0) {
    logisticsChips.push({ icon: '🛣', label: formatRoadSurface(point.roadSurface[0]) });
  }
  if (point.parkingCapacity) {
    logisticsChips.push({ icon: '🅿', label: formatParkingCapacity(point.parkingCapacity) });
  }
  if (nps) {
    logisticsChips.push({ icon: '⛺', label: 'Camp' });
  } else if (point.facilities) {
    const f = point.facilities.toLowerCase();
    if (f.includes('restroom') || f.includes('privy') || f.includes('toilet')) {
      logisticsChips.push({ icon: '🚻', label: 'Restrooms' });
    }
  }
  if (point.feeRequired) {
    logisticsChips.push({ icon: '$', label: 'Fee' });
  }

  return (
    <div className={`bg-white rounded-xl border ${borderColor} overflow-hidden`}>
      {/* Header */}
      <div className="px-3 py-2.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-0.5">
              <span className={`px-1.5 py-0.5 ${labelColor} text-white text-[10px] font-bold rounded`}>
                {labelText}
              </span>
              <span className="text-[11px] text-neutral-400 tabular-nums">Mile {point.riverMile.toFixed(1)}</span>
            </div>
            <h3 className="font-bold text-neutral-900 text-sm leading-tight">{point.name}</h3>
            <p className="text-[11px] text-neutral-400 capitalize">
              {sortTypes(point.types && point.types.length > 0 ? point.types : [point.type])
                .map(t => t.replace('_', ' '))
                .join(' / ')}
            </p>
          </div>
          <button
            onClick={onClear}
            className="p-1 hover:bg-neutral-100 rounded-full flex-shrink-0 -mt-0.5"
            aria-label="Clear selection"
          >
            <X size={14} className="text-neutral-400" />
          </button>
        </div>

        {/* Logistics chips — always visible */}
        {logisticsChips.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {logisticsChips.map((chip, i) => (
              <span key={i} className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-neutral-50 border border-neutral-200 rounded text-[10px] font-medium text-neutral-600">
                <span className="text-[10px]">{chip.icon}</span>
                {chip.label}
              </span>
            ))}
            {!point.isPublic && (
              <span className="inline-flex items-center px-1.5 py-0.5 bg-neutral-100 border border-neutral-200 rounded text-[10px] font-medium text-neutral-500">
                Private
              </span>
            )}
          </div>
        )}

        {/* Nav apps — compact inline row */}
        <div className="flex items-center gap-1 mt-2">
          {generateNavLinks(
            { lat: point.coordinates.lat, lng: point.coordinates.lng, label: point.name },
            point.directionsOverride
          ).map((link: NavLink) => (
            <button
              key={link.app}
              onClick={() => handleNavClick(link, detectPlatform())}
              className="flex items-center justify-center w-7 h-7 bg-neutral-50 border border-neutral-200 rounded-md hover:border-primary-400 hover:bg-primary-50 transition-colors"
              title={link.label}
            >
              {NAV_APP_ICONS[link.app] ? (
                <Image
                  src={NAV_APP_ICONS[link.app]}
                  alt={link.label}
                  width={16}
                  height={16}
                  className="rounded-sm object-contain"
                />
              ) : (
                <span className="text-[10px]">{link.icon}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Expand/collapse toggle */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-center gap-1 py-1.5 text-[11px] font-medium text-neutral-400 hover:text-neutral-600 hover:bg-neutral-50 border-t border-neutral-100 transition-colors"
      >
        {expanded ? <>Less <ChevronUp size={12} /></> : <>More details <ChevronDown size={12} /></>}
      </button>

      {/* Expanded details */}
      {expanded && (
        <div className="border-t border-neutral-100">
          {/* Image carousel */}
          {allImages.length > 0 && (
            <div className="relative w-full aspect-[16/9] bg-neutral-100">
              <Image
                src={allImages[currentImageIndex]}
                alt={point.name}
                fill
                className="object-cover"
                sizes="400px"
              />
              {allImages.length > 1 && (
                <>
                  <button
                    onClick={() => setCurrentImageIndex(i => (i - 1 + allImages.length) % allImages.length)}
                    className="absolute left-1.5 top-1/2 -translate-y-1/2 p-1 bg-black/50 text-white rounded-full hover:bg-black/70"
                  >
                    <ChevronLeft size={14} />
                  </button>
                  <button
                    onClick={() => setCurrentImageIndex(i => (i + 1) % allImages.length)}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 bg-black/50 text-white rounded-full hover:bg-black/70"
                  >
                    <ChevronRight size={14} />
                  </button>
                  <div className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 bg-black/60 text-white text-[10px] rounded">
                    {currentImageIndex + 1} / {allImages.length}
                  </div>
                </>
              )}
            </div>
          )}

          <div className="px-3 py-2.5 space-y-3">
            {/* Description */}
            {point.description && (
              <p className="text-xs text-neutral-600 leading-relaxed">{point.description}</p>
            )}

            {/* Road Access detail */}
            {((point.roadSurface && point.roadSurface.length > 0) || point.roadAccess) && (
              <div>
                <div className="flex items-center gap-1.5 mb-1">
                  <Image src={DETAIL_ICONS.road} alt="" width={12} height={12} />
                  <span className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider">Road Access</span>
                </div>
                {point.roadAccess && (
                  <p className="text-xs text-neutral-600">{point.roadAccess}</p>
                )}
              </div>
            )}

            {/* Parking detail */}
            {(point.parkingCapacity || point.parkingInfo) && (
              <div>
                <div className="flex items-center gap-1.5 mb-1">
                  <Image src={DETAIL_ICONS.parking} alt="" width={12} height={12} />
                  <span className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider">Parking</span>
                </div>
                {point.parkingInfo && (
                  <p className="text-xs text-neutral-600">{point.parkingInfo}</p>
                )}
              </div>
            )}

            {/* Facilities detail */}
            {(point.facilities || nps) && (
              <div>
                <div className="flex items-center gap-1.5 mb-1">
                  <Image src={DETAIL_ICONS.facilities} alt="" width={12} height={12} />
                  <span className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider">Facilities</span>
                </div>
                {point.facilities && (
                  <p className="text-xs text-neutral-600">{point.facilities}</p>
                )}
                {nps && (
                  <div className="mt-1.5 p-2 bg-neutral-50 rounded-lg space-y-1.5">
                    <div className="flex items-center gap-1.5">
                      <Image src={DETAIL_ICONS.camping} alt="" width={12} height={12} />
                      <span className="text-[10px] font-semibold text-neutral-600">NPS Campground</span>
                    </div>
                    {nps.fees.length > 0 && (
                      <div className="space-y-0.5">
                        {nps.fees.map((fee, i) => (
                          <div key={i} className="flex justify-between text-[11px]">
                            <span className="text-neutral-600">{fee.title}</span>
                            <span className="font-semibold">${parseFloat(fee.cost).toFixed(2)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {nps.totalSites > 0 && (
                      <p className="text-[11px] text-neutral-500">
                        {nps.totalSites} sites
                        {nps.sitesFirstCome > 0 && ` · ${nps.sitesFirstCome} first-come`}
                        {nps.sitesReservable > 0 && ` · ${nps.sitesReservable} reservable`}
                      </p>
                    )}
                    <div className="flex flex-wrap gap-1">
                      {nps.amenities.toilets.length > 0 && (
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-white border border-neutral-200 rounded text-[10px] text-neutral-600">
                          <Tent className="w-2.5 h-2.5" />
                          {nps.amenities.toilets.some(t => t.toLowerCase().includes('flush')) ? 'Flush' : 'Vault'}
                        </span>
                      )}
                      {nps.amenities.potableWater.length > 0 && !nps.amenities.potableWater.every(w => w === 'No water') && (
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-white border border-neutral-200 rounded text-[10px] text-neutral-600">
                          <Droplets className="w-2.5 h-2.5" />Water
                        </span>
                      )}
                      {nps.amenities.firewoodForSale === 'Yes' && (
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-white border border-neutral-200 rounded text-[10px] text-neutral-600">
                          <Flame className="w-2.5 h-2.5" />Wood
                        </span>
                      )}
                    </div>
                    {nps.reservationUrl && (
                      <a href={nps.reservationUrl} target="_blank" rel="noopener noreferrer"
                        className="block text-[11px] text-primary-600 hover:underline font-medium">
                        Reserve on Recreation.gov &rarr;
                      </a>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Nearby Services */}
            {point.nearbyServices && point.nearbyServices.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider mb-1">Nearby Services</p>
                <div className="space-y-1">
                  {point.nearbyServices.map((service: NearbyService, idx: number) => (
                    <div key={idx} className="flex items-start gap-1.5 text-[11px]">
                      <Store size={11} className="text-neutral-400 mt-0.5 flex-shrink-0" />
                      <div>
                        <span className="font-medium text-neutral-700">{service.name}</span>
                        <span className="text-neutral-400 ml-1">({formatServiceType(service.type)})</span>
                        {service.phone && (
                          <a href={`tel:${service.phone}`} className="text-primary-600 hover:underline ml-1">{service.phone}</a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Local Tips */}
            {point.localTips && (
              <div>
                <div className="flex items-center gap-1.5 mb-1">
                  <Lightbulb size={12} className="text-amber-500" />
                  <span className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider">Tips</span>
                </div>
                <div
                  className="prose prose-xs max-w-none text-xs text-neutral-600"
                  dangerouslySetInnerHTML={{ __html: point.localTips }}
                />
              </div>
            )}

            {/* Report Issue */}
            {onReportIssue && (
              <button
                onClick={onReportIssue}
                className="inline-flex items-center gap-1 text-[11px] text-neutral-400 hover:text-accent-500 transition-colors"
              >
                <Flag size={10} />
                Report Issue
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
