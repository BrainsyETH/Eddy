'use client';

// src/components/ui/WeatherBug.tsx
// Weather Bug widget - floating overlay showing weather and river conditions

import { useState } from 'react';
import { Sun, Cloud, CloudRain, Wind, Droplet, ChevronDown, ChevronUp } from 'lucide-react';
import { useWeather } from '@/hooks/useWeather';
import { useConditions } from '@/hooks/useConditions';
import { getWindDirection, type WeatherData } from '@/lib/weather/openweather';
import LoadingSpinner from './LoadingSpinner';
import type { ConditionCode } from '@/types/api';

interface WeatherBugProps {
  riverSlug: string | null;
  riverId: string | null;
  className?: string;
}

function getConditionIcon(condition: string): React.ReactNode {
  const lowerCondition = condition.toLowerCase();
  if (lowerCondition.includes('clear') || lowerCondition.includes('sun')) {
    return <Sun className="w-5 h-5" />;
  } else if (lowerCondition.includes('rain') || lowerCondition.includes('drizzle')) {
    return <CloudRain className="w-5 h-5" />;
  } else {
    return <Cloud className="w-5 h-5" />;
  }
}

function getRiverConditionStatus(conditionCode: ConditionCode | null): {
  label: string;
  color: string;
} {
  if (!conditionCode) {
    return { label: 'Unknown', color: 'text-river-gravel' };
  }
  
  switch (conditionCode) {
    case 'too_low':
    case 'very_low':
      return { label: 'Low/Scrapey', color: 'text-amber-400' };
    case 'optimal':
      return { label: 'Good', color: 'text-river-water' };
    case 'high':
      return { label: 'High/Fast', color: 'text-orange-400' };
    case 'dangerous':
      return { label: 'Flood Stage', color: 'text-red-400' };
    case 'low':
      return { label: 'Low/Scrapey', color: 'text-amber-400' };
    default:
      return { label: 'Check Conditions', color: 'text-river-gravel' };
  }
}

export default function WeatherBug({ riverSlug, riverId, className = '' }: WeatherBugProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const { data: weatherData, isLoading: weatherLoading, isError: hasWeatherError } = useWeather(riverSlug);
  const weather = weatherData as WeatherData | null | undefined;
  const { data } = useConditions(riverId);
  const condition = data?.condition ?? null;

  if (!riverSlug || !riverId) {
    return null;
  }

  const riverStatus = getRiverConditionStatus(condition?.code || null);

  // Collapsed view - just show temperature and river status
  if (!isExpanded) {
    return (
      <button
        onClick={() => setIsExpanded(true)}
        className={`absolute top-4 right-4 z-20 glass-card-dark rounded-xl px-3 py-2
                    backdrop-blur-md border border-white/10 shadow-lg
                    hover:border-white/20 transition-colors ${className}`}
      >
        <div className="flex items-center gap-3 text-sm">
          {weatherLoading ? (
            <LoadingSpinner size="sm" />
          ) : weather ? (
            <>
              <div className="flex items-center gap-1.5 text-white">
                <span className="text-river-water">{getConditionIcon(weather.condition)}</span>
                <span className="font-medium">{weather.temp}°</span>
              </div>
              {condition && (
                <>
                  <span className="text-white/30">|</span>
                  <div className="flex items-center gap-1.5">
                    <Droplet className="w-3.5 h-3.5 text-river-water" />
                    <span className={`font-medium ${riverStatus.color}`}>
                      {riverStatus.label}
                    </span>
                  </div>
                </>
              )}
            </>
          ) : (
            <span className="text-river-gravel">Weather unavailable</span>
          )}
          <ChevronUp className="w-4 h-4 text-river-gravel" />
        </div>
      </button>
    );
  }

  return (
    <div
      className={`absolute top-4 right-4 z-20 glass-card-dark rounded-xl p-4
                  backdrop-blur-md border border-white/10 shadow-lg
                  min-w-[240px] ${className}`}
    >
      {weatherLoading ? (
        <div className="flex items-center gap-2 text-river-gravel">
          <LoadingSpinner size="sm" />
          <span className="text-sm">Loading weather...</span>
        </div>
      ) : hasWeatherError ? (
        <div className="text-sm text-amber-400">
          Unable to load weather data
        </div>
      ) : weather ? (
        <div className="space-y-3">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-white/10 pb-2">
            <h3 className="text-sm font-semibold text-white">Weather & Conditions</h3>
            <button
              onClick={() => setIsExpanded(false)}
              className="p-1 hover:bg-white/10 rounded transition-colors"
            >
              <ChevronDown className="w-4 h-4 text-river-gravel" />
            </button>
          </div>

          {/* Temperature & Condition */}
          <div className="flex items-center gap-3">
            <div className="text-river-water">
              {getConditionIcon(weather.condition)}
            </div>
            <div className="flex-1">
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold text-white">{weather.temp}°</span>
                <span className="text-sm text-river-gravel">{weather.condition}</span>
              </div>
            </div>
          </div>

          {/* Wind */}
          <div className="flex items-center gap-2 text-sm">
            <Wind className="w-4 h-4 text-river-gravel" />
            <span className="text-river-gravel">
              {weather.windSpeed} mph {getWindDirection(weather.windDirection)}
            </span>
          </div>

          {/* River Level */}
          {condition && (
            <div className="flex items-center gap-2 text-sm border-t border-white/10 pt-2">
              <Droplet className="w-4 h-4 text-river-water" />
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <span className="text-river-gravel">River Level</span>
                  {condition.gaugeHeightFt !== null && (
                    <span className="text-white font-medium">
                      {condition.gaugeHeightFt.toFixed(1)} ft
                    </span>
                  )}
                </div>
                <div className="mt-1">
                  <span className={`text-xs font-medium ${riverStatus.color}`}>
                    {riverStatus.label}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* City info */}
          <div className="text-xs text-river-gravel text-right pt-1 border-t border-white/10">
            {weather.city}
          </div>
        </div>
      ) : (
        <div className="text-sm text-river-gravel">
          Weather data unavailable
        </div>
      )}
    </div>
  );
}
