'use client';
import { useEffect, useId, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { useRainDetail } from '@/hooks/useRainfall';
import { rainAmount, usableRain } from '@shared/rainfall';
import { rainfallMap, RAIN_MAP_BANDS } from '@shared/rainfall-map';
import { chartStamp } from '@shared/chart-calendar';

export default function RainDetail({ siteId, timeZone, onClose }: { siteId: string; timeZone: string; onClose: () => void }) {
  const ref = useFocusTrap<HTMLDivElement>(true, onClose);
  const { data, isError, refetch } = useRainDetail(siteId, true);
  const map = useMemo(() => data ? rainfallMap(data) : null, [data]);
  const id = `basin-${useId().replace(/:/g, '')}`;
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, []);
  return createPortal(<div className="fixed inset-0 z-[70] flex justify-end bg-neutral-900/50">
    <button className="absolute inset-0 cursor-default" aria-label="Close rain details" tabIndex={-1} onClick={onClose} />
    <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={`${id}-title`} tabIndex={-1}
      className="relative h-full w-full overflow-y-auto bg-secondary-50 p-5 shadow-xl sm:max-w-lg">
      <div className="flex items-center justify-between gap-3">
        <h2 id={`${id}-title`} className="font-display text-2xl font-semibold text-primary-800">Rain upstream</h2>
        <button onClick={onClose} className="flex h-11 w-11 items-center justify-center rounded-lg text-neutral-700 hover:bg-secondary-100" aria-label="Done"><X className="h-5 w-5" /></button>
      </div>
      <p className="mt-1 text-sm text-neutral-600">Rain across the land that drains to this gauge.</p>
      {isError ? <div role="status" className="mt-6 text-sm text-neutral-600">Rain data unavailable. <button onClick={() => void refetch()} className="min-h-11 font-semibold text-primary-700 underline">Try again</button></div>
        : !data || !map ? <p role="status" className="mt-6 text-sm text-neutral-600">Loading rain upstream…</p> : <>
          <p className="mt-4 text-sm font-semibold text-neutral-800">{data.basin.name}</p>
          <p className="text-xs text-neutral-600">{Math.round(data.basin.areaSqMi).toLocaleString()} sq mi · Radar estimate</p>
          <svg viewBox="0 0 320 270" className="mt-4 w-full rounded-xl border border-secondary-200 bg-white" role="img" aria-label={`Watershed upstream of ${data.basin.name}${data.shading ? ', shaded by estimated rain in the past 24 hours' : ', rainfall shading unavailable'}`}>
            <defs><clipPath id={id}><path d={map.path} fillRule="evenodd" clipRule="evenodd" /></clipPath></defs>
            <path d={map.path} fill="var(--color-neutral-200)" fillRule="evenodd" />
            <g clipPath={`url(#${id})`}>{map.shading.map((d, i) => <path key={i} d={d} fill="var(--color-primary-700)" fillOpacity={i === 0 ? 0.08 : 0.15 + i * 0.16} />)}</g>
            <path d={map.path} fill="none" stroke="var(--color-primary-800)" strokeWidth="1.5" />
            <circle cx={map.gauge.x} cy={map.gauge.y} r="4" fill="var(--color-accent-600)" stroke="white" strokeWidth="2" />
            <text x="300" y="22" textAnchor="middle" fill="var(--color-neutral-700)" fontSize="12">N ↑</text>
          </svg>
          <p className="mt-2 text-xs text-neutral-600">{data.shading ? `24-hour rain · through ${chartStamp(data.shading.end, timeZone)}` : 'Rainfall shading unavailable'} · Dot: gauge</p>
          {data.shading && <div className="mt-3 flex flex-wrap gap-x-3 gap-y-2 text-xs text-neutral-600" aria-label="Rainfall in inches">
            {RAIN_MAP_BANDS.map((label, i) => <span key={label} className="inline-flex items-center gap-1"><span className="inline-block h-3 w-3 border border-primary-200 bg-primary-700" style={{ opacity: i === 0 ? 0.08 : 0.15 + i * 0.16 }} />{label} in</span>)}
            <span className="inline-flex items-center gap-1"><span className="inline-block h-3 w-3 bg-neutral-200" />No estimate</span>
          </div>}
          <dl className="mt-5 grid grid-cols-2 gap-3">
            {[24, 72].map(hours => { const total = data.totals.find(row => row.hours === hours); return <div key={hours} className="rounded-lg border border-secondary-200 bg-white p-3">
              <dt className="text-xs text-neutral-600">Past {hours} hours</dt><dd className="mt-1 font-mono text-xl font-semibold text-primary-800">{rainAmount(total?.inches)}</dd>
              {total && <dd className="mt-1 text-xs text-neutral-500">Through {chartStamp(total.end, timeZone)}{total.coverage < 1 ? ` · ${Math.round(total.coverage * 100)}% coverage` : ''}</dd>}
            </div>; })}
          </dl>
          <p className="mt-4 text-xs text-neutral-600">Radar estimates can differ from rain measured on the ground. Gaps mean missing data.</p>
          <details className="mt-4 border-t border-secondary-200 pt-2"><summary className="cursor-pointer py-3 text-sm font-semibold text-primary-800">Hourly rain</summary>
            <div className="max-h-72 overflow-auto"><table className="w-full text-left text-xs"><caption className="sr-only">Estimated upstream rain by hour, in inches</caption><thead><tr><th className="py-2">Hour ending</th><th>Rain</th></tr></thead>
              <tbody>{data.hourly.slice().reverse().map(row => <tr key={row.start} className="border-t border-neutral-200"><td className="py-2">{chartStamp(row.end, timeZone)}</td><td>{rainAmount(usableRain(row) ? row.inches : null)}</td></tr>)}</tbody></table></div>
          </details>
          <p className="mt-4 text-xs text-neutral-500">Rain: NOAA MRMS · Watershed: USGS</p>
        </>}
    </div>
  </div>, document.body);
}
