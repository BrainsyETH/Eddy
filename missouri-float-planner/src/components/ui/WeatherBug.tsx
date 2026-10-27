'use client';

// src/components/ui/WeatherBug.tsx
// Weather Bug widget - floating overlay showing weather conditions

import { useEffect, useRef, useState } from 'react';
import { Sun, Cloud, CloudRain, Wind, ChevronDown, ChevronUp } from 'lucide-react';
// Removed: Droplet icon (river gauge status removed from weather modal)
import { useWeather } from '@/hooks/useWeather';
import { getWindDirection } from '@/lib/weather/display';
import type { WeatherData } from '@/lib/weather/openweather';
import LoadingSpinner from './LoadingSpinner';

interface WeatherBugProps {
  riverSlug: string | null;
  riverId: string | null;
  className?: string;
  /** Root placement. Default floats top-left; pass "relative" to slot the
   *  bug into an overlay stack (so filters/river card never overlap it). */
  positionClassName?: string;
  /**
   * Light, chrome-less temperature chip for embedding in another card's
   * toolbar (the desktop search card); details open right-aligned below it.
   */
  compact?: boolean;
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

export default function WeatherBug({
  riverSlug,
  className = '',
  positionClassName = 'absolute top-4 left-4 z-20',
  compact = false,
}: WeatherBugProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const compactRef = useRef<HTMLDivElement>(null);
  const { data: weatherData, isLoading: weatherLoading, isError: hasWeatherError } = useWeather(riverSlug);
  const weather = weatherData as WeatherData | null | undefined;

  // The compact chip's details are a popover beside other toolbar popovers
  // (search results, filters): close on outside click and Escape so only one
  // is ever open. Focus leaving is handled by onBlur below.
  useEffect(() => {
    if (!compact || !isExpanded) return;
    const onDown = (e: MouseEvent) => {
      if (compactRef.current && !compactRef.current.contains(e.target as Node)) setIsExpanded(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      e.preventDefault();
      e.stopPropagation();
      setIsExpanded(false);
      compactRef.current?.querySelector('button')?.focus();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [compact, isExpanded]);

  if (!riverSlug) {
    return null;
  }

  if (compact) {
    // Nothing to say without a reading — a placeholder only adds noise to
    // the toolbar it sits in.
    if (!weatherLoading && !weather) return null;
    return (
      <div
        ref={compactRef}
        className={`relative ${className}`}
        onBlur={(e) => {
          if (e.relatedTarget && !e.currentTarget.contains(e.relatedTarget as Node)) setIsExpanded(false);
        }}
      >
        <button
          onClick={() => setIsExpanded((v) => !v)}
          aria-expanded={isExpanded}
          aria-label={isExpanded ? 'Collapse weather details' : 'Expand weather details'}
          title="Weather"
          className={`flex items-center gap-1 rounded-lg px-1.5 py-1 text-sm font-semibold tabular-nums transition-colors hover:bg-primary-50 ${
            isExpanded ? 'bg-primary-50 text-primary-700' : 'text-neutral-700'
          }`}
        >
          {weatherLoading ? (
            <LoadingSpinner size="sm" />
          ) : weather ? (
            <>
              <span className="text-primary-600 [&>svg]:h-4 [&>svg]:w-4">{getConditionIcon(weather.condition)}</span>
              {weather.temp}°
            </>
          ) : null}
        </button>
        {isExpanded && (
          <div className="absolute right-0 top-full z-40 mt-2 min-w-[240px] rounded-lg border border-primary-600/30 p-4 shadow-lg backdrop-blur-md glass-card-dark">
            <WeatherDetails weather={weather} isLoading={weatherLoading} isError={hasWeatherError} onCollapse={() => setIsExpanded(false)} />
          </div>
        )}
      </div>
    );
  }

  // Collapsed view - just show temperature
  // Positioned at top-left to avoid overlapping with map zoom controls
  if (!isExpanded) {
    return (
      <button
        onClick={() => setIsExpanded(true)}
        aria-expanded="false"
        aria-label="Expand weather details"
        className={`${positionClassName} glass-card-dark rounded-lg px-3 py-2
                    backdrop-blur-md border border-primary-600/30 shadow-lg
                    hover:border-primary-500/50 transition-colors ${className}`}
      >
        <div className="flex items-center gap-3 text-sm">
          {weatherLoading ? (
            <LoadingSpinner size="sm" />
          ) : weather ? (
            <div className="flex items-center gap-1.5 text-white">
              <span className="text-primary-400">{getConditionIcon(weather.condition)}</span>
              <span className="font-medium">{weather.temp}°</span>
            </div>
          ) : (
            <span className="text-neutral-400">Weather unavailable</span>
          )}
          <ChevronUp className="w-4 h-4 text-neutral-400" aria-hidden="true" />
        </div>
      </button>
    );
  }

  return (
    <div
      className={`${positionClassName} glass-card-dark rounded-lg p-4
                  backdrop-blur-md border border-primary-600/30 shadow-lg
                  min-w-[240px] ${className}`}
    >
      <WeatherDetails weather={weather} isLoading={weatherLoading} isError={hasWeatherError} onCollapse={() => setIsExpanded(false)} />
    </div>
  );
}

function WeatherDetails({ weather, isLoading, isError, onCollapse }: {
  weather: WeatherData | null | undefined;
  isLoading: boolean;
  isError: boolean;
  onCollapse: () => void;
}) {
  return (
    <>
      {isLoading ? (
        <div className="flex items-center gap-2 text-neutral-400">
          <LoadingSpinner size="sm" />
          <span className="text-sm">Loading weather...</span>
        </div>
      ) : isError ? (
        <div className="text-sm text-amber-400">
          Unable to load weather data
        </div>
      ) : weather ? (
        <div className="space-y-3">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-white/10 pb-2">
            <h3 className="text-sm font-semibold text-white">Weather & Conditions</h3>
            <button
              onClick={onCollapse}
              aria-label="Collapse weather details"
              className="p-1 hover:bg-white/10 rounded transition-colors"
            >
              <ChevronDown className="w-4 h-4 text-neutral-400" aria-hidden="true" />
            </button>
          </div>

          {/* Temperature & Condition */}
          <div className="flex items-center gap-3">
            <div className="text-primary-400">
              {getConditionIcon(weather.condition)}
            </div>
            <div className="flex-1">
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold text-white">{weather.temp}°</span>
                <span className="text-sm text-neutral-400">{weather.condition}</span>
              </div>
            </div>
          </div>

          {/* Wind */}
          <div className="flex items-center gap-2 text-sm">
            <Wind className="w-4 h-4 text-neutral-400" />
            <span className="text-neutral-400">
              {weather.windSpeed} mph {getWindDirection(weather.windDirection)}
            </span>
          </div>

          {/* City info */}
          <div className="text-xs text-neutral-400 text-right pt-1 border-t border-white/10">
            {weather.city}
          </div>
        </div>
      ) : (
        <div className="text-sm text-neutral-400">
          Weather data unavailable
        </div>
      )}
    </>
  );
}
