'use client';

// src/components/plan/PlanFilters.tsx
// Plan-page map filter control — the single home for every DATA-layer
// toggle: the statewide "nearby rivers" condition network, river name
// labels, gauge stations, and which categories of points-of-interest to
// surface (outfitters, camps, springs…). Map PRESENTATION controls (style,
// radar, 3D, expand) stay on MapContainer's right-hand rail; content
// belongs here so there is exactly one place to answer "what am I seeing?".
//
// State is owned by PlanPageClient and threaded in; this component is pure
// presentation. POI filtering uses a HIDDEN-set model (empty = show all), so
// the default is "everything on" and a paddler's choices persist as they
// switch rivers.

import { useState, useRef, useEffect } from 'react';
import {
  SlidersHorizontal,
  Waves,
  Type,
  Gauge,
  Sailboat,
  Tent,
  Droplets,
  Mountain,
  Eye,
  Landmark,
  CircleDot,
  Star,
  type LucideIcon,
} from 'lucide-react';
import { conditionColor, CONDITION_ORDER, conditionDef } from '@shared/condition-system';

// Canonical POI category → label + icon. Order is the display order in the
// panel; only categories actually present on the current river are shown.
const POI_CATEGORY_META: Record<string, { label: string; icon: LucideIcon }> = {
  outfitter: { label: 'Outfitters', icon: Sailboat },
  float_camp: { label: 'Camps', icon: Tent },
  spring: { label: 'Springs', icon: Droplets },
  waterfall: { label: 'Waterfalls', icon: Droplets },
  scenic_viewpoint: { label: 'Scenic', icon: Eye },
  cave: { label: 'Caves', icon: Mountain },
  historical_site: { label: 'Historic', icon: Landmark },
  geological: { label: 'Geology', icon: CircleDot },
  other: { label: 'Other', icon: Star },
};
const CATEGORY_ORDER = Object.keys(POI_CATEGORY_META);

export interface PlanFiltersProps {
  /** Statewide condition network (every other river) on/off. */
  showNetwork: boolean;
  onToggleNetwork: () => void;
  /** River name labels along the condition-colored lines. */
  showRiverNames: boolean;
  onToggleRiverNames: () => void;
  /** USGS gauge station pins. */
  showGauges: boolean;
  onToggleGauges: () => void;
  /** Master POI visibility. */
  showPOIs: boolean;
  onTogglePOIs: () => void;
  /** POI categories present on the current river (raw `type` values). */
  availableCategories: string[];
  /** Categories currently hidden (empty = all shown). */
  hiddenCategories: Set<string>;
  onToggleCategory: (category: string) => void;
  /**
   * Positioning of the root. Defaults to floating at the map's top-left;
   * pass e.g. "relative" to slot it into an overlay stack alongside the
   * weather widget so the two never overlap.
   */
  className?: string;
}

export default function PlanFilters({
  showNetwork,
  onToggleNetwork,
  showRiverNames,
  onToggleRiverNames,
  showGauges,
  onToggleGauges,
  showPOIs,
  onTogglePOIs,
  availableCategories,
  hiddenCategories,
  onToggleCategory,
  className = 'absolute top-4 left-4 z-30',
}: PlanFiltersProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const categories = CATEGORY_ORDER.filter((c) => availableCategories.includes(c));
  // Badge count: how many filters are narrowing the view from the default
  // (everything on).
  const activeFilterCount =
    (showNetwork ? 0 : 1) +
    (showRiverNames ? 0 : 1) +
    (showGauges ? 0 : 1) +
    (!showPOIs ? 1 : Math.min(hiddenCategories.size, categories.length));

  return (
    <div ref={rootRef} className={className}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="Map filters"
        className="flex items-center gap-2 rounded-lg bg-white/95 px-3 py-2 text-sm font-semibold text-neutral-700 shadow-lg backdrop-blur-md transition-colors hover:bg-white"
      >
        <SlidersHorizontal className="h-4 w-4" />
        <span>Filters</span>
        {activeFilterCount > 0 && (
          <span className="grid h-5 min-w-5 place-items-center rounded-full bg-primary-600 px-1 text-[11px] font-bold text-white">
            {activeFilterCount}
          </span>
        )}
      </button>

      {open && (
        <div className="mt-2 w-64 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-neutral-200 bg-white/97 shadow-2xl backdrop-blur-md">
          {/* Map layers */}
          <div className="px-3 py-2.5">
            <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-neutral-400">
              Show on map
            </p>
            <ToggleRow
              icon={Waves}
              label="Nearby rivers"
              sublabel="Live conditions statewide"
              on={showNetwork}
              onClick={onToggleNetwork}
            />
            <ToggleRow
              icon={Type}
              label="River names"
              sublabel="Labels along each river"
              on={showRiverNames}
              onClick={onToggleRiverNames}
            />
            <ToggleRow
              icon={Gauge}
              label="Gauge stations"
              sublabel="Live USGS readings"
              on={showGauges}
              onClick={onToggleGauges}
            />
            <ToggleRow
              icon={Star}
              label="Points of interest"
              sublabel="Outfitters, camps, springs…"
              on={showPOIs}
              onClick={onTogglePOIs}
            />
          </div>

          {/* Condition legend — the network colors carry meaning; make the
              "Eddy green" scale learnable right where users control it. */}
          <div className="border-t border-neutral-100 px-3 py-2.5">
            <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-neutral-400">
              River conditions
            </p>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1">
              {CONDITION_ORDER.map((code) => (
                <span key={code} className="flex items-center gap-1.5 text-xs text-neutral-600">
                  <span
                    className="h-2.5 w-2.5 flex-shrink-0 rounded-full border border-white shadow-sm"
                    style={{ backgroundColor: conditionColor(code) }}
                  />
                  {conditionDef(code).label}
                </span>
              ))}
            </div>
          </div>

          {/* POI categories — only when POIs are on and the river has any */}
          {showPOIs && categories.length > 0 && (
            <div className="border-t border-neutral-100 px-3 py-2.5">
              <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-neutral-400">
                Point types
              </p>
              <div className="flex flex-wrap gap-1.5">
                {categories.map((c) => {
                  const meta = POI_CATEGORY_META[c];
                  const Icon = meta.icon;
                  const active = !hiddenCategories.has(c);
                  return (
                    <button
                      key={c}
                      type="button"
                      onClick={() => onToggleCategory(c)}
                      aria-pressed={active}
                      className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors ${
                        active
                          ? 'border-primary-600 bg-primary-600 text-white'
                          : 'border-neutral-200 bg-white text-neutral-500 hover:border-primary-300'
                      }`}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {meta.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ToggleRow({
  icon: Icon,
  label,
  sublabel,
  on,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  sublabel: string;
  on: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className="flex w-full items-center gap-2.5 rounded-lg px-1.5 py-1.5 text-left transition-colors hover:bg-neutral-50"
    >
      <Icon className={`h-4 w-4 shrink-0 ${on ? 'text-primary-600' : 'text-neutral-400'}`} />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-neutral-700">{label}</span>
        <span className="block truncate text-[11px] text-neutral-400">{sublabel}</span>
      </span>
      {/* Track + knob */}
      <span
        className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
          on ? 'bg-primary-600' : 'bg-neutral-300'
        }`}
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${
            on ? 'left-[18px]' : 'left-0.5'
          }`}
        />
      </span>
    </button>
  );
}
