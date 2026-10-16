'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

/** Refresh the existing cached HTML snapshot, never replace it with the older API cache. */
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

  return { now, refreshing };
}
