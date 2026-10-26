// src/components/gauge/gaugeControls.ts
// The option lists for the gauge screen's two segmented controls. Both the
// river hub (RiverGaugeDetail) and the standalone gauge page (GaugeDetailView)
// draw the same unit toggle and the same range toggle; they used to each
// carry their own copy of the labels and titles.

import type { SegmentedOption } from '@/components/ui/Segmented';

export type DisplayUnit = 'ft' | 'cfs';

export const UNIT_OPTIONS: readonly SegmentedOption<DisplayUnit>[] = [
  { value: 'ft', label: 'ft', title: 'Gauge height in feet' },
  { value: 'cfs', label: 'cfs', title: 'Flow in cubic feet per second' },
];

// Compact mobile presets. Desktop and expanded mobile add longer ranges.
export const RANGE_OPTIONS: readonly SegmentedOption<number>[] = [
  { value: 1, label: '24H' },
  { value: 7, label: '7D' },
  { value: 30, label: '30D' },
];
