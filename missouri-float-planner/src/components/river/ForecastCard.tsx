'use client';

import { Sun, Cloud, CloudRain, CloudSnow, CloudLightning, Droplets, Wind } from 'lucide-react';

interface ForecastDay {
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

interface ForecastCardProps {
  days: ForecastDay[];
  city?: string;
}

function getConditionIcon(condition: string) {
  const c = condition.toLowerCase();
  if (c.includes('thunder') || c.includes('storm')) return <CloudLightning className="w-6 h-6" />;
  if (c.includes('snow') || c.includes('sleet')) return <CloudSnow className="w-6 h-6" />;
  if (c.includes('rain') || c.includes('drizzle') || c.includes('shower')) return <CloudRain className="w-6 h-6" />;
  if (c.includes('clear') || c.includes('sun')) return <Sun className="w-6 h-6" />;
  return <Cloud className="w-6 h-6" />;
}

function precipColor(pct: number) {
  if (pct >= 60) return 'text-blue-600';
  if (pct >= 30) return 'text-blue-400';
  return 'text-neutral-400';
}

export default function ForecastCard({ days, city }: ForecastCardProps) {
  const forecast = days.slice(0, 3);

  if (forecast.length === 0) return null;

  return (
    <div className="bg-white rounded-xl border border-neutral-200 p-4">
      <h3 className="text-sm font-semibold text-neutral-900 mb-3">
        3-Day Forecast{city ? ` · ${city}` : ''}
      </h3>
      <div className="flex gap-3 overflow-x-auto">
        {forecast.map((day) => (
          <div
            key={day.date}
            className="flex-1 min-w-[100px] rounded-lg bg-neutral-50 border border-neutral-100 p-3 text-center"
          >
            <p className="text-xs font-medium text-neutral-500 mb-1">{day.dayOfWeek}</p>
            <div className="flex justify-center text-primary-500 mb-1">
              {getConditionIcon(day.condition)}
            </div>
            <div className="flex justify-center items-baseline gap-1 mb-2">
              <span className="text-lg font-bold text-neutral-900">{day.tempHigh}°</span>
              <span className="text-sm text-neutral-400">{day.tempLow}°</span>
            </div>
            <div className="space-y-0.5 text-xs text-neutral-500">
              <div className={`flex items-center justify-center gap-1 ${precipColor(day.precipitation)}`}>
                <Droplets className="w-3 h-3" />
                <span>{day.precipitation}%</span>
              </div>
              <div className="flex items-center justify-center gap-1">
                <Wind className="w-3 h-3" />
                <span>{day.windSpeed} mph</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
