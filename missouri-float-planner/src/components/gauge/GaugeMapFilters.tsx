'use client';

import { FLOW_BAND_ORDER, FLOW_BAND_SYSTEM } from '@shared/flow-band';
import type { NationalGaugeState } from '@/hooks/useNationalGauges';
import type { GaugeFilter } from '@/lib/gauges/map-index';

/** Shared by the planner filter panel and the Live River Map dock. */
export default function GaugeMapFilters({ state, dark = false }: { state: NationalGaugeState; dark?: boolean }) {
  const { layers, setLayers, filters } = state;
  const enabled = layers.rated || layers.other;
  const choices: { key: GaugeFilter; label: string }[] = [
    ...FLOW_BAND_ORDER.map(key => ({ key, label: FLOW_BAND_SYSTEM[key].label })),
    { key: 'flow', label: 'Reports flow' }, { key: 'stage', label: 'Reports stage' }, { key: 'historical', label: 'Include historical' },
  ];
  const buttonClass = `min-h-11 rounded-lg border px-2 py-1.5 text-xs font-semibold ${dark ? 'border-white/30' : 'border-neutral-300'}`;
  return <section aria-label="USGS gauge filters" className={`my-2 space-y-2 ${dark ? 'text-white' : 'text-neutral-800'}`}>
    <button type="button" aria-pressed={enabled} onClick={() => setLayers({ rated: !enabled, other: !enabled })}
      className={`${buttonClass} flex w-full items-center justify-between text-sm`}>
      <span>USGS gauges</span><span>{enabled ? 'On' : 'Off'}</span>
    </button>
    <div className="grid grid-cols-2 gap-2">
      {(['rated', 'other'] as const).map(key => <button key={key} type="button" aria-pressed={layers[key]}
        className={`${buttonClass} ${layers[key] ? dark ? 'bg-primary-700' : 'bg-primary-50' : 'opacity-60'}`}
        onClick={() => setLayers(previous => ({ ...previous, [key]: !previous[key] }))}>
        {key === 'rated' ? 'Eddy-rated' : 'Other USGS'} · {layers[key] ? 'On' : 'Off'}
      </button>)}
    </div>
    {layers.other && <>
      <p className="text-xs">Other USGS gauges show measurements, without an Eddy float rating.</p>
      <details>
        <summary className="cursor-pointer py-2 text-xs font-semibold">Filter other gauges{filters.size > 0 ? ` (${filters.size})` : ''}</summary>
        <p className="mb-2 text-xs">Flow compared with the usual flow for this time of year</p>
        <div className="flex flex-wrap gap-1">
          {choices.map(({ key, label }) => <button key={key} type="button" aria-pressed={filters.has(key)}
            onClick={() => state.toggleFilter(key)} className={`${buttonClass} ${filters.has(key) ? 'bg-primary-700 text-white' : ''}`}>
            {label}
          </button>)}
        </div>
        {filters.size > 0 && <button type="button" className="min-h-11 text-xs underline" onClick={state.clearFilters}>Clear gauge filters</button>}
      </details>
      {state.loading && <p role="status" className="text-xs">Loading USGS gauges…</p>}
      {state.error && <p role="status" className="text-xs">{state.hasData ? 'Gauge refresh failed. Showing previous observations.' : 'USGS gauges could not load.'} <button type="button" className="min-h-11 underline" onClick={state.retry}>Retry gauges</button></p>}
      {!state.loading && !state.error && state.gauges.length === 0 && <p role="status" className="text-xs">No gauges match these filters.</p>}
    </>}
  </section>;
}
