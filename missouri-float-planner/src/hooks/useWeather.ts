// src/hooks/useWeather.ts
// React Query hook for fetching weather data via server-side API

import { useQuery } from '@tanstack/react-query';
import type { WeatherData } from '@/lib/weather/openweather';

export function useWeather(riverSlug: string | null) {
  return useQuery<WeatherData | null, Error>({
    queryKey: ['weather', riverSlug],
    queryFn: async (): Promise<WeatherData | null> => {
      if (!riverSlug) return null;

      const response = await fetch(`/api/weather/${riverSlug}`);

      if (!response.ok) {
        if (response.status === 404) {
          return null; // City not found for this river
        }
        throw new Error('Failed to fetch weather');
      }

      return response.json();
    },
    enabled: !!riverSlug,
    refetchInterval: 10 * 60 * 1000, // Refetch every 10 minutes
    staleTime: 5 * 60 * 1000, // Consider data stale after 5 minutes
    retry: 2, // Retry failed requests twice
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),
    throwOnError: false, // Don't throw, let component handle error state
  });
}
