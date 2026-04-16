'use client';

import { useQuery } from '@tanstack/react-query';
import { Car, Phone, Globe, Loader2 } from 'lucide-react';
import type { NearbyServiceDirectory } from '@/types/api';

interface ShuttlePanelProps {
  putInId: string;
  takeOutId: string;
  putInName: string;
  takeOutName: string;
  services: NearbyServiceDirectory[];
}

interface ShuttleResponse {
  available: boolean;
  miles?: number;
  minutes?: number;
  routeSummary?: string;
}

function useShuttleDistance(putInId: string, takeOutId: string) {
  return useQuery<ShuttleResponse>({
    queryKey: ['shuttle-distance', putInId, takeOutId],
    queryFn: async () => {
      const res = await fetch(`/api/shuttle?putInId=${putInId}&takeOutId=${takeOutId}`);
      if (!res.ok) return { available: false };
      return res.json();
    },
    staleTime: 60 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
    retry: 1,
    throwOnError: false,
  });
}

export default function ShuttlePanel({ putInId, takeOutId, putInName, takeOutName, services }: ShuttlePanelProps) {
  const { data: shuttle, isLoading } = useShuttleDistance(putInId, takeOutId);

  const shuttleOutfitters = services.filter(s =>
    s.servicesOffered.includes('shuttle' as never)
  );

  if (!isLoading && !shuttle?.available && shuttleOutfitters.length === 0) return null;

  return (
    <div className="bg-white rounded-xl border border-neutral-200 p-4">
      <div className="flex items-center gap-2 mb-3">
        <Car className="w-4 h-4 text-primary-600" />
        <h3 className="text-sm font-semibold text-neutral-900">Shuttle & Logistics</h3>
      </div>

      {/* Drive time */}
      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-neutral-400 mb-3">
          <Loader2 className="w-4 h-4 animate-spin" />
          Calculating shuttle drive...
        </div>
      ) : shuttle?.available ? (
        <div className="bg-neutral-50 rounded-lg p-3 mb-3">
          <p className="text-sm text-neutral-700">
            <span className="font-medium">{takeOutName}</span>
            {' → '}
            <span className="font-medium">{putInName}</span>
          </p>
          <p className="text-lg font-bold text-neutral-900 mt-1">
            {shuttle.miles} mi · ~{shuttle.minutes} min by road
          </p>
          {shuttle.routeSummary && (
            <p className="text-xs text-neutral-400 mt-0.5">via {shuttle.routeSummary}</p>
          )}
        </div>
      ) : null}

      {/* Shuttle outfitters */}
      {shuttleOutfitters.length > 0 && (
        <div>
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
