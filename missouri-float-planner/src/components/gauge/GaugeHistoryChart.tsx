'use client';

// One history selection for the desktop report and compact/expanded mobile web.
// Only the presentation changes at the desktop breakpoint; data and controls
// use the same series, comparison, export and keyboard-scrubbing contracts.
import { useCallback, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X, Download, ZoomOut } from 'lucide-react';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import Segmented from '@/components/ui/Segmented';
import FlowTrendChart, {
  type ChartFloodStages,
  type ChartThresholdLines,
} from '@/components/ui/FlowTrendChart';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useGaugeHistory } from '@/hooks/useGaugeHistory';
import { useLastYearComparison } from '@/hooks/useLastYearComparison';
import { lastYearAvailable } from '@shared/chart-model';
import type { HistoryCapabilities } from '@shared/history-capabilities';
import ChartCompare from '@/components/gauge/ChartCompare';
import { RANGE_OPTIONS, UNIT_OPTIONS } from '@/components/gauge/gaugeControls';
import {
  historyRequest,
  historyRangeDays,
  validateHistoryDates,
  type HistoryRange,
} from '@/lib/gauge/history-range';

type ZoomWindow = { t0: number; t1: number };
interface GaugeHistoryChartProps {
  siteId: string;
  siteName: string;
  thresholds?: ChartThresholdLines | null;
  floodStages?: ChartFloodStages | null;
  latestValue?: number | null;
  displayUnit: 'ft' | 'cfs';
  onUnitChange: (unit: 'ft' | 'cfs') => void;
  canToggleUnit: boolean;
  showTypical: boolean;
  capabilities: HistoryCapabilities;
  lastYearOn: boolean;
  onLastYearChange: (on: boolean) => void;
  onRangeChange: (range: HistoryRange) => void;
  onExpand: () => void;
  help?: ReactNode;
}

function csvEscape(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export default function GaugeHistoryChart({
  siteId,
  siteName,
  thresholds,
  floodStages,
  latestValue,
  displayUnit,
  onUnitChange,
  canToggleUnit,
  showTypical,
  capabilities,
  lastYearOn,
  onLastYearChange,
  onRangeChange,
  onExpand,
  help,
}: GaugeHistoryChartProps) {
  const isDesktop = useMediaQuery('(min-width: 1024px)');
  const [expandedOpen, setExpandedOpen] = useState(false);
  const dialogOpen = expandedOpen && isDesktop === false;
  const fullControls = isDesktop === true || dialogOpen;
  const expandButton = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => {
    setExpandedOpen(false);
    requestAnimationFrame(() => expandButton.current?.focus());
  }, []);
  const dialogRef = useFocusTrap<HTMLDivElement>(dialogOpen, close);
  const [selection, setSelection] = useState<HistoryRange>({
    kind: 'days',
    days: 7,
  });
  const [customOpen, setCustomOpen] = useState(false);
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [dateError, setDateError] = useState<string | null>(null);
  const maxDays = capabilities.supportsDaily
    ? 366
    : capabilities.maxInstantDays;
  // A newly restricted provider must never receive an unsupported request.
  const range: HistoryRange =
    (selection.kind === 'custom' && !capabilities.supportsCustomRange) ||
    historyRangeDays(selection) > maxDays
      ? { kind: 'days', days: Math.min(7, maxDays) }
      : selection;
  const { days: requestDays, window: requestWindow } = historyRequest(range);
  const zoomContext = `${siteId}:${displayUnit}:${JSON.stringify(range)}`;
  const [zoomSelection, setZoomSelection] = useState<{
    context: string;
    window: ZoomWindow;
  } | null>(null);
  const zoom =
    zoomSelection?.context === zoomContext ? zoomSelection.window : null;
  const setZoom = (window: ZoomWindow | null) =>
    setZoomSelection(window ? { context: zoomContext, window } : null);

  const chooseRange = (choice: HistoryRange) => {
    setSelection(choice);
    setZoomSelection(null);
    setDateError(null);
    if (!lastYearAvailable(displayUnit, capabilities, historyRangeDays(choice)))
      onLastYearChange(false);
    onRangeChange(choice);
  };
  const {
    data: history,
    isFetching,
    isError,
  } = useGaugeHistory(siteId, requestDays, requestWindow);
  const lastYear = useLastYearComparison({
    siteId,
    days: requestDays,
    window: requestWindow,
    dates: range.kind === 'custom' ? { from: range.from, to: range.to } : null,
    unit: displayUnit,
    capabilities,
    on: lastYearOn,
  });
  const applyCustom = () => {
    const error = validateHistoryDates(customFrom, customTo, maxDays);
    setDateError(error);
    if (!error) chooseRange({ kind: 'custom', from: customFrom, to: customTo });
  };
  const zoomIn = () => {
    const coverage = history?.coverageWindow;
    const current =
      zoom ??
      (coverage
        ? { t0: Date.parse(coverage.from), t1: Date.parse(coverage.to) }
        : null);
    if (!current || current.t1 - current.t0 < 4 * 3_600_000) return;
    const quarter = (current.t1 - current.t0) / 4;
    setZoom({ t0: current.t0 + quarter, t1: current.t1 - quarter });
  };
  const exportCsv = useCallback(() => {
    if (!history) return;
    const statistic = history.statistic;
    const sampled = history.sampled;
    const fromLabel = (history.coverageWindow?.from ?? '').slice(0, 10);
    const toLabel = (history.coverageWindow?.to ?? '').slice(0, 10);

    // The declaration lives in the FILE: filename AND metadata rows. A
    // sampled or daily series handed to a spreadsheet must keep saying what
    // it is after the download dialog is gone.
    const filename =
      [
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
      history.truncationReason
        ? `# truncation: ${history.truncationReason}`
        : null,
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

    const csv = [
      ...meta,
      'timestamp,gauge_height_ft,discharge_cfs,qualifiers',
      ...rows,
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  }, [history, siteId, siteName]);

  const rangeLabel =
    range.kind === 'custom'
      ? `${range.from} to ${range.to}`
      : range.days === 1
        ? 'Last 24 hours'
        : range.days === 365
          ? 'Last year'
          : `Last ${range.days} days`;
  const presets = fullControls
    ? [
        ...RANGE_OPTIONS,
        { value: 90, label: '90D' },
        { value: 365, label: '1Y' },
      ]
    : RANGE_OPTIONS;
  const hasReadings = !!history?.readings.length && !isFetching && !isError;
  const content = (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-4">
        <div>
          <h2 className="text-base font-bold text-neutral-900">
            {dialogOpen
              ? siteName
              : `${displayUnit === 'ft' ? 'Stage' : 'Flow'} history`}
          </h2>
          <p className="mt-0.5 text-xs text-neutral-500">{rangeLabel}</p>
        </div>
        <div className="flex items-center gap-2">
          {help}
          {canToggleUnit && (
            <Segmented
              aria-label="Display unit"
              options={UNIT_OPTIONS}
              value={displayUnit}
              onChange={(unit) => {
                setZoomSelection(null);
                onUnitChange(unit);
              }}
            />
          )}
          {!fullControls && (
            <Button
              ref={expandButton}
              variant="outline"
              size="sm"
              onClick={() => {
                setExpandedOpen(true);
                onExpand();
              }}
            >
              Expand
            </Button>
          )}
          {dialogOpen && (
            <button
              type="button"
              onClick={close}
              aria-label="Close expanded chart"
              className="rounded-lg p-2 text-neutral-500 hover:bg-neutral-100"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 px-5 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            aria-label="History range"
            options={presets.map((preset) => ({
              ...preset,
              disabled: preset.value > maxDays,
              title:
                preset.value > maxDays
                  ? `This station's source serves at most ${maxDays} days of history`
                  : undefined,
            }))}
            value={range.kind === 'days' ? range.days : 0}
            onChange={(days) => {
              chooseRange({ kind: 'days', days });
              setCustomOpen(false);
            }}
          />
          {fullControls && (
            <button
              type="button"
              aria-expanded={customOpen}
              aria-disabled={!capabilities.supportsCustomRange || undefined}
              title={
                !capabilities.supportsCustomRange
                  ? "Custom dates aren't available from this station's source"
                  : undefined
              }
              onClick={() => {
                if (capabilities.supportsCustomRange)
                  setCustomOpen(!customOpen);
              }}
              className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${range.kind === 'custom' || customOpen ? 'border-primary-600 bg-primary-50 text-primary-800' : 'border-neutral-300 text-neutral-600'} aria-disabled:opacity-50`}
            >
              Custom
            </button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {lastYear.eligible && (
            <ChartCompare
              on={lastYearOn}
              onChange={onLastYearChange}
              status={lastYear.status}
              onRetry={lastYear.retry}
            />
          )}
          {fullControls && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={zoomIn}
                disabled={!hasReadings}
              >
                Zoom in
              </Button>
              {zoom && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setZoom(null)}
                >
                  <ZoomOut className="h-3.5 w-3.5" />
                  Reset zoom
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={exportCsv}
                disabled={!hasReadings}
              >
                <Download className="h-3.5 w-3.5" />
                Export CSV
              </Button>
            </>
          )}
        </div>
      </div>
      {fullControls && customOpen && capabilities.supportsCustomRange && (
        <div className="border-y border-neutral-100 bg-neutral-50 px-5 py-3">
          <div className="flex flex-wrap items-end gap-3 text-xs text-neutral-600">
            <label className="grid gap-1">
              From date
              <input
                type="date"
                value={customFrom}
                onChange={(event) => setCustomFrom(event.target.value)}
                className="min-w-0 rounded border border-neutral-300 bg-white px-2 py-1.5"
              />
            </label>
            <label className="grid gap-1">
              To date
              <input
                type="date"
                value={customTo}
                onChange={(event) => setCustomTo(event.target.value)}
                className="min-w-0 rounded border border-neutral-300 bg-white px-2 py-1.5"
              />
            </label>
            <Button variant="outline" size="sm" onClick={applyCustom}>
              Apply
            </Button>
          </div>
          {dateError && (
            <p role="alert" className="mt-2 text-xs text-red-700">
              {dateError}
            </p>
          )}
        </div>
      )}
      <div className="px-2 pb-2">
        <FlowTrendChart
          key={`${siteId}-${displayUnit}`}
          gaugeSiteId={siteId}
          days={requestDays}
          window={requestWindow}
          zoomWindow={fullControls ? zoom : null}
          onBrushZoom={fullControls ? setZoom : undefined}
          thresholds={thresholds}
          floodStages={floodStages}
          latestValue={latestValue}
          displayUnit={displayUnit}
          chartClassName={fullControls ? 'h-72 lg:h-96' : 'h-48 md:h-56'}
          showTypical={showTypical}
          showProvenance
          showGridlines={fullControls}
          lastYear={lastYear.comparison}
        />
      </div>
      {fullControls && (
        <div className="px-5 pb-3 text-xs text-neutral-500">
          {history?.statistic && history.statistic !== 'instantaneous' && (
            <p>Daily values · one point per day</p>
          )}
          {history?.truncationReason && <p>{history.truncationReason}</p>}
          <p className="mt-1">
            Drag to zoom. Use arrow keys to explore readings.
          </p>
        </div>
      )}
      {fullControls && history && history.readings.length > 0 && !isError && (
        <details className="border-t border-neutral-200 px-5 py-3">
          <summary className="cursor-pointer text-xs font-semibold text-neutral-600">
            Data table ({history.readings.length} readings
            {history.sampled ? ', sampled' : ''})
          </summary>
          <div className="mt-3 max-h-64 overflow-auto">
            <table className="w-full text-xs tabular-nums">
              <caption className="sr-only">
                {siteName} — {rangeLabel}
              </caption>
              <thead className="sticky top-0 bg-white">
                <tr className="text-left text-neutral-500">
                  <th scope="col" className="py-2 pr-3">
                    Time
                  </th>
                  <th scope="col" className="py-2 pr-3">
                    Stage (ft)
                  </th>
                  <th scope="col" className="py-2 pr-3">
                    Flow (cfs)
                  </th>
                  <th scope="col" className="py-2">
                    Qualifiers
                  </th>
                </tr>
              </thead>
              <tbody>
                {history.readings.map((reading) => (
                  <tr
                    key={reading.timestamp}
                    className="border-t border-neutral-100 text-neutral-700"
                  >
                    <td className="whitespace-nowrap py-2 pr-3">
                      {new Date(reading.timestamp).toLocaleString('en-US', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                      })}
                    </td>
                    <td className="py-2 pr-3">
                      {reading.gaugeHeightFt ?? '—'}
                    </td>
                    <td className="py-2 pr-3">{reading.dischargeCfs ?? '—'}</td>
                    <td className="py-2">
                      {(reading.qualifiers ?? []).join(' ')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </>
  );
  return (
    <Card variant="panel" className="min-w-0">
      {dialogOpen ? (
        <>
          <div className="flex h-80 items-center justify-center text-sm text-neutral-500">
            Chart open in expanded view
          </div>
          {createPortal(
            <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6">
              {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
              <div
                className="absolute inset-0 bg-neutral-900/60"
                onClick={close}
              />
              <div
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-label={`Expanded history for ${siteName}`}
                tabIndex={-1}
                className="relative max-h-full w-full max-w-5xl overflow-y-auto rounded-xl bg-white shadow-2xl"
              >
                {content}
              </div>
            </div>,
            document.body,
          )}
        </>
      ) : (
        content
      )}
    </Card>
  );
}
