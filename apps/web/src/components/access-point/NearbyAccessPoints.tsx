// src/components/access-point/NearbyAccessPoints.tsx
// Shows upstream and downstream access points

import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import type { NearbyAccessPoint } from '@/types/api';

interface NearbyAccessPointsProps {
  accessPoints: NearbyAccessPoint[];
  riverSlug: string;
  riverName: string;
}

export default function NearbyAccessPoints({
  accessPoints,
  riverSlug,
  riverName,
}: NearbyAccessPointsProps) {
  return (
    <div className="bg-white rounded-xl border border-neutral-200 shadow-sm overflow-hidden p-4">
      <h3 className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-3">
        Nearby on {riverName}
      </h3>

      <div className="space-y-2">
        {accessPoints.map((ap) => (
          <Link
            key={ap.id}
            href={`/rivers/${riverSlug}/access/${ap.slug}`}
            className="flex items-center gap-3 p-2.5 -mx-2 rounded-lg hover:bg-neutral-50 transition-colors"
          >
            <div
              className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm ${
                ap.direction === 'upstream'
                  ? 'bg-blue-100 text-blue-700'
                  : 'bg-emerald-100 text-emerald-700'
              }`}
            >
              {ap.direction === 'upstream' ? '↑' : '↓'}
            </div>

            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-neutral-900 truncate">
                {ap.name}
              </div>
              <div className="text-xs text-neutral-500">
                {ap.direction === 'upstream' ? 'Upstream' : 'Downstream'} ·{' '}
                {ap.distanceMiles} mi
                {ap.estimatedFloatTime && ` · ${ap.estimatedFloatTime}`}
              </div>
            </div>

            <ChevronRight className="w-4 h-4 text-neutral-400 flex-shrink-0" />
          </Link>
        ))}
      </div>
    </div>
  );
}
