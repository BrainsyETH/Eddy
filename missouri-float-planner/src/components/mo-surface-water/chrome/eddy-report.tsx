'use client';

import { useEffect, useMemo, useState } from 'react';
import { STAGE_VERDICTS, THEME, type StageVerdict } from '@/lib/usgs/mo-statewide-data';
import type { MoStatewideGauge } from '@/app/api/usgs/mo-statewide/route';
import type { GaugeUpdateResponse } from '@/app/api/gauge-update/[siteId]/route';
import type { EddyUpdateResponse } from '@/app/api/eddy-update/[riverSlug]/route';
import { MONO, SANS, VerdictChipSpan } from './shared';

export type EddyReport = {
  quoteText: string;
  summaryText: string | null;
  conditionCode: string;
  generatedAt: string;
};

// Module-level cache so a gauge fetched once (rail open or first hover)
// stays warm for subsequent hovers. Cleared on full reload; that's fine —
// reports refresh daily and the cron writes a new row, not a delta.
const reportCache = new Map<string, EddyReport | null>();
const inflight = new Map<string, Promise<EddyReport | null>>();

function fetchReport(gauge: MoStatewideGauge): Promise<EddyReport | null> {
  const key = `${gauge.is_primary ? 'p' : 's'}:${gauge.is_primary ? gauge.river_slug : gauge.site_no}`;
  if (reportCache.has(key)) return Promise.resolve(reportCache.get(key) ?? null);
  const existing = inflight.get(key);
  if (existing) return existing;
  const url = gauge.is_primary
    ? `/api/eddy-update/${encodeURIComponent(gauge.river_slug)}`
    : `/api/gauge-update/${encodeURIComponent(gauge.site_no)}`;
  const p = fetch(url)
    .then((r) => (r.ok ? r.json() : null))
    .then((j: EddyUpdateResponse | GaugeUpdateResponse | null) => {
      if (!j?.available || !j.update) {
        reportCache.set(key, null);
        return null;
      }
      const norm: EddyReport = {
        quoteText: j.update.quoteText,
        summaryText: j.update.summaryText,
        conditionCode: j.update.conditionCode,
        generatedAt: j.update.generatedAt,
      };
      reportCache.set(key, norm);
      return norm;
    })
    .catch(() => { reportCache.set(key, null); return null; })
    .finally(() => { inflight.delete(key); });
  inflight.set(key, p);
  return p;
}

// Primary gauges share the river-level Sonnet update from /api/eddy-update
// (one canonical narrative per river). Secondary gauges have their own
// Haiku update from /api/gauge-update. The card looks identical either way;
// only the source endpoint differs.
export function useGaugeRailReport(gauge: MoStatewideGauge | null): EddyReport | null | undefined {
  const cached = useMemo(() => {
    if (!gauge) return undefined;
    const key = `${gauge.is_primary ? 'p' : 's'}:${gauge.is_primary ? gauge.river_slug : gauge.site_no}`;
    return reportCache.has(key) ? reportCache.get(key) ?? null : undefined;
    // Same rationale as the effect below: depend on identifying fields,
    // not the object reference.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gauge?.site_no, gauge?.is_primary, gauge?.river_slug]);
  const [report, setReport] = useState<EddyReport | null | undefined>(cached);
  useEffect(() => {
    if (!gauge) { setReport(undefined); return; }
    if (cached !== undefined) { setReport(cached); return; }
    let cancelled = false;
    setReport(undefined);
    fetchReport(gauge).then((r) => { if (!cancelled) setReport(r); });
    return () => { cancelled = true; };
    // Refetch only when the identifying fields change. Re-running on every
    // new `gauge` object reference would re-fire on each parent render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gauge?.site_no, gauge?.is_primary, gauge?.river_slug]);
  return report;
}

export function EddyReportCard({ report }: { report: EddyReport | null | undefined }) {
  const [showFull, setShowFull] = useState(false);
  if (report === undefined) {
    return (
      <div
        className="mt-3 rounded-md border-2 p-3"
        style={{ background: 'var(--color-secondary-100)', borderColor: 'var(--color-neutral-300)', fontFamily: MONO, fontSize: 11, color: THEME.inkDim }}
      >
        Loading Eddy&apos;s read on this gauge…
      </div>
    );
  }
  if (report === null) {
    // No update yet (cron hasn't run for this gauge, or it's a primary
    // covered by the river-level Sonnet update). Skip silently — the rest
    // of the card already explains the reading.
    return null;
  }
  const verdict = STAGE_VERDICTS[report.conditionCode as StageVerdict] ?? STAGE_VERDICTS.unknown;
  return (
    <div
      className="mt-3 rounded-md border-2 p-3"
      style={{
        background: 'var(--color-surface)',
        borderColor: THEME.cardBorder,
        borderLeft: `4px solid ${verdict.color}`,
        boxShadow: `2px 2px 0 ${THEME.cardShadow}`,
      }}
    >
      <div className="flex items-center gap-2">
        <span
          className="uppercase font-bold"
          style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: '0.18em', color: 'var(--color-accent-700)' }}
        >
          Eddy says
        </span>
        <VerdictChipSpan code={report.conditionCode} label={verdict.label} />
      </div>
      {report.summaryText && (
        <p
          className="mt-2 leading-snug"
          style={{ fontFamily: SANS, fontSize: 13, fontWeight: 600, color: THEME.primaryDark }}
        >
          “{report.summaryText}”
        </p>
      )}
      {(showFull || !report.summaryText) && (
        <p
          className="mt-2 leading-snug"
          style={{ fontFamily: SANS, fontSize: 12, color: THEME.ink }}
        >
          {report.quoteText}
        </p>
      )}
      {report.summaryText && (
        <button
          type="button"
          onClick={() => setShowFull((v) => !v)}
          className="mt-2 uppercase font-bold transition-opacity hover:opacity-70"
          style={{
            fontFamily: MONO,
            fontSize: 9,
            letterSpacing: '0.15em',
            color: THEME.inkDim,
            background: 'transparent',
            border: 'none',
            padding: 0,
            cursor: 'pointer',
          }}
        >
          {showFull ? 'Show less' : 'Show full report'}
        </button>
      )}
    </div>
  );
}

