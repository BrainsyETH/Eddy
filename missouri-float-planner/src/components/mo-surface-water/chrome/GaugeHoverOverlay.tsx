'use client';

import { STAGE_VERDICTS, THEME, classifyPercentile, type StageVerdict } from '@/lib/usgs/mo-statewide-data';
import type { MoStatewideGauge } from '@/app/api/usgs/mo-statewide/route';
import { getEddyImageForCondition } from '@/constants';
import { MONO, SANS, VerdictChipSpan, UnchangedChip, extractPlace, readingAge, relativeTime } from './shared';
import { useGaugeRailReport } from './eddy-report';

const OVERLAY_W = 360;
const OVERLAY_GAP = 18;

export function GaugeHoverOverlay({
  gauge,
  gaugeName,
  verdict: verdictCode,
  sharedRiverNames,
  unchangedDays,
  pos,
}: {
  gauge: MoStatewideGauge | null;
  /** USGS station name like "Current River near Van Buren MO". */
  gaugeName: string | null;
  /** Editorial condition for this gauge, used for the fallback card when
   *  Eddy has no written report yet. */
  verdict: StageVerdict | null;
  /** Set (≥2 names) when this one physical gauge is the primary rating
   *  for multiple rivers — disclosed on the SOURCE line. */
  sharedRiverNames?: string[] | null;
  /** Days the reading has sat byte-identical (see flatlineDays), or null. */
  unchangedDays?: number | null;
  pos: { x: number; y: number } | null;
}) {
  // Live verdict gates the note (see useGaugeRailReport): if the gauge has
  // crossed into a different condition class than Eddy's daily note, the hook
  // returns null and we fall back to the live reading below — so the chip and
  // Eddy avatar never show "good" over a flooding gauge.
  const report = useGaugeRailReport(gauge, verdictCode);

  if (!gauge || !pos) return null;

  // Prefer Eddy's written report; fall back to the live reading + editorial
  // condition while the report is loading or when none exists.
  const conditionCode = report ? report.conditionCode : verdictCode ?? 'unknown';
  const verdict = STAGE_VERDICTS[conditionCode as StageVerdict] ?? STAGE_VERDICTS.unknown;
  const eddyImg = getEddyImageForCondition(conditionCode);
  const place = extractPlace(gaugeName);
  const readingLine = [
    gauge.gaugeHeightFt != null ? `${gauge.gaugeHeightFt.toFixed(2)} ft` : null,
    gauge.dischargeCfs != null ? `${Math.round(gauge.dischargeCfs)} cfs` : null,
  ].filter(Boolean).join(' · ') || 'No live reading';

  // Anchor: prefer right of the marker, flip if it would clip; same for top.
  const viewportW = typeof window !== 'undefined' ? window.innerWidth : 1024;
  const viewportH = typeof window !== 'undefined' ? window.innerHeight : 768;
  const overflowsRight = pos.x + OVERLAY_GAP + OVERLAY_W > viewportW - 12;
  const left = overflowsRight ? Math.max(12, pos.x - OVERLAY_GAP - OVERLAY_W) : pos.x + OVERLAY_GAP;
  // Estimate height ~120; flip if it would clip the bottom.
  const overflowsBottom = pos.y + 130 > viewportH - 12;
  const top = overflowsBottom ? Math.max(12, pos.y - 130) : Math.max(12, pos.y - 20);

  return (
    <div
      className="pointer-events-none fixed z-40 rounded-md border-2 p-3"
      style={{
        top, left, width: OVERLAY_W,
        background: THEME.cardBg,
        borderColor: THEME.cardBorder,
        boxShadow: `3px 3px 0 ${THEME.cardShadow}`,
        fontFamily: SANS,
      }}
    >
      <div className="flex items-start gap-3">
        <div
          className="flex-shrink-0 rounded-md border-2"
          style={{ width: 48, height: 48, borderColor: THEME.cardBorder, background: '#F2EAD8', overflow: 'hidden' }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={eddyImg}
            alt=""
            width={44}
            height={44}
            style={{ display: 'block', margin: '2px auto' }}
            // Blob-store avatar can be blocked (offline, strict proxies) —
            // hide the frame instead of showing a broken-image glyph.
            onError={(e) => {
              const frame = e.currentTarget.parentElement;
              if (frame) frame.style.display = 'none';
            }}
          />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              className="uppercase font-bold"
              style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: '0.18em', color: 'var(--color-accent-700)' }}
            >
              {report ? 'Eddy says' : 'Live reading'}
            </span>
            <VerdictChipSpan code={conditionCode} label={verdict.label} />
          </div>
          <p
            className="mt-1.5 leading-snug"
            style={{ fontSize: 13.5, fontWeight: 600, color: THEME.primaryDark }}
          >
            {report?.summaryText
              ? report.summaryText.replace(/^["“]|["”]$/g, '')
              : readingLine}
          </p>
          <div
            className="mt-2 rounded-sm px-2 py-1.5"
            style={{
              background: 'var(--color-secondary-100)',
              border: '1px solid var(--color-neutral-300)',
              fontFamily: MONO,
              fontSize: 10,
              color: THEME.inkDim,
              letterSpacing: '0.04em',
            }}
          >
            {/* The reading's age (and its STALE flag) always shows — a fresh
                Eddy report must never mask an old number underneath it. */}
            <span style={{ color: THEME.ink, fontWeight: 700 }}>SOURCE</span>{' '}
            USGS #{gauge.site_no}{place ? ` · ${place}` : ''} · reading{' '}
            {readingAge(gauge.readingTimestamp)?.label ?? 'no timestamp'}
            {readingAge(gauge.readingTimestamp)?.stale && (
              <span
                className="ml-1.5 rounded-sm px-1 py-px font-bold uppercase"
                style={{ background: '#E5A000', color: '#3D2E00', fontSize: 9.5, letterSpacing: '0.1em' }}
              >
                Stale
              </span>
            )}
            {unchangedDays != null && (
              <span className="ml-1.5"><UnchangedChip days={unchangedDays} /></span>
            )}
            {gauge.percentile != null && (
              <> · P{Math.round(gauge.percentile)} {classifyPercentile(gauge.percentile).label.toLowerCase()}</>
            )}
            {report && <> · report {relativeTime(report.generatedAt)}</>}
            {sharedRiverNames && sharedRiverNames.length >= 2 && (
              <> · serves {sharedRiverNames.join(' + ')}</>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// "Current River near Van Buren MO" → "Van Buren, MO". Falls back to the
// raw river name when the station label doesn't follow the USGS convention.
