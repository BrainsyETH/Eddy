import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetchRainfall } from '@/api/client';
import { normalizeRain, RAIN_PREFERENCE_KEY, type RainSummary } from '@eddy/conditions/rainfall';
import { normalizeRainDetail } from '@eddy/conditions/rainfall-map';

export function useRainfall(siteId: string | null, enabled: boolean) {
  const [state, setState] = useState<{ key: string | null; data: RainSummary | null; failed: boolean }>({ key: null, data: null, failed: false });
  const [revision, setRevision] = useState(0);
  const retry = useCallback(() => setRevision(value => value + 1), []);
  useEffect(() => {
    if (!siteId || !enabled) return;
    const controller = new AbortController();
    let disposed = false;
    const load = async () => {
      try {
        const data = normalizeRain(await fetchRainfall(siteId, false, controller.signal), siteId);
        if (!disposed) setState({ key: siteId, data, failed: false });
      } catch {
        if (!disposed) setState(previous => ({ key: siteId, data: previous.key === siteId ? previous.data : null, failed: true }));
      }
    };
    void load();
    const timer = setInterval(() => void load(), 5 * 60_000);
    return () => { disposed = true; controller.abort(); clearInterval(timer); };
  }, [siteId, enabled, revision]);
  return { data: enabled && state.key === siteId ? state.data : null, failed: state.key === siteId && state.failed, retry };
}
export function useRainDetail(siteId: string) {
  const [state, setState] = useState<{ key: string; revision: number; data: ReturnType<typeof normalizeRainDetail>; failed: boolean } | null>(null);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let disposed = false;
    void fetchRainfall(siteId, true, controller.signal).then(value => {
      if (disposed) return;
      const data = normalizeRainDetail(value, siteId);
      setState({ key: siteId, revision, data, failed: !data });
    }, () => { if (!disposed) setState({ key: siteId, revision, data: null, failed: true }); });
    return () => { disposed = true; controller.abort(); };
  }, [siteId, revision]);
  const current = state?.key === siteId && state.revision === revision ? state : null;
  return { data: current?.data ?? null, failed: current?.failed ?? false, retry: () => setRevision(value => value + 1) };
}
export function useRainPreference() {
  const [on, setOn] = useState(true);
  const changed = useRef(false);
  const writes = useRef(Promise.resolve());
  useEffect(() => {
    let disposed = false;
    void AsyncStorage.getItem(RAIN_PREFERENCE_KEY).then(value => {
      if (!disposed && !changed.current) setOn(value !== 'off');
    }, () => {});
    return () => { disposed = true; };
  }, []);
  const update = useCallback((value: boolean) => {
    changed.current = true; setOn(value);
    writes.current = writes.current.then(() => AsyncStorage.setItem(RAIN_PREFERENCE_KEY, value ? 'on' : 'off')).catch(() => {});
  }, []);
  return [on, update] as const;
}
