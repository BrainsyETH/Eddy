import { useEffect, useState } from 'react';
import { useIsFocused } from 'expo-router';
import { fetchFloatStartEstimate } from '@/api/client';
import { currentMovingSpeed } from '@/lib/floatStart';

type Request = Parameters<typeof fetchFloatStartEstimate>[0];
type Result = Awaited<ReturnType<typeof fetchFloatStartEstimate>>;

/** One moving model for every entrance. Editing immediately hides the previous answer. */
export function useStartEstimate(request: Request | null, now: number) {
  const focused = useIsFocused();
  const key = request ? JSON.stringify(request) : '';
  const freshness = Math.floor(now / (5 * 60_000));
  const [answer, setAnswer] = useState<{ key: string; freshness: number; receivedAt: number; result: Result | null } | null>(null);
  useEffect(() => {
    if (!key || !focused) return;
    const controller = new AbortController();
    // Coalesce rapid boat/endpoint edits; nothing waits for this request to start tracking.
    const timer = setTimeout(() => {
      void fetchFloatStartEstimate(JSON.parse(key) as Request, controller.signal)
        .then(result => {
          if (!controller.signal.aborted) setAnswer({ key, freshness, receivedAt: Date.now(), result });
        })
        .catch(() => {
          if (!controller.signal.aborted) setAnswer({ key, freshness, receivedAt: Date.now(), result: null });
        });
    }, 300);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [key, freshness, focused]);
  const current = answer?.key === key && answer.freshness === freshness ? answer : null;
  return { speed: currentMovingSpeed(current?.result ?? null, Math.max(now, current?.receivedAt ?? 0)), loading: Boolean(key && !current) };
}
