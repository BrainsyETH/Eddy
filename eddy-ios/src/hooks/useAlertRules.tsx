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
import { alertRuleKey } from '@/lib/alertGroups';
import { useSession } from '@/hooks/useSession';

interface AlertRulesValue {
  /** Null means "not loaded or no usable session", never "none". */
  rules: AlertRule[] | null;
  /** False until the first fetch settles, however it settled. */
  ready: boolean;
  /**
   * The last load failed and left us with nothing.
   *
   * A FAILED LOAD IS NOT A MISSING SESSION. `rules` is null in both cases, and
   * the manage list reads null as "signed out" — so a signed-in person opening
   * the Alerts tab with no connection was told to sign in to the account they
   * already had, under a button offering to create it. The same confusion the
   * quiet-hours screen fixed for itself; this is the flag that lets this screen
   * tell the two apart.
   *
   * Only ever true alongside a null `rules`: a failure that still has a list to
   * show keeps showing it, which is the offline behaviour load() already had.
   */
  loadFailed: boolean;
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
  /**
   * Delete a rule.
   *
   * `cascaded` names rows the SERVER will delete along with it — the gauge
   * alerts parented to a river subscription, via the foreign key's on-delete
   * cascade. They are removed from the list here and restored with it if the
   * write fails, but no request is made for them: issuing one would race the
   * cascade and 404 on whichever lost.
   */
  remove: (rule: AlertRule, cascaded?: AlertRule[]) => Promise<void>;
  /** Is there already a rule on this river or gauge? Drives the bell's label. */
  rulesFor: (scope: 'river' | 'gauge', entityId: string) => AlertRule[];
}

/** A resume that also has to clear a spent one-shot. See setEnabled. */
function needsRearm(rule: AlertRule, enabled: boolean): boolean {
  return enabled && rule.oneShot && rule.firedAt != null;
}

const AlertRulesContext = createContext<AlertRulesValue>({
  rules: null,
  ready: false,
  loadFailed: false,
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
  const [loadFailed, setLoadFailed] = useState(false);
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
        // Genuinely signed out. Not a failure — the screen's sign-in state is
        // the correct thing to draw, so the flag is cleared rather than set.
        setRules(null);
        setLoadFailed(false);
        setReady(true);
        return;
      }
      try {
        const next = await fetchAlertRules(token, signal);
        // A null here is an unusable session, not an empty list — pass it
        // straight through rather than flattening it to [].
        setRules(next);
        setLoadFailed(false);
      } catch (err) {
        // Offline keeps whatever we last had. Blanking the list would tell
        // someone their alerts are gone at exactly the moment they cannot
        // check, and invite them to create duplicates.
        if (err instanceof ApiError && err.message === 'Request cancelled') return;
        // Recorded ONLY when there is nothing on screen to fall back to. With a
        // list still in hand this is an ordinary failed refresh and the list
        // stands; with none, `rules` stays null and the screen would otherwise
        // read that as "signed out" and say so.
        setLoadFailed(rulesRef.current === null);
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
      // Every rule this mutation touches. remove() passes the cascade; the
      // patches touch only their own rule and take the default.
      affected: AlertRule[] = [rule],
    ): Promise<T> => {
      const before = rulesRef.current;
      if (before) setRules(optimistic(before));

      // Revert ONLY what this mutation touched, as it was — never the whole
      // snapshot. Restoring the full `before` list meant two overlapping
      // mutations could undo each other: pause A (slow write), pause B
      // (succeeds, reconciles), A's write fails → the wholesale revert put
      // back a list where B was enabled again, though the server had it
      // paused, and the screen lied until the next refetch.
      const keys = new Set(affected.map(alertRuleKey));
      const beforeAffected = (before ?? []).filter((r) => keys.has(alertRuleKey(r)));
      const revert = () =>
        setRules((current) => {
          if (!current) return current;
          const beforeByKey = new Map(beforeAffected.map((r) => [alertRuleKey(r), r]));
          // Patched rules swap back in place; deleted ones are re-inserted at
          // the front — the grouping downstream decides display order anyway.
          const swapped = current.map((r) => beforeByKey.get(alertRuleKey(r)) ?? r);
          const present = new Set(current.map(alertRuleKey));
          const missing = beforeAffected.filter((r) => !present.has(alertRuleKey(r)));
          return missing.length ? [...missing, ...swapped] : swapped;
        });

      const token = await getAccessToken();
      if (!token) {
        if (before) revert();
        throw new ApiError('Sign in to change alerts', 401);
      }

      try {
        return await write(token);
      } catch (err) {
        if (before) revert();
        throw err;
      }
    },
    [getAccessToken],
  );

  /**
   * Replace a rule with the version the server just saved.
   *
   * The optimistic patch is a guess, and it is wrong wherever the route derives
   * one field from another — dropping `between` nulls the upper bound
   * server-side, which no patch built from the user's taps can know. Applied
   * after every successful write so the list holds what was stored rather than
   * what was asked for.
   *
   * Matched on alertRuleKey, not `id`: the two tables have separate id spaces
   * and a gauge rule can share a uuid with a river subscription.
   */
  const reconcile = useCallback((saved: AlertRule | null) => {
    if (!saved) return;
    const key = alertRuleKey(saved);
    setRules((current) =>
      current ? current.map((r) => (alertRuleKey(r) === key ? saved : r)) : current,
    );
  }, []);

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
      const rearm = needsRearm(rule, enabled);
      const result = await mutate(
        rule,
        (current) =>
          current.map((r) =>
            r.id === rule.id
              ? { ...r, enabled, ...(rearm ? { firedAt: null, lastTriggeredAt: null } : {}) }
              : r,
          ),
        (token) => updateAlertRule(token, rule, { enabled, ...(rearm ? { rearm: true } : {}) }),
      );
      reconcile(result.rule);
    },
    [mutate, reconcile],
  );

  const update = useCallback(
    async (rule: AlertRule, patch: UpdateAlertRuleInput): Promise<AlertRuleSeed | null> => {
      const result = await mutate(
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
      );
      // The server's copy wins over the guess above — see reconcile.
      reconcile(result.rule);
      return result.seed;
    },
    [mutate, reconcile],
  );

  const remove = useCallback(
    (rule: AlertRule, cascaded: AlertRule[] = []) => {
      // The cascade is a foreign key, not a loop of requests: deleting a river
      // subscription removes the gauge alerts parented to it, server-side. All
      // this has to do is take them off the list at the same moment, so the
      // group does not sit there half-deleted until the next refetch.
      const gone = new Set([rule, ...cascaded].map(alertRuleKey));
      return mutate(
        rule,
        (current) => current.filter((r) => !gone.has(alertRuleKey(r))),
        (token) => deleteAlertRule(token, rule),
        // The cascade is part of what a failed delete has to put back.
        [rule, ...cascaded],
      );
    },
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
    () => ({
      rules,
      ready,
      loadFailed,
      refreshing,
      refresh,
      add,
      setEnabled,
      update,
      remove,
      rulesFor,
    }),
    [rules, ready, loadFailed, refreshing, refresh, add, setEnabled, update, remove, rulesFor],
  );

  return <AlertRulesContext.Provider value={value}>{children}</AlertRulesContext.Provider>;
}

export function useAlertRules() {
  return useContext(AlertRulesContext);
}
