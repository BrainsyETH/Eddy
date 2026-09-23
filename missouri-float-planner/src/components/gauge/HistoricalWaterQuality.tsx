import type { GaugeDetail } from '@/app/api/gauges/[siteId]/route';
export default function HistoricalWaterQuality({ data }: { data?: GaugeDetail['historicalWaterQuality'] }) {
  if (!data?.waterTemperature && !data?.dissolvedOxygen) return null;
  return <details className="rounded-lg border border-neutral-200 p-3 text-sm text-neutral-600">
    <summary className="cursor-pointer font-medium">Historical water quality</summary>
    <p className="mt-2">These observations are over 24 hours old.</p>
    {data.waterTemperature && <p>Water temperature: {data.waterTemperature.valueF}°F · {new Date(data.waterTemperature.observedAt).toLocaleString()}{data.waterTemperature.measuredAtName ? ` · ${data.waterTemperature.measuredAtName}` : ''}</p>}
    {data.dissolvedOxygen && <p>Dissolved oxygen: {data.dissolvedOxygen.valueMgL} mg/L · {new Date(data.dissolvedOxygen.observedAt).toLocaleString()}{data.dissolvedOxygen.measuredAtName ? ` · ${data.dissolvedOxygen.measuredAtName}` : ''}</p>}
  </details>;
}
