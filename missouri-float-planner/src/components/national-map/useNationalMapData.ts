'use client';

// Everything the national map loads, on three separate clocks:
//   * geometry — static assets, once (detail rivers on first zoom-in);
//   * station catalog — once per session (CDN-cached for hours);
//   * frames — the live readings, every few minutes while visible.
//
// Long-session rules (the map is meant to run for hours on a wall):
//   * one request in flight at a time; a new refresh never stacks on an old one;
//   * a failed refresh keeps the last good frame, whose observations keep their
//     own times and age normally — failure never becomes an empty country;
//   * frames only move forward (a CDN edge serving an older frame is ignored);
//   * after sleep, a hidden tab, or a dropped connection, refresh on return
//     instead of waiting out a timer the browser throttled.

import { useCallback, useEffect, useRef, useState } from 'react';
import { decodeCatalog, type CatalogStation } from '@/lib/national-map/catalog';
import { decodeFrame, type DecodedFrame } from '@/lib/national-map/frame';
import { decodeGeometry, GEOMETRY_VERSION, type DecodedGeometry } from '@/lib/national-map/geometry';

/** Frames are captured every 15 minutes and CDN-cached for 5. */
const REFRESH_MS = 5 * 60_000;
const RETRY_STEPS_MS = [30_000, 60_000, 120_000, 300_000];
const REQUEST_TIMEOUT_MS = 30_000;
/** Freshness is re-evaluated against the wall clock at least this often. */
const CLOCK_TICK_MS = 60_000;

export interface FrameStatus {
  /** Wall-clock time of the last successful frame request. */
  lastSuccessAt: number | null;
  lastError: string | null;
  loading: boolean;
}

export interface NationalMapData {
  geometry: DecodedGeometry | null;
  detail: DecodedGeometry | null;
  catalog: CatalogStation[] | null;
  frame: DecodedFrame | null;
  status: FrameStatus;
  catalogError: string | null;
  geometryError: string | null;
  /** Wall clock, ticking each minute — freshness is judged against it. */
  now: number;
  loadDetail: () => void;
  refresh: () => void;
}

async function getJson(url: string, signal: AbortSignal): Promise<unknown> {
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return res.json();
}

function timeoutSignal(parent: AbortSignal, ms: number): AbortSignal {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(new DOMException('Timed out', 'TimeoutError')), ms);
  parent.addEventListener('abort', () => c.abort(parent.reason), { once: true });
  c.signal.addEventListener('abort', () => clearTimeout(t), { once: true });
  return c.signal;
}

export function useNationalMapData(): NationalMapData {
  const [geometry, setGeometry] = useState<DecodedGeometry | null>(null);
  const [geometryError, setGeometryError] = useState<string | null>(null);
  const [detail, setDetail] = useState<DecodedGeometry | null>(null);
  const detailRequested = useRef(false);
  const [catalog, setCatalog] = useState<CatalogStation[] | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [frame, setFrame] = useState<DecodedFrame | null>(null);
  const frameRef = useRef<DecodedFrame | null>(null);
  const [status, setStatus] = useState<FrameStatus>({ lastSuccessAt: null, lastError: null, loading: true });
  const [now, setNow] = useState(() => Date.now());

  // The live controller for frame requests. Replaced on every mount, so a
  // StrictMode remount (or a fast unmount/remount) never inherits an aborted one.
  const alive = useRef<AbortController | null>(null);
  const inFlight = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const failures = useRef(0);
  const lastSuccess = useRef<number | null>(null);

  // Geometry: static, versioned, cached by the browser and the CDN.
  useEffect(() => {
    const controller = new AbortController();
    getJson(`/river-map/geometry/base.v${GEOMETRY_VERSION}.json`, controller.signal)
      .then((body) => setGeometry(decodeGeometry(body)))
      .catch((e: unknown) => {
        if (!controller.signal.aborted) setGeometryError(e instanceof Error ? e.message : String(e));
      });
    return () => controller.abort();
  }, []);

  const loadDetail = useCallback(() => {
    if (detailRequested.current) return;
    detailRequested.current = true;
    getJson(`/river-map/geometry/detail.v${GEOMETRY_VERSION}.json`, new AbortController().signal)
      .then((body) => setDetail(decodeGeometry(body)))
      .catch(() => {
        // Detail is enrichment: the base network stands without it. Allow a
        // later zoom to try again.
        detailRequested.current = false;
      });
  }, []);

  // Catalog, with a patient retry: without it there are no USGS positions.
  useEffect(() => {
    const controller = new AbortController();
    const signal = controller.signal;
    let attempt = 0;
    let retry: ReturnType<typeof setTimeout> | null = null;
    const load = () => {
      getJson('/api/river-map/stations', timeoutSignal(signal, REQUEST_TIMEOUT_MS))
        .then((body) => {
          setCatalog(decodeCatalog(body));
          setCatalogError(null);
        })
        .catch((e: unknown) => {
          if (signal.aborted) return;
          setCatalogError(e instanceof Error ? e.message : String(e));
          retry = setTimeout(load, RETRY_STEPS_MS[Math.min(attempt++, RETRY_STEPS_MS.length - 1)]);
        });
    };
    load();
    return () => {
      controller.abort();
      if (retry) clearTimeout(retry);
    };
  }, []);

  // The refresh loop re-schedules itself through this ref, so the callback
  // never has to name itself.
  const refreshRef = useRef<() => void>(() => {});
  const schedule = useCallback((ms: number) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => refreshRef.current(), ms);
  }, []);

  const refresh = useCallback(() => {
    const live = alive.current;
    if (!live || live.signal.aborted || inFlight.current) return;
    inFlight.current = true;
    setStatus((s) => ({ ...s, loading: true }));
    const signal = timeoutSignal(live.signal, REQUEST_TIMEOUT_MS);
    const held = frameRef.current;
    const url = held ? `/api/river-map/frame?since=${encodeURIComponent(new Date(held.capturedAt).toISOString())}` : '/api/river-map/frame';
    fetch(url, { signal })
      .then(async (res) => {
        if (res.status === 204) return null; // nothing newer than what we hold
        if (!res.ok) throw new Error(`frame → HTTP ${res.status}`);
        return res.json();
      })
      .then((body) => {
        if (body === null) {
          failures.current = 0;
          lastSuccess.current = Date.now();
          setStatus({ lastSuccessAt: lastSuccess.current, lastError: null, loading: false });
          setNow(Date.now());
          schedule(REFRESH_MS);
          return;
        }
        const next = decodeFrame(body);
        const current = frameRef.current;
        // Monotonic: an older frame from a lagging edge never replaces a newer one.
        if (!current || next.capturedAt >= current.capturedAt) {
          frameRef.current = next;
          setFrame(next);
        }
        failures.current = 0;
        lastSuccess.current = Date.now();
        setStatus({ lastSuccessAt: lastSuccess.current, lastError: null, loading: false });
        setNow(Date.now());
        schedule(REFRESH_MS);
      })
      .catch((e: unknown) => {
        if (live.signal.aborted) return;
        const wait = RETRY_STEPS_MS[Math.min(failures.current++, RETRY_STEPS_MS.length - 1)];
        setStatus((s) => ({ ...s, lastError: e instanceof Error ? e.message : String(e), loading: false }));
        schedule(wait);
      })
      .finally(() => {
        inFlight.current = false;
      });
  }, [schedule]);

  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  useEffect(() => {
    const controller = new AbortController();
    alive.current = controller;
    inFlight.current = false;
    refresh();
    const tick = setInterval(() => setNow(Date.now()), CLOCK_TICK_MS);
    const catchUp = () => {
      if (document.hidden) return;
      setNow(Date.now());
      const since = lastSuccess.current === null ? Infinity : Date.now() - lastSuccess.current;
      if (since > 2 * 60_000) refresh();
    };
    const online = () => refresh();
    document.addEventListener('visibilitychange', catchUp);
    window.addEventListener('focus', catchUp);
    window.addEventListener('online', online);
    window.addEventListener('pageshow', catchUp);
    return () => {
      controller.abort();
      clearInterval(tick);
      if (timer.current) clearTimeout(timer.current);
      document.removeEventListener('visibilitychange', catchUp);
      window.removeEventListener('focus', catchUp);
      window.removeEventListener('online', online);
      window.removeEventListener('pageshow', catchUp);
    };
  }, [refresh]);

  return { geometry, detail, catalog, frame, status, catalogError, geometryError, now, loadDetail, refresh };
}
