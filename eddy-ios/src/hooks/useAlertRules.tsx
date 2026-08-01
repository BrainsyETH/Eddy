// eddy-ios/src/hooks/useAlertRules.tsx
// The user's alert rules — river and gauge alike — as one live list.
//
// ── Why this has no local store, unlike useStarredRivers ────────────────────
//
// A star is a free local bookmark that must work with no account and no
// network, so it is written to disk first and reconciled later. An alert is the
// opposite: it exists to make a SERVER push a notification, it requires a
// permanent account, and a rule that only existed on the phone would be one the
// delivery cron has never heard of. Caching them locally would mean showing
// people alerts that will never fire.
//
// So this is server state, held in memory for the session. Signed out, `rules`
// is null — deliberately distinct from `[]`, because "you have no alerts" and
// "we could not ask" must not render the same on a screen whose next control is
// "create one".
//
// Mutations are OPTIMISTIC and revert on failure. Pausing an alert should feel
// like flicking a switch, and the round trip is long enough on a river that a
// spinner would read as a broken toggle.

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
import type { AlertRule, AlertRuleSeed } from '@eddy/types';
import {
  ApiError,
  deleteAlertRule,
  fetchAlertRules,
  updateAlertRule,
  type UpdateAlertRuleInput,
} from '@/api/client';
import { useSession } from '@/hooks/useSession';

interface AlertRulesValue {
  /** Null means "not loaded or no usable session", never "none". */
  rules: AlertRule[] | null;
  /** False until the first fetch settles, however it settled. */
  ready: boolean;
  refreshing: boolean;
  refresh: () => Promise<void>;
  /** Insert a rule the create screen just made, without a round trip. */
  add: (rule: AlertRule) => void;
  setEnabled: (rule: AlertRule, enabled: boolean) => Promise<void>;
  /**
   * Edit a rule. Resolves with the re-seeded crossing state when the threshold
   * moved, so the edit screen can tell the user their rule starts out on the
   * far side of its own number instead of leaving it silently unable to fire.
   */
  update: (rule: AlertRule, patch: UpdateAlertRuleInput) => Promise<AlertRuleSeed | null>;
  remove: (rule: AlertRule) => Promise<void>;
  /** Is there already a rule on this river or gauge? Drives the bell's label. */
  rulesFor: (scope: 'river' | 'gauge', entityId: string) => AlertRule[];
}

const AlertRulesContext = createContext<AlertRulesValue>({
  rules: null,
  ready: false,
  refreshing: false,
  refresh: async () => {},
  add: () => {},
  setEnabled: async () => {},
  update: async () => null,
  remove: async () => {},
  rulesFor: () => [],
});

export function AlertRulesProvider({ children }: { children: ReactNode }) {
  const [rules, setRules] = useState<AlertRule[] | null>(null);
  const [ready, setReady] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const { session, getAccessToken } = useSession();

  // Read inside the mutations without being a dependency of them: a stale
  // closure would revert an optimistic edit to a list from two changes ago.
  //
  // Written in an effect rather than during render — a ref assigned in the
  // render body is read-during-render under React's rules and tears under
  // concurrent rendering. Every reader here is an event handler, which runs
  // after effects have flushed, so the value is never behind.
  const rulesRef = useRef<AlertRule[] | null>(null);
  useEffect(() => {
    rulesRef.current = rules;
  }, [rules]);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      const token = await getAccessToken();
      if (!token) {
        setRules(null);
        setReady(true);
        return;
      }
      try {
        const next = await fetchAlertRules(token, signal);
        // A null here is an unusable session, not an empty list — pass it
        // straight through rather than flattening it to [].
        setRules(next);
      } catch (err) {
        // Offline keeps whatever we last had. Blanking the list would tell
        // someone their alerts are gone at exactly the moment they cannot
        // check, and invite them to create duplicates.
        if (err instanceof ApiError && err.message === 'Request cancelled') return;
      } finally {
        setReady(true);
      }
    },
    [getAccessToken],
  );

  // Reloads when the user changes: signing in with Apple upgrades an anonymous
  // session in place, and the rules that come with it are not the ones the
  // anonymous session could see.
  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load, session?.user?.id]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const add = useCallback((rule: AlertRule) => {
    setRules((current) => [rule, ...(current ?? []).filter((r) => r.id !== rule.id)]);
  }, []);

  /**
   * Apply a local change, run the write, and put the list back if it fails.
   *
   * Generic over the write's result so a caller can read what the server said.
   * It used to swallow it, which is how PATCH's re-seed — the one thing that
   * knows a freshly edited rule is already past its own threshold — never
   * reached a screen.
   */
  const mutate = useCallback(
    async <T,>(
      rule: AlertRule,
      optimistic: (rules: AlertRule[]) => AlertRule[],
      write: (token: string) => Promise<T>,
    ): Promise<T> => {
      const before = rulesRef.current;
      if (before) setRules(optimistic(before));

      const token = await getAccessToken();
      if (!token) {
        if (before) setRules(before);
        throw new ApiError('Sign in to change alerts', 401);
      }

      try {
        return await write(token);
      } catch (err) {
        if (before) setRules(before);
        throw err;
      }
    },
    [getAccessToken],
  );

  // Discards the seed on purpose: pausing or resuming a rule never moves its
  // threshold, so there is no reseed to report and nothing for a caller to do
  // with one.
  const setEnabled = useCallback(
    async (rule: AlertRule, enabled: boolean): Promise<void> => {
      /**
       * Switching a SPENT one-shot back on re-arms it.
       *
       * Delivery now pauses a one-shot when it fires, which makes this switch
       * the re-arm control wherever a rule is listed. Sending `enabled: true`
       * alone would clear the pause and leave one_shot_fired_at set — a rule
       * that reads as live on every screen and cannot fire, which is the exact
       * confusion switching it off was meant to end.
       */
      const rearm = enabled && rule.oneShot && rule.firedAt != null;
      await mutate(
        rule,
        (current) =>
          current.map((r) =>
            r.id === rule.id
              ? { ...r, enabled, ...(rearm ? { firedAt: null, lastTriggeredAt: null } : {}) }
              : r,
          ),
        (token) => updateAlertRule(token, rule, { enabled, ...(rearm ? { rearm: true } : {}) }),
      );
    },
    [mutate],
  );

  const update = useCallback(
    (rule: AlertRule, patch: UpdateAlertRuleInput) =>
      mutate(
        rule,
        (current) =>
          current.map((r) =>
            r.id === rule.id
              ? {
                  ...r,
                  ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
                  ...(patch.oneShot !== undefined ? { oneShot: patch.oneShot } : {}),
                  ...(patch.conditionKind ? { conditionKind: patch.conditionKind } : {}),
                  ...(patch.metric ? { metric: patch.metric } : {}),
                  ...(patch.comparator ? { comparator: patch.comparator } : {}),
                  ...(patch.thresholdValue !== undefined
                    ? { thresholdValue: patch.thresholdValue }
                    : {}),
                  ...(patch.thresholdValueMax !== undefined
                    ? { thresholdValueMax: patch.thresholdValueMax }
                    : {}),
                  // Re-arming clears the spend, which is what greys out a
                  // "fired" badge the moment the user taps it — and un-pauses
                  // the rule, mirroring the server's rearm default now that a
                  // delivered one-shot switches itself off. Without the
                  // `enabled` half the row would sit there armed and showing
                  // OFF until the next refetch corrected it.
                  ...(patch.rearm
                    ? { firedAt: null, lastTriggeredAt: null, enabled: patch.enabled ?? true }
                    : {}),
                }
              : r,
          ),
        (token) => updateAlertRule(token, rule, patch),
      ),
    [mutate],
  );

  const remove = useCallback(
    (rule: AlertRule) =>
      mutate(
        rule,
        (current) => current.filter((r) => r.id !== rule.id),
        (token) => deleteAlertRule(token, rule),
      ),
    [mutate],
  );

  const rulesFor = useCallback(
    (scope: 'river' | 'gauge', entityId: string) =>
      (rules ?? []).filter((rule) =>
        scope === 'river' ? rule.riverId === entityId : rule.gaugeId === entityId,
      ),
    [rules],
  );

  const value = useMemo(
    () => ({ rules, ready, refreshing, refresh, add, setEnabled, update, remove, rulesFor }),
    [rules, ready, refreshing, refresh, add, setEnabled, update, remove, rulesFor],
  );

  return <AlertRulesContext.Provider value={value}>{children}</AlertRulesContext.Provider>;
}

export function useAlertRules() {
  return useContext(AlertRulesContext);
}
