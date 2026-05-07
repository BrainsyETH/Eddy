'use client';

import { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { MO_RIVERS, ALL_MO_GAUGE_IDS, MO_FLOATER } from '@/lib/usgs/mo-statewide-data';
import type {
  MoStatewideGauge,
  MoStatewideResponse,
} from '@/app/api/usgs/mo-statewide/route';
import {
  HeaderBar,
  PercentileLegend,
  StatewideSummary,
  GaugeHover,
  GaugeDetail,
  FloaterCard,
  TimeScrubber,
} from './Chrome';

// MapLibre needs window — load only on the client.
const MOMap = dynamic(() => import('./MOMap'), { ssr: false });

const REACH_COUNT = MO_RIVERS.length;
const GAUGE_COUNT = ALL_MO_GAUGE_IDS.length;

export default function MOSurfaceWaterApp() {
  const [data, setData] = useState<MoStatewideResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [hoveredRiverId, setHoveredRiverId] = useState<string | null>(null);
  const [focusedRiverId, setFocusedRiverId] = useState<string | null>(null);
  const [hoveredGaugeId, setHoveredGaugeId] = useState<string | null>(null);
  const [focusedGaugeId, setFocusedGaugeId] = useState<string | null>(null);
  const [dayOffset, setDayOffset] = useState(0);

  // Fetch the live statewide snapshot, refreshing every 15 minutes.
  useEffect(() => {
    let aborted = false;
    const load = async () => {
      try {
        const res = await fetch('/api/usgs/mo-statewide', { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const j = (await res.json()) as MoStatewideResponse;
        if (!aborted) {
          setData(j);
          setError(null);
        }
      } catch (e) {
        if (!aborted) setError(e instanceof Error ? e.message : String(e));
      }
    };
    load();
    const id = setInterval(load, 15 * 60 * 1000);
    return () => {
      aborted = true;
      clearInterval(id);
    };
  }, []);

  const gauges: MoStatewideGauge[] = useMemo(() => data?.gauges ?? [], [data]);

  // When clicking a gauge, also set its parent river focused for context.
  const handleFocusGauge = (id: string | null) => {
    setFocusedGaugeId(id);
    if (id) {
      const g = gauges.find((x) => x.site_no === id);
      if (g) setFocusedRiverId(g.river_id);
    }
  };

  // FloaterCard shows when a curated, floatable river is hovered or focused
  // and no gauge is focused.
  const floaterRiverId = (() => {
    if (focusedGaugeId) return null;
    const id = hoveredRiverId ?? focusedRiverId;
    return id && id in MO_FLOATER ? id : null;
  })();

  return (
    <div
      className="absolute inset-0"
      style={{ background: '#1F1A14', fontFamily: 'var(--font-body)' }}
    >
      <MOMap
        gauges={gauges}
        hoveredRiverId={hoveredRiverId}
        focusedRiverId={focusedRiverId}
        hoveredGaugeId={hoveredGaugeId}
        focusedGaugeId={focusedGaugeId}
        onHoverRiver={setHoveredRiverId}
        onFocusRiver={setFocusedRiverId}
        onHoverGauge={setHoveredGaugeId}
        onFocusGauge={handleFocusGauge}
      />

      <HeaderBar
        generatedAt={data?.generatedAt ?? null}
        reachCount={REACH_COUNT}
        gaugeCount={GAUGE_COUNT}
      />
      <PercentileLegend />
      <StatewideSummary gauges={gauges} />

      {focusedGaugeId ? (
        <GaugeDetail
          focusedGaugeId={focusedGaugeId}
          gauges={gauges}
          onClose={() => setFocusedGaugeId(null)}
        />
      ) : hoveredGaugeId ? (
        <GaugeHover hoveredGaugeId={hoveredGaugeId} gauges={gauges} />
      ) : floaterRiverId ? (
        <FloaterCard riverId={floaterRiverId} gauges={gauges} />
      ) : null}

      <TimeScrubber dayOffset={dayOffset} setDayOffset={setDayOffset} />

      {error && (
        <div
          className="absolute z-30 rounded-sm border px-3 py-2"
          style={{
            top: 100, left: '50%', transform: 'translateX(-50%)',
            background: 'rgba(31,26,20,0.94)', color: '#F2EAD8',
            borderColor: 'rgba(242,234,216,0.3)',
            fontFamily: 'var(--font-mono)', fontSize: 11,
            letterSpacing: '0.08em',
          }}
        >
          USGS fetch failed: {error}
        </div>
      )}
    </div>
  );
}
