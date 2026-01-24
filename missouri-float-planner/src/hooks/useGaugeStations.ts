// src/hooks/useGaugeStations.ts
// React Query hook for fetching all gauge stations in Missouri

import { useQuery } from '@tanstack/react-query';
import type { GaugeStation, GaugesResponse } from '@/app/api/gauges/route';

export type { GaugeStation };

export function useGaugeStations() {
  return useQuery<GaugeStation[], Error>({
    queryKey: ['gaugeStations'],
    queryFn: async (): Promise<GaugeStation[]> => {
      const response = await fetch('/api/gauges');
      if (!response.ok) {
        throw new Error('Failed to fetch gauge stations');
      }
      const data = (await response.json()) as GaugesResponse;
      return data.gauges;
    },
    refetchInterval: 10 * 60 * 1000, // Refetch every 10 minutes
    retry: 2,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),
    staleTime: 5 * 60 * 1000, // Consider data stale after 5 minutes
    refetchOnWindowFocus: false, // Don't refetch on tab focus (prevents flicker)
    placeholderData: (previousData) => previousData, // Keep previous data during refetch
  });
}

/**
 * Find the nearest gauge to a given coordinate
 */
export function findNearestGauge(
  gauges: GaugeStation[],
  lat: number,
  lng: number
): GaugeStation | null {
  if (!gauges || gauges.length === 0) return null;

  let nearestGauge: GaugeStation | null = null;
  let minDistance = Infinity;

  for (const gauge of gauges) {
    const distance = getDistanceKm(lat, lng, gauge.coordinates.lat, gauge.coordinates.lng);
    if (distance < minDistance) {
      minDistance = distance;
      nearestGauge = gauge;
    }
  }

  return nearestGauge;
}

/**
 * Calculate distance between two points using Haversine formula
 */
function getDistanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371; // Earth's radius in km
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(deg: number): number {
  return deg * (Math.PI / 180);
}
