// src/hooks/useWeather.ts
// React Query hook for fetching weather data

import { useQuery } from '@tanstack/react-query';
import { fetchWeather, getCityForRiver, type WeatherData } from '@/lib/weather/openweather';

export function useWeather(riverSlug: string | null) {
  return useQuery<WeatherData | null, Error>({
    queryKey: ['weather', riverSlug],
    queryFn: async (): Promise<WeatherData | null> => {
      if (!riverSlug) return null;
      
      const cityData = getCityForRiver(riverSlug);
      if (!cityData) return null;
      
      const apiKey = process.env.NEXT_PUBLIC_OPENWEATHER_API_KEY;
      if (!apiKey) {
        console.warn('OpenWeatherMap API key not configured');
        return null;
      }
      
      try {
        return await fetchWeather(cityData.lat, cityData.lon, apiKey);
      } catch (error) {
        console.error('Error fetching weather:', error);
        throw error; // Let React Query handle retry
      }
    },
    enabled: !!riverSlug,
    refetchInterval: 10 * 60 * 1000, // Refetch every 10 minutes
    staleTime: 5 * 60 * 1000, // Consider data stale after 5 minutes
    retry: 2, // Retry failed requests twice
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),
    throwOnError: false, // Don't throw, let component handle error state
  });
}
