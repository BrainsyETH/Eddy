'use client';

// src/components/ui/GaugeWeather.tsx
// Compact weather display for gauge station cards (lazy loaded)

import Image from 'next/image';
import { Cloud, Wind, Droplets } from 'lucide-react';
import { useWeatherByCoords, getWeatherIconUrl } from '@/hooks/useWeather';

interface GaugeWeatherProps {
  lat: number;
  lon: number;
  enabled?: boolean;
}

export default function GaugeWeather({ lat, lon, enabled = true }: GaugeWeatherProps) {
  const { data: weather, isLoading, error } = useWeatherByCoords(lat, lon, enabled);

  if (!enabled) return null;

  if (isLoading) {
    return (
      <div className="bg-gradient-to-r from-blue-50 to-sky-50 border border-blue-200 rounded-lg p-3 animate-pulse">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-100 rounded-full"></div>
          <div className="flex-1 space-y-2">
            <div className="h-4 bg-blue-100 rounded w-20"></div>
            <div className="h-3 bg-blue-100 rounded w-32"></div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !weather) {
    return null; // Silently fail - weather is nice-to-have
  }

  return (
    <div className="bg-gradient-to-r from-blue-50 to-sky-50 border border-blue-200 rounded-lg p-3">
      <div className="flex items-center gap-3">
        {/* Weather Icon */}
        <div className="flex-shrink-0">
          <Image
            src={getWeatherIconUrl(weather.conditionIcon)}
            alt={weather.condition}
            width={48}
            height={48}
            className="w-12 h-12"
          />
        </div>

        {/* Weather Details */}
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-neutral-900">{weather.temp}°F</span>
            <span className="text-sm text-neutral-600 capitalize">{weather.condition}</span>
          </div>
          <div className="flex items-center gap-4 text-xs text-neutral-500 mt-1">
            <span className="flex items-center gap-1">
              <Wind className="w-3 h-3" />
              {weather.windSpeed} mph {weather.windDirection}
            </span>
            <span className="flex items-center gap-1">
              <Droplets className="w-3 h-3" />
              {weather.humidity}%
            </span>
          </div>
        </div>

        {/* Location */}
        <div className="text-right text-xs text-neutral-400">
          <Cloud className="w-4 h-4 mx-auto mb-0.5 opacity-50" />
          {weather.city}
        </div>
      </div>
    </div>
  );
}
