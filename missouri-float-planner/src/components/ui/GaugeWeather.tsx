'use client';

// src/components/ui/GaugeWeather.tsx
// Compact weather display for gauge station cards with 3-day forecast

import Image from 'next/image';
import { Cloud, Wind, Sun, Droplets } from 'lucide-react';
import { useWeatherByCoords, useForecastByCoords, getWeatherIconUrl } from '@/hooks/useWeather';

interface GaugeWeatherProps {
  lat: number;
  lon: number;
  enabled?: boolean;
  variant?: 'default' | 'compact';
}

export default function GaugeWeather({ lat, lon, enabled = true, variant = 'default' }: GaugeWeatherProps) {
  const { data: weather, isLoading, error } = useWeatherByCoords(lat, lon, enabled);
  const { data: forecast } = useForecastByCoords(lat, lon, enabled);

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

  // Skip today from forecast (we already show current weather)
  const forecastDays = forecast?.days?.slice(1, 4) ?? [];

  // Compact variant — matches Stitch reference design
  if (variant === 'compact') {
    return (
      <div className="bg-white border border-neutral-200 rounded-xl p-4">
        <div className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wider mb-3">
          {weather.city} Weather
        </div>
        <div className="flex items-center gap-4">
          <Image
            src={getWeatherIconUrl(weather.conditionIcon)}
            alt={weather.condition}
            width={48}
            height={48}
            className="w-12 h-12 flex-shrink-0"
            unoptimized
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-bold text-neutral-900">{weather.temp}°F</span>
            </div>
            <div className="text-sm text-neutral-600 capitalize">{weather.condition}</div>
          </div>
          <div className="text-right flex-shrink-0">
            <div className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">Wind</div>
            <div className="text-sm font-semibold text-neutral-900">{weather.windDirection} {weather.windSpeed} mph</div>
          </div>
        </div>

        {/* 3-day forecast row */}
        {forecastDays.length > 0 && (
          <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-neutral-100">
            {forecastDays.map((day) => (
              <div key={day.date} className="text-center">
                <div className="text-[10px] font-semibold text-neutral-500 uppercase">{day.dayOfWeek}</div>
                <Image
                  src={getWeatherIconUrl(day.conditionIcon)}
                  alt={day.condition}
                  width={32}
                  height={32}
                  className="w-8 h-8 mx-auto"
                  unoptimized
                />
                <div className="text-xs font-semibold text-neutral-900 tabular-nums">
                  {day.tempHigh}° <span className="text-neutral-400 font-normal">{day.tempLow}°</span>
                </div>
                {day.precipitation > 20 && (
                  <div className="flex items-center justify-center gap-0.5 text-[10px] text-blue-500">
                    <Droplets className="w-2.5 h-2.5" />
                    {day.precipitation}%
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
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
        <div className="bg-white border border-neutral-200 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-1">
            <Cloud className="w-4 h-4 text-primary-600" />
            <span className="text-xs font-medium text-neutral-500 uppercase">Temp</span>
          </div>
          <div className="text-2xl font-bold text-neutral-900">
            {weather.temp}°F
          </div>
          <div className="text-xs text-neutral-600 capitalize mt-0.5">{weather.condition}</div>
        </div>
        {/* Wind */}
        <div className="bg-white border border-neutral-200 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-1">
            <Wind className="w-4 h-4 text-primary-600" />
            <span className="text-xs font-medium text-neutral-500 uppercase">Wind</span>
          </div>
          <div className="text-2xl font-bold text-neutral-900">
            {weather.windSpeed}<span className="text-sm font-normal"> mph</span>
          </div>
          <div className="text-xs text-neutral-600 mt-0.5">{weather.windDirection}</div>
        </div>
        {/* Weather Icon */}
        <div className="bg-white border border-neutral-200 rounded-lg p-3 flex items-center justify-center">
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

      {/* 3-day forecast */}
      {forecastDays.length > 0 && (
        <div className="grid grid-cols-3 gap-3 mt-3">
          {forecastDays.map((day) => (
            <div key={day.date} className="bg-white border border-neutral-200 rounded-lg p-2.5 text-center">
              <div className="text-[10px] font-semibold text-neutral-500 uppercase">{day.dayOfWeek}</div>
              <Image
                src={getWeatherIconUrl(day.conditionIcon)}
                alt={day.condition}
                width={32}
                height={32}
                className="w-8 h-8 mx-auto"
                unoptimized
              />
              <div className="text-xs font-semibold text-neutral-900 tabular-nums">
                {day.tempHigh}° <span className="text-neutral-400 font-normal">{day.tempLow}°</span>
              </div>
              {day.precipitation > 20 && (
                <div className="flex items-center justify-center gap-0.5 text-[10px] text-blue-500 mt-0.5">
                  <Droplets className="w-2.5 h-2.5" />
                  {day.precipitation}%
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
