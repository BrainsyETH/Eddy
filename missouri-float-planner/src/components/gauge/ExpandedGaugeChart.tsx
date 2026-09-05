'use client';

// src/components/gauge/ExpandedGaugeChart.tsx
// The expanded hydrograph — the surface ADR 0010 reserved.
//
// The inline chart is already dense at 128/192px: five threshold rules, two
// condition zones, the typical band and median, the forecast, a crosshair.
// Everything the ADR listed as "recorded rather than built" lands HERE, not
// there: long ranges (90d / 1y / custom dates), brush zoom, and export.
//
// The rules this surface keeps:
//   · Arrows/Home/End stay bound to SCRUBBING — chart-parity.test.ts asserts
//     that contract and it is the accessibility story Eddy currently wins on.
//     Zoom gets its own labeled buttons; the brush is pointer/touch only.
//   · Unsupported ranges are DISABLED WITH AN EXPLANATION, never silently
//     truncated — capabilities come from the wire (GaugeDetail
//     .historyCapabilities), because there is no client-side provider
//     registry to consult.
//   · An export declares itself in the FILE — filename and metadata rows,
//     not a tooltip — because samplePreservingExtrema() means the payload is
//     not the station's record, and daily data is not the sensor's cadence.
//   · Focus is trapped while open, Escape closes, and focus returns to the
//     trigger (useFocusTrap owns all three).

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Download, ZoomOut } from 'lucide-react';
import Button from '@/components/ui/Button';
import Segmented from '@/components/ui/Segmented';
import FlowTrendChart, {
  type ChartFloodStages,
  type ChartThresholdLines,
} from '@/components/ui/FlowTrendChart';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { useGaugeHistory, type HistoryWindowRequest } from '@/hooks/useGaugeHistory';

interface HistoryCapabilitiesLike {
  maxInstantDays: number;
  supportsDaily: boolean;
  supportsCustomRange: boolean;
}

interface ExpandedGaugeChartProps {
  open: boolean;
  onClose: () => void;
  siteId: string;
  siteName: string;
  thresholds?: ChartThresholdLines | null;
  floodStages?: ChartFloodStages | null;
  displayUnit: 'ft' | 'cfs';
  showTypical: boolean;
  /**
   * From GaugeDetail.historyCapabilities. Absent reads as the
   * pre-capability world — 30 instantaneous days, nothing custom — so this
   * surface never offers a range the server may not honor.
   */
  capabilities?: HistoryCapabilitiesLike | null;
}

const FALLBACK_CAPABILITIES: HistoryCapabilitiesLike = {
  maxInstantDays: 30,
  supportsDaily: false,
  supportsCustomRange: false,
};

type RangeChoice = { kind: 'days'; days: number } | { kind: 'custom'; from: string; to: string };

function csvEscape(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export default function ExpandedGaugeChart({
  open,
  onClose,
  siteId,
  siteName,
  thresholds,
  floodStages,
  displayUnit,
  showTypical,
  capabilities,
}: ExpandedGaugeChartProps) {
  const caps = capabilities ?? FALLBACK_CAPABILITIES;
  const dialogRef = useFocusTrap<HTMLDivElement>(open, onClose);

  const [range, setRange] = useState<RangeChoice>({ kind: 'days', days: 90 });
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [zoom, setZoom] = useState<{ t0: number; t1: number } | null>(null);

  // A new range is a new question; a zoom into the old one must not survive it.
  const chooseRange = useCallback((choice: RangeChoice) => {
    setRange(choice);
    setZoom(null);
  }, []);

  useEffect(() => {
    if (!open) setZoom(null);
  }, [open]);

  const maxDays = caps.supportsDaily ? 366 : caps.maxInstantDays;
  const presets = [
    { label: '90D', days: 90 },
    { label: '1Y', days: 365 },
  ].map((preset) => ({
    ...preset,
    enabled: preset.days <= maxDays,
    reason:
      preset.days <= maxDays
        ? null
        : `This station's source serves at most ${maxDays} days of history`,
  }));

  const requestDays = range.kind === 'days' ? range.days : 30;
  const requestWindow: HistoryWindowRequest | null =
    range.kind === 'custom'
      ? { from: `${range.from}T00:00:00Z`, to: `${range.to}T23:59:59Z`, resolution: 'auto' }
      : null;

  // The same query the chart below runs — React Query dedupes them — so the
  // export writes exactly the series on screen, never a second fetch that
  // could disagree with it.
  const { data: history } = useGaugeHistory(open ? siteId : null, requestDays, requestWindow);

  const applyCustom = useCallback(() => {
    if (!customFrom || !customTo) return;
    if (new Date(customFrom).getTime() >= new Date(customTo).getTime()) return;
    chooseRange({ kind: 'custom', from: customFrom, to: customTo });
  }, [customFrom, customTo, chooseRange]);

  const zoomIn = useCallback(() => {
    // Keyboard-reachable zoom, per the ADR: the brush is pointer-only, so a
    // labeled control must be able to do the same job. Halves the window
    // around its center.
    const coverage = history?.coverageWindow;
    const base = zoom ?? (coverage
      ? { t0: new Date(coverage.from).getTime(), t1: new Date(coverage.to).getTime() }
      : null);
    if (!base) return;
    const quarter = (base.t1 - base.t0) / 4;
    if (base.t1 - base.t0 < 4 * 3_600_000) return; // don't zoom below ~4h
    setZoom({ t0: base.t0 + quarter, t1: base.t1 - quarter });
  }, [zoom, history]);

  const exportCsv = useCallback(() => {
    if (!history) return;
    const statistic = history.statistic;
    const sampled = history.sampled;
    const fromLabel = (history.coverageWindow?.from ?? '').slice(0, 10);
    const toLabel = (history.coverageWindow?.to ?? '').slice(0, 10);

    // The declaration lives in the FILE: filename AND metadata rows. A
    // sampled or daily series handed to a spreadsheet must keep saying what
    // it is after the download dialog is gone.
    const filename = [
      'eddy',
      siteId,
      fromLabel || 'start',
      toLabel || 'end',
      statistic,
      sampled ? 'sampled' : null,
    ]
      .filter(Boolean)
      .join('-') + '.csv';

    const meta = [
      `# station: ${siteName} (${siteId})`,
      `# requested: ${history.requestedWindow?.from ?? ''} to ${history.requestedWindow?.to ?? ''}`,
      `# covered: ${history.coverageWindow?.from ?? 'none'} to ${history.coverageWindow?.to ?? 'none'}`,
      `# coverage_complete: ${history.coverageComplete}`,
      `# resolution: ${history.resolution} (statistic: ${statistic})`,
      `# sampled: ${sampled ? 'true — extrema-preserving downsample; this is NOT the station’s full record' : 'false'}`,
      history.truncationReason ? `# truncation: ${history.truncationReason}` : null,
      `# source: ${history.sourceUrl ?? 'unknown'}`,
      `# units: gauge_height_ft in feet, discharge_cfs in cubic feet per second`,
    ].filter(Boolean);

    const rows = history.readings.map((reading) =>
      [
        reading.timestamp,
        reading.gaugeHeightFt ?? '',
        reading.dischargeCfs ?? '',
        csvEscape((reading.qualifiers ?? []).join(' ')),
      ].join(','),
    );

    const csv = [...meta, 'timestamp,gauge_height_ft,discharge_cfs,qualifiers', ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  }, [history, siteId, siteName]);

  const rangeLabel = useMemo(() => {
    if (range.kind === 'custom') return `${range.from} to ${range.to}`;
    return range.days === 365 ? 'Last year' : `Last ${range.days} days`;
  }, [range]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-8">
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
      <div className="absolute inset-0 bg-neutral-900/60" onClick={onClose} />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Expanded history for ${siteName}`}
        tabIndex={-1}
        className="relative w-full max-w-5xl max-h-full overflow-y-auto rounded-xl bg-white shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-neutral-200 px-5 py-3">
          <div>
            <h2 className="text-base font-bold text-neutral-900">{siteName}</h2>
            <p className="text-xs text-neutral-500">
              {rangeLabel}
              {history?.statistic && history.statistic !== 'instantaneous' && (
                <span> · daily values, one point per day</span>
              )}
              {history?.truncationReason && <span> · {history.truncationReason}</span>}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close expanded chart"
            className="rounded-lg p-1.5 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 px-5 pt-3">
          {/* A custom range presses nothing: 0 matches no preset. */}
          <Segmented
            aria-label="History range"
            options={presets.map((preset) => ({
              value: preset.days,
              label: preset.label,
              disabled: !preset.enabled,
              title: preset.reason ?? undefined,
            }))}
            value={range.kind === 'days' ? range.days : 0}
            onChange={(days) => chooseRange({ kind: 'days', days })}
          />

          {caps.supportsCustomRange ? (
            <div className="flex items-center gap-1.5 text-xs text-neutral-600">
              <label>
                <span className="sr-only">From date</span>
                <input
                  type="date"
                  value={customFrom}
                  onChange={(event) => setCustomFrom(event.target.value)}
                  className="rounded border border-neutral-300 px-1.5 py-1"
                />
              </label>
              <span aria-hidden="true">–</span>
              <label>
                <span className="sr-only">To date</span>
                <input
                  type="date"
                  value={customTo}
                  onChange={(event) => setCustomTo(event.target.value)}
                  className="rounded border border-neutral-300 px-1.5 py-1"
                />
              </label>
              <Button variant="outline" size="sm" onClick={applyCustom} disabled={!customFrom || !customTo}>
                Apply
              </Button>
            </div>
          ) : (
            <span className="text-xs text-neutral-400">
              Custom dates aren&apos;t available from this station&apos;s source
            </span>
          )}

          <div className="ml-auto flex items-center gap-2">
            {/* Zoom keeps its own labeled controls — the arrow keys stay
                bound to scrubbing, always. */}
            <Button variant="outline" size="sm" onClick={zoomIn}>
              Zoom in
            </Button>
            <Button variant="outline" size="sm" onClick={() => setZoom(null)} disabled={!zoom}>
              <ZoomOut className="h-3.5 w-3.5" />
              Reset zoom
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={exportCsv}
              disabled={!history || history.readings.length === 0}
            >
              <Download className="h-3.5 w-3.5" />
              Export CSV
            </Button>
          </div>
        </div>

        <p className="px-5 pt-1 text-[11px] text-neutral-400">
          Drag across the chart to zoom to a selection. Arrow keys step through readings.
        </p>

        <div className="px-2 pb-4 pt-1">
          <FlowTrendChart
            key={`${siteId}-${displayUnit}-expanded`}
            gaugeSiteId={siteId}
            days={requestDays}
            window={requestWindow}
            zoomWindow={zoom}
            onBrushZoom={setZoom}
            thresholds={thresholds}
            floodStages={floodStages}
            displayUnit={displayUnit}
            chartClassName="h-72 md:h-96"
            showTypical={showTypical}
            showProvenance
            showGridlines
          />
        </div>

        {/* The tabular view behind the keyboard scrub (ADR 0010): the same
            series, as data a screen reader can walk row by row and anyone can
            copy out — the export's on-screen twin. Collapsed by default; a
            year of daily rows is a lot of DOM to pay for unasked. */}
        {history && history.readings.length > 0 && (
          <details className="border-t border-neutral-200 px-5 py-3">
            <summary className="cursor-pointer text-xs font-semibold text-neutral-600">
              Data table ({history.readings.length} readings
              {history.sampled ? ', sampled' : ''})
            </summary>
            <div className="mt-2 max-h-64 overflow-y-auto">
              <table className="w-full text-xs tabular-nums">
                <thead className="sticky top-0 bg-white">
                  <tr className="text-left text-neutral-500">
                    <th scope="col" className="py-1 pr-3 font-semibold">Time</th>
                    <th scope="col" className="py-1 pr-3 font-semibold">Stage (ft)</th>
                    <th scope="col" className="py-1 pr-3 font-semibold">Flow (cfs)</th>
                    <th scope="col" className="py-1 font-semibold">Qualifiers</th>
                  </tr>
                </thead>
                <tbody>
                  {history.readings.map((reading) => (
                    <tr key={reading.timestamp} className="border-t border-neutral-100 text-neutral-700">
                      <td className="py-1 pr-3 whitespace-nowrap">
                        {new Date(reading.timestamp).toLocaleString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          hour: 'numeric',
                          minute: '2-digit',
                        })}
                      </td>
                      <td className="py-1 pr-3">{reading.gaugeHeightFt ?? '—'}</td>
                      <td className="py-1 pr-3">{reading.dischargeCfs ?? '—'}</td>
                      <td className="py-1 text-neutral-400">{(reading.qualifiers ?? []).join(' ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        )}
      </div>
    </div>,
    document.body,
  );
}
