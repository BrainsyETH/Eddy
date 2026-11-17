// eddy-ios/src/hooks/useDamAlerts.tsx
// The caller's dam generation alerts, held once for the dam screen (which sets
// them) and the Alerts tab (which lists them).
//
// A sibling of AlertRulesProvider and built the same way, for the same reason:
// an alert exists to make the backend push, so the server's list is the truth
// and this is a copy of it, updated optimistically and put back on failure.
//
// It is NOT folded into that provider. River and gauge rules share a shape
// (AlertRule) and a set of verbs; a dam alert is two switches on one row with
// no pause, no threshold and no one-shot, and stretching AlertRule to carry it
// would put a third `source` in front of every screen that switches on two.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { DamGenerationAlert } from '@eddy/types';
import { ApiError, deleteDamAlert, fetchDamAlerts, saveDamAlert } from '@/api/client';
import { applyDamAlert, NO_DAM_ALERT, type DamAlertTimes } from '@/lib/damAlerts';
import { useSession } from '@/hooks/useSession';

interface DamAlertsValue {
  /** Null when signed out, or before the first load answers. */
  alerts: DamGenerationAlert[] | null;
  /** True once the first load has answered, whatever it said. */
  ready: boolean;
  refresh: () => Promise<void>;
  /**
   * Set one dam's two times, with a token already in hand.
   *
   * Takes the token rather than fetching one because every caller runs this
   * inside useAlertGate, which owns the session and turns a 401/403 thrown from
   * here into the sign-in sheet. Rejects after putting the list back.
   */
  save: (token: string, dam: { id: string; name: string }, times: DamAlertTimes) => Promise<void>;
  /** Remove one dam's alert. Rejects after putting the row back. */
  remove: (damId: string) => Promise<void>;
}

const DamAlertsContext = createContext<DamAlertsValue>({
  alerts: null,
  ready: false,
  refresh: async () => {},
  save: async () => {},
  remove: async () => {},
});

export function DamAlertsProvider({ children }: { children: ReactNode }) {
  const [alerts, setAlerts] = useState<DamGenerationAlert[] | null>(null);
  const [ready, setReady] = useState(false);
  const { session, isAnonymous, getAccessToken } = useSession();

  // Bumped by every write, so a load that started before a switch was flicked
  // cannot land after it and put the switch back.
  const mutationGen = useRef(0);
  const alertsRef = useRef<DamGenerationAlert[] | null>(null);
  useEffect(() => {
    alertsRef.current = alerts;
  }, [alerts]);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      // An anonymous session cannot hold an alert (the server requires a
      // permanent account to write one), so there is nothing to ask for.
      const token = isAnonymous ? null : await getAccessToken();
      if (!token) {
        setAlerts(null);
        setReady(true);
        return;
      }
      const gen = mutationGen.current;
      try {
        const next = await fetchDamAlerts(token, signal);
        if (mutationGen.current === gen) setAlerts(next);
      } catch (err) {
        if (err instanceof ApiError && err.message === 'Request cancelled') return;
        // A failed refresh keeps what is held. The switches then show the last
        // known state rather than reading off for an alert that is still set.
      } finally {
        setReady(true);
      }
    },
    [getAccessToken, isAnonymous],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load, session?.user?.id]);

  const refresh = useCallback(() => load(), [load]);

  const save = useCallback(
    async (token: string, dam: { id: string; name: string }, times: DamAlertTimes) => {
      const before = alertsRef.current;
      mutationGen.current += 1;
      setAlerts(applyDamAlert(before ?? [], dam, times, new Date().toISOString()));
      try {
        const saved = await saveDamAlert(token, { damId: dam.id, ...times });
        // The server's row replaces the optimistic one, so createdAt and the
        // name are the ones it holds.
        if (saved) {
          setAlerts((current) =>
            current ? current.map((entry) => (entry.damId === saved.damId ? saved : entry)) : current,
          );
        }
      } catch (err) {
        setAlerts(before);
        throw err;
      }
    },
    [],
  );

  const remove = useCallback(
    async (damId: string) => {
      const before = alertsRef.current;
      mutationGen.current += 1;
      setAlerts(applyDamAlert(before ?? [], { id: damId, name: '' }, NO_DAM_ALERT, ''));
      try {
        const token = await getAccessToken();
        if (!token) throw new ApiError('Sign in to change alerts', 401);
        await deleteDamAlert(token, damId);
      } catch (err) {
        setAlerts(before);
        throw err;
      }
    },
    [getAccessToken],
  );

  const value = useMemo(
    () => ({ alerts, ready, refresh, save, remove }),
    [alerts, ready, refresh, save, remove],
  );

  return <DamAlertsContext.Provider value={value}>{children}</DamAlertsContext.Provider>;
}

export function useDamAlerts() {
  return useContext(DamAlertsContext);
}
