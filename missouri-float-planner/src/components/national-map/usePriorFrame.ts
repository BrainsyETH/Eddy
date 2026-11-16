'use client';

// A recorded frame some time before the current one, as sites by key — the
// baseline for "what changed" (featured stories, ~6 h) and the Change view's
// window (6 h / 24 h). The frame route answers `?at=` with the newest frame
// at or before that instant; a frame that is not at least `minShare` of the
// requested span older than the current one is refused (null), so a young
// history never passes for a full window.

import { useEffect, useState } from 'react';
import type { CatalogStation } from '@/lib/national-map/catalog';
import { decodeFrame, type DecodedFrame } from '@/lib/national-map/frame';
import { buildSites, type Site } from '@/lib/national-map/marks';
import type { TrendPoint } from '@/lib/national-map/trend';

export interface PriorFrame {
  capturedAt: number;
  noaaOk: boolean;
  sites: Map<string, Site>;
}

export function usePriorFrame(
  enabled: boolean,
  frame: DecodedFrame | null,
  catalog: CatalogStation[] | null,
  backMs: number,
  minShare: number,
): PriorFrame | null {
  const [state, setState] = useState<{ key: string; prior: PriorFrame | null } | null>(null);
  const key = enabled && frame && catalog ? `${frame.capturedAt}:${backMs}` : '';
  useEffect(() => {
    if (!key || !frame || !catalog) return;
    const controller = new AbortController();
    const at = new Date(frame.capturedAt - backMs).toISOString();
    fetch(`/api/river-map/frame?at=${encodeURIComponent(at)}`, { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => {
        if (!body) return setState({ key, prior: null });
        const older = decodeFrame(body);
        if (frame.capturedAt - older.capturedAt < backMs * minShare) return setState({ key, prior: null });
        setState({
          key,
          prior: { capturedAt: older.capturedAt, noaaOk: older.sources.noaaOk, sites: new Map(buildSites(catalog, older).map((x) => [x.key, x])) },
        });
      })
      .catch(() => {
        if (!controller.signal.aborted) setState({ key, prior: null });
      });
    return () => controller.abort();
  }, [key, frame, catalog, backMs, minShare]);
  return state && state.key === key ? state.prior : null;
}

/** Oldest / newest recorded frame times (the frame route's `?meta=1`), refreshed with each new frame. */
export function useFrameHistory(enabled: boolean, capturedAt: number | null): { oldest: number | null; newest: number | null } | null {
  const [state, setState] = useState<{ key: string; meta: { oldest: number | null; newest: number | null } } | null>(null);
  const key = enabled ? String(capturedAt ?? '') : '';
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    const parse = (v: unknown) => (typeof v === 'string' && Number.isFinite(Date.parse(v)) ? Date.parse(v) : null);
    fetch('/api/river-map/frame?meta=1', { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((m: { oldest?: unknown; newest?: unknown } | null) =>
        setState({ key, meta: { oldest: parse(m?.oldest), newest: parse(m?.newest) } }),
      )
      .catch(() => {
        if (!controller.signal.aborted) setState({ key, meta: { oldest: null, newest: null } });
      });
    return () => controller.abort();
  }, [enabled, key]);
  return state && state.key === key ? state.meta : null;
}

/**
 * The flooding trend (the frame route's `?trend=1`, nationally or for a
 * region): one point per hour over the last 24 h of recorded frames,
 * refreshed with each new frame.
 * Null while loading or when the route cannot answer — never an empty trend.
 */
export function useFloodTrend(enabled: boolean, capturedAt: number | null, region: string | null = null): TrendPoint[] | null {
  const [state, setState] = useState<{ key: string; points: TrendPoint[] | null } | null>(null);
  const key = enabled ? `${capturedAt ?? ''}|${region ?? ''}` : '';
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    fetch(`/api/river-map/frame?trend=1${region ? `&region=${encodeURIComponent(region)}` : ''}`, { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((body: { points?: unknown } | null) => setState({ key, points: parseTrend(body?.points) }))
      .catch(() => {
        if (!controller.signal.aborted) setState({ key, points: null });
      });
    return () => controller.abort();
  }, [enabled, key, region]);
  return state && state.key === key ? state.points : null;
}

function parseTrend(v: unknown): TrendPoint[] | null {
  if (!Array.isArray(v)) return null;
  const n = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : 0);
  return v
    .filter((p): p is Record<string, unknown> => !!p && typeof p === 'object' && Number.isFinite((p as { t?: unknown }).t))
    .map((p) => ({ t: p.t as number, ok: p.ok === true, major: n(p.major), moderate: n(p.moderate), minor: n(p.minor), action: n(p.action) }));
}
