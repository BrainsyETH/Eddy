'use client';

// src/app/embed/display/RiverLine.tsx
// The best river's real line, drawn from its geometry, with the suggested
// stretch highlighted the way the planner map does it (green on a white
// casing, put-in and take-out markers in the map's colors) and Eddy floating
// it in the canoe. Decorative: the facts beside it carry the information.

import { useEffect, useMemo, useRef, useState } from 'react';
import { EDDY_IMAGES } from '@/constants';
import styles from './display.module.css';

const W = 800;
const H = 260;
const PAD = 34;
const LOOP_MS = 42000;

interface Props {
  slug: string;
  putInId: string | null;
  takeOutId: string | null;
}

interface Geo {
  coords: [number, number][];
  points: { id: string; lng: number; lat: number }[];
}

function decimate(coords: [number, number][], max = 420): [number, number][] {
  if (coords.length <= max) return coords;
  const step = coords.length / max;
  const out: [number, number][] = [];
  for (let i = 0; i < max; i++) out.push(coords[Math.floor(i * step)]);
  out.push(coords[coords.length - 1]);
  return out;
}

export default function RiverLine({ slug, putInId, takeOutId }: Props) {
  const [geo, setGeo] = useState<Geo | null>(null);
  const tripRef = useRef<SVGPathElement>(null);
  const canoeRef = useRef<SVGImageElement>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch(`/api/rivers/${encodeURIComponent(slug)}`).then((r) => (r.ok ? r.json() : null)),
      fetch(`/api/rivers/${encodeURIComponent(slug)}/access-points?view=compact`).then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([river, access]) => {
        if (cancelled) return;
        const coords = (river?.river?.geometry?.coordinates ?? []) as [number, number][];
        const points = ((access?.accessPoints ?? []) as { id: string; coordinates?: { lng: number; lat: number } }[])
          .filter((p) => p.coordinates)
          .map((p) => ({ id: p.id, lng: p.coordinates!.lng, lat: p.coordinates!.lat }));
        setGeo(coords.length > 1 ? { coords, points } : null);
      })
      .catch(() => { if (!cancelled) setGeo(null); });
    return () => { cancelled = true; };
  }, [slug]);

  const drawn = useMemo(() => {
    if (!geo) return null;
    // Frame the suggested stretch with some river either side, not the whole
    // river: a 120-mile river at this size is a squiggle, the stretch is a trip.
    const nearestRaw = (id: string | null) => {
      const p = id ? geo.points.find((q) => q.id === id) : null;
      if (!p) return null;
      let best = 0, bestD = Infinity;
      geo.coords.forEach(([lng, lat], i) => { const d = (lng - p.lng) ** 2 + (lat - p.lat) ** 2; if (d < bestD) { bestD = d; best = i; } });
      return best;
    };
    const ra = nearestRaw(putInId), rb = nearestRaw(takeOutId);
    let view = geo.coords;
    if (ra != null && rb != null && ra !== rb) {
      const lo = Math.min(ra, rb), hi = Math.max(ra, rb), pad = Math.max(3, Math.round((hi - lo) * 0.45));
      view = geo.coords.slice(Math.max(0, lo - pad), Math.min(geo.coords.length, hi + pad + 1));
    }
    view = decimate(view);
    const lat0 = view.reduce((s, c) => s + c[1], 0) / view.length;
    const kx = Math.cos((lat0 * Math.PI) / 180);
    const xs = view.map((c) => c[0] * kx);
    const ys = view.map((c) => -c[1]);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const scale = Math.min((W - PAD * 2) / Math.max(maxX - minX, 1e-6), (H - PAD * 2) / Math.max(maxY - minY, 1e-6));
    const ox = (W - (maxX - minX) * scale) / 2, oy = (H - (maxY - minY) * scale) / 2;
    const project = (lng: number, lat: number): [number, number] => [ox + (lng * kx - minX) * scale, oy + (-lat - minY) * scale];
    const pts = view.map(([lng, lat]) => project(lng, lat));
    const toD = (list: [number, number][]) => list.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join('');

    const nearestIndex = (id: string | null) => {
      const p = id ? geo.points.find((q) => q.id === id) : null;
      if (!p) return null;
      const [px, py] = project(p.lng, p.lat);
      let best = 0, bestD = Infinity;
      pts.forEach(([x, y], i) => { const d = (x - px) ** 2 + (y - py) ** 2; if (d < bestD) { bestD = d; best = i; } });
      return best;
    };
    const a = nearestIndex(putInId), b = nearestIndex(takeOutId);
    const hasTrip = a != null && b != null && a !== b;
    // Order the trip the way the put-in → take-out reads, whichever way the geometry runs.
    const trip = hasTrip ? (a! < b! ? pts.slice(a!, b! + 1) : pts.slice(b!, a! + 1).reverse()) : pts;
    return { river: toD(pts), trip: toD(trip), hasTrip, start: trip[0], end: trip[trip.length - 1] };
  }, [geo, putInId, takeOutId]);

  useEffect(() => {
    if (!drawn) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0;
    const t0 = performance.now();
    const place = (k: number) => {
      const path = tripRef.current, canoe = canoeRef.current;
      if (!path || !canoe) return;
      const len = path.getTotalLength();
      const p = path.getPointAtLength(len * k);
      canoe.setAttribute('x', String(p.x - 34));
      canoe.setAttribute('y', String(p.y - 40));
    };
    if (reduce) { place(0.45); return; }
    const tick = (now: number) => {
      // Ease in and out at each end so Eddy lingers at the put-in and take-out.
      const t = ((now - t0) % LOOP_MS) / LOOP_MS;
      place(0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, t * 1.1)));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [drawn]);

  if (!drawn) return <svg className={styles.line} viewBox={`0 0 ${W} ${H}`} aria-hidden="true" />;

  return (
    <svg className={styles.line} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <path d={drawn.river} fill="none" stroke="#E8DFD0" strokeOpacity={0.28} strokeWidth={34} strokeLinecap="round" strokeLinejoin="round" />
      <path d={drawn.river} fill="none" stroke="#2D7889" strokeWidth={18} strokeLinecap="round" strokeLinejoin="round" />
      <path className={styles.flow} d={drawn.river} fill="none" stroke="#D4EAEF" strokeOpacity={0.75} strokeWidth={2} strokeDasharray="12 42" strokeLinecap="round" />
      {drawn.hasTrip ? (
        <>
          <path d={drawn.trip} fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth={11} strokeLinecap="round" strokeLinejoin="round" />
          <path ref={tripRef} d={drawn.trip} fill="none" stroke="#22c55e" strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" />
          <circle cx={drawn.start[0]} cy={drawn.start[1]} r={13} fill="#478559" stroke="#fff" strokeWidth={3} />
          <circle cx={drawn.end[0]} cy={drawn.end[1]} r={13} fill="#f95d9b" stroke="#fff" strokeWidth={3} />
        </>
      ) : (
        <path ref={tripRef} d={drawn.trip} fill="none" stroke="none" />
      )}
      <image ref={canoeRef} href={EDDY_IMAGES.canoe} width={72} height={48} x={-100} y={-100} />
    </svg>
  );
}
