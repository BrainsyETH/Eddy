'use client';

// /river-map — a map-first, data-rich experience.
//
//   ┌─────────┬──────────────────────────────┐
//   │  Data   │   Live condition map          │
//   │  dock   │   (rivers, gauges, rail,      │
//   │         │    30-day timeline)           │
//   └─────────┴──────────────────────────────┘
//
// The dock and the map share one hover/focus state: pointing at a river
// row lights the reach; scrubbing the timeline repaints the rows. On
// mobile the dock becomes a slide-in drawer behind a floating live chip.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import {
  classifyStageFromThresholds,
  condKey,
  type MOCampground,
  type MODataset,
  type MORiver,
  type StageVerdict,
} from '@/lib/usgs/mo-statewide-data';
import type {
  MoStatewideGauge,
  MoStatewideResponse,
} from '@/app/api/usgs/mo-statewide/route';
import type {
  MoHistoryBundleEntry,
  MoHistoryBundleResponse,
} from '@/app/api/usgs/mo-history-bundle/route';
import type {
  MoForecastEntry,
  MoForecastResponse,
} from '@/app/api/usgs/mo-forecast/route';
import type { MoSitesResponse } from '@/app/api/usgs/mo-sites/route';
import type { MoContextSite } from '@/lib/usgs/mo-sites';
import { computeTodayVerdicts, FLOATABLE } from './derive';
import DataDock, { type DockRiverReading, type DockRiverTrend } from './Dock';
import {
  RightRail,
  TimeScrubber,
  DetailModal,
  GaugeHoverOverlay,
  ContextSiteCard,
  flatlineDays,
  type ModalSelection,
} from './Chrome';

const MOMap = dynamic(() => import('./MOMap'), { ssr: false });

export default function MOSurfaceWaterApp() {
  const [dataset, setDataset] = useState<MODataset | null>(null);
  const [statewide, setStatewide] = useState<MoStatewideResponse | null>(null);
  const [historyBundle, setHistoryBundle] = useState<MoHistoryBundleResponse | null>(null);
  const [forecast, setForecast] = useState<MoForecastResponse | null>(null);
  const [moSites, setMoSites] = useState<MoSitesResponse | null>(null);
  const [selectedSite, setSelectedSite] = useState<MoContextSite | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Set when live fetch failed and we hydrated from the local snapshot. */
  const [staleCacheAt, setStaleCacheAt] = useState<string | null>(null);

  const [hoveredRiverId, setHoveredRiverId] = useState<string | null>(null);
  const [focusedRiverId, setFocusedRiverId] = useState<string | null>(null);
  const [hoveredGaugeId, setHoveredGaugeId] = useState<string | null>(null);
  const [hoveredGaugePos, setHoveredGaugePos] = useState<{ x: number; y: number } | null>(null);
  const [focusedGaugeId, setFocusedGaugeId] = useState<string | null>(null);
  // Access points / campgrounds / POIs open in a modal popup with link-outs;
  // they're not pinned in the right rail. Rivers + gauges still pin to the
  // rail on click.
  const [modalSelection, setModalSelection] = useState<ModalSelection | null>(null);
  const [dayOffset, setDayOffset] = useState(0);
  const [dockOpen, setDockOpen] = useState(false);
  // True while the mobile bottom sheet is at its EXPANDED snap. The flow
  // animation pauses when the map is mostly covered (expanded sheet, modal,
  // or the dock drawer) — at PEEK it keeps running, since the visible live
  // map above the sheet is the point of the page.
  const [sheetExpanded, setSheetExpanded] = useState(false);
  // The 30-day timeline is a big fixed reserve; collapse it by default on
  // phones to give the map back ~100px, expanded on md+. Starts expanded on
  // both server and first client render (so hydration matches), then
  // collapses after mount if we're on a small screen.
  // This page is a fixed full-viewport app — iOS rubber-banding the (empty)
  // body just reveals the light site background above the dark header as a
  // gray band. Contain overscroll and paint the body dark for the cases
  // where iOS rubber-bands anyway; scoped to this route and restored on
  // unmount so content pages keep pull-to-refresh and their light bg.
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const prev = [html.style.overscrollBehaviorY, body.style.overscrollBehaviorY, body.style.backgroundColor];
    html.style.overscrollBehaviorY = 'none';
    body.style.overscrollBehaviorY = 'none';
    body.style.backgroundColor = '#071A20';
    return () => {
      html.style.overscrollBehaviorY = prev[0];
      body.style.overscrollBehaviorY = prev[1];
      body.style.backgroundColor = prev[2];
    };
  }, []);

  const [timelineExpanded, setTimelineExpanded] = useState(true);
  useEffect(() => {
    if (!window.matchMedia('(min-width: 768px)').matches) setTimelineExpanded(false);
  }, []);

  // Access points / campgrounds / springs are paused while we iterate on
  // the gauge-first experience. The MOMap props are kept so the layers
  // can be re-enabled by flipping these constants when we're ready.
  const showCampgrounds = false;
  const showAccessPoints = false;
  const showPOIs = false;
  const [showGauges, setShowGauges] = useState(true);
  const [showTerrain, setShowTerrain] = useState(true);
  const [showSites, setShowSites] = useState(true);
  const [showFlow, setShowFlow] = useState(true);

  // Initial fetches. On success the payloads are snapshotted to
  // localStorage; on failure we hydrate from that snapshot with a loud
  // staleness banner — a rural connection dropping must never mean a
  // broken map (and never a stale map dressed as live).
  useEffect(() => {
    let aborted = false;
    const CACHE_KEY = 'mosw-snapshot-v1';
    const load = async () => {
      try {
        // Phase 1 — everything the live verdicts need (geometry + readings
        // + 72h flood forecast). The rivers start breathing the moment
        // these land; the slow 30-day history fan-out must not gate them.
        const [dRes, sRes, fRes] = await Promise.all([
          fetch('/api/usgs/mo-dataset'),
          fetch('/api/usgs/mo-statewide'),
          fetch('/api/usgs/mo-forecast'),
        ]);
        if (!dRes.ok) throw new Error(`dataset ${dRes.status}`);
        const d = await dRes.json();
        const s = sRes.ok ? await sRes.json() : { gauges: [], generatedAt: null };
        const f = fRes.ok ? await fRes.json() : { entries: [], generatedAt: null };
        if (aborted) return;
        setDataset(d);
        setStatewide(s);
        setForecast(f);
        setError(null);
        setStaleCacheAt(null);

        // Phase 2 — 30-day history (sparklines, trends, time scrubber).
        // Everything downstream renders a sensible empty state until it
        // lands. The offline snapshot is written once both phases settle
        // so a hydrate never restores a map without its history.
        let h: MoHistoryBundleResponse = { entries: [], days: 30, generatedAt: '' };
        try {
          const hRes = await fetch('/api/usgs/mo-history-bundle');
          if (hRes.ok) h = await hRes.json();
        } catch { /* history is enrichment — the live map stands without it */ }
        if (aborted) return;
        setHistoryBundle(h);
        try {
          window.localStorage.setItem(
            CACHE_KEY,
            JSON.stringify({ at: new Date().toISOString(), d, s, h, f }),
          );
        } catch { /* quota/private mode — cache is best-effort */ }
      } catch (e) {
        if (aborted) return;
        // Degraded path: last-known snapshot, clearly labeled.
        try {
          const raw = window.localStorage.getItem(CACHE_KEY);
          if (raw) {
            const snap = JSON.parse(raw);
            setDataset(snap.d);
            setStatewide(snap.s);
            setHistoryBundle(snap.h);
            setForecast(snap.f);
            setStaleCacheAt(snap.at ?? null);
            setError(null);
            return;
          }
        } catch { /* fall through to the error banner */ }
        setError(e instanceof Error ? e.message : String(e));
      }
    };
    load();
    // Statewide context sites load independently — strictly optional, so
    // their failure (or slowness) never gates the curated experience.
    const loadSites = () => {
      fetch('/api/usgs/mo-sites')
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => { if (!aborted && j) setMoSites(j); })
        .catch(() => {});
    };
    loadSites();
    let lastLiveFetchAt = Date.now();
    const refreshLive = () => {
      lastLiveFetchAt = Date.now();
      fetch('/api/usgs/mo-statewide')
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => { if (!aborted && j) setStatewide(j); })
        .catch(() => {});
      loadSites();
    };
    // refresh the live snapshots every 15 minutes
    const id = setInterval(refreshLive, 15 * 60 * 1000);
    // Background tabs throttle (or freeze, on mobile) the interval — a
    // phone unlocked hours later would show old readings until the next
    // tick. Refetch immediately on tab return when the data has aged.
    const onVisible = () => {
      if (!document.hidden && Date.now() - lastLiveFetchAt > 5 * 60 * 1000) refreshLive();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      aborted = true;
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  const rivers: MORiver[] = useMemo(() => dataset?.rivers ?? [], [dataset]);
  const gauges: MoStatewideGauge[] = useMemo(() => statewide?.gauges ?? [], [statewide]);
  const historyEntries: MoHistoryBundleEntry[] = useMemo(
    () => historyBundle?.entries ?? [],
    [historyBundle],
  );
  const forecastBySite: Record<string, MoForecastEntry> = useMemo(() => {
    const out: Record<string, MoForecastEntry> = {};
    for (const e of forecast?.entries ?? []) out[e.site_no] = e;
    return out;
  }, [forecast]);

  const dayCount = historyEntries[0]?.daily.length ?? 0;

  // Index into the daily-history arrays for the current scrubber position.
  // dayOffset is negative; -30 → index 0, 0 → last index.
  const scrubIdx = useMemo(() => {
    if (!dayCount) return -1;
    return Math.max(
      0,
      Math.min(dayCount - 1, Math.round(((dayCount - 1) * (30 + dayOffset)) / 30)),
    );
  }, [dayOffset, dayCount]);

  const isToday = dayOffset === 0 || scrubIdx === dayCount - 1;

  // Per-gauge percentile (for gauge dots)
  const percentileByGauge: Record<string, number | null> = useMemo(() => {
    const out: Record<string, number | null> = {};
    if (isToday || !historyEntries.length) {
      for (const g of gauges) out[g.site_no] = g.percentile;
    } else {
      for (const g of gauges) {
        const ent = historyEntries.find((e) => e.site_no === g.site_no);
        out[g.site_no] = ent?.daily[scrubIdx]?.percentile ?? g.percentile;
      }
    }
    return out;
  }, [gauges, historyEntries, scrubIdx, isToday]);

  // Per-gauge ConditionCode — derived from the gauge's own thresholds and
  // reading. Drives the segmented river coloring so each reach inherits
  // the condition of the gauge nearest to it, instead of every reach
  // showing the primary gauge's condition.
  //
  // Keyed by `${river_id}::${site_id}` (see condKey), not by site alone: a
  // single physical gauge can be the primary for two rivers with different
  // editorial thresholds (07017200 → Courtois + Huzzah), so the same reading
  // must classify independently per river.
  const conditionByGauge: Record<string, StageVerdict> = useMemo(() => {
    const out: Record<string, StageVerdict> = {};
    for (const r of rivers) {
      for (const g of r.gauges ?? []) {
        const live = gauges.find((x) => x.site_no === g.site_id);
        let value: number | null = null;
        if (isToday) {
          value = g.threshold_unit === 'ft'
            ? live?.gaugeHeightFt ?? null
            : live?.dischargeCfs ?? null;
        } else {
          const ent = historyEntries.find((e) => e.site_no === g.site_id);
          const day = ent?.daily[scrubIdx];
          value = g.threshold_unit === 'ft'
            ? day?.gaugeHeightFt ?? null
            : day?.dischargeCfs ?? null;
        }
        out[condKey(r.id, g.site_id)] = classifyStageFromThresholds(value, g.threshold_unit, g);
      }
    }
    return out;
  }, [rivers, gauges, historyEntries, scrubIdx, isToday]);

  // Verdict per river from the primary gauge. Today's view includes the
  // 72h AHPS forecast flood override (shared derivation with the dock's
  // headline counts); scrubbed days classify the historical reading.
  const verdictByRiver: Record<string, StageVerdict> = useMemo(() => {
    if (isToday) return computeTodayVerdicts(rivers, gauges, forecastBySite);
    const out: Record<string, StageVerdict> = {};
    for (const r of rivers) {
      const primary = (r.gauges ?? []).find((g) => g.is_primary);
      if (!primary) { out[r.slug] = 'unknown'; continue; }
      const ent = historyEntries.find((e) => e.site_no === primary.site_id);
      const day = ent?.daily[scrubIdx];
      const value = primary.threshold_unit === 'ft'
        ? day?.gaugeHeightFt ?? null
        : day?.dischargeCfs ?? null;
      out[r.slug] = classifyStageFromThresholds(value, primary.threshold_unit, primary);
    }
    return out;
  }, [rivers, gauges, historyEntries, scrubIdx, isToday, forecastBySite]);

  // Primary-gauge reading per river for the dock rows — live today,
  // historical when the timeline is scrubbed, so the dock always shows
  // the same day the map is painting.
  const readingByRiver: Record<string, DockRiverReading> = useMemo(() => {
    const out: Record<string, DockRiverReading> = {};
    // By SITE, not river slug — the statewide payload has one entry per
    // physical gauge, so a shared primary (07017200 → Courtois + Huzzah)
    // must serve both rivers' rows (see computeTodayVerdicts).
    const liveBySite = new Map<string, MoStatewideGauge>();
    for (const g of gauges) {
      if (!liveBySite.has(g.site_no)) liveBySite.set(g.site_no, g);
    }
    for (const r of rivers) {
      const primary = (r.gauges ?? []).find((g) => g.is_primary);
      if (!primary) { out[r.slug] = { value: null, unit: 'ft', dischargeCfs: null, percentile: null }; continue; }
      if (isToday) {
        const live = liveBySite.get(primary.site_id);
        out[r.slug] = {
          value: primary.threshold_unit === 'ft'
            ? live?.gaugeHeightFt ?? null
            : live?.dischargeCfs ?? null,
          unit: primary.threshold_unit,
          dischargeCfs: live?.dischargeCfs ?? null,
          percentile: live?.percentile ?? null,
        };
      } else {
        const ent = historyEntries.find((e) => e.site_no === primary.site_id);
        const day = ent?.daily[scrubIdx];
        out[r.slug] = {
          value: primary.threshold_unit === 'ft'
            ? day?.gaugeHeightFt ?? null
            : day?.dischargeCfs ?? null,
          unit: primary.threshold_unit,
          dischargeCfs: day?.dischargeCfs ?? null,
          percentile: day?.percentile ?? null,
        };
      }
    }
    return out;
  }, [rivers, gauges, historyEntries, scrubIdx, isToday]);

  const floatableCount = rivers.filter((r) => FLOATABLE.has(verdictByRiver[r.slug])).length;

  // A single physical gauge can be the primary for more than one river —
  // USGS 07017200 rates both Courtois and Huzzah, each against its own
  // thresholds. Disclose it everywhere the reading shows, instead of
  // letting a river present a neighbor creek's gauge as silently its own.
  // Derived from the dataset (no hardcoded site IDs), keyed by river slug.
  const sharedGaugeByRiver: Record<string, { siteId: string; others: string[] }> = useMemo(() => {
    const riversBySite = new Map<string, MORiver[]>();
    for (const r of rivers) {
      const primary = (r.gauges ?? []).find((g) => g.is_primary);
      if (!primary) continue;
      const list = riversBySite.get(primary.site_id) ?? [];
      list.push(r);
      riversBySite.set(primary.site_id, list);
    }
    const out: Record<string, { siteId: string; others: string[] }> = {};
    riversBySite.forEach((rs, siteId) => {
      if (rs.length < 2) return;
      for (const r of rs) {
        out[r.slug] = { siteId, others: rs.filter((x) => x.id !== r.id).map((x) => x.name) };
      }
    });
    return out;
  }, [rivers]);

  // Newest actual USGS reading time across the network — the honest "as of"
  // for the dock masthead. The route's generatedAt is just server response
  // time and reads fresher than the data really is.
  const newestReadingAt = useMemo(() => {
    let max: string | null = null;
    for (const g of gauges) {
      const t = g.readingTimestamp;
      if (t && !Number.isNaN(Date.parse(t)) && (!max || Date.parse(t) > Date.parse(max))) max = t;
    }
    return max;
  }, [gauges]);

  // 24h direction per river: today's daily value vs yesterday's, in the
  // gauge's own threshold unit. Small wobble reads as steady, not a trend.
  // Null when the river has no primary gauge or fewer than two daily points.
  const trendByRiver: Record<string, DockRiverTrend | null> = useMemo(() => {
    const out: Record<string, DockRiverTrend | null> = {};
    for (const r of rivers) {
      out[r.slug] = null;
      const primary = (r.gauges ?? []).find((g) => g.is_primary);
      if (!primary) continue;
      const ent = historyEntries.find((e) => e.site_no === primary.site_id && e.is_primary);
      const daily = ent?.daily ?? [];
      const pick = (d: { gaugeHeightFt: number | null; dischargeCfs: number | null }) =>
        primary.threshold_unit === 'ft' ? d.gaugeHeightFt : d.dischargeCfs;
      const vals = daily.map(pick).filter((v): v is number => v != null);
      if (vals.length < 2) continue;
      const today = vals[vals.length - 1];
      const yesterday = vals[vals.length - 2];
      const delta = today - yesterday;
      const deadband = primary.threshold_unit === 'ft' ? 0.05 : Math.abs(yesterday) * 0.05;
      out[r.slug] = {
        dir: delta > deadband ? 'rising' : delta < -deadband ? 'falling' : 'steady',
        delta,
        unit: primary.threshold_unit,
      };
    }
    return out;
  }, [rivers, historyEntries]);

  // Mission-control telemetry for the dock: how much of the network is
  // talking, which way the water is moving (the planning signal), and
  // whether the next 72h forecast crosses any warning stage. The rising/
  // falling counts are derived from trendByRiver so the aggregate and the
  // per-row arrows can never disagree.
  const telemetry = useMemo(() => {
    const reporting = gauges.filter(
      (g) => g.dischargeCfs != null || g.gaugeHeightFt != null,
    ).length;
    let rising = 0;
    let falling = 0;
    let risk72h = 0;
    for (const r of rivers) {
      const dir = trendByRiver[r.slug]?.dir;
      if (dir === 'rising') rising++;
      else if (dir === 'falling') falling++;
      const primary = (r.gauges ?? []).find((g) => g.is_primary);
      if (!primary) continue;
      const fc = forecastBySite[primary.site_id];
      const warnStage = primary.action_stage_ft ?? primary.flood_stage_ft;
      if (fc?.peakFt != null && warnStage != null && fc.peakFt >= warnStage) risk72h++;
    }
    return { reporting, rising, falling, risk72h };
  }, [rivers, gauges, trendByRiver, forecastBySite]);

  // ─── Right-rail selectors ─────────────────────────────────────────────
  const focusedRiver = rivers.find((r) => r.id === focusedRiverId) ?? null;
  const hoveredRiver = rivers.find((r) => r.id === hoveredRiverId) ?? null;
  const railRiver = focusedRiver ?? hoveredRiver;
  const railPrimaryGauge = (() => {
    if (!railRiver) return null;
    const primary = (railRiver.gauges ?? []).find((g) => g.is_primary);
    if (!primary) return null;
    return gauges.find((g) => g.site_no === primary.site_id) ?? null;
  })();
  const railPrimaryHistory = (() => {
    if (!railRiver) return null;
    const primary = (railRiver.gauges ?? []).find((g) => g.is_primary);
    if (!primary) return null;
    return historyEntries.find((e) => e.site_no === primary.site_id) ?? null;
  })();

  const focusedGauge = gauges.find((g) => g.site_no === focusedGaugeId) ?? null;
  const hoveredGauge = gauges.find((g) => g.site_no === hoveredGaugeId) ?? null;
  // USGS station name lookup for the hover overlay's source line; lives in
  // the dataset's per-river gauge rows, not in the statewide payload.
  const hoveredGaugeName = useMemo(() => {
    if (!hoveredGauge) return null;
    for (const r of rivers) {
      const match = (r.gauges ?? []).find((g) => g.site_id === hoveredGauge.site_no);
      if (match) return match.name;
    }
    return null;
  }, [hoveredGauge, rivers]);
  // Stuck-sensor disclosure for the hovered gauge (see flatlineDays).
  const hoveredGaugeUnchangedDays = useMemo(() => {
    if (!hoveredGauge) return null;
    const ent = historyEntries.find((e) => e.site_no === hoveredGauge.site_no) ?? null;
    return flatlineDays(ent, hoveredGauge);
  }, [hoveredGauge, historyEntries]);
  // Rivers whose PRIMARY rating comes from the hovered gauge — two or more
  // means the hover overlay discloses the shared-gauge arrangement.
  const hoveredGaugeSharedRivers = useMemo(() => {
    if (!hoveredGauge) return null;
    const names = rivers
      .filter((r) => (r.gauges ?? []).some((g) => g.is_primary && g.site_id === hoveredGauge.site_no))
      .map((r) => r.name);
    return names.length >= 2 ? names : null;
  }, [hoveredGauge, rivers]);

  // One selection = one overlay. The page has three independent overlay
  // systems — the rail (focused gauge/river), the context-site card, and
  // the center detail modal — and clicking a new feature must REPLACE
  // whatever is open, not stack on top of it. Every selection entry point
  // clears all of them first, then sets its own. (Escape still peels the
  // layers one at a time for keyboard users, below.)
  // All of these are useCallback'd so MOMap's memoized marker layers can
  // list them as deps without being invalidated every render.
  const clearAllOverlays = useCallback(() => {
    setFocusedGaugeId(null);
    setFocusedRiverId(null);
    setHoveredRiverId(null);
    setHoveredGaugeId(null);
    setHoveredGaugePos(null);
    setSelectedSite(null);
    setModalSelection(null);
  }, []);

  const handleFocusGauge = useCallback((id: string | null) => {
    clearAllOverlays();
    if (id) setFocusedGaugeId(id);
  }, [clearAllOverlays]);
  const selectRiver = useCallback((id: string | null) => {
    clearAllOverlays();
    if (id) setFocusedRiverId(id);
  }, [clearAllOverlays]);
  const selectSite = useCallback((site: MoContextSite | null) => {
    clearAllOverlays();
    if (site) setSelectedSite(site);
  }, [clearAllOverlays]);
  const handleHoverGauge = useCallback((id: string | null, pos?: { x: number; y: number } | null) => {
    setHoveredGaugeId(id);
    setHoveredGaugePos(pos ?? null);
  }, []);
  // Access points / campgrounds / POIs open the modal popup with link-outs.
  // We also focus the river they belong to so the right rail keeps showing
  // its float context behind the modal — that pairing is one selection, so
  // it clears the gauge/site overlays but keeps its own river focus.
  const handleClickAccess = useCallback((id: string | null) => {
    if (!id) { setModalSelection(null); return; }
    for (const r of rivers) {
      const ap = (r.access_points ?? []).find((a) => a.id === id);
      if (ap) {
        clearAllOverlays();
        setModalSelection({ kind: 'access', ap, river: r });
        setFocusedRiverId(r.id);
        return;
      }
    }
  }, [rivers, clearAllOverlays]);
  const handleClickCampground = useCallback((id: string | null) => {
    if (!id || !dataset) { setModalSelection(null); return; }
    const camp = dataset.campgrounds.find((c) => c.id === id);
    if (!camp) return;
    // Find the river the campground was snapped to (if any) so the modal
    // can name it. Falls back to nearest-by-distance if snap_river_id is
    // not present on the row.
    let nearestRiverName: string | null = null;
    for (const r of rivers) {
      // The dataset RPC may attach snap_river_id on the campground row;
      // check it first if present, otherwise fall back to nearest-distance.
      const sid = (camp as MOCampground & { snap_river_id?: string | null }).snap_river_id;
      if (sid && r.id === sid) { nearestRiverName = r.name; break; }
    }
    if (!nearestRiverName) {
      let bestD = Infinity;
      for (const r of rivers) {
        for (const c of r.geometry.coordinates as Array<[number, number]>) {
          const dx = c[0] - camp.lon, dy = c[1] - camp.lat;
          const d2 = dx * dx + dy * dy;
          if (d2 < bestD) { bestD = d2; nearestRiverName = r.name; }
        }
      }
    }
    clearAllOverlays();
    setModalSelection({ kind: 'campground', camp, nearestRiverName });
  }, [rivers, dataset, clearAllOverlays]);
  const handleClickPoi = useCallback((id: string | null) => {
    if (!id) { setModalSelection(null); return; }
    for (const r of rivers) {
      const p = (r.pois ?? []).find((x) => x.id === id);
      if (p) {
        clearAllOverlays();
        setModalSelection({ kind: 'poi', poi: p, river: r });
        setFocusedRiverId(r.id);
        return;
      }
    }
  }, [rivers, clearAllOverlays]);
  const closeModal = () => setModalSelection(null);
  const closeRail = useCallback(() => {
    setFocusedGaugeId(null);
    setFocusedRiverId(null);
    // Also drop hover state so the × button closes a rail that was opened
    // by hover. Otherwise hoveredRiverId stays set and the rail re-renders
    // immediately on the next paint.
    setHoveredRiverId(null);
    setHoveredGaugeId(null);
    setHoveredGaugePos(null);
  }, []);

  // ─── Shareable URL state (?river=<slug> / ?gauge=<site_no>) ────────────
  // Makes a selected river/gauge deep-linkable. Apply the query once, after
  // rivers load (slugs → ids), then reflect later selections back into the
  // URL with replaceState so there's no navigation or history spam.
  const urlApplied = useRef(false);
  useEffect(() => {
    if (urlApplied.current || rivers.length === 0) return;
    urlApplied.current = true;
    const params = new URLSearchParams(window.location.search);
    const riverSlug = params.get('river');
    const gaugeNo = params.get('gauge');
    if (riverSlug) {
      const r = rivers.find((x) => x.slug === riverSlug);
      if (r) setFocusedRiverId(r.id);
    } else if (gaugeNo && gauges.some((g) => g.site_no === gaugeNo)) {
      setFocusedGaugeId(gaugeNo);
    }
  }, [rivers, gauges]);
  useEffect(() => {
    if (!urlApplied.current) return;
    const params = new URLSearchParams(window.location.search);
    params.delete('river');
    params.delete('gauge');
    const r = rivers.find((x) => x.id === focusedRiverId);
    if (r) params.set('river', r.slug);
    else if (focusedGaugeId) params.set('gauge', focusedGaugeId);
    const qs = params.toString();
    window.history.replaceState(null, '', window.location.pathname + (qs ? `?${qs}` : ''));
  }, [focusedRiverId, focusedGaugeId, rivers]);

  // Escape backs out of whatever is pinned: modal → site card → rail.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (modalSelection) { setModalSelection(null); return; }
      if (selectedSite) { setSelectedSite(null); return; }
      closeRail();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modalSelection, selectedSite]);

  const railOpen = !!railRiver || !!focusedGauge;

  return (
    <div
      className="absolute inset-0 flex overflow-hidden"
      style={{ background: '#071A20', fontFamily: 'var(--font-body)' }}
    >
      {/* keyframes shared by the dock chrome */}
      <style>{`
        @keyframes mosw-ping { 75%, 100% { transform: scale(2.6); opacity: 0; } }
      `}</style>

      <DataDock
        rivers={rivers}
        verdictByRiver={verdictByRiver}
        readingByRiver={readingByRiver}
        trendByRiver={trendByRiver}
        history={historyEntries}
        hoveredRiverId={hoveredRiverId}
        focusedRiverId={focusedRiverId}
        dayOffset={dayOffset}
        readingsAsOf={newestReadingAt}
        cadenceSeconds={statewide?.cadenceSeconds ?? null}
        sharedGaugeByRiver={sharedGaugeByRiver}
        gaugeCount={gauges.length}
        telemetry={telemetry}
        showGauges={showGauges}
        setShowGauges={setShowGauges}
        showTerrain={showTerrain}
        setShowTerrain={setShowTerrain}
        showSites={showSites}
        setShowSites={setShowSites}
        showFlow={showFlow}
        setShowFlow={setShowFlow}
        siteCount={moSites?.sites.length ?? 0}
        sitesCapped={moSites?.capped ?? false}
        onHoverRiver={setHoveredRiverId}
        onFocusRiver={selectRiver}
        open={dockOpen}
        onClose={() => setDockOpen(false)}
      />

      {/* ── Map stage ── */}
      <div className="relative min-w-0 flex-1">
        {/* Map canvas stops above the timeline so the state never hides
            behind the scrubber. The reserve shrinks when the timeline is
            collapsed (mobile), giving the map back its height. */}
        <div
          className="absolute inset-x-0 top-0"
          style={{ bottom: timelineExpanded ? 192 : 60 }}
        >
        <MOMap
          rivers={rivers}
          campgrounds={dataset?.campgrounds ?? []}
          gauges={gauges}
          verdictByRiver={verdictByRiver}
          conditionByGauge={conditionByGauge}
          percentileByGauge={percentileByGauge}
          hoveredRiverId={hoveredRiverId}
          focusedRiverId={focusedRiverId}
          hoveredGaugeId={hoveredGaugeId}
          focusedGaugeId={focusedGaugeId}
          showCampgrounds={showCampgrounds}
          showAccessPoints={showAccessPoints}
          showPOIs={showPOIs}
          showGauges={showGauges}
          showTerrain={showTerrain}
          showFlow={showFlow}
          contextSites={moSites?.sites ?? []}
          showSites={showSites}
          selectedContextSiteId={selectedSite?.site_no ?? null}
          onClickContextSite={selectSite}
          railOpen={railOpen}
          onHoverRiver={setHoveredRiverId}
          onFocusRiver={selectRiver}
          onHoverGauge={handleHoverGauge}
          onFocusGauge={handleFocusGauge}
          onClickCampground={handleClickCampground}
          onClickAccessPoint={handleClickAccess}
          onClickPoi={handleClickPoi}
          flowPaused={sheetExpanded || modalSelection != null || dockOpen}
        />
        </div>

        {/* Mobile: floating live chip that opens the dock drawer */}
        <button
          type="button"
          onClick={() => setDockOpen(true)}
          className="absolute left-3 top-3 z-20 flex items-center gap-2 rounded-md border-2 px-3 py-2 md:hidden"
          style={{
            background: 'rgba(12,40,49,0.94)',
            borderColor: 'rgba(242,234,216,0.2)',
            color: '#F2EAD8',
            fontFamily: 'var(--font-mono), ui-monospace, monospace',
            fontSize: 11,
            letterSpacing: '0.1em',
            boxShadow: '0 8px 24px -12px rgba(4,20,26,0.9)',
          }}
        >
          <span className="inline-block h-2 w-2 rounded-full" style={{ background: '#F07052', boxShadow: '0 0 6px #F07052' }} />
          <span className="font-bold uppercase">
            {floatableCount}/{rivers.length || '—'} rivers floatable
          </span>
        </button>

        <RightRail
          river={railRiver}
          sharedGauge={railRiver ? sharedGaugeByRiver[railRiver.slug] ?? null : null}
          primaryGauge={railPrimaryGauge}
          primaryHistory={railPrimaryHistory}
          focusedGauge={focusedGauge}
          focusedGaugeVerdict={focusedGauge ? conditionByGauge[condKey(focusedGauge.river_id, focusedGauge.site_no)] ?? null : null}
          campground={null}
          accessPoint={null}
          poi={null}
          forecastBySite={forecastBySite}
          onClose={closeRail}
          onCloseGauge={() => setFocusedGaugeId(null)}
          onAccessPointClick={(id) => handleClickAccess(id)}
          onSheetExpandedChange={setSheetExpanded}
        />

        {/* On mobile the detail sheet owns the bottom of the screen, so the
            timeline (also bottom-anchored) is hidden while a sheet/site card
            is open. `contents` keeps the scrubber positioning normal when
            shown; desktop always shows it beside the right rail. */}
        <div className={railOpen || selectedSite ? 'hidden md:contents' : 'contents'}>
          <TimeScrubber
            dayOffset={dayOffset}
            setDayOffset={setDayOffset}
            history={historyEntries}
            rivers={rivers}
            expanded={timelineExpanded}
            onToggle={() => setTimelineExpanded((v) => !v)}
          />
        </div>

        {selectedSite && (
          <ContextSiteCard
            site={selectedSite}
            onClose={() => setSelectedSite(null)}
            onSheetExpandedChange={setSheetExpanded}
          />
        )}

        {error && (
          <div
            className="absolute z-30 rounded-md border-2 px-3 py-2"
            style={{
              top: 64, left: '50%', transform: 'translateX(-50%)',
              background: '#0F2D35', color: '#F2EAD8',
              borderColor: '#3F3B33',
              fontFamily: 'var(--font-mono)', fontSize: 11,
              letterSpacing: '0.08em',
              boxShadow: '3px 3px 0 #1A1814',
            }}
          >
            Data fetch failed: {error}
          </div>
        )}

        {staleCacheAt && (
          <div
            className="absolute z-30 flex items-center gap-3 rounded-md border-2 px-3 py-2"
            style={{
              top: 12, left: '50%', transform: 'translateX(-50%)',
              background: '#3D2E00', color: '#FFD98A',
              borderColor: '#E5A000',
              fontFamily: 'var(--font-mono)', fontSize: 11,
              letterSpacing: '0.08em',
              boxShadow: '3px 3px 0 #1A1814',
              maxWidth: 'calc(100% - 24px)',
            }}
            role="status"
          >
            <span className="font-bold uppercase">Offline</span>
            <span>
              showing last-known data from{' '}
              {new Date(staleCacheAt).toLocaleString(undefined, {
                month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
              })}
            </span>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-sm border px-2 py-0.5 font-bold uppercase"
              style={{ borderColor: '#E5A000', color: '#FFD98A', fontSize: 10 }}
            >
              Retry
            </button>
          </div>
        )}
      </div>

      <DetailModal selection={modalSelection} onClose={closeModal} />

      {/* Hover overlay — only shown when no rail is pinned, so it never
          fights with the GaugeDetail rail for screen space. */}
      {!focusedGauge && !focusedRiverId && (
        <GaugeHoverOverlay
          gauge={hoveredGauge}
          gaugeName={hoveredGaugeName}
          verdict={hoveredGauge ? conditionByGauge[condKey(hoveredGauge.river_id, hoveredGauge.site_no)] ?? null : null}
          sharedRiverNames={hoveredGaugeSharedRivers}
          unchangedDays={hoveredGaugeUnchangedDays}
          pos={hoveredGaugePos}
        />
      )}
    </div>
  );
}
