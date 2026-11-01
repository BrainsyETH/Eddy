'use client';

// src/components/gauge/GaugeMapFilters.tsx
// The USGS gauge layer: one row, then the refinements that only make sense
// once it is on. Shared by the planner filter panel and the Live River Map dock.
//
// ── One row for one question ────────────────────────────────────────────────
// "Show me gauges" is one switch, as in the app's layers sheet
// (eddy-ios/src/map/layers.ts, the `gauges` row). Which gauges is a refinement
// under it: two tier chips, Eddy-rated and Other, that partition the same USGS
// network. They used to be a third and fourth on/off button beside a master
// one, which made three controls answer the same question.
//
// ── The colour key IS the filter ────────────────────────────────────────────
// The flow-band chips explain the colours on the map and narrow to them, the
// same pattern as the river-condition chips below this section. There used to
// be a swatch legend AND, behind a disclosure, a second copy of the same five
// swatches as filter buttons, with an explainer paragraph between them.
//
// Bands and traits keep iOS's semantics (filterMapGauges): bands OR together,
// "Reports flow" / "Reports stage" must both hold, and historical is inclusion.

import { FLOW_BAND_ORDER, FLOW_BAND_SYSTEM, FLOW_BAND_UNKNOWN_SOLID } from '@shared/flow-band';
import type { NationalGaugeState } from '@/hooks/useNationalGauges';
import { REFERENCE_CLUSTER_FILL, REFERENCE_CLUSTER_INK, type GaugeFilter } from '@/lib/gauges/map-index';
import { EDDY_IMAGES } from '@/constants';
import { EddyIcon } from '@/components/ui/EddyIcon';
import { LayerChip, LayerRow } from '@/components/ui/LayerRow';

const TRAITS: { key: GaugeFilter; label: string }[] = [
  { key: 'flow', label: 'Reports flow' },
  { key: 'stage', label: 'Reports stage' },
  { key: 'historical', label: 'Include historical' },
];

function Swatch({ color }: { color: string }) {
  return <span aria-hidden className="inline-block h-2.5 w-2.5 shrink-0 rounded-full border border-white/70 shadow-[0_0_0_1px_rgba(45,42,36,0.25)]" style={{ background: color }} />;
}

/**
 * Eddy's face marks the tier Eddy has graded, as against the rest of the USGS
 * network beside it — the app's `eddyRated` symbol, for the same reason: the
 * difference between the two chips is literally "did Eddy grade this one".
 */
function EddyRatedMark() {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={EDDY_IMAGES.favicon} alt="" aria-hidden width={16} height={16} className="h-4 w-4 shrink-0 rounded-full" />
  );
}

export default function GaugeMapFilters({ state, dark = false, note }: {
  state: NationalGaugeState; dark?: boolean;
  /** Context the map adds, e.g. that the timeline replays only Eddy's rivers. */
  note?: string | null;
}) {
  const { layers, setLayers, filters } = state;
  const enabled = layers.rated || layers.other;
  const muted = dark ? 'text-white/65' : 'text-[color:var(--color-text-muted)]';
  const filtering = filters.size > 0;
  const shown = state.gauges.length;

  return <section aria-label="USGS gauge filters" className={dark ? 'text-white' : 'text-[color:var(--color-text-primary)]'}>
    <LayerRow
      dark={dark}
      mark={<EddyIcon name="gaugeStation" size={18} />}
      label="River gauges"
      sublabel="Live USGS readings"
      on={enabled}
      onClick={() => setLayers({ rated: !enabled, other: !enabled })}
    />

    {enabled && <div className="space-y-2 pb-2 pl-[2.6rem] pr-1">
      <div role="group" aria-label="Which gauges" className="grid grid-cols-2 gap-1.5">
        <LayerChip dark={dark} pressed={layers.rated} title="Gauges Eddy rates for floating"
          onClick={() => setLayers(previous => ({ ...previous, rated: !previous.rated }))}>
          <EddyRatedMark /><span className="truncate">Eddy-rated</span>
        </LayerChip>
        <LayerChip dark={dark} pressed={layers.other} title="Every other USGS gauge, not rated by Eddy"
          onClick={() => setLayers(previous => ({ ...previous, other: !previous.other }))}>
          <EddyIcon name="gaugeStation" size={16} /><span className="truncate">Other gauges</span>
        </LayerChip>
      </div>

      {layers.other && <>
        <p className={`text-[11px] leading-snug ${muted}`}>
          Other gauges aren&rsquo;t rated by Eddy. Color compares flow with the usual for today.
        </p>
        <div role="group" aria-label="Other gauge colors" className="grid grid-cols-2 gap-1">
          {FLOW_BAND_ORDER.map(key => (
            <LayerChip key={key} dark={dark} pressed={filters.has(key)} onClick={() => state.toggleFilter(key)}
              className={`!min-h-8 !border font-medium ${filtering && !filters.has(key) ? 'opacity-60' : ''}`}
              title={filters.has(key) ? `Stop filtering by ${FLOW_BAND_SYSTEM[key].label}` : `Show only ${FLOW_BAND_SYSTEM[key].label.toLowerCase()} gauges`}>
              <Swatch color={FLOW_BAND_SYSTEM[key].solid} /><span className="truncate">{FLOW_BAND_SYSTEM[key].label}</span>
            </LayerChip>
          ))}
          {/* A key, not a filter: "no comparison" is the absence of a band. */}
          <span className={`flex min-h-8 items-center gap-1.5 px-2 text-xs ${muted}`}>
            <Swatch color={FLOW_BAND_UNKNOWN_SOLID} />No comparison
          </span>
        </div>
        <div role="group" aria-label="Gauge readings" className="flex flex-wrap gap-1">
          {TRAITS.map(({ key, label }) => (
            <LayerChip key={key} dark={dark} pressed={filters.has(key)} onClick={() => state.toggleFilter(key)}
              className="!min-h-8 !border !px-1.5 text-[11px] font-medium">
              {label}
            </LayerChip>
          ))}
        </div>
        {filtering ? (
          <div className={`flex items-center justify-between gap-2 rounded-md border px-2 py-1 text-[11px] font-semibold ${dark ? 'border-primary-300/50 bg-primary-300/10' : 'border-primary-200 bg-primary-50 text-primary-700'}`}>
            <span role="status">{state.loading ? 'Filtering…' : `${shown.toLocaleString()} ${shown === 1 ? 'gauge' : 'gauges'} nationwide`}</span>
            <button type="button" aria-label="Clear gauge filters" className="min-h-8 px-1 underline-offset-2 hover:underline" onClick={state.clearFilters}>
              Clear ×
            </button>
          </div>
        ) : (
          <p className={`flex items-center gap-1.5 text-[10px] ${muted}`}>
            <span>Tap a color to filter</span>
            <span aria-hidden>·</span>
            <span aria-hidden className="grid h-3.5 place-items-center rounded-[3px] border px-0.5 text-[8px] font-bold"
              style={{ minWidth: 14, background: REFERENCE_CLUSTER_FILL, borderColor: REFERENCE_CLUSTER_INK, color: REFERENCE_CLUSTER_INK }}>3</span>
            <span>grouped gauges</span>
          </p>
        )}
        {note && <p role="note" className={`text-xs ${muted}`}>{note}</p>}
        {state.loading && !filtering && <p role="status" className={`text-xs ${muted}`}>Loading USGS gauges…</p>}
        {state.error && <p role="status" className="text-xs">{state.hasData ? 'Gauge refresh failed. Showing previous observations.' : 'USGS gauges could not load.'} <button type="button" className="min-h-11 underline" onClick={state.retry}>Retry gauges</button></p>}
        {state.namesError && <p role="status" className="text-xs">Station names could not refresh. Site numbers remain available. <button type="button" className="min-h-11 underline" onClick={state.retryNames}>Retry names</button></p>}
        {!state.loading && !state.error && shown === 0 && <p role="status" className={`text-xs ${muted}`}>No gauges match these filters.</p>}
      </>}
    </div>}
  </section>;
}
