import { chartGeometry } from '@shared/chart-geometry';
import { chartStamp } from '@shared/chart-calendar';
import { chartStatisticForUnit, chartStatisticLabel, resolutionNotice } from '@shared/chart-share';
import { buildZones } from '@shared/threshold-zones';
import type { ChartShareData } from '@/lib/gauges/chart-share-data';

/** Satori draws this SVG from the same model as the interactive charts. */
export type ChartImageData = Omit<ChartShareData, 'gauge'> & {
  gauge: Pick<ChartShareData['gauge'], 'name' | 'floodStages'>;
};
export function ChartShareImage({ data }: { data: ChartImageData }) {
  const { state, gauge, history, view, thresholds } = data;
  const geometry = chartGeometry(view, state.unit, 1010, 290)!;
  const stamp = (time: string | number) => chartStamp(time, state.timeZone);
  const series = (kind: 'observed' | 'forecast' | 'prior', color: string, dash?: string) => (
    <g>
      {geometry[kind].paths.map((d, i) => (
        <path key={i} d={d} fill="none" stroke={color} strokeWidth="3" strokeDasharray={dash} />
      ))}
      {geometry[kind].dots.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r="3" fill={color} />
      ))}
    </g>
  );
  const zones = thresholds?.thresholdUnit === state.unit ? buildZones(thresholds) : [];
  const unavailable = [
    state.layers.includes('lastYear') && !view.prior.length ? 'Last year unavailable' : '',
    state.layers.some((l) => l === 'typical' || l === 'median') && !view.typical.length
      ? 'Historical context unavailable'
      : '',
  ].filter(Boolean);
  return (
    <div
      style={{
        width: 1200,
        height: 630,
        display: 'flex',
        flexDirection: 'column',
        background: '#f8faf9',
        color: '#163d38',
        padding: '28px 42px',
        fontFamily: 'Fredoka',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 22 }}>
        <span>EDDY · SHARED CHART</span>
        <span>
          USGS {state.siteId} · {state.unit}
        </span>
      </div>
      <div
        style={{
          display: 'flex',
          fontSize: 32,
          marginTop: 10,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {gauge.name}
      </div>
      <div style={{ display: 'flex', fontSize: 16, marginTop: 5 }}>
        {stamp(state.visible.from)} — {stamp(state.visible.to)}
      </div>
      <div
        style={{
          display: 'flex',
          position: 'relative',
          marginTop: 22,
          marginLeft: 62,
          width: 1010,
          height: 290,
        }}
      >
        <svg width="1010" height="290" viewBox="0 0 1010 290" style={{ overflow: 'hidden' }}>
          <defs>
            <clipPath id="plot">
              <rect width="1010" height="290" />
            </clipPath>
          </defs>
          <g clipPath="url(#plot)">
            {geometry.yTicks.map((t) => (
              <line
                key={t.value}
                x1="0"
                x2="1010"
                y1={geometry.y(t.value)}
                y2={geometry.y(t.value)}
                stroke="#dbe5e2"
              />
            ))}
            {zones.map((z) => (
              <line
                key={z.key}
                x1="0"
                x2="1010"
                y1={geometry.y(z.min)}
                y2={geometry.y(z.min)}
                stroke={z.color}
                strokeDasharray="5 4"
                strokeOpacity="0.6"
              />
            ))}
            {state.unit === 'ft' &&
              gauge.floodStages &&
              [
                gauge.floodStages.actionFt,
                gauge.floodStages.floodFt,
                gauge.floodStages.moderateFt,
                gauge.floodStages.majorFt,
              ]
                .filter((v): v is number => v !== null && v > 0)
                .map((v, i) => (
                  <line
                    key={i}
                    x1="0"
                    x2="1010"
                    y1={geometry.y(v)}
                    y2={geometry.y(v)}
                    stroke="#8b5cf6"
                    strokeDasharray="5 4"
                  />
                ))}
            {state.layers.includes('typical') && geometry.area && (
              <path d={geometry.area} fill="#bda688" fillOpacity="0.3" />
            )}
            {state.layers.includes('median') && geometry.median && (
              <path
                d={geometry.median}
                fill="none"
                stroke="#a38259"
                strokeWidth="2"
                strokeDasharray="4 3"
              />
            )}
            {series('prior', '#9a6e39', '5 4')}
            {series('observed', '#117b6c')}
            {series('forecast', '#698eae', '7 5')}
          </g>
        </svg>
        {geometry.yTicks.map((t) => (
          <div
            key={t.value}
            style={{
              display: 'flex',
              position: 'absolute',
              right: 1020,
              top: geometry.y(t.value) - 10,
              fontSize: 15,
            }}
          >
            {state.unit === 'ft' ? t.value.toFixed(1) : Math.round(t.value).toLocaleString('en-US')}
          </div>
        ))}
      </div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginLeft: 62,
          width: 1010,
          marginTop: 8,
          fontSize: 14,
        }}
      >
        {geometry.xTicks.map((t) => (
          <span key={t.value}>
            {chartStamp(
              t.value,
              state.timeZone,
              Date.parse(state.visible.to) - Date.parse(state.visible.from) > 2 * 86_400_000,
            )}
          </span>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 18, fontSize: 16, marginTop: 15 }}>
        <span>Observed</span>
        {view.forecast.length > 0 && <span style={{ color: '#698eae' }}>NWS forecast</span>}
        {state.layers.includes('lastYear') && <span style={{ color: '#9a6e39' }}>Last year</span>}
        {state.layers.includes('typical') && <span>Typical 25–75%</span>}
        {state.layers.includes('median') && <span>Historical median</span>}
        <span>
          {state.scale === 'loaded'
            ? 'Loaded window'
            : state.scale === 'visible'
              ? 'Visible values'
              : 'Full scale'}
        </span>
      </div>
      <div style={{ display: 'flex', fontSize: 15, marginTop: 8 }}>
        {resolutionNotice(state.statistic, chartStatisticForUnit(history.statistic, state.unit)) ??
          chartStatisticLabel(chartStatisticForUnit(history.statistic, state.unit))}
        {history.sampled ? ' · Sampled' : ''}
        {!history.coverageComplete ? ' · Partial coverage' : ''}
        {unavailable.length ? ` · ${unavailable.join(' · ')}` : ''}
      </div>
      <div style={{ display: 'flex', fontSize: 13, marginTop: 7 }}>
        USGS provisional data may be revised · Rendered {stamp(data.generatedAt)} · eddy.guide
      </div>
    </div>
  );
}

/** Only social previews use this neutral fallback; it contains no substitute data. */
export function ChartShareUnavailableImage({
  state,
}: {
  state: import('@shared/chart-share').ChartShareState;
}) {
  return (
    <div
      style={{
        width: 1200,
        height: 630,
        padding: 64,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        background: '#f8faf9',
        color: '#163d38',
        fontFamily: 'Fredoka',
      }}
    >
      <div style={{ display: 'flex', fontSize: 28 }}>EDDY · SHARED CHART · USGS {state.siteId}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        <div style={{ display: 'flex', fontSize: 54 }}>This saved view is unavailable</div>
        <div style={{ display: 'flex', fontSize: 25 }}>
          {chartStamp(state.visible.from, state.timeZone)} —{' '}
          {chartStamp(state.visible.to, state.timeZone)}
        </div>
        <div style={{ display: 'flex', fontSize: 28 }}>Open the gauge for current conditions.</div>
      </div>
      <div style={{ display: 'flex', fontSize: 25 }}>eddy.guide</div>
    </div>
  );
}
