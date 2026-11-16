'use client';

import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Refresh the existing cached HTML snapshot, never replace it with the older API cache.
 *
 * Shared by the dam page and the /dams directory: a minute clock for reading
 * ages and the schedule's now line, plus router.refresh() on focus, on
 * visibility and every five minutes (at most once a minute), so an open page
 * picks up new readings and newly posted schedules, not only a moving clock.
 */
export function useDamPageClock(renderedAt: number) {
  const router = useRouter();
  const [now, setNow] = useState(renderedAt);
  const [refreshing, startTransition] = useTransition();
  const pending = useRef(false);
  pending.current = refreshing;
  const lastAttempt = useRef(renderedAt);

  useEffect(() => {
    function refresh() {
      if (document.visibilityState !== 'visible') return;
      const instant = Date.now();
      setNow(instant);
      if (pending.current || instant - lastAttempt.current < 60_000) return;
      lastAttempt.current = instant;
      pending.current = true;
      startTransition(() => router.refresh());
    }
    setNow(Date.now());
    refresh();
    const clock = window.setInterval(() => {
      if (document.visibilityState === 'visible') setNow(Date.now());
    }, 60_000);
    const poll = window.setInterval(refresh, 5 * 60_000);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.clearInterval(clock);
      window.clearInterval(poll);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [router]);

  /** Refresh now, for an explicit "Try again"; still one refresh at a time. */
  const refreshNow = useCallback(() => {
    if (pending.current) return;
    const instant = Date.now();
    lastAttempt.current = instant;
    pending.current = true;
    setNow(instant);
    startTransition(() => router.refresh());
  }, [router]);

  return { now, refreshing, refreshNow };
}
