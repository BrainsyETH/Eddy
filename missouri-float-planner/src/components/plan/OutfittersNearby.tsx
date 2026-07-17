'use client';

// src/components/plan/OutfittersNearby.tsx
// "Outfitters near your put-in" — the conversion moment. Once a paddler has
// a put-in, the outfitter POIs already on the map become tap-to-call /
// website cards sorted by distance to that put-in. Contact info comes from
// the OSM import via the pois API (website/phone fields).

import { Sailboat, Phone, Globe } from 'lucide-react';
import { trackEvent } from '@/lib/analytics';
import type { PointOfInterest } from '@/types/nps';
import type { AccessPoint } from '@/types/api';

const MAX_SHOWN = 3;

function distanceKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export default function OutfittersNearby({
  pois,
  putInPoint,
  riverSlug,
}: {
  pois: PointOfInterest[] | undefined;
  putInPoint: AccessPoint | null | undefined;
  riverSlug: string | null;
}) {
  if (!putInPoint || !pois?.length) return null;

  const outfitters = pois
    .filter((p) => p.type === 'outfitter' && p.latitude != null && p.longitude != null)
    .map((p) => ({
      poi: p,
      km: distanceKm(
        putInPoint.coordinates.lat,
        putInPoint.coordinates.lng,
        p.latitude,
        p.longitude,
      ),
    }))
    .sort((a, b) => a.km - b.km)
    .slice(0, MAX_SHOWN);

  if (!outfitters.length) return null;

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-3">
      <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-neutral-500">
        Outfitters near your put-in
      </p>
      <ul className="space-y-2">
        {outfitters.map(({ poi, km }) => (
          <li key={poi.id} className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-full bg-teal-50 text-teal-700">
              <Sailboat className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-neutral-800">
                {poi.name}
              </span>
              <span className="block text-[11px] text-neutral-400">
                {km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`} away
                {poi.riverMile != null ? ` · Mile ${poi.riverMile.toFixed(1)}` : ''}
              </span>
            </span>
            <span className="flex flex-shrink-0 items-center gap-1">
              {poi.phone && (
                <a
                  href={`tel:${poi.phone.replace(/[^+\d]/g, '')}`}
                  onClick={() =>
                    trackEvent('outfitter_tap', { river: riverSlug ?? '', name: poi.name, action: 'call' })
                  }
                  aria-label={`Call ${poi.name}`}
                  className="grid h-8 w-8 place-items-center rounded-lg border border-neutral-200 text-neutral-600 transition-colors hover:border-teal-300 hover:text-teal-700"
                >
                  <Phone className="h-3.5 w-3.5" />
                </a>
              )}
              {poi.website && (
                <a
                  href={poi.website.startsWith('http') ? poi.website : `https://${poi.website}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() =>
                    trackEvent('outfitter_tap', { river: riverSlug ?? '', name: poi.name, action: 'website' })
                  }
                  aria-label={`${poi.name} website`}
                  className="grid h-8 w-8 place-items-center rounded-lg border border-neutral-200 text-neutral-600 transition-colors hover:border-teal-300 hover:text-teal-700"
                >
                  <Globe className="h-3.5 w-3.5" />
                </a>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
