'use client';

import { FLOW_BAND_ORDER, FLOW_BAND_SYSTEM, FLOW_BAND_UNKNOWN_SOLID } from '@shared/flow-band';
import type { NationalGaugeState } from '@/hooks/useNationalGauges';
import { REFERENCE_CLUSTER_FILL, REFERENCE_CLUSTER_INK, type GaugeFilter } from '@/lib/gauges/map-index';

function Swatch({ color }: { color: string }) {
  return <span aria-hidden className="inline-block h-2.5 w-2.5 shrink-0 rounded-full border border-white/70" style={{ background: color }} />;
}

/**
 * Shared by the planner filter panel and the Live River Map dock. The layer
 * switches and the color key stay visible; narrowing filters fold away.
 */
export default function GaugeMapFilters({ state, dark = false, note }: {
  state: NationalGaugeState; dark?: boolean;
  /** Context the map adds, e.g. that the timeline replays only Eddy's rivers. */
  note?: string | null;
}) {
  const { layers, setLayers, filters } = state;
  const enabled = layers.rated || layers.other;
  const choices: { key: GaugeFilter; label: string }[] = [
    ...FLOW_BAND_ORDER.map(key => ({ key, label: FLOW_BAND_SYSTEM[key].label })),
    { key: 'flow', label: 'Reports flow' }, { key: 'stage', label: 'Reports stage' }, { key: 'historical', label: 'Include historical' },
  ];
  const buttonClass = `min-h-11 rounded-lg border px-2 py-1.5 text-xs font-semibold ${dark ? 'border-white/30' : 'border-neutral-300'}`;
  const muted = dark ? 'text-white/70' : 'text-neutral-600';
  return <section aria-label="USGS gauge filters" className={`my-2 space-y-2 ${dark ? 'text-white' : 'text-neutral-800'}`}>
    <button type="button" aria-pressed={enabled} onClick={() => setLayers({ rated: !enabled, other: !enabled })}
      className={`${buttonClass} flex w-full items-center justify-between text-sm`}>
      <span>USGS gauges</span><span>{enabled ? 'On' : 'Off'}</span>
    </button>
    <div className="grid grid-cols-2 gap-2">
      {(['rated', 'other'] as const).map(key => <button key={key} type="button" aria-pressed={layers[key]}
        className={`${buttonClass} whitespace-nowrap !px-1.5 ${layers[key] ? dark ? 'bg-primary-700' : 'bg-primary-50' : 'opacity-60'}`}
        onClick={() => setLayers(previous => ({ ...previous, [key]: !previous[key] }))}>
        {key === 'rated' ? 'Eddy-rated' : 'Other USGS'} · {layers[key] ? 'On' : 'Off'}
      </button>)}
    </div>
    {layers.other && <>
      <ul aria-label="Other gauge colors" className={`flex flex-wrap gap-x-2.5 gap-y-1 text-[11px] ${muted}`}>
        {FLOW_BAND_ORDER.map(key => <li key={key} className="flex items-center gap-1"><Swatch color={FLOW_BAND_SYSTEM[key].solid} />{FLOW_BAND_SYSTEM[key].label}</li>)}
        <li className="flex items-center gap-1"><Swatch color={FLOW_BAND_UNKNOWN_SOLID} />No comparison</li>
        <li className="flex items-center gap-1">
          <span aria-hidden className="grid h-3.5 place-items-center rounded-full border px-0.5 text-[8px] font-bold"
            style={{ minWidth: 14, background: REFERENCE_CLUSTER_FILL, borderColor: REFERENCE_CLUSTER_INK, color: REFERENCE_CLUSTER_INK }}>3</span>Group
        </li>
      </ul>
      {note && <p role="note" className={`text-xs ${muted}`}>{note}</p>}
      <details>
        <summary className="cursor-pointer py-2 text-xs font-semibold">Filter other gauges{filters.size > 0 ? ` (${filters.size})` : ''}</summary>
        <p className={`mb-2 text-xs ${muted}`}>Other USGS gauges show measurements, without an Eddy float rating. Colors compare flow with the usual flow for this time of year.</p>
        <div className="flex flex-wrap gap-1">
          {choices.map(({ key, label }) => <button key={key} type="button" aria-pressed={filters.has(key)}
            onClick={() => state.toggleFilter(key)} className={`${buttonClass} flex items-center gap-1.5 ${filters.has(key) ? 'bg-primary-700 text-white' : ''}`}>
            {key in FLOW_BAND_SYSTEM && <Swatch color={FLOW_BAND_SYSTEM[key as keyof typeof FLOW_BAND_SYSTEM].solid} />}{label}
          </button>)}
        </div>
        {filters.size > 0 && <button type="button" className="min-h-11 text-xs underline" onClick={state.clearFilters}>Clear gauge filters</button>}
      </details>
      {state.loading && <p role="status" className="text-xs">Loading USGS gauges…</p>}
      {state.error && <p role="status" className="text-xs">{state.hasData ? 'Gauge refresh failed. Showing previous observations.' : 'USGS gauges could not load.'} <button type="button" className="min-h-11 underline" onClick={state.retry}>Retry gauges</button></p>}
      {state.namesError && <p role="status" className="text-xs">Station names could not refresh. Site numbers remain available. <button type="button" className="min-h-11 underline" onClick={state.retryNames}>Retry names</button></p>}
      {!state.loading && !state.error && state.gauges.length === 0 && <p role="status" className="text-xs">No gauges match these filters.</p>}
    </>}
  </section>;
}
