'use client';

// src/components/ui/GaugeWeather.tsx
// Compact weather display for gauge station cards (lazy loaded)

import Image from 'next/image';
import { Cloud, Wind, Sun } from 'lucide-react';
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
      <div>
        <h4 className="text-sm font-semibold text-neutral-700 mb-3 flex items-center gap-2">
          <Cloud className="w-4 h-4" />
          Current Weather
        </h4>
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white border border-neutral-200 rounded-lg p-3 animate-pulse">
            <div className="h-4 bg-neutral-100 rounded w-16 mb-2"></div>
            <div className="h-8 bg-neutral-100 rounded w-20"></div>
          </div>
          <div className="bg-white border border-neutral-200 rounded-lg p-3 animate-pulse">
            <div className="h-4 bg-neutral-100 rounded w-16 mb-2"></div>
            <div className="h-8 bg-neutral-100 rounded w-20"></div>
          </div>
          <div className="bg-white border border-neutral-200 rounded-lg p-3 animate-pulse flex items-center justify-center">
            <div className="w-12 h-12 bg-neutral-100 rounded-full"></div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !weather) {
    return (
      <div>
        <h4 className="text-sm font-semibold text-neutral-700 mb-3 flex items-center gap-2">
          <Cloud className="w-4 h-4" />
          Current Weather
        </h4>
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-3 bg-neutral-50 border border-neutral-200 rounded-lg p-3 text-center text-neutral-500 text-sm">
            Weather unavailable
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h4 className="text-sm font-semibold text-neutral-700 mb-3 flex items-center gap-2">
        <Sun className="w-4 h-4" />
        Current Weather
        <span className="text-xs font-normal text-neutral-400 ml-auto">{weather.city}</span>
      </h4>
      <div className="grid grid-cols-3 gap-3">
        {/* Temperature */}
        <div className="bg-gradient-to-br from-blue-50 to-sky-50 border border-blue-200 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-1">
            <Cloud className="w-4 h-4 text-blue-600" />
            <span className="text-xs font-medium text-neutral-500 uppercase">Temp</span>
          </div>
          <div className="text-2xl font-bold text-neutral-900">
            {weather.temp}°F
          </div>
          <div className="text-xs text-neutral-600 capitalize mt-0.5">{weather.condition}</div>
        </div>
        {/* Wind */}
        <div className="bg-gradient-to-br from-blue-50 to-sky-50 border border-blue-200 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-1">
            <Wind className="w-4 h-4 text-blue-600" />
            <span className="text-xs font-medium text-neutral-500 uppercase">Wind</span>
          </div>
          <div className="text-2xl font-bold text-neutral-900">
            {weather.windSpeed}<span className="text-sm font-normal"> mph</span>
          </div>
          <div className="text-xs text-neutral-600 mt-0.5">{weather.windDirection}</div>
        </div>
        {/* Weather Icon */}
        <div className="bg-gradient-to-br from-blue-50 to-sky-50 border border-blue-200 rounded-lg p-3 flex items-center justify-center">
          <Image
            src={getWeatherIconUrl(weather.conditionIcon)}
            alt={weather.condition}
            width={64}
            height={64}
            className="w-16 h-16"
            unoptimized
          />
        </div>
      </div>
    </div>
  );
}
