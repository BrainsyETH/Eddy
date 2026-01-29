// src/hooks/useWeather.ts
// React Query hooks for fetching weather data

import { useQuery } from '@tanstack/react-query';
import type { WeatherData } from '@/lib/weather/openweather';

// Weather data for coordinates (used by gauge stations)
interface CoordinateWeatherData {
  temp: number;
  condition: string;
  conditionIcon: string;
  windSpeed: number;
  windDirection: string;
  humidity: number;
  city: string;
}

// Original hook for river-based weather
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

// New hook for coordinate-based weather (lazy loading for gauges)
export function useWeatherByCoords(lat: number | null, lon: number | null, enabled = true) {
  return useQuery<CoordinateWeatherData | null, Error>({
    queryKey: ['weather-coords', lat, lon],
    queryFn: async (): Promise<CoordinateWeatherData | null> => {
      if (lat === null || lon === null) return null;

      const response = await fetch(`/api/weather?lat=${lat}&lon=${lon}`);

      if (!response.ok) {
        throw new Error('Failed to fetch weather');
      }

      return response.json();
    },
    enabled: enabled && lat !== null && lon !== null,
    staleTime: 30 * 60 * 1000, // 30 minutes
    gcTime: 60 * 60 * 1000, // 1 hour cache
    retry: 1,
    throwOnError: false,
  });
}

// Weather icon URL helper
export function getWeatherIconUrl(iconCode: string): string {
  return `https://openweathermap.org/img/wn/${iconCode}@2x.png`;
}
