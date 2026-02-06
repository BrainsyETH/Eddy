'use client';

// src/components/plan/DirectionsLinks.tsx
// Navigation links for put-in and shuttle routes

import { ChevronRight, MapPin } from 'lucide-react';
import type { AccessPoint } from '@/types/api';

interface DirectionsLinksProps {
  putIn: AccessPoint;
  takeOut: AccessPoint;
  compact?: boolean;
}

function getDirectionsUrl(point: AccessPoint): string {
  if (point.directionsOverride) {
    return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(point.directionsOverride)}`;
  }
  return `https://www.google.com/maps/dir/?api=1&destination=${point.coordinates.lat},${point.coordinates.lng}`;
}

function getShuttleUrl(putIn: AccessPoint, takeOut: AccessPoint): string {
  const origin = putIn.directionsOverride
    ? encodeURIComponent(putIn.directionsOverride)
    : `${putIn.coordinates.lat},${putIn.coordinates.lng}`;
  const dest = takeOut.directionsOverride
    ? encodeURIComponent(takeOut.directionsOverride)
    : `${takeOut.coordinates.lat},${takeOut.coordinates.lng}`;
  return `https://www.google.com/maps/dir/${origin}/${dest}`;
}

export default function DirectionsLinks({ putIn, takeOut, compact = false }: DirectionsLinksProps) {
  const iconSize = compact ? 12 : 14;
  const circleSize = compact ? 'w-7 h-7' : 'w-8 h-8';
  const padding = compact ? 'px-3 py-2.5' : 'px-4 py-2.5';
  const textSize = compact ? 'text-sm' : 'text-sm';

  return (
    <div className="space-y-2">
      <a
        href={getDirectionsUrl(putIn)}
        target="_blank"
        rel="noopener noreferrer"
        className={`flex items-center justify-between w-full ${padding} rounded-lg bg-neutral-100 hover:bg-neutral-200 transition-colors group`}
      >
        <div className="flex items-center gap-3">
          <div className={`${circleSize} rounded-full bg-support-500 flex items-center justify-center`}>
            <MapPin size={iconSize} className="text-white" />
          </div>
          <div>
            <p className={`${textSize} font-semibold text-neutral-800`}>Directions to Put-in</p>
            {!compact && <p className="text-xs text-neutral-500">Opens in Google Maps</p>}
          </div>
        </div>
        <ChevronRight size={compact ? 16 : 18} className="text-neutral-400 group-hover:text-neutral-600 transition-colors" />
      </a>

      <a
        href={getShuttleUrl(putIn, takeOut)}
        target="_blank"
        rel="noopener noreferrer"
        className={`flex items-center justify-between w-full ${padding} rounded-lg bg-primary-50 hover:bg-primary-100 transition-colors group`}
      >
        <div className="flex items-center gap-3">
          <div className={`${circleSize} rounded-full bg-primary-600 flex items-center justify-center`}>
            <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="5" cy="18" r="3"/>
              <circle cx="19" cy="6" r="3"/>
              <path d="M5 15V9a6 6 0 0 1 6-6h0"/>
              <path d="M19 9v6a6 6 0 0 1-6 6h0"/>
            </svg>
          </div>
          <div>
            <p className={`${textSize} font-semibold text-neutral-800`}>Shuttle Route</p>
            {!compact && <p className="text-xs text-neutral-500">View in Google Maps</p>}
          </div>
        </div>
        <ChevronRight size={compact ? 16 : 18} className="text-primary-400 group-hover:text-primary-600 transition-colors" />
      </a>
    </div>
  );
}
