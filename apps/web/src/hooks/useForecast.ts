// src/hooks/useForecast.ts
// React Query hook for fetching 5-day weather forecast

import { useQuery } from '@tanstack/react-query';

export interface ForecastDay {
  date: string;
  dayOfWeek: string;
  tempHigh: number;
  tempLow: number;
  condition: string;
  conditionIcon: string;
  precipitation: number;
  windSpeed: number;
  humidity: number;
}

export interface ForecastResponse {
  river: string;
  location: string;
  forecast: ForecastDay[];
}

export function useForecast(riverSlug: string | null) {
  return useQuery<ForecastResponse | null, Error>({
    queryKey: ['forecast', riverSlug],
    queryFn: async (): Promise<ForecastResponse | null> => {
      if (!riverSlug) return null;

      const response = await fetch(`/api/weather/${riverSlug}/forecast`);

      if (!response.ok) {
        if (response.status === 404) {
          return null;
        }
        throw new Error('Failed to fetch forecast');
      }

      return response.json();
    },
    enabled: !!riverSlug,
    staleTime: 30 * 60 * 1000, // 30 minutes
    refetchInterval: 60 * 60 * 1000, // Refetch every hour
  });
}
