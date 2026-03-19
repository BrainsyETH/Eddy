'use client';

// src/components/chat/ToolCards.tsx
// Rich visual cards rendered inline in chat messages from tool result data.
// Replaces wall-of-text responses with scannable, visual summaries.

import type { ToolResultData } from '@/lib/chat/types';
import { CONDITION_COLORS } from '@/constants';
import { Droplets, Thermometer, Wind, Clock, Car, AlertTriangle, ExternalLink, ChevronRight } from 'lucide-react';
import Link from 'next/link';

interface ToolCardsProps {
  toolData: ToolResultData[];
}

/** Renders all tool result data as rich visual cards */
export default function ToolCards({ toolData }: ToolCardsProps) {
  if (!toolData || toolData.length === 0) return null;

  return (
    <div className="space-y-2 mb-2">
      {toolData.map((td, i) => (
        <ToolCard key={`${td.tool}-${i}`} tool={td.tool} data={td.data} />
      ))}
    </div>
  );
}

function ToolCard({ tool, data }: { tool: string; data: Record<string, unknown> }) {
  switch (tool) {
    case 'get_river_conditions':
      return <ConditionsCard data={data} />;
    case 'get_weather':
      return <WeatherCard data={data} />;
    case 'get_float_route':
      return <RouteCard data={data} />;
    default:
      return null;
  }
}

// ─── Conditions Card ────────────────────────────────────────────────────────

function ConditionsCard({ data }: { data: Record<string, unknown> }) {
  const conditionCode = data.conditionCode as string;
  const color = CONDITION_COLORS[conditionCode as keyof typeof CONDITION_COLORS] || CONDITION_COLORS.unknown;
  const riverUrl = data.riverUrl as string | undefined;
  const usgsUrl = data.usgsUrl as string | undefined;

  return (
    <div className="rounded-xl border border-neutral-200 bg-white overflow-hidden shadow-sm">
      {/* Condition bar */}
      <div className="flex items-center gap-2 px-3 py-2" style={{ backgroundColor: `${color}15` }}>
        <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
        <span className="text-xs font-bold uppercase tracking-wide" style={{ color }}>
          {data.conditionLabel as string}
        </span>
      </div>

      <div className="px-3 py-2.5 space-y-2">
        {/* River name + gauge */}
        <div className="flex items-baseline justify-between">
          <span className="text-sm font-semibold text-neutral-900">{data.riverName as string}</span>
          <span className="text-[10px] text-neutral-400">{data.gaugeName as string}</span>
        </div>

        {/* Key metrics row */}
        <div className="flex gap-4">
          {data.gaugeHeightFt != null && (
            <div className="flex items-center gap-1.5">
              <Droplets className="w-3.5 h-3.5 text-primary-500" />
              <div>
                <span className="text-sm font-bold text-neutral-900">{Number(data.gaugeHeightFt).toFixed(1)} ft</span>
                {typeof data.optimalRange === 'string' && data.optimalRange && (
                  <span className="text-[10px] text-neutral-400 ml-1">/ {data.optimalRange}</span>
                )}
              </div>
            </div>
          )}
          {data.dischargeCfs != null && (
            <div className="text-xs text-neutral-500">
              {Number(data.dischargeCfs).toLocaleString()} cfs
            </div>
          )}
        </div>

        {/* Trend */}
        {typeof data.trend === 'string' && data.trend && (
          <p className="text-xs text-neutral-500">
            {typeof data.trendDetail === 'string' && data.trendDetail && (
              <><span className="font-medium text-neutral-700">{data.trendDetail}</span>{' — '}</>
            )}
            {data.trend}
          </p>
        )}

        {/* Links row */}
        <div className="flex gap-3 pt-1">
          {riverUrl && (
            <Link href={riverUrl} className="inline-flex items-center gap-1 text-[11px] font-medium text-primary-600 hover:text-primary-800 transition-colors">
              View river <ChevronRight className="w-3 h-3" />
            </Link>
          )}
          {usgsUrl && (
            <a href={usgsUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[11px] font-medium text-neutral-400 hover:text-neutral-600 transition-colors">
              USGS <ExternalLink className="w-2.5 h-2.5" />
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Weather Card ───────────────────────────────────────────────────────────

function WeatherCard({ data }: { data: Record<string, unknown> }) {
  const current = data.current as { temp?: number; condition?: string; windSpeed?: number; humidity?: number } | null;
  const forecast = data.forecast as { dayOfWeek?: string; tempHigh?: number; tempLow?: number; condition?: string; precipitation?: number }[] | undefined;
  const alerts = data.alerts as { event?: string; severity?: string; headline?: string }[] | undefined;

  return (
    <div className="rounded-xl border border-neutral-200 bg-white overflow-hidden shadow-sm">
      {/* Alerts banner */}
      {alerts && alerts.length > 0 && (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-red-50 border-b border-red-100">
          <AlertTriangle className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />
          <span className="text-xs font-medium text-red-700 truncate">{alerts[0].headline || alerts[0].event}</span>
        </div>
      )}

      <div className="px-3 py-2.5">
        {/* Location + current */}
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-neutral-500">{data.location as string}</span>
          {current && (
            <span className="text-xs text-neutral-400">{current.condition}</span>
          )}
        </div>

        {current && (
          <div className="flex items-center gap-4 mb-3">
            <div className="flex items-center gap-1.5">
              <Thermometer className="w-4 h-4 text-accent-500" />
              <span className="text-lg font-bold text-neutral-900">{Math.round(current.temp || 0)}&deg;F</span>
            </div>
            {current.windSpeed != null && (
              <div className="flex items-center gap-1 text-xs text-neutral-500">
                <Wind className="w-3 h-3" />
                <span>{Math.round(current.windSpeed)} mph</span>
              </div>
            )}
            {current.humidity != null && (
              <div className="flex items-center gap-1 text-xs text-neutral-500">
                <Droplets className="w-3 h-3" />
                <span>{current.humidity}%</span>
              </div>
            )}
          </div>
        )}

        {/* 4-day forecast row */}
        {forecast && forecast.length > 0 && (
          <div className="grid grid-cols-4 gap-1">
            {forecast.slice(0, 4).map((day, i) => (
              <div key={i} className="text-center py-1.5 px-1 rounded-lg bg-neutral-50">
                <div className="text-[10px] font-medium text-neutral-500 mb-0.5">{day.dayOfWeek?.slice(0, 3)}</div>
                <div className="text-xs font-bold text-neutral-800">{Math.round(day.tempHigh || 0)}&deg;</div>
                <div className="text-[10px] text-neutral-400">{Math.round(day.tempLow || 0)}&deg;</div>
                {(day.precipitation ?? 0) > 20 && (
                  <div className="text-[9px] text-primary-500 font-medium mt-0.5">{day.precipitation}%</div>
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
      {/* Route header */}
      <div className="px-3 py-2 bg-primary-50 border-b border-primary-100">
        <div className="text-xs font-bold text-primary-800">
          {data.startPoint as string} → {data.endPoint as string}
        </div>
        <div className="text-[10px] text-primary-500">{data.riverName as string}</div>
      </div>

      <div className="px-3 py-2.5">
        {/* Stats row */}
        <div className="flex gap-4 mb-2">
          <div className="flex items-center gap-1.5">
            <div className="w-5 h-5 rounded-md bg-primary-100 flex items-center justify-center">
              <Droplets className="w-3 h-3 text-primary-600" />
            </div>
            <div>
              <div className="text-sm font-bold text-neutral-900">{data.distanceMiles as number} mi</div>
            </div>
          </div>
          {hours && (
            <div className="flex items-center gap-1.5">
              <div className="w-5 h-5 rounded-md bg-accent-100 flex items-center justify-center">
                <Clock className="w-3 h-3 text-accent-600" />
              </div>
              <div>
                <div className="text-sm font-bold text-neutral-900">{hours.low}–{hours.high} hrs</div>
              </div>
            </div>
          )}
          {data.shuttleDriveMinutes != null && (
            <div className="flex items-center gap-1.5">
              <div className="w-5 h-5 rounded-md bg-neutral-100 flex items-center justify-center">
                <Car className="w-3 h-3 text-neutral-600" />
              </div>
              <div>
                <div className="text-sm font-bold text-neutral-900">{Math.round(data.shuttleDriveMinutes as number)} min</div>
                <div className="text-[10px] text-neutral-400">shuttle</div>
              </div>
            </div>
          )}
        </div>

        {/* Hazards summary */}
        {hazards && hazards.length > 0 && (
          <div className="flex items-center gap-1.5 text-xs text-neutral-500 mb-2">
            <AlertTriangle className="w-3 h-3 text-yellow-500" />
            <span>{hazards.length} hazard{hazards.length !== 1 ? 's' : ''} on route</span>
          </div>
        )}

        {/* Plan link */}
        {planUrl && (
          <Link href={planUrl} className="inline-flex items-center gap-1 text-[11px] font-medium text-primary-600 hover:text-primary-800 transition-colors">
            Open in planner <ChevronRight className="w-3 h-3" />
          </Link>
        )}
      </div>
    </div>
  );
}
