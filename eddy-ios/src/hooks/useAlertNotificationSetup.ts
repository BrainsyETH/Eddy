import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useAppConfig } from './useAppConfig';
import { usePush } from './usePush';
import { useSession } from './useSession';
import { alertNotificationNotice, type AlertNotificationNotice } from '@/lib/alertNotificationSetup';
import { warn } from '@/lib/monitoring';

/** Notification setup cannot undo, or masquerade as a failure of, a saved rule. */
export function useAlertNotificationSetup() {
  const push = usePush();
  const { refresh, enable } = push;
  const { features } = useAppConfig();
  const { session, isAnonymous } = useSession();
  const userId = !isAnonymous ? session?.user.id ?? null : null;
  const [state, setState] = useState<{ userId: string | null; busy: boolean; primerOpen: boolean; error: string | null }>({ userId, busy: false, primerOpen: false, error: null });
  // A different account must not inherit an open primer or an in-flight status.
  if (state.userId !== userId) setState({ userId, busy: false, primerOpen: false, error: null });
  const { busy, primerOpen, error } = state;
  const updateState = useCallback((patch: Partial<Omit<typeof state, 'userId'>>) => {
    setState(previous => previous.userId === userId ? { ...previous, ...patch } : previous);
  }, [userId]);
  const operation = useRef(0);
  const running = useRef(false);

  useEffect(() => () => { operation.current += 1; running.current = false; }, [userId]);

  const dismiss = useCallback(() => {
    operation.current += 1;
    running.current = false;
    updateState({ busy: false, primerOpen: false, error: null });
  }, [updateState]);

  useFocusEffect(useCallback(() => () => dismiss(), [dismiss]));

  /** Call only AFTER a successful enable/rearm. True keeps the editor open. */
  const check = useCallback(async (): Promise<boolean> => {
    if (running.current) return true;
    running.current = true;
    const attempt = ++operation.current;
    updateState({ busy: true, error: null });
    try {
      const status = await refresh();
      if (operation.current !== attempt) return true;
      const notice = alertNotificationNotice(status, features.push);
      if (notice?.action === 'ask') updateState({ primerOpen: true });
      return notice !== null;
    } catch (cause) {
      if (operation.current === attempt) updateState({ error: 'Couldn’t check notifications. Your alert is saved. Try again.' });
      warn('push', 'could not check notification setup for a saved alert', cause);
      return true;
    } finally {
      if (operation.current === attempt) { running.current = false; updateState({ busy: false }); }
    }
  }, [refresh, features.push, updateState]);

  // Capture cancellation before the write: an old save finishing after Pause,
  // sign-out or navigation must not start a new permission prompt.
  const afterSave = useCallback(async <T,>(save: Promise<T>, shouldCheck: boolean) => {
    const attempt = operation.current;
    const value = await save;
    const needsAttention = shouldCheck && operation.current === attempt ? await check() : false;
    return { value, needsAttention };
  }, [check]);

  const notice: AlertNotificationNotice | null = userId
    ? alertNotificationNotice(push, features.push) ?? (error ? { message: 'Check notifications on this iPhone.', action: 'retry' } : null)
    : null;

  const act = async (allow = false) => {
    if (running.current) return;
    if (!allow && notice?.action === 'ask') { updateState({ primerOpen: true }); return; }
    if (!allow && notice?.action === 'retry') { await check(); return; }
    running.current = true;
    const attempt = ++operation.current;
    updateState({ busy: true, error: null });
    updateState({ primerOpen: false });
    try {
      if (allow || notice?.action === 'enable') await enable();
      else if (notice?.action === 'settings') await Linking.openSettings();
    } catch (cause) {
      if (operation.current === attempt) updateState({ error: 'Couldn’t finish notification setup. Try again.' });
      warn('push', 'could not complete saved alert notification setup', cause);
    } finally {
      if (operation.current === attempt) { running.current = false; updateState({ busy: false }); }
    }
  };

  return { notice, busy, error, primerOpen: Boolean(userId) && primerOpen, afterSave, act, dismiss };
}
