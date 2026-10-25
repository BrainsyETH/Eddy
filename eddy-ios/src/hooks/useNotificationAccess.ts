import { useCallback, useEffect, useRef, useState } from 'react';
import { onForeground } from '@/lib/foreground';
import type { NotificationAccess } from '@/lib/notificationAccess';
import { readNotificationAccess, requestNotificationAccess } from '@/lib/notificationPermissions';

export function useNotificationAccess() {
  const [state, setState] = useState<NotificationAccess>('unknown');
  const [busy, setBusy] = useState(false);
  const generation = useRef(0);
  const mounted = useRef(false);
  const requesting = useRef(false);
  const read = useCallback(async () => {
    if (!mounted.current) return;
    const current = ++generation.current;
    const next = await readNotificationAccess();
    if (mounted.current && current === generation.current) setState(next);
  }, []);
  useEffect(() => {
    mounted.current = true;
    void read();
    const off = onForeground(() => void read());
    return () => { mounted.current = false; off(); };
  }, [read]);
  const request = useCallback(async () => {
    if (requesting.current) return;
    requesting.current = true;
    setBusy(true);
    const current = ++generation.current;
    const next = await requestNotificationAccess();
    if (mounted.current && current === generation.current) setState(next);
    requesting.current = false;
    if (mounted.current) setBusy(false);
    // Includes a return from the OS dialog that raced the foreground read.
    await read();
  }, [read]);
  return { state, busy, request };
}
