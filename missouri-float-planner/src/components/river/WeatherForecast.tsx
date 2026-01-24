'use client';

// src/components/river/WeatherForecast.tsx
// 5-day weather forecast for river detail pages

import { useForecast } from '@/hooks/useForecast';

interface WeatherForecastProps {
  riverSlug: string | null;
  className?: string;
}

// Weather condition to icon mapping
const CONDITION_ICONS: Record<string, string> = {
  'Clear': '☀️',
  'Clouds': '☁️',
  'Rain': '🌧️',
  'Drizzle': '🌦️',
  'Thunderstorm': '⛈️',
  'Snow': '❄️',
  'Mist': '🌫️',
  'Fog': '🌫️',
  'Haze': '🌫️',
};

export default function WeatherForecast({ riverSlug, className = '' }: WeatherForecastProps) {
  const { data: forecast, isLoading, error } = useForecast(riverSlug);

  if (isLoading) {
    return (
      <div className={`bg-white/5 rounded-lg p-4 ${className}`}>
        <div className="flex items-center gap-2 text-river-gravel text-sm">
          <div className="w-4 h-4 border-2 border-sky-warm border-t-transparent rounded-full animate-spin" />
          Loading forecast...
        </div>
      </div>
    );
  }

  if (error || !forecast?.forecast?.length) {
    return (
      <div className={`bg-white/5 rounded-lg p-4 ${className}`}>
        <p className="text-river-gravel text-sm">Weather forecast unavailable</p>
      </div>
    );
  }

  return (
    <div className={`bg-white/5 rounded-lg p-4 border border-white/10 ${className}`}>
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-semibold text-white">5-Day Forecast</h4>
        <span className="text-xs text-river-gravel">{forecast.location}</span>
      </div>

      <div className="grid grid-cols-5 gap-2">
        {forecast.forecast.map((day, index) => (
          <div
            key={day.date}
            className={`text-center p-2 rounded-lg ${
              index === 0 ? 'bg-white/10' : 'bg-white/5'
            }`}
          >
            <p className="text-xs font-medium text-white">
              {index === 0 ? 'Today' : day.dayOfWeek}
            </p>
            <p className="text-xl my-1">
              {CONDITION_ICONS[day.condition] || '🌤️'}
            </p>
            <p className="text-xs text-white font-semibold">
              {day.tempHigh}°
            </p>
            <p className="text-[10px] text-river-gravel">
              {day.tempLow}°
            </p>
            {day.precipitation > 20 && (
              <p className="text-[10px] text-blue-400 mt-1">
                💧 {day.precipitation}%
              </p>
            )}
          </div>
        ))}
      </div>

      {/* Rain warning if any day has high precipitation */}
      {forecast.forecast.some(d => d.precipitation > 50) && (
        <div className="mt-3 p-2 bg-blue-500/20 rounded-lg border border-blue-400/30">
          <p className="text-xs text-blue-200">
            <span className="font-semibold">Rain Expected:</span> Check conditions before your float. Heavy rain can rapidly change river levels.
          </p>
        </div>
      )}
    </div>
  );
}
