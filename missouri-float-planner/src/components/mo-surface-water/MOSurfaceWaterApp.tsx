'use client';

import { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import {
  classifyStageFromThresholds,
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
import {
  HeaderBar,
  PercentileLegend,
  StatewideSummary,
  RightRail,
  TimeScrubber,
  LayerToggles,
} from './Chrome';

const MOMap = dynamic(() => import('./MOMap'), { ssr: false });

export default function MOSurfaceWaterApp() {
  const [dataset, setDataset] = useState<MODataset | null>(null);
  const [statewide, setStatewide] = useState<MoStatewideResponse | null>(null);
  const [historyBundle, setHistoryBundle] = useState<MoHistoryBundleResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [hoveredRiverId, setHoveredRiverId] = useState<string | null>(null);
  const [focusedRiverId, setFocusedRiverId] = useState<string | null>(null);
  const [hoveredGaugeId, setHoveredGaugeId] = useState<string | null>(null);
  const [focusedGaugeId, setFocusedGaugeId] = useState<string | null>(null);
  const [focusedCampgroundId, setFocusedCampgroundId] = useState<string | null>(null);
  const [focusedAccessId, setFocusedAccessId] = useState<string | null>(null);
  const [focusedPoiId, setFocusedPoiId] = useState<string | null>(null);
  const [dayOffset, setDayOffset] = useState(0);

  const [showCampgrounds, setShowCampgrounds] = useState(true);
  const [showAccessPoints, setShowAccessPoints] = useState(true);
  const [showPOIs, setShowPOIs] = useState(true);

  // Initial fetches
  useEffect(() => {
    let aborted = false;
    const load = async () => {
      try {
        const [dRes, sRes, hRes] = await Promise.all([
          fetch('/api/usgs/mo-dataset'),
          fetch('/api/usgs/mo-statewide'),
          fetch('/api/usgs/mo-history-bundle'),
        ]);
        if (!dRes.ok) throw new Error(`dataset ${dRes.status}`);
        const d = await dRes.json();
        const s = sRes.ok ? await sRes.json() : { gauges: [], generatedAt: null };
        const h = hRes.ok ? await hRes.json() : { entries: [], days: 30, generatedAt: null };
        if (!aborted) {
          setDataset(d);
          setStatewide(s);
          setHistoryBundle(h);
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

  // Verdict per river based on the gauge_height_ft from the primary gauge.
  // For historical scrubbing, we approximate by mapping percentile back through
  // the per-day stage when available; otherwise we use today's stage.
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
      out[r.slug] = classifyStageFromThresholds(value, primary.threshold_unit, primary);
    }
    return out;
  }, [rivers, gauges, historyEntries, scrubIdx, dayOffset, dayCount]);

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

  const focusedCampground = dataset?.campgrounds.find((c) => c.id === focusedCampgroundId) ?? null;
  const focusedAccessPoint = (() => {
    if (!focusedAccessId) return null;
    for (const r of rivers) {
      const ap = (r.access_points ?? []).find((a) => a.id === focusedAccessId);
      if (ap) return { ap, river: r };
    }
    return null;
  })();
  const focusedPoi = (() => {
    if (!focusedPoiId) return null;
    for (const r of rivers) {
      const p = (r.pois ?? []).find((x) => x.id === focusedPoiId);
      if (p) return { poi: p, river: r };
    }
    return null;
  })();

  const handleFocusGauge = (id: string | null) => {
    setFocusedGaugeId(id);
    setFocusedCampgroundId(null);
    setFocusedAccessId(null);
    setFocusedPoiId(null);
    if (id) {
      const g = gauges.find((x) => x.site_no === id);
      if (g) setFocusedRiverId(g.river_id);
    }
  };
  const handleFocusCampground = (id: string | null) => {
    setFocusedCampgroundId(id);
    if (id) {
      setFocusedGaugeId(null);
      setFocusedAccessId(null);
      setFocusedPoiId(null);
    }
  };
  const handleFocusAccess = (id: string | null) => {
    setFocusedAccessId(id);
    if (id) {
      setFocusedGaugeId(null);
      setFocusedCampgroundId(null);
      setFocusedPoiId(null);
    }
  };
  const handleFocusPoi = (id: string | null) => {
    setFocusedPoiId(id);
    if (id) {
      setFocusedGaugeId(null);
      setFocusedCampgroundId(null);
      setFocusedAccessId(null);
    }
  };

  const closeRail = () => {
    setFocusedGaugeId(null);
    setFocusedCampgroundId(null);
    setFocusedAccessId(null);
    setFocusedPoiId(null);
  };

  return (
    <div className="absolute inset-0" style={{ background: '#0F2D35', fontFamily: 'var(--font-body)' }}>
      <MOMap
        rivers={rivers}
        campgrounds={dataset?.campgrounds ?? []}
        gauges={gauges}
        verdictByRiver={verdictByRiver}
        percentileByRiver={percentileByRiver}
        percentileByGauge={percentileByGauge}
        hoveredRiverId={hoveredRiverId}
        focusedRiverId={focusedRiverId}
        hoveredGaugeId={hoveredGaugeId}
        focusedGaugeId={focusedGaugeId}
        showCampgrounds={showCampgrounds}
        showAccessPoints={showAccessPoints}
        showPOIs={showPOIs}
        onHoverRiver={setHoveredRiverId}
        onFocusRiver={setFocusedRiverId}
        onHoverGauge={setHoveredGaugeId}
        onFocusGauge={handleFocusGauge}
        onClickCampground={handleFocusCampground}
        onClickAccessPoint={handleFocusAccess}
        onClickPoi={handleFocusPoi}
      />

      <HeaderBar
        generatedAt={statewide?.generatedAt ?? dataset?.generated_at ?? null}
        riverCount={rivers.length}
        gaugeCount={gauges.length}
        campgroundCount={dataset?.campgrounds.length ?? 0}
      />
      <PercentileLegend />
      <LayerToggles
        showCampgrounds={showCampgrounds}
        showAccessPoints={showAccessPoints}
        showPOIs={showPOIs}
        setShowCampgrounds={setShowCampgrounds}
        setShowAccessPoints={setShowAccessPoints}
        setShowPOIs={setShowPOIs}
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
        campground={focusedCampground}
        accessPoint={focusedAccessPoint}
        poi={focusedPoi}
        onClose={closeRail}
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
    </div>
  );
}
