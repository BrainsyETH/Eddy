import { useEffect, useRef, useState } from 'react';
import { onForeground } from '@/lib/foreground';
import { parseSnooze, snoozeDeadline } from '@/lib/todayPresentation';

const KEY = 'eddy.today.alertsSnoozedUntil.v1';
function storage(): { getItem(key: string): Promise<string | null>; setItem(key: string, value: string): Promise<void> } {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('@react-native-async-storage/async-storage').default;
}
export function useTodaySnooze() {
  const [until, setUntil] = useState(0);
  const [now, setNow] = useState(Date.now);
  const [ready, setReady] = useState(false);
  const writes = useRef(Promise.resolve());
  useEffect(() => {
    let active = true;
    void storage().getItem(KEY).then((value) => {
      if (active) setUntil(parseSnooze(value));
    }).catch(() => {}).finally(() => { if (active) setReady(true); });
    const off = onForeground(() => setNow(Date.now()));
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => { active = false; off(); clearInterval(timer); };
  }, []);
  useEffect(() => {
    if (until <= now) return;
    const timer = setTimeout(() => setNow(Date.now()), until - now);
    return () => clearTimeout(timer);
  }, [until, now]);
  const snooze = (duration: 'hour' | 'today' | 'day' | null) => {
    const deadline = duration ? snoozeDeadline(duration) : 0;
    setUntil(deadline);
    setNow(Date.now());
    writes.current = writes.current.catch(() => {}).then(() => storage().setItem(KEY, String(deadline))).catch(() => {});
  };
  return { ready, until, snoozed: until > now, snooze };
}

