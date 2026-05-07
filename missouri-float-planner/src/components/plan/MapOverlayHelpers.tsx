'use client';

// src/components/plan/MapOverlayHelpers.tsx
// Map-first UX overlays: state-aware interaction hint, live route stats badge,
// and a marker color legend. These ride on top of the MapContainer.

import { useState, useEffect } from 'react';
import { MousePointerClick, X, MapPin, Info } from 'lucide-react';
import type { FloatPlan, AccessPoint } from '@/types/api';

const PUT_IN_COLOR = '#478559';
const TAKE_OUT_COLOR = '#f95d9b';
const NEUTRAL_COLOR = '#c7b8a6';

interface MapHintBannerProps {
  putInPoint: AccessPoint | null;
  takeOutPoint: AccessPoint | null;
}

// State-aware hint that teaches the map-first interaction.
export function MapHintBanner({ putInPoint, takeOutPoint }: MapHintBannerProps) {
  const [dismissed, setDismissed] = useState(false);

  // Reset dismissal whenever the selection state transitions to something new.
  const stateKey = putInPoint?.id || takeOutPoint?.id || 'none';
  useEffect(() => {
    setDismissed(false);
  }, [stateKey]);

  if (dismissed) return null;

  let primary: string;
  let secondary: string | null = null;

  if (!putInPoint && !takeOutPoint) {
    primary = 'Tap a marker to set your put-in';
    secondary = 'Then tap a second marker downstream for the take-out';
  } else if (putInPoint && !takeOutPoint) {
    primary = 'Now tap a take-out downstream';
    secondary = 'Or tap your put-in again to clear it';
  } else if (!putInPoint && takeOutPoint) {
    primary = 'Now tap a put-in upstream';
    secondary = null;
  } else {
    primary = 'Tap a different marker to swap';
    secondary = 'Tap the put-in or take-out again to clear';
  }

  return (
    <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 max-w-[92%] sm:max-w-md pointer-events-auto">
      <div className="flex items-start gap-2 pl-3 pr-2 py-2 bg-white/95 backdrop-blur-sm rounded-full shadow-lg border border-neutral-200">
        <div className="flex-shrink-0 mt-0.5 text-primary-600">
          <MousePointerClick className="w-4 h-4" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold text-neutral-800 leading-tight">{primary}</p>
          {secondary && (
            <p className="hidden sm:block text-[10px] text-neutral-500 leading-tight mt-0.5">{secondary}</p>
          )}
        </div>
        <button
          onClick={() => setDismissed(true)}
          aria-label="Dismiss hint"
          className="flex-shrink-0 -mr-0.5 p-1 rounded-full text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition-colors"
        >
          <X className="w-3.5 h-3.5" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

interface RouteStatsBadgeProps {
  plan: FloatPlan | null;
  isLoading?: boolean;
  className?: string;
}

// Floating "12.4 mi · 5–7 hrs" badge that keeps key route stats visible
// while the user is zooming or panning the map.
export function RouteStatsBadge({ plan, isLoading = false, className = '' }: RouteStatsBadgeProps) {
  if (!plan && !isLoading) return null;

  return (
    <div
      className={`absolute top-3 right-3 z-20 pointer-events-auto ${className}`}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-2 px-3 py-2 bg-white/95 backdrop-blur-sm rounded-xl shadow-lg border border-neutral-200">
        {isLoading || !plan ? (
          <div className="flex items-center gap-2 text-neutral-500">
            <span className="w-3 h-3 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-xs font-medium">Calculating…</span>
          </div>
        ) : (
          <>
            <div className="flex flex-col items-end leading-tight">
              <span className="text-[9px] font-semibold uppercase tracking-wider text-neutral-400">Distance</span>
              <span className="text-sm font-bold text-neutral-900">{plan.distance.formatted}</span>
            </div>
            <div className="w-px h-6 bg-neutral-200" aria-hidden="true" />
            <div className="flex flex-col items-end leading-tight">
              <span className="text-[9px] font-semibold uppercase tracking-wider text-neutral-400">Float time</span>
              <span className="text-sm font-bold text-neutral-900">
                {plan.floatTime?.formatted || '—'}
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

interface MapLegendProps {
  className?: string;
}

// Compact legend for marker colors. Collapsed by default; expands on click.
export function MapLegend({ className = '' }: MapLegendProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className={`absolute bottom-3 right-3 z-20 pointer-events-auto ${className}`}>
      {open ? (
        <div className="bg-white/95 backdrop-blur-sm rounded-xl shadow-lg border border-neutral-200 p-2.5 min-w-[180px]">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">Legend</span>
            <button
              onClick={() => setOpen(false)}
              aria-label="Close legend"
              className="p-0.5 rounded text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition-colors"
            >
              <X className="w-3 h-3" aria-hidden="true" />
            </button>
          </div>
          <ul className="space-y-1.5">
            <LegendRow color={PUT_IN_COLOR} label="Put-in" />
            <LegendRow color={TAKE_OUT_COLOR} label="Take-out" />
            <LegendRow color={NEUTRAL_COLOR} label="Other access" />
          </ul>
        </div>
      ) : (
        <button
          onClick={() => setOpen(true)}
          aria-label="Show map legend"
          className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white/95 backdrop-blur-sm rounded-full shadow-md border border-neutral-200 text-xs font-medium text-neutral-700 hover:bg-white transition-colors"
        >
          <Info className="w-3.5 h-3.5 text-primary-600" aria-hidden="true" />
          <span>Legend</span>
        </button>
      )}
    </div>
  );
}

function LegendRow({ color, label }: { color: string; label: string }) {
  return (
    <li className="flex items-center gap-2">
      <span
        className="inline-flex items-center justify-center w-4 h-4 rounded-full border border-white shadow-sm"
        style={{ backgroundColor: color }}
        aria-hidden="true"
      >
        <MapPin className="w-2.5 h-2.5 text-white" strokeWidth={3} />
      </span>
      <span className="text-xs text-neutral-700">{label}</span>
    </li>
  );
}
