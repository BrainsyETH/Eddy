'use client';

import { Car, Phone, Globe } from 'lucide-react';
import type { NearbyServiceDirectory } from '@/types/api';
import ShuttleRoute, { type ShuttleEndpoint } from '@/components/plan/ShuttleRoute';

interface ShuttlePanelProps {
  putIn: ShuttleEndpoint;
  takeOut: ShuttleEndpoint;
  services: NearbyServiceDirectory[];
}

/**
 * Shuttle & Logistics, below the planner.
 *
 * This used to print a road distance and drive time of its own from
 * /api/shuttle ("84.74 mi · ~102 min" for a 30-mile Pulltite → Cedargrove
 * shuttle). The plan route and the iOS plan card already decline to print that
 * number — most access points still route from mid-river, and a free-text
 * directions_override could geocode to a different town of the same name — so
 * this was the last surface still showing it. It now hands the drive to Google
 * or Apple Maps, the same as everywhere else.
 */
export default function ShuttlePanel({ putIn, takeOut, services }: ShuttlePanelProps) {
  // Asks the CAPABILITY, not the type — a campground or a lodge that runs a
  // shuttle belongs here, and three of the directory's outfitters do not. This
  // was `'shuttle' as never`, a cast left over from before `servicesOffered`
  // was typed; `ServiceOffering` has covered it for a while. The iOS planner
  // now asks the same question through serviceOffers in @eddy/types, so the two
  // platforms agree about what a shuttle is.
  const shuttleOutfitters = services.filter(s => s.servicesOffered.includes('shuttle'));

  return (
    <div className="bg-white rounded-xl border border-neutral-200 p-4">
      <div className="flex items-center gap-2 mb-3">
        <Car className="w-4 h-4 text-primary-600" />
        <h3 className="text-sm font-semibold text-neutral-900">Shuttle & Logistics</h3>
      </div>

      <ShuttleRoute plan={{ putIn, takeOut }} />

      {/* Shuttle outfitters */}
      {shuttleOutfitters.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-medium text-neutral-500 uppercase tracking-wide mb-2">
            Shuttle providers
          </p>
          <div className="space-y-2">
            {shuttleOutfitters.map(outfitter => (
              <div key={outfitter.id} className="flex items-center justify-between py-1.5">
                <span className="text-sm font-medium text-neutral-800">{outfitter.name}</span>
                <div className="flex items-center gap-2">
                  {outfitter.phone && (
                    <a
                      href={`tel:${outfitter.phone}`}
                      className="flex items-center gap-1 text-xs text-primary-600 hover:text-primary-700"
                    >
                      <Phone className="w-3 h-3" />
                      Call
                    </a>
                  )}
                  {outfitter.website && (
                    <a
                      href={outfitter.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-xs text-neutral-500 hover:text-neutral-700"
                      aria-label={`Visit ${outfitter.name} website (opens in a new tab)`}
                    >
                      <Globe className="w-3 h-3" />
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
