'use client';

// The detail rail: RightRail dispatcher + the RailSheet container and every
// card it can show (river, gauge, campground, access point, POI, context site).
// These share so much context that they live together; leaf primitives come
// from ./shared, the chart from ./Sparkline, the report from ./eddy-report.

import { useEffect, useRef, useState } from 'react';
import {
  STAGE_VERDICTS,
  THEME,
  classifyPercentile,
  classifyStageFromThresholds,
  type MORiver,
  type MOCampground,
  type MOAccessPoint,
  type MOPoi,
  type StageVerdict,
} from '@/lib/usgs/mo-statewide-data';
import type { MoStatewideGauge } from '@/app/api/usgs/mo-statewide/route';
import type { MoContextSite } from '@/lib/usgs/mo-sites';
import type { MoHistoryBundleEntry } from '@/app/api/usgs/mo-history-bundle/route';
import type { MoForecastEntry } from '@/app/api/usgs/mo-forecast/route';
import { conditionChip } from '@shared/condition-system';
import {
  MONO,
  SANS,
  DISPLAY,
  KV,
  RailSectionLabel,
  CloseBtn,
  ThresholdProvenance,
  DataAgeChip,
  UnchangedChip,
  flatlineDays,
} from './shared';
import { Sparkline, useHistory } from './Sparkline';
import { EddyReportCard, useGaugeRailReport } from './eddy-report';

// ─── Right rail: river / gauge / campground / POI / access detail ──────

export function RightRail({
  river,
  sharedGauge,
  primaryGauge,
  primaryHistory,
  focusedGauge,
  focusedGaugeVerdict,
  campground,
  accessPoint,
  poi,
  forecastBySite,
  onClose,
  onCloseGauge,
  onAccessPointClick,
  onSheetExpandedChange,
}: {
  river: MORiver | null;
  /** Set when the river's primary gauge also rates other rivers
   *  (e.g. USGS 07017200 covers both Courtois and Huzzah). */
  sharedGauge?: { siteId: string; others: string[] } | null;
  primaryGauge: MoStatewideGauge | null;
  primaryHistory: MoHistoryBundleEntry | null;
  focusedGauge: MoStatewideGauge | null;
  /** Editorial-thresholds verdict computed in the parent. Falls back to
   *  the percentile/USGS label when null (e.g. statewide gauges with no
   *  curated river binding). */
  focusedGaugeVerdict: StageVerdict | null;
  campground: MOCampground | null;
  accessPoint: { ap: MOAccessPoint; river: MORiver } | null;
  poi: { poi: MOPoi; river: MORiver | null } | null;
  forecastBySite: Record<string, MoForecastEntry>;
  /** Closes the rail entirely (river + gauge). Used by RiverCard's ×. */
  onClose: () => void;
  /** Closes JUST the gauge focus, falling back to the river card.
   *  Without this, "Close" on a gauge collapses the river too, which
   *  felt like a broken navigation step. */
  onCloseGauge?: () => void;
  onAccessPointClick?: (id: string) => void;
  /** Mobile sheet peek↔expanded signal, forwarded to whichever card renders. */
  onSheetExpandedChange?: (expanded: boolean) => void;
}) {
  if (focusedGauge) {
    return (
      <GaugeDetail
        gauge={focusedGauge}
        verdict={focusedGaugeVerdict}
        forecast={forecastBySite[focusedGauge.site_no] ?? null}
        onClose={onCloseGauge ?? onClose}
        onSheetExpandedChange={onSheetExpandedChange}
      />
    );
  }
  if (campground) {
    return <CampgroundCard campground={campground} onClose={onClose} />;
  }
  if (accessPoint) {
    return <AccessPointCard ap={accessPoint.ap} river={accessPoint.river} onClose={onClose} />;
  }
  if (poi) {
    return <PoiCard poi={poi.poi} river={poi.river} onClose={onClose} />;
  }
  if (river) {
    const primary = (river.gauges ?? []).find((g) => g.is_primary);
    const forecast = primary ? forecastBySite[primary.site_id] ?? null : null;
    return (
      <RiverCard
        river={river}
        sharedGauge={sharedGauge ?? null}
        primaryGauge={primaryGauge}
        primaryHistory={primaryHistory}
        forecast={forecast}
        onClose={onClose}
        onAccessPointClick={onAccessPointClick}
        onSheetExpandedChange={onSheetExpandedChange}
      />
    );
  }
  return null;
}

// Matches the site-wide "Field Notebook" card recipe (River Report + Blog):
// white surface, teal border, warm offset shadow. Uses the shared design
// tokens so the map panels stay in sync with the rest of the app.
const RAIL_BASE_STYLE: React.CSSProperties = {
  background: 'var(--color-surface)',
  borderColor: 'var(--color-primary-700)',
  fontFamily: SANS,
  boxShadow: '3px 3px 0 var(--color-neutral-400)',
};

// The peek sheet covers this fraction of the viewport bottom; MOMap imports
// it to know how much of the stage a fresh selection's sheet will cover.
export const SHEET_PEEK_FRACTION = 0.44;

// Responsive container for the detail cards: a right-side panel on desktop
// (md+), a bottom sheet on phones. At PEEK there is deliberately NO backdrop
// — the map stays visible and interactive above the sheet (tapping another
// feature switches the selection; tapping empty map closes). Only EXPANDED
// gets a plain scrim, and nothing here uses backdrop-filter: a blur over the
// animating flow canvas forces iOS to re-blur the viewport every frame,
// which was the page's single biggest jank source.
function RailSheet({
  onClose,
  onExpandedChange,
  className = 'md:w-[min(360px,calc(100vw-24px))]',
  tall = true,
  z = 'z-40',
  ariaLabel,
  children,
}: {
  onClose?: () => void;
  /** Fires when the mobile sheet crosses peek↔expanded (used to pause the
   *  flow animation while the sheet covers the map). */
  onExpandedChange?: (expanded: boolean) => void;
  className?: string;
  tall?: boolean;
  z?: string;
  ariaLabel?: string;
  children: React.ReactNode;
}) {
  // Mobile is a two-snap bottom sheet: opens at a small PEEK (headline only)
  // and swipes up to EXPANDED for the full card; swiping the handle below
  // peek dismisses. Desktop (md+) stays the right-side panel — the height
  // logic only applies on phones. (MOMap is ssr:false, so reading matchMedia
  // at init is safe — no hydration mismatch.)
  const [isMobile] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches,
  );
  const [reducedMotion] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
  const PEEK = Math.round(vh * SHEET_PEEK_FRACTION);
  const EXPANDED = Math.round(vh * 0.88);
  // Natural height of the card content — the expanded snap caps here so a
  // short card (few sections) doesn't leave a page of dead white space
  // under its CTA. Measured at snap time; content taller than 88vh still
  // clamps to EXPANDED and scrolls.
  const contentRef = useRef<HTMLDivElement>(null);
  const HANDLE_H = 22; // pt-2.5 + 4px bar + pb-1
  const expandedTarget = () => {
    const contentH = contentRef.current?.offsetHeight;
    if (!contentH) return EXPANDED;
    return Math.max(PEEK, Math.min(EXPANDED, contentH + HANDLE_H));
  };
  const [height, setHeight] = useState(PEEK);
  const [snap, setSnapState] = useState<'peek' | 'expanded'>('peek');
  const [dragging, setDragging] = useState(false);
  // lastH mirrors the in-flight height so endDrag never reads a stale
  // render closure — touch events can arrive faster than React re-renders.
  // samples feed the flick-velocity read at release.
  const dragRef = useRef<{
    startY: number;
    startH: number;
    lastH: number;
    active: boolean;
    samples: Array<{ t: number; y: number }>;
  } | null>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const onExpandedChangeRef = useRef(onExpandedChange);
  onExpandedChangeRef.current = onExpandedChange;
  const setSnap = (s: 'peek' | 'expanded') => {
    setSnapState(s);
    onExpandedChangeRef.current?.(s === 'expanded');
  };

  // Slide up from the bottom on mount instead of popping in fully open.
  // Two rAFs guarantee one painted frame at translateY(100%) first.
  const [entered, setEntered] = useState(!isMobile || reducedMotion);
  useEffect(() => {
    if (entered) return;
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setEntered(true)));
    return () => cancelAnimationFrame(id);
  }, [entered]);

  // Each new selection (ariaLabel changes) reopens at peek; unmount always
  // reports collapsed so the flow animation resumes.
  useEffect(() => { setHeight(PEEK); setSnap('peek'); }, [ariaLabel, PEEK]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => onExpandedChangeRef.current?.(false), []);

  // ── Drag mechanics (standard bottom-sheet behavior) ──
  // The whole card is the drag surface, not just the 4px handle: at PEEK any
  // vertical pan moves the sheet (content is scroll-locked until expanded);
  // at EXPANDED the content scrolls normally, and a pull-down with the
  // scroller at top drags the sheet back down — the Apple/Google Maps sheet
  // contract. An 8px dead zone keeps taps working, and release applies a
  // flick: a fast swipe commits in its direction even if the midpoint wasn't
  // crossed.
  const DRAG_DEAD_ZONE = 8;
  const FLICK_PX_PER_MS = 0.45;

  const beginDrag = (y: number) => {
    dragRef.current = {
      startY: y, startH: height, lastH: height, active: false,
      samples: [{ t: performance.now(), y }],
    };
  };
  const moveDrag = (y: number, downOnly = false) => {
    const d = dragRef.current;
    if (!d) return;
    const dy = d.startY - y; // up = grow
    if (!d.active) {
      // At expanded, an upward pan belongs to the content scroller — keep
      // re-anchoring so a later pull-down starts from here without a jump.
      if (downOnly && dy > 0) { d.startY = y; return; }
      if (Math.abs(dy) < DRAG_DEAD_ZONE) return;
      d.active = true;
      setDragging(true);
    }
    const h = Math.max(80, Math.min(EXPANDED, d.startH + dy));
    d.lastH = h;
    d.samples.push({ t: performance.now(), y });
    if (d.samples.length > 6) d.samples.shift();
    setHeight(h);
  };
  const endDrag = () => {
    const d = dragRef.current;
    dragRef.current = null;
    setDragging(false);
    if (!d?.active) return; // never crossed the dead zone — it was a tap
    const h = d.lastH;
    // Signed flick velocity (px/ms, + = upward) over the last ~100ms.
    const newest = d.samples[d.samples.length - 1];
    let oldest = d.samples[0];
    for (const s of d.samples) {
      if (newest.t - s.t <= 100) { oldest = s; break; }
    }
    const span = newest.t - oldest.t;
    const v = span > 15 ? (oldest.y - newest.y) / span : 0;
    const target = expandedTarget();
    if (v > FLICK_PX_PER_MS) { setHeight(target); setSnap('expanded'); return; }
    if (v < -FLICK_PX_PER_MS) {
      // Flick down: expanded settles at peek (unless thrown well past it);
      // peek dismisses.
      if (snap === 'expanded' && h > PEEK * 0.7) { setHeight(PEEK); setSnap('peek'); return; }
      onClose?.();
      return;
    }
    if (h < PEEK * 0.6) { onClose?.(); return; } // dragged well below peek → dismiss
    const toExpanded = Math.abs(h - target) < Math.abs(h - PEEK);
    setHeight(toExpanded ? target : PEEK);
    setSnap(toExpanded ? 'expanded' : 'peek');
  };

  // Handle strip: always drags, and stops propagation so the card-body
  // handlers below don't double-track the same touch.
  const onHandleStart = (e: React.TouchEvent) => { e.stopPropagation(); beginDrag(e.touches[0].clientY); };
  const onHandleMove = (e: React.TouchEvent) => { e.stopPropagation(); moveDrag(e.touches[0].clientY); };
  const onHandleEnd = (e: React.TouchEvent) => { e.stopPropagation(); endDrag(); };

  // Card body: drags at peek; at expanded only a pull-down from scroll-top.
  const onBodyStart = (e: React.TouchEvent) => {
    if (!isMobile) return;
    beginDrag(e.touches[0].clientY);
  };
  const onBodyMove = (e: React.TouchEvent) => {
    if (!isMobile || !dragRef.current) return;
    const y = e.touches[0].clientY;
    if (snap === 'expanded') {
      const sc = scrollerRef.current;
      if ((sc?.scrollTop ?? 0) > 0) { dragRef.current.startY = y; return; } // content owns it
      moveDrag(y, true);
      return;
    }
    moveDrag(y);
  };
  const onBodyEnd = () => {
    if (!isMobile) return;
    endDrag();
  };

  return (
    <>
      {/* Scrim only when EXPANDED — a plain tint (no backdrop-filter), and a
          tap collapses back to peek rather than closing outright. */}
      {isMobile && snap === 'expanded' && (
        <button
          type="button"
          aria-label="Collapse detail"
          onClick={() => { setHeight(PEEK); setSnap('peek'); }}
          className={`fixed inset-0 md:hidden ${z}`}
          style={{ background: 'rgba(4,20,26,0.45)' }}
        />
      )}
      <div
        ref={scrollerRef}
        role="dialog"
        aria-modal={!isMobile || snap === 'expanded'}
        aria-label={ariaLabel}
        className={`${z} border-2 fixed inset-x-0 bottom-0 rounded-t-2xl md:absolute md:inset-x-auto md:right-3 md:top-12 md:h-auto md:rounded-md ${tall ? 'md:bottom-[156px]' : ''} ${className}`}
        onTouchStart={onBodyStart}
        onTouchMove={onBodyMove}
        onTouchEnd={onBodyEnd}
        onTouchCancel={onBodyEnd}
        style={{
          ...RAIL_BASE_STYLE,
          // Explicit height only on phones (peek/expanded); desktop lets the
          // md: inset classes govern.
          ...(isMobile ? { height: `calc(${height}px + env(safe-area-inset-bottom, 0px))` } : {}),
          // Scroll-locked at peek so a pan anywhere on the card moves the
          // SHEET (expand/dismiss), not the content — content scrolling is
          // an expanded-only affordance. touch-action none at peek keeps
          // Chrome's pull-to-refresh out of the gesture; taps are unaffected.
          overflowY: isMobile && snap === 'peek' ? 'hidden' : 'auto',
          overscrollBehaviorY: 'none',
          touchAction: isMobile && snap === 'peek' ? 'none' : undefined,
          transform: entered ? 'translateY(0)' : 'translateY(100%)',
          transition: dragging
            ? 'none'
            : 'height 260ms cubic-bezier(0.4,0,0.2,1), transform 260ms cubic-bezier(0.4,0,0.2,1)',
          paddingBottom: isMobile ? undefined : 'env(safe-area-inset-bottom, 0px)',
        }}
      >
        {/* Drag handle — mobile only; drag up to expand, down to peek/dismiss. */}
        <div
          data-testid="sheet-handle"
          className="md:hidden sticky top-0 z-10 flex justify-center pt-2.5 pb-1"
          style={{ background: THEME.cardBg, touchAction: 'none' }}
          onTouchStart={onHandleStart}
          onTouchMove={onHandleMove}
          onTouchEnd={onHandleEnd}
          onTouchCancel={onHandleEnd}
        >
          <div style={{ width: 40, height: 4, borderRadius: 99, background: 'rgba(45,42,36,0.28)' }} />
        </div>
        <div ref={contentRef}>{children}</div>
      </div>
    </>
  );
}

function RiverCard({
  river,
  sharedGauge,
  primaryGauge,
  primaryHistory,
  forecast,
  onClose,
  onAccessPointClick,
  onSheetExpandedChange,
}: {
  river: MORiver;
  /** Set when the primary gauge also rates other rivers. */
  sharedGauge: { siteId: string; others: string[] } | null;
  primaryGauge: MoStatewideGauge | null;
  primaryHistory: MoHistoryBundleEntry | null;
  forecast: MoForecastEntry | null;
  onClose?: () => void;
  /** When set, access-point rows in the rail become clickable buttons
   *  that open the detail modal for that access point. */
  onAccessPointClick?: (id: string) => void;
  onSheetExpandedChange?: (expanded: boolean) => void;
}) {
  const primaryThresholds = (river.gauges ?? []).find((x) => x.is_primary) ?? null;
  // Use the canonical classifier so this badge matches /rivers/[slug] for
  // the same gauge reading. Falls back to forecast peak when the live
  // value is below flood stage but the next 72h forecast crosses it.
  const verdict: StageVerdict = (() => {
    if (!primaryGauge || !primaryThresholds) return 'unknown';
    const stageFt = primaryGauge.gaugeHeightFt;
    const value = primaryThresholds.threshold_unit === 'cfs'
      ? primaryGauge.dischargeCfs
      : stageFt;
    // Forecast-aware flood override on STAGE (ft), regardless of display unit —
    // the stored gauge height keeps anchoring "dangerous" for a cfs-primary gauge.
    if (
      primaryThresholds.flood_stage_ft != null &&
      Math.max(stageFt ?? Number.NEGATIVE_INFINITY, forecast?.peakFt ?? Number.NEGATIVE_INFINITY) >= primaryThresholds.flood_stage_ft
    ) {
      return 'dangerous';
    }
    if (value == null) return 'unknown';
    return classifyStageFromThresholds(value, primaryThresholds.threshold_unit, primaryThresholds, stageFt);
  })();
  const tone = STAGE_VERDICTS[verdict];
  const bannerChip = conditionChip(verdict);
  // The river's "Eddy says" report — the primary gauge carries is_primary +
  // river_slug, so this resolves to the river-level report (same source the
  // gauge card uses), giving the popup the same voice as the report + blog.
  // Passing the live verdict suppresses the note if the gauge has since
  // crossed into a different condition class than the note was written for.
  const eddy = useGaugeRailReport(primaryGauge, verdict);

  const allAccess = river.access_points ?? [];
  const [showAllAccess, setShowAllAccess] = useState(false);
  const accessSummary = showAllAccess ? allAccess : allAccess.slice(0, 4);

  return (
    <RailSheet onClose={onClose} onExpandedChange={onSheetExpandedChange} z="z-40" ariaLabel={river.name}>
    <div className="p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div
            className="uppercase font-bold"
            style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: '0.18em', color: 'var(--color-accent-700)' }}
          >
            {river.region ?? '—'} · {river.length_miles?.toFixed(0) ?? '—'} mi
          </div>
          <div className="mt-1 font-bold leading-tight"
            style={{ fontSize: 22, color: THEME.primaryDark, fontFamily: DISPLAY }}>
            {river.name}
          </div>
        </div>
        {onClose && <CloseBtn onClose={onClose} />}
      </div>

      {/* Tint + dark ink + solid inset accent — the shared system's approved
          chip surface (white on the light condition fills fails AA). */}
      <div
        className="mt-3 flex items-baseline gap-2.5 rounded-md px-3 py-2.5"
        style={{
          background: bannerChip.background,
          color: bannerChip.color,
          border: `1.5px solid ${bannerChip.borderColor}`,
          borderLeft: `4px solid ${bannerChip.solid}`,
        }}
      >
        <span className="font-bold leading-none" style={{ fontFamily: MONO, fontSize: 22 }}>
          {(primaryThresholds?.threshold_unit ?? 'ft') === 'cfs'
            ? (primaryGauge?.dischargeCfs != null
                ? `${Math.round(primaryGauge.dischargeCfs).toLocaleString()} cfs`
                : primaryThresholds ? '— cfs' : 'no live gauge')
            : (primaryGauge?.gaugeHeightFt != null
                ? `${primaryGauge.gaugeHeightFt.toFixed(2)} ft`
                : primaryThresholds ? '— ft' : 'no live gauge')}
        </span>
        <span className="font-bold uppercase"
          style={{ fontFamily: MONO, fontSize: 11, letterSpacing: '0.1em' }}>
          {tone.label}
        </span>
        <span className="ml-auto" style={{ fontSize: 11, opacity: 0.9 }}>{tone.desc}</span>
      </div>
      <div className="mt-1.5 flex items-center gap-1.5">
        <DataAgeChip iso={primaryGauge?.readingTimestamp} />
        <UnchangedChip days={flatlineDays(primaryHistory, primaryGauge)} />
      </div>
      {sharedGauge && (
        <div
          className="mt-1"
          style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: '0.04em', color: THEME.inkDim, lineHeight: 1.5 }}
        >
          Reading via shared gauge #{sharedGauge.siteId} — also rates{' '}
          {sharedGauge.others.join(', ')}; thresholds calibrated per river.
        </div>
      )}

      <EddyReportCard report={eddy} />

      {primaryThresholds && (
        <ThresholdProvenance
          thresholds={primaryThresholds}
          forecast={forecast}
          currentValueFt={primaryGauge?.gaugeHeightFt ?? null}
        />
      )}

      <div className="mt-3 grid grid-cols-3 gap-2">
        {(primaryThresholds?.threshold_unit ?? 'ft') === 'cfs' ? (
          <KV label="Stage"
            value={primaryGauge?.gaugeHeightFt != null ? primaryGauge.gaugeHeightFt.toFixed(2) : '—'}
            sub="ft" />
        ) : (
          <KV label="Flow"
            value={primaryGauge?.dischargeCfs != null ? `${Math.round(primaryGauge.dischargeCfs)}` : '—'}
            sub="cfs" />
        )}
        <KV label="Percentile"
          value={primaryGauge?.percentile != null ? `P${Math.round(primaryGauge.percentile)}` : '—'} />
        <KV label="Gauges" value={`${(river.gauges ?? []).length}`} />
      </div>

      <div className="mt-4">
        <RailSectionLabel>30-day trend · primary gauge</RailSectionLabel>
        <div
          className="rounded-md border-2 p-2.5"
          style={{ background: 'var(--color-secondary-100)', borderColor: 'var(--color-neutral-300)' }}
        >
          {primaryHistory ? (
            <Sparkline history={primaryHistory} width={310} height={90} />
          ) : (
            <div
              style={{
                height: 90, display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: MONO, fontSize: 10, color: THEME.inkDim,
              }}
            >
              Loading history…
            </div>
          )}
        </div>
        {primaryHistory?.band && (
          <div
            className="mt-1.5"
            style={{ fontFamily: MONO, fontSize: 9.5, color: THEME.inkDim }}
          >
            Period-of-record envelope (P25–P75) shaded.
            {primaryHistory.band.p50 != null && (
              <> Median for today: {Math.round(primaryHistory.band.p50)} cfs.</>
            )}
          </div>
        )}
        {primaryGauge && (
          <a
            href={`https://waterdata.usgs.gov/monitoring-location/${primaryGauge.site_no}/`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1.5 inline-block uppercase font-bold hover:underline"
            style={{
              fontFamily: MONO, fontSize: 9.5, letterSpacing: '0.1em',
              color: 'var(--color-primary-600)',
            }}
          >
            USGS #{primaryGauge.site_no} station page ↗
          </a>
        )}
      </div>

      {allAccess.length > 0 && (
        <div className="mt-4">
          <RailSectionLabel>Access points · {allAccess.length}</RailSectionLabel>
          <div className="space-y-1">
            {accessSummary.map((a) => {
              const clickable = !!onAccessPointClick;
              const Row = clickable ? 'button' : 'div';
              return (
                <Row
                  key={a.id}
                  type={clickable ? 'button' : undefined}
                  onClick={clickable ? () => onAccessPointClick(a.id) : undefined}
                  className={`flex w-full items-center justify-between rounded-sm px-2 py-1 text-left ${clickable ? 'hover:bg-secondary-200 cursor-pointer' : ''}`}
                  style={{ background: 'var(--color-secondary-100)', fontFamily: MONO, fontSize: 11, transition: 'background 120ms' }}
                >
                  <span className="truncate" style={{ color: THEME.ink }}>{a.name}</span>
                  <span style={{ color: 'var(--color-primary-600)', fontWeight: 700, marginLeft: 6, whiteSpace: 'nowrap' }}>
                    mi {a.river_mile_downstream != null ? a.river_mile_downstream.toFixed(1) : '—'}
                    {clickable && <span aria-hidden style={{ marginLeft: 6, color: 'var(--color-accent-500)' }}>›</span>}
                  </span>
                </Row>
              );
            })}
          </div>
          {allAccess.length > 4 && (
            <button
              type="button"
              onClick={() => setShowAllAccess((v) => !v)}
              className="mt-1 cursor-pointer hover:underline"
              style={{ fontFamily: MONO, fontSize: 10, color: THEME.inkDim, letterSpacing: '0.05em' }}
            >
              {showAllAccess ? `Show top 4` : `Show all ${allAccess.length}`}
            </button>
          )}
        </div>
      )}

      {river.pois && river.pois.length > 0 && (
        <div className="mt-4">
          <RailSectionLabel>On-river highlights</RailSectionLabel>
          <div className="space-y-1">
            {river.pois.slice(0, 5).map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between rounded-sm px-2 py-1"
                style={{ background: 'var(--color-secondary-100)', fontFamily: MONO, fontSize: 11 }}
              >
                <span className="truncate" style={{ color: THEME.ink }}>
                  {p.name}
                </span>
                <span style={{ color: THEME.inkDim, marginLeft: 6, textTransform: 'capitalize' }}>
                  {p.type.replace('_', ' ')}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Cross-link to the full River Report — ties the map to the report +
          blog pages this card's styling mirrors. Coral accent-700 keeps
          white label text AA-compliant. */}
      <a
        href={`/rivers/${river.slug}`}
        className="mt-4 flex items-center justify-center gap-1.5 rounded-md border-2 px-3 py-2.5 uppercase"
        style={{
          background: 'var(--color-accent-700)',
          color: 'var(--color-surface)',
          borderColor: THEME.cardBorder,
          boxShadow: `2px 2px 0 ${THEME.cardShadow}`,
          fontFamily: MONO,
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: '0.12em',
        }}
      >
        Full river report
        <span aria-hidden>→</span>
      </a>
    </div>
    </RailSheet>
  );
}


function GaugeDetail({
  gauge,
  verdict,
  forecast,
  onClose,
  onSheetExpandedChange,
}: {
  gauge: MoStatewideGauge;
  verdict: StageVerdict | null;
  forecast: MoForecastEntry | null;
  onClose: () => void;
  onSheetExpandedChange?: (expanded: boolean) => void;
}) {
  const cls = gauge.percentile != null ? classifyPercentile(gauge.percentile) : null;
  const history = useHistory(gauge.site_no);
  // Live verdict gates the note: a Flood reading must never sit under a
  // "good, dialed in" quote from Eddy's last daily pass.
  const eddy = useGaugeRailReport(gauge, verdict);
  // Prefer the editorial verdict (matches the marker color + the rest of
  // the app); fall back to the USGS percentile classification when the
  // gauge has no curated thresholds.
  const verdictInfo = verdict ? STAGE_VERDICTS[verdict] : null;
  // Match RiverCard's banner: a tinted surface with dark "ink" + a solid
  // left accent bar (the shared system's AA-safe chip — white text on the
  // light condition fills fails contrast). For percentile-only gauges with
  // no editorial verdict, keep the USGS percentile color as a light tint.
  const bannerChip = verdict
    ? conditionChip(verdict)
    : {
        background: cls ? `${cls.color}1F` : 'rgba(133,125,112,0.12)',
        color: 'var(--color-neutral-900)',
        borderColor: cls ? `${cls.color}59` : 'var(--color-neutral-300)',
        solid: cls?.color ?? '#857D70',
      };
  const headlineLabel = verdictInfo?.label ?? cls?.label ?? 'No condition data';
  const headlineValue = verdict
    ? (gauge.gaugeHeightFt != null ? `${gauge.gaugeHeightFt.toFixed(2)} ft` : '—')
    : (gauge.percentile != null ? `P${Math.round(gauge.percentile)}` : '—');
  return (
    <RailSheet onClose={onClose} onExpandedChange={onSheetExpandedChange} z="z-40" ariaLabel={`Gauge ${gauge.site_no}`}>
    <div className="p-4">
      <div className="flex items-start justify-between">
        <div>
          <div
            className="uppercase font-bold"
            style={{
              fontFamily: MONO, fontSize: 9.5, letterSpacing: '0.18em', color: 'var(--color-accent-700)',
            }}
          >
            USGS Site #{gauge.site_no}
          </div>
          <div className="mt-1 font-bold leading-tight"
            style={{ fontSize: 18, color: THEME.primaryDark, fontFamily: DISPLAY }}>
            {gauge.river_name}
          </div>
        </div>
        <CloseBtn onClose={onClose} />
      </div>

      <div
        className="mt-3 flex items-baseline gap-3 rounded-md px-3 py-2.5"
        style={{
          background: bannerChip.background,
          color: bannerChip.color,
          border: `1.5px solid ${bannerChip.borderColor}`,
          borderLeft: `4px solid ${bannerChip.solid}`,
        }}
      >
        <div className="font-bold leading-none" style={{ fontFamily: MONO, fontSize: 22 }}>
          {headlineValue}
        </div>
        <div style={{ fontSize: 13, fontWeight: 600 }}>{headlineLabel}</div>
      </div>
      <div className="mt-1.5"><DataAgeChip iso={gauge.readingTimestamp} /></div>

      <EddyReportCard report={eddy} />

      <ThresholdProvenance
        thresholds={{
          flood_stage_ft: gauge.flood_stage_ft,
          action_stage_ft: gauge.action_stage_ft,
          threshold_source: gauge.threshold_source,
          threshold_source_url: gauge.threshold_source_url,
        }}
        forecast={forecast}
        currentValueFt={gauge.gaugeHeightFt}
      />

      <div className="mt-3 grid grid-cols-2 gap-2">
        <KV label="Flow"
          value={gauge.dischargeCfs != null ? `${Math.round(gauge.dischargeCfs)}` : '—'} sub="cfs" />
        <KV label="Stage"
          value={gauge.gaugeHeightFt != null ? `${gauge.gaugeHeightFt.toFixed(2)}` : '—'} sub="ft" />
        <KV label="Percentile"
          value={gauge.percentile != null ? `P${Math.round(gauge.percentile)}` : '—'} />
        <KV label="Years on record"
          value={gauge.stats?.yearsOfRecord != null ? `${Math.round(gauge.stats.yearsOfRecord)}` : '—'} />
      </div>

      <div className="mt-3">
        <RailSectionLabel>30-day trend</RailSectionLabel>
      </div>
      <div
        className="mt-1 rounded-md border-2 p-2.5"
        style={{ background: 'var(--color-secondary-100)', borderColor: 'var(--color-neutral-300)' }}
      >
        {history ? <Sparkline history={history} width={310} height={120} /> : (
          <div style={{
            height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: MONO, fontSize: 10, color: THEME.inkDim,
          }}>Loading…</div>
        )}
      </div>

      <div
        className="mt-3 border-t pt-2.5"
        style={{
          borderTop: '1px dashed var(--color-neutral-300)',
          fontFamily: MONO, fontSize: 10, lineHeight: 1.5, color: THEME.inkDim,
        }}
      >
        Percentile ranks today&apos;s flow against this gauge&apos;s full daily
        record for the date.
      </div>

      {/* Cross-link to the full River Report — the richer destination (guide,
          sections, outfitters, planner) for the river this gauge rates. It's
          the primary action here, so it sits above the raw USGS station page
          and borrows the RiverCard's coral CTA to keep the map's cards
          consistent. */}
      <a
        href={`/rivers/${gauge.river_slug}`}
        className="mt-3 flex items-center justify-center gap-1.5 rounded-md border-2 px-3 py-2.5 uppercase"
        style={{
          background: 'var(--color-accent-700)',
          color: 'var(--color-surface)',
          borderColor: THEME.cardBorder,
          boxShadow: `2px 2px 0 ${THEME.cardShadow}`,
          fontFamily: MONO, fontSize: 12, fontWeight: 700, letterSpacing: '0.12em',
        }}
      >
        Full river report
        <span aria-hidden>→</span>
      </a>

      {/* Straight to the horse's mouth — the official USGS station page with
          the full record, rating tables, and annual peaks. */}
      <a
        href={`https://waterdata.usgs.gov/monitoring-location/${gauge.site_no}/`}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-2.5 flex items-center justify-center gap-1.5 rounded-md border-2 px-3 py-2 uppercase"
        style={{
          background: 'var(--color-secondary-50)',
          color: 'var(--color-primary-700)',
          borderColor: 'var(--color-primary-700)',
          boxShadow: `2px 2px 0 ${THEME.cardShadow}`,
          fontFamily: MONO, fontSize: 11, fontWeight: 700, letterSpacing: '0.12em',
        }}
      >
        USGS station page
        <span aria-hidden>↗</span>
      </a>
    </div>
    </RailSheet>
  );
}

// "Eddy says" payload rendered in the gauge rail. Both endpoints feed
// the same card, so we normalize to a minimal shape that matches what
// EddyReportCard reads.

function CampgroundCard({
  campground, onClose,
}: { campground: MOCampground; onClose: () => void }) {
  return (
    <div
      className="absolute right-3 z-30 w-[min(330px,calc(100vw-24px))] rounded-md border-2 p-4"
      style={{ ...RAIL_BASE_STYLE, top: 12 }}
    >
      <div className="flex items-start justify-between">
        <div>
          <div className="uppercase font-bold"
            style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: '0.18em', color: 'var(--color-accent-700)' }}>
            NPS · Ozark Riverways
          </div>
          <div className="mt-1 font-bold leading-tight"
            style={{ fontSize: 18, color: THEME.primaryDark, fontFamily: DISPLAY }}>
            {campground.name}
          </div>
        </div>
        <CloseBtn onClose={onClose} />
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <KV label="Total" value={`${campground.total_sites ?? 0}`} sub="sites" />
        <KV label="Reservable" value={`${campground.sites_reservable ?? 0}`} />
        <KV label="First-come" value={`${campground.sites_first_come ?? 0}`} />
      </div>
      <div className="mt-3 flex flex-col gap-1.5">
        {campground.reservation_url && (
          <a
            href={campground.reservation_url}
            target="_blank" rel="noreferrer"
            className="rounded-md border-2 px-3 py-2 text-center text-[12px] font-bold uppercase tracking-[0.1em]"
            style={{
              background: THEME.live, color: 'var(--color-secondary-50)', borderColor: THEME.cardBorder,
              fontFamily: MONO, boxShadow: `2px 2px 0 ${THEME.cardShadow}`,
            }}
          >
            Reserve · recreation.gov
          </a>
        )}
        {campground.nps_url && (
          <a
            href={campground.nps_url}
            target="_blank" rel="noreferrer"
            className="rounded-md border-2 px-3 py-2 text-center text-[11px] uppercase tracking-[0.1em]"
            style={{
              background: THEME.cardBg, color: THEME.ink, borderColor: THEME.cardBorder,
              fontFamily: MONO, boxShadow: `2px 2px 0 ${THEME.cardShadow}`,
            }}
          >
            NPS page →
          </a>
        )}
      </div>
    </div>
  );
}

function AccessPointCard({
  ap, river, onClose,
}: { ap: MOAccessPoint; river: MORiver; onClose: () => void }) {
  return (
    <div
      className="absolute right-3 z-30 w-[min(330px,calc(100vw-24px))] rounded-md border-2 p-4"
      style={{ ...RAIL_BASE_STYLE, top: 12 }}
    >
      <div className="flex items-start justify-between">
        <div>
          <div className="uppercase font-bold"
            style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: '0.18em', color: 'var(--color-accent-700)' }}>
            {ap.ownership ?? 'Public'} · access
          </div>
          <div className="mt-1 font-bold leading-tight"
            style={{ fontSize: 18, color: THEME.primaryDark, fontFamily: DISPLAY }}>
            {ap.name}
          </div>
          <div style={{
            fontFamily: MONO, fontSize: 11, marginTop: 2, color: THEME.inkDim,
          }}>
            {river.name} · mile {ap.river_mile_downstream?.toFixed(1) ?? '—'}
          </div>
        </div>
        <CloseBtn onClose={onClose} />
      </div>
      <a
        href={`/rivers/${river.slug}`}
        className="mt-3 inline-block rounded-md border-2 px-3 py-2 text-[11px] font-bold uppercase tracking-[0.1em]"
        style={{
          background: THEME.cardBg, color: THEME.ink, borderColor: THEME.cardBorder,
          fontFamily: MONO, boxShadow: `2px 2px 0 ${THEME.cardShadow}`,
        }}
      >
        Plan a float on {river.name} →
      </a>
    </div>
  );
}

function PoiCard({
  poi, river, onClose,
}: { poi: MOPoi; river: MORiver | null; onClose: () => void }) {
  return (
    <div
      className="absolute right-3 z-30 w-[min(330px,calc(100vw-24px))] rounded-md border-2 p-4"
      style={{ ...RAIL_BASE_STYLE, top: 12 }}
    >
      <div className="flex items-start justify-between">
        <div>
          <div className="uppercase font-bold"
            style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: '0.18em', color: 'var(--color-accent-700)' }}>
            {poi.type.replace('_', ' ')}
          </div>
          <div className="mt-1 font-bold leading-tight"
            style={{ fontSize: 18, color: THEME.primaryDark, fontFamily: DISPLAY }}>
            {poi.name}
          </div>
          {river && (
            <div style={{
              fontFamily: MONO, fontSize: 11, marginTop: 2, color: THEME.inkDim,
            }}>
              {river.name}{poi.river_mile != null ? ` · mile ${poi.river_mile.toFixed(1)}` : ''}
            </div>
          )}
        </div>
        <CloseBtn onClose={onClose} />
      </div>
      {poi.description && (
        <div className="mt-3" style={{ fontSize: 12, lineHeight: 1.5, color: THEME.ink }}>
          {poi.description.length > 280 ? `${poi.description.slice(0, 280)}…` : poi.description}
        </div>
      )}
      {poi.nps_url && (
        <a
          href={poi.nps_url}
          target="_blank" rel="noreferrer"
          className="mt-3 inline-block rounded-md border-2 px-3 py-2 text-[11px] uppercase tracking-[0.1em]"
          style={{
            background: THEME.cardBg, color: THEME.ink, borderColor: THEME.cardBorder,
            fontFamily: MONO, boxShadow: `2px 2px 0 ${THEME.cardShadow}`,
          }}
        >
          Read on NPS.gov →
        </a>
      )}
    </div>
  );
}

// ─── Time scrubber driven by real per-day percentile array ──────────────


export function ContextSiteCard({
  site,
  onClose,
  onSheetExpandedChange,
}: {
  site: MoContextSite;
  onClose: () => void;
  onSheetExpandedChange?: (expanded: boolean) => void;
}) {
  return (
    <RailSheet onClose={onClose} onExpandedChange={onSheetExpandedChange} z="z-40" tall={false} className="md:w-[min(330px,calc(100vw-24px))]" ariaLabel={`USGS site ${site.site_no}`}>
    <div className="p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="uppercase font-bold"
            style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: '0.18em', color: 'var(--color-accent-700)' }}>
            USGS Site #{site.site_no}
          </div>
          <div className="mt-1 font-bold leading-tight"
            style={{ fontSize: 16, color: THEME.primaryDark, fontFamily: DISPLAY }}>
            {site.name ?? 'Unnamed monitoring site'}
          </div>
        </div>
        <CloseBtn onClose={onClose} />
      </div>

      <div className="mt-3 flex items-baseline gap-2 rounded-md border-2 px-3 py-2.5"
        style={{ background: 'var(--color-secondary-100)', borderColor: 'var(--color-neutral-300)' }}>
        <span className="font-bold leading-none" style={{ fontFamily: MONO, fontSize: 22, color: THEME.primary }}>
          {Math.round(site.dischargeCfs).toLocaleString()}
        </span>
        <span style={{ fontFamily: MONO, fontSize: 11, color: THEME.inkDim }}>cfs discharge</span>
        <span className="ml-auto"><DataAgeChip iso={site.readingTimestamp} /></span>
      </div>

      <p className="mt-2.5" style={{ fontFamily: MONO, fontSize: 10, lineHeight: 1.55, color: THEME.inkDim }}>
        Statewide context site — Eddy has no float rating here. Flow shown
        for hydrologic context only.
      </p>

      <a
        href={`https://waterdata.usgs.gov/monitoring-location/${site.site_no}`}
        target="_blank"
        rel="noreferrer"
        className="mt-3 inline-block rounded-md border-2 px-3 py-2 text-[11px] font-bold uppercase tracking-[0.1em]"
        style={{
          background: THEME.cardBg, color: THEME.ink, borderColor: THEME.cardBorder,
          fontFamily: MONO, boxShadow: `2px 2px 0 ${THEME.cardShadow}`,
        }}
      >
        Full record on USGS →
      </a>
    </div>
    </RailSheet>
  );
}
