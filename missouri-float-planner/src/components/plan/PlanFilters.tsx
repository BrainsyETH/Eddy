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
import Link from 'next/link';
import {
  SlidersHorizontal,
  Waves,
  Type,
  Gauge,
  Wind,
  Sailboat,
  Tent,
  Droplets,
  Mountain,
  Eye,
  Landmark,
  CircleDot,
  Star,
  Camera,
  type LucideIcon,
} from 'lucide-react';
import {
  conditionColor,
  CONDITION_ORDER,
  conditionDef,
  type ConditionCode,
} from '@shared/condition-system';

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
  /** Animated downstream flow particles (presentation, session-only). */
  showFlow: boolean;
  onToggleFlow: () => void;
  /** Master POI visibility. */
  showPOIs: boolean;
  onTogglePOIs: () => void;
  /** Community river-photo pins. */
  showPhotos: boolean;
  onTogglePhotos: () => void;
  /** POI categories present on the current river (raw `type` values). */
  availableCategories: string[];
  /** Categories currently hidden (empty = all shown). */
  hiddenCategories: Set<string>;
  onToggleCategory: (category: string) => void;
  /** Statewide rivers per condition (drives the legend-chip counts). */
  conditionCounts: Record<ConditionCode, number>;
  /** Conditions the network is filtered to (empty = show all). */
  conditionFilter: ReadonlySet<ConditionCode>;
  onToggleCondition: (code: ConditionCode) => void;
  onClearConditionFilter: () => void;
  /** Newest actual USGS reading timestamp (freshness stamp). */
  readingsAsOf?: string | null;
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
  showFlow,
  onToggleFlow,
  showPOIs,
  onTogglePOIs,
  showPhotos,
  onTogglePhotos,
  availableCategories,
  hiddenCategories,
  onToggleCategory,
  conditionCounts,
  conditionFilter,
  onToggleCondition,
  onClearConditionFilter,
  readingsAsOf = null,
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
    (conditionFilter.size > 0 ? 1 : 0) +
    (!showPOIs ? 1 : Math.min(hiddenCategories.size, categories.length));

  // The single number the legend exists to answer: how much of the state
  // is floatable right now (Observatory's "N/M go", planner-toned).
  const totalRivers = Object.values(conditionCounts).reduce((a, b) => a + b, 0);
  const floatableCount = (conditionCounts.good ?? 0) + (conditionCounts.flowing ?? 0);
  const conditionFilterActive = conditionFilter.size > 0;
  const matchingCount = [...conditionFilter].reduce(
    (sum, code) => sum + (conditionCounts[code] ?? 0),
    0,
  );

  // Freshness = the newest actual gauge reading, not fetch time. Same-day
  // shows time only; an older stamp keeps its date so the age is unmissable.
  const stampDate = readingsAsOf ? new Date(readingsAsOf) : null;
  const stamp =
    stampDate && !Number.isNaN(stampDate.getTime())
      ? stampDate.toLocaleString(
          undefined,
          stampDate.toDateString() === new Date().toDateString()
            ? { hour: 'numeric', minute: '2-digit' }
            : { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' },
        )
      : null;

  return (
    <div ref={rootRef} className={className}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="Map filters"
        className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold shadow-lg transition-opacity hover:opacity-90"
        style={{
          // Solid surface, no color-mix/translucency: older mobile Safari
          // drops unsupported backgrounds entirely, which over satellite
          // imagery means unreadable — the bug this file just fixed.
          background: 'var(--color-surface)',
          color: 'var(--color-text-primary)',
        }}
      >
        <SlidersHorizontal className="h-4 w-4" />
        <span>Filters</span>
        {activeFilterCount > 0 && (
          <span className="grid h-5 min-w-5 place-items-center rounded-full bg-primary-600 px-1 text-[11px] font-bold text-white">
            {activeFilterCount}
          </span>
        )}
      </button>

      {/* SOLID theme surface (never translucent): this floats over satellite
          imagery, where a see-through panel makes every label unreadable.
          Colors come from the global semantic tokens so dark mode holds.
          Height clamps to the viewport with internal scroll — the panel
          outgrew short phones. */}
      {open && (
        <div
          className="mt-2 max-h-[min(65dvh,36rem)] w-72 max-w-[calc(100vw-1.5rem)] overflow-y-auto overflow-x-hidden overscroll-contain rounded-xl border shadow-2xl"
          style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}
        >
          {/* Map layers */}
          <div className="px-3 py-2.5">
            <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-[color:var(--color-text-muted)]">
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
              icon={Wind}
              label="Water flow"
              sublabel="Animated current"
              on={showFlow}
              onClick={onToggleFlow}
            />
            <ToggleRow
              icon={Star}
              label="Points of interest"
              sublabel="Outfitters, camps, springs…"
              on={showPOIs}
              onClick={onTogglePOIs}
            />
            <ToggleRow
              icon={Camera}
              label="River photos"
              sublabel="Community water-level pics"
              on={showPhotos}
              onClick={onTogglePhotos}
            />
          </div>

          {/* Condition legend + filter — the chips explain the colors AND
              filter the network to matching rivers (the Observatory's
              verdict-tile pattern): tap "Flowing" to answer "where can I
              float today?". Counts are statewide, live. */}
          <div className="border-t border-[color:var(--color-border)] px-3 py-2.5">
            <div className="mb-2 flex items-baseline justify-between gap-2">
              <p className="text-[11px] font-bold uppercase tracking-wider text-[color:var(--color-text-muted)]">
                River conditions
              </p>
              {totalRivers > 0 && (
                <span className="text-[11px] font-bold tabular-nums text-emerald-600">
                  {floatableCount}/{totalRivers} floatable
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-1">
              {CONDITION_ORDER.map((code) => {
                const n = conditionCounts[code] ?? 0;
                const selected = conditionFilter.has(code);
                const color = conditionColor(code);
                // A condition with no rivers right now can't be filtered to
                // (it would empty the map), so its chip is inert and dim.
                const interactive = n > 0;
                return (
                  <button
                    key={code}
                    type="button"
                    disabled={!interactive}
                    aria-pressed={selected}
                    onClick={() => onToggleCondition(code)}
                    title={
                      !interactive
                        ? `${conditionDef(code).label} — no rivers right now`
                        : selected
                          ? `Stop filtering by ${conditionDef(code).label}`
                          : `Show only ${conditionDef(code).label} rivers`
                    }
                    className={`flex items-center gap-1.5 rounded-md border px-1.5 py-1.5 text-left text-xs transition-all ${
                      !interactive
                        ? 'cursor-default opacity-40'
                        : 'hover:bg-[var(--color-background)]'
                    } ${conditionFilterActive && !selected ? 'opacity-50' : ''} ${
                      selected
                        ? 'font-semibold text-[color:var(--color-text-primary)]'
                        : 'text-[color:var(--color-text-secondary)]'
                    }`}
                    style={{
                      borderColor: selected ? color : 'transparent',
                      background: selected ? `${color}1f` : undefined,
                    }}
                  >
                    <span
                      className="h-2.5 w-2.5 flex-shrink-0 rounded-full border border-white shadow-sm"
                      style={{ backgroundColor: color }}
                    />
                    <span className="min-w-0 flex-1 truncate">{conditionDef(code).label}</span>
                    <span className="text-[10px] font-semibold tabular-nums text-[color:var(--color-text-muted)]">
                      {n}
                    </span>
                  </button>
                );
              })}
            </div>
            {/* Filter status / discoverability: when filtering, the match
                count + clear; otherwise a faint prompt so the chips read as
                interactive, not just a readout. */}
            {conditionFilterActive ? (
              <button
                type="button"
                onClick={onClearConditionFilter}
                className="mt-1.5 flex w-full items-center justify-between rounded-md border border-primary-200 bg-primary-50 px-2 py-1 text-[11px] font-semibold text-primary-700 transition-colors hover:bg-primary-100"
              >
                <span>
                  Showing {matchingCount} {matchingCount === 1 ? 'river' : 'rivers'}
                </span>
                <span>Clear ×</span>
              </button>
            ) : (
              <p className="mt-1.5 text-[10px] text-[color:var(--color-text-muted)]">
                Tap a condition to filter the map
              </p>
            )}
          </div>

          {/* POI categories — only when POIs are on and the river has any */}
          {showPOIs && categories.length > 0 && (
            <div className="border-t border-[color:var(--color-border)] px-3 py-2.5">
              <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-[color:var(--color-text-muted)]">
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
                      className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                        active
                          ? 'border-primary-600 bg-primary-600 text-white'
                          : 'border-[color:var(--color-border)] bg-[var(--color-surface)] text-[color:var(--color-text-secondary)] hover:border-primary-300'
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

          {/* Provenance footer: how fresh the colors are, and the statewide
              dashboard the readings come from. Truncates instead of wrapping
              ("15-/min refresh" read broken on phones); cadence lives in the
              tooltip. */}
          <div
            className="flex items-center justify-between gap-2 border-t px-3 py-2"
            style={{ borderColor: 'var(--color-border)', background: 'var(--color-background)' }}
          >
            <span
              className="min-w-0 truncate text-[10px] tabular-nums text-[color:var(--color-text-muted)]"
              title="Refreshes every 15 minutes"
            >
              USGS · {stamp ? `as of ${stamp}` : 'live readings'}
            </span>
            <Link
              href="/river-map"
              className="whitespace-nowrap text-[10px] font-bold text-primary-600 hover:text-primary-700"
            >
              Statewide map →
            </Link>
          </div>
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
      className="flex w-full items-center gap-2.5 rounded-lg px-1.5 py-2 text-left transition-colors hover:bg-[var(--color-background)]"
    >
      <Icon
        className={`h-4 w-4 shrink-0 ${on ? 'text-primary-600' : 'text-[color:var(--color-text-muted)]'}`}
      />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-[color:var(--color-text-primary)]">
          {label}
        </span>
        <span className="block truncate text-[11px] text-[color:var(--color-text-muted)]">
          {sublabel}
        </span>
      </span>
      {/* Track + knob */}
      <span
        className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
          on ? 'bg-primary-600' : 'bg-[var(--color-border-strong)]'
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
