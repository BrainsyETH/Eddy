// Shared overview selector. Selection is owned by the screen, so its reading,
// chart, weather and Read update together without remounting the chart.
import type { MapGauge } from '@eddy/types';
import { GaugeMenu } from './GaugeMenu';
import { gaugeMenuOptions } from '@/lib/gaugeMenu';

export function GaugePicker({ gauges, riverSlug, selectedId, onSelect }: {
  gauges: MapGauge[];
  riverSlug: string;
  selectedId: string;
  onSelect: (gaugeId: string) => void;
}) {
  return <GaugeMenu options={gaugeMenuOptions(gauges, riverSlug)} selectedId={selectedId} onSelect={onSelect} />;
}
