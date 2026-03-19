'use client';

// src/components/chat/ToolCards.tsx
// Rich visual cards rendered inline in chat messages from tool result data.
// Smart grouping: multiple conditions → compact comparison table,
// multiple weather → merged summary, single results → full card.

import type { ToolResultData } from '@/lib/chat/types';
import { CONDITION_COLORS } from '@/constants';
import { Droplets, Thermometer, Wind, Clock, Car, AlertTriangle, ExternalLink, ChevronRight, ChevronDown } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

interface ToolCardsProps {
  toolData: ToolResultData[];
}

/** Renders all tool result data as rich visual cards, grouping multiples */
export default function ToolCards({ toolData }: ToolCardsProps) {
  if (!toolData || toolData.length === 0) return null;

  // Group by tool type
  const conditions = toolData.filter(td => td.tool === 'get_river_conditions');
  const weather = toolData.filter(td => td.tool === 'get_weather');
  const routes = toolData.filter(td => td.tool === 'get_float_route');

  return (
    <div className="space-y-2 mb-2">
      {/* Conditions: compact table if 2+, full card if 1 */}
      {conditions.length > 1 ? (
        <ConditionsComparisonCard items={conditions.map(c => c.data)} />
      ) : conditions.length === 1 ? (
        <ConditionsCard data={conditions[0].data} />
      ) : null}

      {/* Weather: single merged card if 2+, full card if 1 */}
      {weather.length > 1 ? (
        <WeatherSummaryCard items={weather.map(w => w.data)} />
      ) : weather.length === 1 ? (
        <WeatherCard data={weather[0].data} />
      ) : null}

      {/* Routes: always full card */}
      {routes.map((td, i) => (
        <RouteCard key={`route-${i}`} data={td.data} />
      ))}
    </div>
  );
}

// ─── Compact Conditions Comparison (multi-river) ────────────────────────────

function ConditionsComparisonCard({ items }: { items: Record<string, unknown>[] }) {
  // Sort: optimal/okay first, then low, then high/dangerous
  const order: Record<string, number> = { optimal: 0, okay: 1, low: 2, too_low: 3, high: 4, dangerous: 5, unknown: 6 };
  const sorted = [...items].sort((a, b) =>
    (order[a.conditionCode as string] ?? 6) - (order[b.conditionCode as string] ?? 6)
  );

  return (
    <div className="rounded-xl border border-neutral-200 bg-white overflow-hidden shadow-sm">
      <div className="px-3 py-2 bg-neutral-50 border-b border-neutral-100">
        <span className="text-[11px] font-bold uppercase tracking-wide text-neutral-500">
          River Conditions
        </span>
      </div>
      <div className="divide-y divide-neutral-100">
        {sorted.map((data, i) => {
          const code = data.conditionCode as string;
          const color = CONDITION_COLORS[code as keyof typeof CONDITION_COLORS] || CONDITION_COLORS.unknown;
          const riverUrl = data.riverUrl as string | undefined;

          return (
            <div key={i} className="flex items-center gap-2.5 px-3 py-2">
              {/* Condition dot */}
              <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />

              {/* River name — tappable link */}
              <div className="flex-1 min-w-0">
                {riverUrl ? (
                  <Link href={riverUrl} className="text-sm font-semibold text-neutral-900 hover:text-primary-700 transition-colors">
                    {data.riverName as string}
                  </Link>
                ) : (
                  <span className="text-sm font-semibold text-neutral-900">{data.riverName as string}</span>
                )}
              </div>

              {/* Gauge + condition */}
              <div className="flex items-center gap-2 flex-shrink-0">
                {data.gaugeHeightFt != null && (
                  <span className="text-sm font-bold text-neutral-800 tabular-nums">
                    {Number(data.gaugeHeightFt).toFixed(1)} ft
                  </span>
                )}
                <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded-full" style={{ color, backgroundColor: `${color}15` }}>
                  {code === 'okay' ? 'OK' : code === 'optimal' ? 'OPT' : code === 'too_low' ? 'LOW' : code === 'dangerous' ? 'DANGER' : (code || '?').toUpperCase()}
                </span>
              </div>

              {/* Trend arrow */}
              {typeof data.trendDetail === 'string' && data.trendDetail && (
                <span className="text-[10px] text-neutral-400 flex-shrink-0 tabular-nums">
                  {data.trendDetail.split(' ')[0]}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Single Conditions Card ─────────────────────────────────────────────────

function ConditionsCard({ data }: { data: Record<string, unknown> }) {
  const conditionCode = data.conditionCode as string;
  const color = CONDITION_COLORS[conditionCode as keyof typeof CONDITION_COLORS] || CONDITION_COLORS.unknown;
  const riverUrl = data.riverUrl as string | undefined;
  const usgsUrl = data.usgsUrl as string | undefined;

  return (
    <div className="rounded-xl border border-neutral-200 bg-white overflow-hidden shadow-sm">
      <div className="flex items-center gap-2 px-3 py-2" style={{ backgroundColor: `${color}15` }}>
        <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
        <span className="text-xs font-bold uppercase tracking-wide" style={{ color }}>
          {data.conditionLabel as string}
        </span>
      </div>

      <div className="px-3 py-2 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-neutral-900">{data.riverName as string}</span>
          {data.gaugeHeightFt != null && (
            <span className="text-sm font-bold text-neutral-800">
              <Droplets className="w-3 h-3 text-primary-500 inline mr-0.5" />
              {Number(data.gaugeHeightFt).toFixed(1)} ft
              {typeof data.optimalRange === 'string' && data.optimalRange && (
                <span className="text-[10px] text-neutral-400 ml-1">/ {data.optimalRange}</span>
              )}
            </span>
          )}
        </div>
        <div className="flex gap-2">
          {riverUrl && (
            <Link href={riverUrl} className="text-[11px] font-medium text-primary-600 hover:text-primary-800">
              View <ChevronRight className="w-3 h-3 inline" />
            </Link>
          )}
          {usgsUrl && (
            <a href={usgsUrl} target="_blank" rel="noopener noreferrer" className="text-[11px] text-neutral-400 hover:text-neutral-600">
              USGS <ExternalLink className="w-2.5 h-2.5 inline" />
            </a>
          )}
        </div>
      </div>

      {typeof data.trendDetail === 'string' && data.trendDetail && (
        <div className="px-3 pb-2 text-[11px] text-neutral-400">
          {data.trendDetail}
        </div>
      )}
    </div>
  );
}

// ─── Merged Weather Summary (multi-location) ────────────────────────────────

function WeatherSummaryCard({ items }: { items: Record<string, unknown>[] }) {
  // Collect all alerts
  const allAlerts: { event?: string; headline?: string }[] = [];
  for (const item of items) {
    const alerts = item.alerts as { event?: string; headline?: string }[] | undefined;
    if (alerts) allAlerts.push(...alerts);
  }

  // Pick the first location's forecast for the weekend preview (they're usually close)
  const primaryForecast = items[0]?.forecast as { dayOfWeek?: string; tempHigh?: number; tempLow?: number; precipitation?: number }[] | undefined;

  return (
    <div className="rounded-xl border border-neutral-200 bg-white overflow-hidden shadow-sm">
      {allAlerts.length > 0 && (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-red-50 border-b border-red-100">
          <AlertTriangle className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />
          <span className="text-xs font-medium text-red-700 truncate">{allAlerts[0].headline || allAlerts[0].event}</span>
        </div>
      )}

      <div className="px-3 py-2">
        <div className="text-[11px] font-bold uppercase tracking-wide text-neutral-500 mb-2">Weekend Weather</div>

        {/* Locations row — compact */}
        <div className="flex gap-4 mb-2">
          {items.map((item, i) => {
            const current = item.current as { temp?: number; condition?: string } | null;
            return (
              <div key={i} className="flex items-center gap-1.5">
                <Thermometer className="w-3 h-3 text-accent-500" />
                <span className="text-xs font-medium text-neutral-600">{item.location as string}</span>
                {current && (
                  <span className="text-sm font-bold text-neutral-900">{Math.round(current.temp || 0)}&deg;</span>
                )}
              </div>
            );
          })}
        </div>

        {/* Forecast strip — just weekend days */}
        {primaryForecast && primaryForecast.length > 0 && (
          <div className="grid grid-cols-4 gap-1">
            {primaryForecast.slice(0, 4).map((day, i) => (
              <div key={i} className="text-center py-1 px-1 rounded-md bg-neutral-50">
                <div className="text-[10px] font-medium text-neutral-500">{day.dayOfWeek?.slice(0, 3)}</div>
                <div className="text-xs font-bold text-neutral-800">{Math.round(day.tempHigh || 0)}&deg;</div>
                {(day.precipitation ?? 0) > 20 && (
                  <div className="text-[9px] text-primary-500 font-medium">{day.precipitation}%</div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Single Weather Card ────────────────────────────────────────────────────

function WeatherCard({ data }: { data: Record<string, unknown> }) {
  const current = data.current as { temp?: number; condition?: string; windSpeed?: number; humidity?: number } | null;
  const forecast = data.forecast as { dayOfWeek?: string; tempHigh?: number; tempLow?: number; condition?: string; precipitation?: number }[] | undefined;
  const alerts = data.alerts as { event?: string; severity?: string; headline?: string }[] | undefined;

  return (
    <div className="rounded-xl border border-neutral-200 bg-white overflow-hidden shadow-sm">
      {alerts && alerts.length > 0 && (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-red-50 border-b border-red-100">
          <AlertTriangle className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />
          <span className="text-xs font-medium text-red-700 truncate">{alerts[0].headline || alerts[0].event}</span>
        </div>
      )}

      <div className="px-3 py-2">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs font-medium text-neutral-500">{data.location as string}</span>
          {current && <span className="text-[11px] text-neutral-400">{current.condition}</span>}
        </div>

        {current && (
          <div className="flex items-center gap-3 mb-2">
            <div className="flex items-center gap-1">
              <Thermometer className="w-3.5 h-3.5 text-accent-500" />
              <span className="text-base font-bold text-neutral-900">{Math.round(current.temp || 0)}&deg;F</span>
            </div>
            {current.windSpeed != null && (
              <span className="text-[11px] text-neutral-500">
                <Wind className="w-3 h-3 inline mr-0.5" />{Math.round(current.windSpeed)} mph
              </span>
            )}
          </div>
        )}

        {forecast && forecast.length > 0 && (
          <div className="grid grid-cols-4 gap-1">
            {forecast.slice(0, 4).map((day, i) => (
              <div key={i} className="text-center py-1 px-1 rounded-md bg-neutral-50">
                <div className="text-[10px] font-medium text-neutral-500">{day.dayOfWeek?.slice(0, 3)}</div>
                <div className="text-xs font-bold text-neutral-800">{Math.round(day.tempHigh || 0)}&deg;</div>
                {(day.precipitation ?? 0) > 20 && (
                  <div className="text-[9px] text-primary-500 font-medium">{day.precipitation}%</div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Route Card ─────────────────────────────────────────────────────────────

function RouteCard({ data }: { data: Record<string, unknown> }) {
  const hours = data.estimatedHours as { low?: number; high?: number } | undefined;
  const hazards = data.hazards as { name?: string; severity?: string }[] | undefined;
  const planUrl = data.planUrl as string | undefined;

  return (
    <div className="rounded-xl border border-neutral-200 bg-white overflow-hidden shadow-sm">
      <div className="px-3 py-2 bg-primary-50 border-b border-primary-100 flex items-center justify-between">
        <div>
          <div className="text-xs font-bold text-primary-800">
            {data.startPoint as string} &rarr; {data.endPoint as string}
          </div>
          <div className="text-[10px] text-primary-500">{data.riverName as string}</div>
        </div>
        {planUrl && (
          <Link href={planUrl} className="text-[11px] font-medium text-primary-600 hover:text-primary-800">
            Plan <ChevronRight className="w-3 h-3 inline" />
          </Link>
        )}
      </div>

      <div className="px-3 py-2 flex items-center gap-4">
        <div className="flex items-center gap-1">
          <Droplets className="w-3 h-3 text-primary-500" />
          <span className="text-sm font-bold text-neutral-900">{data.distanceMiles as number} mi</span>
        </div>
        {hours && (
          <div className="flex items-center gap-1">
            <Clock className="w-3 h-3 text-accent-500" />
            <span className="text-sm font-bold text-neutral-900">{hours.low}&ndash;{hours.high} hrs</span>
          </div>
        )}
        {data.shuttleDriveMinutes != null && (
          <div className="flex items-center gap-1">
            <Car className="w-3 h-3 text-neutral-500" />
            <span className="text-sm font-bold text-neutral-900">{Math.round(data.shuttleDriveMinutes as number)} min</span>
            <span className="text-[10px] text-neutral-400">shuttle</span>
          </div>
        )}
        {hazards && hazards.length > 0 && (
          <div className="flex items-center gap-1 text-xs text-neutral-500">
            <AlertTriangle className="w-3 h-3 text-yellow-500" />
            <span>{hazards.length}</span>
          </div>
        )}
      </div>
    </div>
  );
}
