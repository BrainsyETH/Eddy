// eddy-ios/src/components/RiverGaugeAlerts.tsx
// Which gauges on this river am I actually being told about?
//
// ── The gap this fills ──────────────────────────────────────────────────────
//
// A river alert watches ONE station: the river's primary gauge, which is what
// the river's condition is computed from and fanned out of the global outbox.
// That is the right default and, on a river gauged once, the whole story. The
// Meramec is gauged four times over 108 miles. Somebody who floats the upper
// river was subscribed to a verdict measured 70 miles downstream of where they
// put in, and the app never said so — the alert simply carried the river's name
// and looked complete.
//
// So the river's other rated gauges are listed here, each with a switch. On
// creates a condition-mode rule against THAT station's ladder; off deletes it.
// The primary is shown too, and locked: it is what the river alert already is,
// and a switch that cannot be turned off without deleting the alert you are
// editing would be a lie.
//
// ── Why this could not exist until now ──────────────────────────────────────
//
// POST /api/me/gauge-alerts refused every condition rule on a river the caller
// already subscribed to, on the reasoning that it would notify twice about one
// transition. True of the primary station and false of every other one — the
// evaluator grades each rule against its own river_gauges ladder — so that
// check now applies to the primary alone. See the comment on it in the route.
//
// ── Where the gauges come from ──────────────────────────────────────────────
//
// /api/gauges: one flat list of every rated station, each carrying the ladder
// per river it grades. The rivers a station rates ARE its river_gauges rows, so
// filtering that list by river id gives exactly the set the server will accept
// a condition rule for — no new endpoint, and the same request four other
// screens already make.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import type { AlertRule, AlertSubscriptionKind, MapGauge } from '@eddy/types';
import { ApiError, createGaugeAlert, fetchGauges } from '@/api/client';
import { useAlertRules } from '@/hooks/useAlertRules';
import { useSession } from '@/hooks/useSession';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';
import { EddySymbol } from '@/components/EddySymbol';
import { followsParent } from '@/lib/alertGroups';

/** A rated station on this river, paired with its link to it. */
interface RiverGauge {
  /** gauge_stations uuid. */
  id: string;
  name: string;
  usgsSiteId: string | null;
  isPrimary: boolean;
  /**
   * False when the river_gauges row exists with every level null.
   *
   * A legal, deliberate state — migration 00198 wires Clearwater Dam's release
   * to the Black exactly that way, on the grounds that calibrating a
   * floatability ladder for a dam release is a safety judgement Eddy will not
   * make. The server would accept a condition rule against it and the rule
   * could never produce a verdict, so the switch is disabled and says why.
   */
  rated: boolean;
}

function riverGauges(gauges: MapGauge[], riverId: string): RiverGauge[] {
  const rows: RiverGauge[] = [];
  for (const gauge of gauges) {
    const link = (gauge.thresholds ?? []).find((entry) => entry.riverId === riverId);
    if (!link) continue;
    rows.push({
      id: gauge.id,
      name: gauge.name,
      usgsSiteId: gauge.usgsSiteId ?? null,
      isPrimary: link.isPrimary,
      // Any one level is enough: the classifier reads whichever bands are set,
      // and demanding all six would hide gauges Eddy genuinely does grade.
      rated: [
        link.levelTooLow,
        link.levelLow,
        link.levelOptimalMin,
        link.levelOptimalMax,
        link.levelHigh,
        link.levelDangerous,
      ].some((level) => level != null),
    });
  }
  // The primary first — it is the one the alert above is about — then the rest
  // in the order the endpoint returned them.
  return rows.sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary));
}

interface Props {
  /** The river-condition rule being edited. */
  rule: AlertRule;
}

export function RiverGaugeAlerts({ rule }: Props) {
  const { colors, elevation } = useTheme();
  const { getAccessToken } = useSession();
  const { rules, add, remove } = useAlertRules();

  const [gauges, setGauges] = useState<MapGauge[] | null>(null);
  // The station directory could not be loaded. Not the same as "still
  // loading": the gauges this alert already covers are in the rules list and
  // can be shown, and switched off, without it.
  const [directoryFailed, setDirectoryFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const riverId = rule.riverId;

  useEffect(() => {
    if (!riverId) return;
    const controller = new AbortController();
    fetchGauges(controller.signal)
      .then((next) => {
        setGauges(next);
        setDirectoryFailed(false);
      })
      .catch(() => {
        // An unmount or a retry cancelled this one; its answer is not news.
        if (!controller.signal.aborted) setDirectoryFailed(true);
      });
    return () => controller.abort();
  }, [riverId, attempt]);

  /**
   * The gauges this alert already covers, read from the rules themselves.
   *
   * The Alerts tab names these on the alert's row, and this section is the
   * only place they can be switched off. It used to render nothing at all when
   * the directory request failed, so a dropped request left "Main gauge +
   * Sullivan" on the list with no way to reach Sullivan.
   */
  const savedRows = useMemo<RiverGauge[]>(
    () =>
      rule.source !== 'river_condition'
        ? []
        : (rules ?? [])
            .filter(
              (candidate) =>
                candidate.source === 'gauge' &&
                candidate.mode === 'condition' &&
                candidate.parentId === rule.id &&
                candidate.gaugeId != null,
            )
            .map((candidate) => ({
              id: candidate.gaugeId as string,
              name: candidate.gaugeName ?? 'Gauge',
              usgsSiteId: candidate.usgsSiteId,
              isPrimary: false,
              // It has a rule, so the server accepted it as rated.
              rated: true,
            })),
    [rules, rule.source, rule.id],
  );

  const rows = useMemo(
    () => (gauges && riverId ? riverGauges(gauges, riverId) : directoryFailed ? savedRows : []),
    [gauges, riverId, directoryFailed, savedRows],
  );

  /**
   * The existing condition rule for a station on this river, if any.
   *
   * THIS ALERT'S OWN RULE FIRST. A station can carry two condition rules on
   * one river — the one switched on here, and a standalone one set from the
   * gauge screen on a different setting — and the list comes newest first. A
   * plain `find` therefore handed back whichever was newer: a later standalone
   * alert shadowed the gauge this alert covers, and the row locked its switch
   * and said "not part of this one" about a gauge the Alerts tab was naming as
   * covered.
   *
   * Failing that, any rule on the station — because the switch below has to
   * answer "will I hear about this gauge?" and the answer is yes either way. It
   * is `ownedHere` that decides whether this section may act on it.
   */
  const ruleFor = useCallback(
    (gaugeId: string): AlertRule | null => {
      const onStation = (rules ?? []).filter(
        (candidate) =>
          candidate.source === 'gauge' &&
          candidate.mode === 'condition' &&
          candidate.gaugeId === gaugeId &&
          candidate.riverId === riverId,
      );
      return (
        onStation.find(
          (candidate) => rule.source === 'river_condition' && candidate.parentId === rule.id,
        ) ??
        onStation[0] ??
        null
      );
    },
    [rules, riverId, rule.source, rule.id],
  );

  /**
   * Was this rule created HERE, from the river alert being edited?
   *
   * ── The rule this section must not touch ──────────────────────────────────
   *
   * Somebody can set a condition alert on a station from the gauge screen. It
   * has no parent, it is not gated by this river alert, and it does not nest
   * under it on the Alerts tab — it is their own alert, which is exactly the
   * distinction `parent_subscription_id` was added to make and that
   * groupAlertRules already respects.
   *
   * This section knew nothing about it. The switch read on, which was true, and
   * the copy beside it promised the rule "appears under this alert on the
   * Alerts tab" and travels with it — none of which was true. Worse, the switch
   * was live: flicking it off called remove() and deleted a standalone alert
   * from a screen that had no business owning it, while the user was editing a
   * different rule entirely.
   *
   * So a rule that is not ours is shown, described accurately, and left alone.
   */
  const ownedHere = useCallback(
    (existing: AlertRule | null): boolean =>
      existing != null && rule.source === 'river_condition' && existing.parentId === rule.id,
    [rule.source, rule.id],
  );

  const toggle = useCallback(
    async (row: RiverGauge, next: boolean) => {
      if (!riverId) return;
      setError(null);
      setBusyId(row.id);
      try {
        const existing = ruleFor(row.id);
        if (!next) {
          // Only ever removes a rule this section created. The switch is
          // disabled for anything else, so this is the second lock on the same
          // door — deleting somebody's standalone alert from here would be
          // silent and unrecoverable.
          if (existing && ownedHere(existing)) await remove(existing);
          return;
        }
        if (existing) return;

        const token = await getAccessToken();
        if (!token) throw new ApiError('Sign in to change alerts', 401);
        const created = await createGaugeAlert(token, {
          gaugeStationId: row.id,
          usgsSiteId: row.usgsSiteId ?? undefined,
          riverId,
          riverSlug: rule.riverSlug ?? undefined,
          scope: 'gauge',
          mode: 'condition',
          // The same thing the river alert is set to tell you about, because
          // this is that alert extended to another station — not a new
          // decision. The SAVED setting, not whatever is being drafted above:
          // saving the draft carries it to every gauge on the saved setting,
          // this one included, and backing out leaves both as they were.
          conditionKind: (rule.conditionKind ?? 'all') as AlertSubscriptionKind,
          // One-time with the river alert, too. A gauge that kept sending under
          // an alert set to send once is not that alert on another station.
          oneShot: rule.oneShot,
          // WHAT MAKES IT A CHILD, and the reason this screen can promise the
          // river alert governs it. Sent only from here: the same rule created
          // on the gauge screen is somebody's own alert and must not be
          // silenced by a river subscription it has nothing to do with.
          //
          // Guarded on `source` because this section is only ever rendered
          // inside a river-condition alert, and a gauge rule's id would name a
          // row in the wrong table — which the server and the database would
          // both refuse, but as a 400 rather than as a thing we never sent.
          parentSubscriptionId: rule.source === 'river_condition' ? rule.id : undefined,
        });
        // Straight into the list, so the switch stays on without a refetch and
        // the new rule is immediately visible on the Alerts tab.
        add(created.rule);
      } catch (err) {
        // The route writes its refusals for a person — "You can have up to 25
        // alerts", "You already have this alert" — so show what it said rather
        // than inventing a sentence about a rule this screen cannot see.
        setError(err instanceof ApiError ? err.message : 'Could not change that. Try again.');
      } finally {
        setBusyId(null);
      }
    },
    [
      riverId,
      ruleFor,
      ownedHere,
      remove,
      getAccessToken,
      rule.riverSlug,
      rule.conditionKind,
      rule.oneShot,
      rule.source,
      rule.id,
      add,
    ],
  );

  // Nothing to say on a river with one gauge: the alert above IS that gauge,
  // and a section listing it alone would be a heading over a locked switch.
  //
  // Without the directory there is no telling how many gauges the river has,
  // so the section shows only when there is something of ours to show. A
  // failed request on a river with no added gauges stays silent, as before.
  if (!riverId) return null;
  if (directoryFailed ? rows.length === 0 : rows.length < 2) return null;

  return (
    <>
      <Text style={[styles.sectionLabel, { color: colors.textSubtle }]}>Gauges on this river</Text>
      <Text style={[styles.intro, { color: colors.textMuted }]}>
        {/* Says what the river alert actually watches, and where the switch you
            are about to flick shows up: the Alerts tab names the gauges an
            alert covers on its row. Without the first sentence the extra
            switches read as optional detail rather than as the answer to "which
            part of the river is this about"; without the second, switching one
            on looked like it had done nothing. */}
        This alert follows {rule.riverName ?? 'the river'}&apos;s main gauge. Switch on another
        gauge to hear about its stretch too, graded on its own levels. Added gauges use this
        alert&apos;s settings and are listed with it on the Alerts tab.
      </Text>

      {gauges === null && !directoryFailed ? (
        <ActivityIndicator style={styles.loading} color={colors.interactive} />
      ) : null}

      {/* Says what is missing and offers the fix. The rows below are only the
          gauges already added; the main gauge and the ones not yet switched on
          come from the directory. */}
      {directoryFailed ? (
        <View style={styles.failedRow}>
          <Text style={[styles.failedText, { color: colors.textMuted }]}>
            Couldn&apos;t load this river&apos;s other gauges.
          </Text>
          <Pressable
            onPress={() => {
              setDirectoryFailed(false);
              setAttempt((n) => n + 1);
            }}
            accessibilityRole="button"
            accessibilityLabel="Retry loading this river's gauges"
            hitSlop={12}
          >
            <Text style={[styles.failedRetry, { color: colors.interactive }]}>Retry</Text>
          </Pressable>
        </View>
      ) : null}

      {rows.map((row) => {
        const existing = ruleFor(row.id);
        const owned = ownedHere(existing);
        const on = row.isPrimary || existing != null;
        // On, but somebody else's — set from the gauge screen rather than from
        // here, so it is not gated by this alert and does not go with it.
        const separate = existing != null && !owned;
        // Ours, and no longer on this alert's setting — given its own trigger
        // from its row on the Alerts tab.
        const ownSetting =
          existing != null && owned && existing.enabled && !followsParent(existing, rule);
        return (
          <View
            key={row.id}
            style={[styles.row, { backgroundColor: colors.card }, elevation(1)]}
          >
            <EddySymbol name="gauge" size={22} />
            <View style={styles.body}>
              <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
                {row.name}
              </Text>
              <Text style={[styles.hint, { color: colors.textMuted }]}>
                {row.isPrimary
                  ? 'The main gauge — this is what the alert above watches.'
                  : !row.rated
                    ? 'Eddy has not set levels for this gauge on this river.'
                    : separate
                      ? // Says whose it is and where to change it. The switch is
                        // locked beside this, because the only thing this
                        // section could do to it is delete it.
                        'On as an alert of its own — it is not part of this one. Manage it on the Alerts tab.'
                      : owned && existing && !existing.enabled
                        ? // Paused from its own row on the Alerts tab. This
                          // switch deletes what it turns off, so it must not
                          // read as a plain "On" for a rule that is not firing.
                          'Paused on the Alerts tab. Resume it there.'
                        : ownSetting
                          ? 'Included, with its own setting. Change it on the Alerts tab.'
                          : on && !rule.enabled
                            ? // The same fact the Alerts tab reports: the
                              // river alert's switch holds this gauge too. It
                              // used to read "On" under a paused alert.
                              `Included · paused with ${rule.riverName ?? 'this alert'}`
                            : on
                              ? 'Included — you will hear about this gauge separately.'
                              : 'Off'}
              </Text>
            </View>
            {busyId === row.id ? (
              <ActivityIndicator color={colors.interactive} />
            ) : (
              <Switch
                value={on}
                // The primary cannot be switched off here. Turning it off would
                // mean deleting the alert being edited, which is what the
                // Delete button at the bottom of this screen is for.
                //
                // Nor can a rule set somewhere else: this switch deletes what it
                // turns off, and that one is not ours to delete.
                disabled={row.isPrimary || !row.rated || separate}
                onValueChange={(next) => void toggle(row, next)}
                trackColor={{ true: colors.interactive, false: colors.border }}
                accessibilityLabel={
                  separate
                    ? `${row.name} has its own alert, managed on the Alerts tab`
                    : `${on ? 'Stop' : 'Start'} alerts for ${row.name}`
                }
              />
            )}
          </View>
        );
      })}

      {error ? <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text> : null}
    </>
  );
}

const styles = StyleSheet.create({
  sectionLabel: {
    ...t.xs,
    fontFamily: fonts.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: 22,
    marginBottom: 6,
    marginHorizontal: 4,
  },
  intro: { ...t.xs, fontFamily: fonts.body, marginHorizontal: 4, marginBottom: 10, lineHeight: 17 },
  loading: { marginVertical: 12 },
  failedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginHorizontal: 4,
    marginBottom: 10,
  },
  failedText: { ...t.sm, fontFamily: fonts.body, flex: 1 },
  failedRetry: { ...t.sm, fontFamily: fonts.semibold },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 14,
    marginBottom: 8,
  },
  body: { flex: 1, minWidth: 0 },
  name: { ...t.base, fontFamily: fonts.semibold },
  hint: { ...t.xs, fontFamily: fonts.body, marginTop: 2 },
  errorText: { ...t.sm, fontFamily: fonts.body, marginTop: 6, marginHorizontal: 4 },
});
