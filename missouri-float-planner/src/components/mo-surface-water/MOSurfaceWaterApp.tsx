'use client';

import { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import {
  classifyStageFromThresholds,
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
import {
  HeaderBar,
  PercentileLegend,
  StatewideSummary,
  RightRail,
  TimeScrubber,
  LayerToggles,
  DetailModal,
  GaugeHoverOverlay,
  type ModalSelection,
} from './Chrome';

const MOMap = dynamic(() => import('./MOMap'), { ssr: false });

export default function MOSurfaceWaterApp() {
  const [dataset, setDataset] = useState<MODataset | null>(null);
  const [statewide, setStatewide] = useState<MoStatewideResponse | null>(null);
  const [historyBundle, setHistoryBundle] = useState<MoHistoryBundleResponse | null>(null);
  const [forecast, setForecast] = useState<MoForecastResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  // Access points / campgrounds / springs are paused while we iterate on
  // the gauge-first experience. The MOMap props are kept so the layers
  // can be re-enabled by flipping these constants when we're ready.
  const showCampgrounds = false;
  const showAccessPoints = false;
  const showPOIs = false;
  const [showGauges, setShowGauges] = useState(true);

  // Initial fetches
  useEffect(() => {
    let aborted = false;
    const load = async () => {
      try {
        const [dRes, sRes, hRes, fRes] = await Promise.all([
          fetch('/api/usgs/mo-dataset'),
          fetch('/api/usgs/mo-statewide'),
          fetch('/api/usgs/mo-history-bundle'),
          fetch('/api/usgs/mo-forecast'),
        ]);
        if (!dRes.ok) throw new Error(`dataset ${dRes.status}`);
        const d = await dRes.json();
        const s = sRes.ok ? await sRes.json() : { gauges: [], generatedAt: null };
        const h = hRes.ok ? await hRes.json() : { entries: [], days: 30, generatedAt: null };
        const f = fRes.ok ? await fRes.json() : { entries: [], generatedAt: null };
        if (!aborted) {
          setDataset(d);
          setStatewide(s);
          setHistoryBundle(h);
          setForecast(f);
          setError(null);
        }
      } catch (e) {
        if (!aborted) setError(e instanceof Error ? e.message : String(e));
      }
    };
    load();
    const id = setInterval(() => {
      // refresh just the live snapshot every 15 minutes
      fetch('/api/usgs/mo-statewide')
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => { if (!aborted && j) setStatewide(j); })
        .catch(() => {});
    }, 15 * 60 * 1000);
    return () => { aborted = true; clearInterval(id); };
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

  // Per-river primary-gauge percentile at scrubbed day (or live if today)
  const percentileByRiver: Record<string, number | null> = useMemo(() => {
    const out: Record<string, number | null> = {};
    const isToday = dayOffset === 0 || scrubIdx === dayCount - 1;
    if (isToday) {
      // Use live
      const byRiver = new Map<string, number[]>();
      for (const g of gauges) {
        if (g.percentile == null) continue;
        const arr = byRiver.get(g.river_slug) ?? [];
        arr.push(g.percentile);
        byRiver.set(g.river_slug, arr);
      }
      for (const r of rivers) {
        const arr = byRiver.get(r.slug);
        out[r.slug] =
          arr && arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
      }
    } else {
      for (const r of rivers) {
        const ent = historyEntries.find((e) => e.river_slug === r.slug);
        const p = ent?.daily[scrubIdx]?.percentile ?? null;
        out[r.slug] = p;
      }
    }
    return out;
  }, [rivers, gauges, historyEntries, scrubIdx, dayOffset, dayCount]);

  // Per-gauge percentile (for gauge dots)
  const percentileByGauge: Record<string, number | null> = useMemo(() => {
    const out: Record<string, number | null> = {};
    if (dayOffset === 0 || scrubIdx === dayCount - 1 || !historyEntries.length) {
      for (const g of gauges) out[g.site_no] = g.percentile;
    } else {
      for (const g of gauges) {
        const ent = historyEntries.find((e) => e.site_no === g.site_no);
        out[g.site_no] = ent?.daily[scrubIdx]?.percentile ?? g.percentile;
      }
    }
    return out;
  }, [gauges, historyEntries, scrubIdx, dayOffset, dayCount]);

  // Per-gauge ConditionCode — derived from the gauge's own thresholds and
  // reading. Drives the segmented river coloring so each reach inherits
  // the condition of the gauge nearest to it, instead of every reach
  // showing the primary gauge's condition.
  const conditionByGauge: Record<string, StageVerdict> = useMemo(() => {
    const out: Record<string, StageVerdict> = {};
    const isToday = dayOffset === 0 || scrubIdx === dayCount - 1;
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
        out[g.site_id] = classifyStageFromThresholds(value, g.threshold_unit, g);
      }
    }
    return out;
  }, [rivers, gauges, historyEntries, scrubIdx, dayOffset, dayCount]);

  // Verdict per river based on the gauge_height_ft from the primary gauge.
  // For historical scrubbing, we approximate by mapping percentile back through
  // the per-day stage when available; otherwise we use today's stage.
  // When today's view is active, the next-72h AHPS forecast peak also feeds
  // the flood-stage hazard override — i.e. "river is currently Prime but
  // forecast crosses flood stage tomorrow" reads as Hazard.
  const verdictByRiver: Record<string, StageVerdict> = useMemo(() => {
    const out: Record<string, StageVerdict> = {};
    const liveByRiver = new Map<string, MoStatewideGauge>();
    for (const g of gauges) {
      if (g.is_primary && !liveByRiver.has(g.river_slug)) liveByRiver.set(g.river_slug, g);
    }
    const isToday = dayOffset === 0 || scrubIdx === dayCount - 1;
    for (const r of rivers) {
      const primary = (r.gauges ?? []).find((g) => g.is_primary);
      if (!primary) { out[r.slug] = 'unknown'; continue; }
      let value: number | null = null;
      if (isToday) {
        const live = liveByRiver.get(r.slug);
        value = primary.threshold_unit === 'ft'
          ? live?.gaugeHeightFt ?? null
          : live?.dischargeCfs ?? null;
      } else {
        const ent = historyEntries.find((e) => e.site_no === primary.site_id);
        const day = ent?.daily[scrubIdx];
        value = primary.threshold_unit === 'ft'
          ? day?.gaugeHeightFt ?? null
          : day?.dischargeCfs ?? null;
      }
      // Flood-stage hazard override — for ft thresholds only, when today's
      // live or 72h-forecast peak exceeds USGS/AHPS flood stage.
      if (
        isToday &&
        primary.threshold_unit === 'ft' &&
        primary.flood_stage_ft != null
      ) {
        const fc = forecastBySite[primary.site_id];
        const peakCandidate = Math.max(
          value ?? Number.NEGATIVE_INFINITY,
          fc?.peakFt ?? Number.NEGATIVE_INFINITY,
        );
        if (peakCandidate >= primary.flood_stage_ft) {
          out[r.slug] = 'dangerous';
          continue;
        }
      }
      out[r.slug] = classifyStageFromThresholds(value, primary.threshold_unit, primary);
    }
    return out;
  }, [rivers, gauges, historyEntries, scrubIdx, dayOffset, dayCount, forecastBySite]);

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

  const handleFocusGauge = (id: string | null) => {
    setFocusedGaugeId(id);
    // Only follow the gauge's parent river when the user had ALREADY
    // pinned a river — in that case we want the back-nav from the gauge
    // rail to return them to the river card they were exploring. A cold
    // click on a gauge marker should open the gauge alone, so closing
    // it once empties the rail instead of revealing a river card the
    // user never asked for.
    if (id && focusedRiverId) {
      const g = gauges.find((x) => x.site_no === id);
      if (g) setFocusedRiverId(g.river_id);
    }
  };
  // Access points / campgrounds / POIs open the modal popup with link-outs.
  // We also focus the river they belong to so the right rail keeps showing
  // its float context behind the modal.
  const handleClickAccess = (id: string | null) => {
    if (!id) { setModalSelection(null); return; }
    for (const r of rivers) {
      const ap = (r.access_points ?? []).find((a) => a.id === id);
      if (ap) {
        setModalSelection({ kind: 'access', ap, river: r });
        setFocusedRiverId(r.id);
        return;
      }
    }
  };
  const handleClickCampground = (id: string | null) => {
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
    setModalSelection({ kind: 'campground', camp, nearestRiverName });
  };
  const handleClickPoi = (id: string | null) => {
    if (!id) { setModalSelection(null); return; }
    for (const r of rivers) {
      const p = (r.pois ?? []).find((x) => x.id === id);
      if (p) {
        setModalSelection({ kind: 'poi', poi: p, river: r });
        setFocusedRiverId(r.id);
        return;
      }
    }
  };
  const closeModal = () => setModalSelection(null);
  const closeRail = () => {
    setFocusedGaugeId(null);
    setFocusedRiverId(null);
    // Also drop hover state so the × button closes a rail that was opened
    // by hover. Otherwise hoveredRiverId stays set and the rail re-renders
    // immediately on the next paint.
    setHoveredRiverId(null);
    setHoveredGaugeId(null);
    setHoveredGaugePos(null);
  };

  return (
    <div className="absolute inset-0" style={{ background: '#0F2D35', fontFamily: 'var(--font-body)' }}>
      <MOMap
        rivers={rivers}
        campgrounds={dataset?.campgrounds ?? []}
        gauges={gauges}
        verdictByRiver={verdictByRiver}
        conditionByGauge={conditionByGauge}
        percentileByRiver={percentileByRiver}
        percentileByGauge={percentileByGauge}
        hoveredRiverId={hoveredRiverId}
        focusedRiverId={focusedRiverId}
        hoveredGaugeId={hoveredGaugeId}
        focusedGaugeId={focusedGaugeId}
        showCampgrounds={showCampgrounds}
        showAccessPoints={showAccessPoints}
        showPOIs={showPOIs}
        showGauges={showGauges}
        onHoverRiver={setHoveredRiverId}
        onFocusRiver={setFocusedRiverId}
        onHoverGauge={(id, pos) => { setHoveredGaugeId(id); setHoveredGaugePos(pos ?? null); }}
        onFocusGauge={handleFocusGauge}
        onClickCampground={handleClickCampground}
        onClickAccessPoint={handleClickAccess}
        onClickPoi={handleClickPoi}
      />

      <HeaderBar
        generatedAt={statewide?.generatedAt ?? dataset?.generated_at ?? null}
        riverCount={rivers.length}
        gaugeCount={gauges.length}
        campgroundCount={dataset?.campgrounds.length ?? 0}
      />
      <PercentileLegend />
      <LayerToggles
        showGauges={showGauges}
        setShowGauges={setShowGauges}
      />
      <StatewideSummary
        rivers={rivers}
        percentileByRiver={percentileByRiver}
        verdictByRiver={verdictByRiver}
      />

      <RightRail
        river={railRiver}
        primaryGauge={railPrimaryGauge}
        primaryHistory={railPrimaryHistory}
        hoveredGauge={hoveredGauge}
        focusedGauge={focusedGauge}
        focusedGaugeVerdict={focusedGauge ? conditionByGauge[focusedGauge.site_no] ?? null : null}
        campground={null}
        accessPoint={null}
        poi={null}
        forecastBySite={forecastBySite}
        onClose={closeRail}
        onCloseGauge={() => setFocusedGaugeId(null)}
        onAccessPointClick={(id) => handleClickAccess(id)}
      />

      <TimeScrubber
        dayOffset={dayOffset}
        setDayOffset={setDayOffset}
        history={historyEntries}
        rivers={rivers}
      />

      {error && (
        <div
          className="absolute z-30 rounded-md border-2 px-3 py-2"
          style={{
            top: 96, left: '50%', transform: 'translateX(-50%)',
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

      <DetailModal selection={modalSelection} onClose={closeModal} />

      {/* Hover overlay — only shown when no rail is pinned, so it never
          fights with the GaugeDetail rail for screen space. */}
      {!focusedGauge && !focusedRiverId && (
        <GaugeHoverOverlay gauge={hoveredGauge} gaugeName={hoveredGaugeName} pos={hoveredGaugePos} />
      )}
    </div>
  );
}
