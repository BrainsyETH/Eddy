import { useEffect, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

const TICK_MS = 5_000;

/** Display freshness only; recording has its own lifecycle. */
export function useFloatDisplayClock(enabled: boolean): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setInterval> | null = null;
    const stop = () => {
      if (timer !== null) clearInterval(timer);
      timer = null;
    };
    const update = (state: AppStateStatus) => {
      if (state !== 'active') {
        stop();
      } else if (timer === null) {
        setNow(Date.now());
        timer = setInterval(() => setNow(Date.now()), TICK_MS);
      }
    };
    const subscription = AppState.addEventListener('change', update);
    update(AppState.currentState);
    return () => {
      subscription.remove();
      stop();
    };
  }, [enabled]);
  return now;
}
