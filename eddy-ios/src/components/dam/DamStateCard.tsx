// eddy-ios/src/components/dam/DamStateCard.tsx
// A dam's current state — the headline block on the dam screen.
//
// Ported from the web card, and the copy discipline ports with it because it is
// the whole point of the component:
//
//  - A metric the dam does not publish is ABSENT from `metrics`, and absent
//    renders NOTHING. Clearwater is flood control with no powerhouse, so it
//    must not show a "Generation: 0 cfs" tile implying the turbines are idle.
//  - Generating vs idle is the fact a wading angler needs first, so it leads.
//  - A daily-mean release (the St. Louis district publishes release that way,
//    about a day behind) is labelled. Showing it as "releasing now" would be a
//    correctness bug, not a cosmetic one.
//  - Stale readings drop their emphasis rather than being hidden — a number
//    with an honest age beats no number.
//
// ── What moved out of this file ────────────────────────────────────────────
// The generation hero. It is DamGenerationHero now, on the dam SCREEN only,
// because a rack of eight generator cells repeated down a favourites list is
// not scannable. What is left here is the one-line now → next summary, which is
// what a list surface actually needs.
//
// ── Why the generating chip is not a condition colour ──────────────────────
// It uses the interactive teal, never conditionColor(). CONDITION_SYSTEM's
// palette means "should you float this river", and generating/idle is not that
// verdict — it is a fact about machinery. Painting "Generating" in the
// `dangerous` red would make the app appear to have issued a floatability call
// it has not made, on a reach it may not even carry.

import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { DamSnapshot } from '@eddy/types';
import {
  relativeAge,
  tailwaterMovementSentence,
  readingStaleness,
  SCHEDULE_CHANGE_NOTE,
} from '@eddy/conditions/dam-schedule-copy';
import {
  generationNow,
  generationStatusLabel,
  nowNextClauses,
} from '@eddy/conditions/dam-generation';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';

function formatCfs(value: number): string {
  return `${Math.round(value).toLocaleString()} cfs`;
}

/**
 * Whether a reading has aged out of usefulness, from its own timestamp.
 *
 * Deliberately not `metric.staleness`. That band is stamped when the SERVER
 * assembles the snapshot and then frozen on the wire, and this screen fetches
 * once on mount with no refetch on focus — so a screen backgrounded and resumed
 * hours later would still be told the reading is fresh while the age beside it,
 * computed on this device, correctly reads "9 hours ago". See readingStaleness.
 */
function isStale(metric: { at: string }): boolean {
  return readingStaleness(metric.at) === 'stale';
}

interface StatProps {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  value: string;
  /**
   * A qualifier that belongs ON the value line but must not compete with the
   * number for weight — "elevation" beside 703.95 ft. Kept out of `value`
   * because at full display weight it wrapped onto its own line and read as a
   * second, unlabelled figure.
   */
  suffix?: string;
  sub?: string | null;
  /** A stale reading stays visible and loses emphasis. */
  dim?: boolean;
}

function Stat({ icon, label, value, suffix, sub, dim }: StatProps) {
  const { colors } = useTheme();
  return (
    <View style={styles.stat}>
      <View style={styles.statLabelRow}>
        <Ionicons name={icon} size={12} color={colors.textSubtle} />
        <Text style={[styles.statLabel, { color: colors.textSubtle }]}>{label}</Text>
      </View>
      <Text style={[styles.statValue, { color: dim ? colors.textMuted : colors.text }]}>
        {value}
        {suffix ? (
          <Text style={[styles.statSuffix, { color: colors.textSubtle }]}> {suffix}</Text>
        ) : null}
      </Text>
      {sub ? <Text style={[styles.statSub, { color: colors.textSubtle }]}>{sub}</Text> : null}
    </View>
  );
}

export function DamStateCard({
  dam,
  /**
   * This card is NOT the top of the screen.
   *
   * Set on the dam screen, where DamGenerationHero sits above it and already
   * carries the generation summary and the release figure. Two copies of one
   * fact on one screen read as two facts. Named to match the web card's prop so
   * the two surfaces stay legibly the same component.
   */
  secondary,
}: {
  dam: DamSnapshot;
  secondary?: boolean;
}) {
  const { colors, elevation } = useTheme();

  const release = dam.metrics.release;
  const pool = dam.metrics.poolElevation;
  const floodPool = dam.metrics.pctFloodPool;
  const tailwaterTemp = dam.metrics.tailwaterTempF;
  const tailwaterStage = dam.metrics.tailwaterElevation;
  const inflow = dam.metrics.inflow;
  const generationFlow = dam.metrics.generationFlow;

  // The one-line version of the console: what Eddy MEASURED, then what SWPA has
  // SCHEDULED. Two strings rather than one because they can honestly disagree —
  // a unit trips, a schedule is revised after Eddy fetched it — and a row that
  // merged them would give a plan the weight of a measurement.
  //
  // The scheduled half is also the only live line Stockton and Truman can carry:
  // the Kansas City district publishes no timeseries at all, so those two have
  // no observation to show.
  // A flood-control project has no powerhouse to report on, so it gets no
  // generation line at all — the same test the hero uses to render nothing.
  const state = generationNow(dam);
  const clauses =
    secondary || generationStatusLabel(state) === null
      ? null
      : nowNextClauses(state, dam.schedule, dam.generationReference);

  return (
    <View style={[styles.card, { backgroundColor: colors.card }, elevation(2)]}>
      {/* Generating or not, first and in words.
          `generating` is NULL — not false — for a dam that publishes no turbine
          flow, and null must render nothing. Stockton and Truman are SWPA
          schedule entries with no CWMS feed at all; printing "Not generating"
          for them would be an observation nobody made. */}
      {!secondary && dam.generating !== null ? (
        <View style={styles.chipRow}>
          <View
            style={[
              styles.chip,
              {
                backgroundColor: dam.generating ? colors.interactive : colors.cardRaised,
                borderColor: dam.generating ? colors.interactive : colors.border,
              },
            ]}
          >
            <Ionicons
              name={dam.generating ? 'flash' : 'flash-off-outline'}
              size={13}
              color={dam.generating ? colors.onInteractive : colors.textMuted}
            />
            <Text
              style={[
                styles.chipText,
                { color: dam.generating ? colors.onInteractive : colors.textMuted },
              ]}
            >
              {dam.generating ? 'Generating' : 'Not generating'}
            </Text>
          </View>
          {generationFlow ? (
            <Text style={[styles.chipAside, { color: colors.textSubtle }]}>
              {formatCfs(generationFlow.value)} through the turbines
            </Text>
          ) : null}
        </View>
      ) : null}

      {/* The note is not decoration and must not be dropped to save a line: it
          carries SWPA's "subject to change" and the fact that water downstream
          lags the dam, and on a list surface there is no schedule block below to
          carry either. */}
      {clauses ? (
        <View>
          <Text style={[styles.observed, { color: colors.text }]}>{clauses.observed}</Text>
          {clauses.scheduled ? (
            <>
              <View style={styles.nextChangeRow}>
                <Ionicons name="time-outline" size={13} color={colors.interactive} />
                <Text style={[styles.nextChange, { color: colors.interactive }]}>
                  {clauses.scheduled}
                </Text>
              </View>
              <Text style={[styles.nextChangeAside, { color: colors.textSubtle }]}>
                {SCHEDULE_CHANGE_NOTE}
              </Text>
            </>
          ) : null}
        </View>
      ) : null}

      {/* Tailwater facts lead, lake facts follow. The water below the dam is
          what someone is standing in; the pool is context. */}
      <View style={styles.statGrid}>
        {/* Hidden only when the hero above ACTUALLY carried it. A flood-control
            project renders no hero — DamGenerationHero returns null for a dam
            with no powerhouse — so on Clearwater this is the only place total
            release appears. */}
        {release && !(secondary && dam.hasTurbines) ? (
          <Stat
            icon="water-outline"
            label={release.dailyMean ? 'Release (daily avg)' : 'Releasing'}
            value={formatCfs(release.value)}
            sub={
              release.dailyMean
                ? ['daily average', relativeAge(release.at)].filter(Boolean).join(', ')
                : relativeAge(release.at)
            }
            dim={isStale(release)}
          />
        ) : null}

        {/* Level below the dam, with how far it moved in three hours. Measured
            2026-08-12, this swings 8.19 ft at Table Rock and 7.67 ft at Bull
            Shoals between idle and full generation — and unlike the schedule it
            also catches water nobody announced.

            "elevation" is spelled in the value rather than left as a bare
            "710.79 ft": this is height above a vertical datum, and a number that
            size labelled "stage" reads as depth to anyone who has waded a river.

            Movement and age travel together — see tailwaterMovementSentence. */}
        {tailwaterStage ? (
          <Stat
            icon="resize-outline"
            label="Water level below dam"
            value={`${tailwaterStage.value.toFixed(2)} ft`}
            suffix="elevation"
            sub={tailwaterMovementSentence(tailwaterStage)}
            dim={isStale(tailwaterStage)}
          />
        ) : null}

        {tailwaterTemp ? (
          <Stat
            icon="thermometer-outline"
            label="Tailwater temp"
            value={`${tailwaterTemp.value.toFixed(1)} °F`}
            sub={tailwaterTemp.value < 60 ? 'cold release' : null}
            dim={isStale(tailwaterTemp)}
          />
        ) : null}

        {pool ? (
          <Stat
            icon="analytics-outline"
            label="Lake level"
            value={`${pool.value.toFixed(2)} ft`}
            sub={
              floodPool ? `${floodPool.value.toFixed(0)}% flood pool` : relativeAge(pool.at)
            }
            dim={isStale(pool)}
          />
        ) : null}

        {/* Inflow against release is what says whether the lake is filling, and
            so whether the Corps will have to run water in the days ahead.
            Stated as a bare number rather than a verdict: turning the pair into
            "the lake is rising" would ignore rainfall, evaporation and the pool
            the operator is actually targeting. */}
        {inflow ? (
          <Stat
            icon="enter-outline"
            label={inflow.dailyMean ? 'Inflow (daily avg)' : 'Inflow'}
            value={formatCfs(inflow.value)}
            // Age included for the same reason as the tailwater reading: this
            // shipped with only "into the lake" beneath it and no indication of
            // when it was measured, which on the two St. Louis dams is a daily
            // mean about a day in arrears.
            sub={[inflow.dailyMean ? 'daily average into the lake' : 'into the lake', relativeAge(inflow.at)]
              .filter(Boolean)
              .join(' · ')}
            dim={isStale(inflow)}
          />
        ) : null}

        {/* Declared in the registry, never inferred from the temperature
            reading. Norfork is a premier trout tailwater that publishes no
            water temperature at all, so inferring this would drop the label on
            exactly the fishery most worth naming. */}
        {dam.tailwaterFishery ? (
          <Stat
            icon="fish-outline"
            label="Below the dam"
            value={dam.tailwaterFishery === 'trout' ? 'Trout water' : 'Warm water'}
            sub={dam.tailwaterFishery === 'trout' ? 'cold year-round' : null}
          />
        ) : null}
      </View>

      {/* "nameplate" is spelled out because the generation console sizes
          everything against SWPA's SCHEDULING capacity, which is a different
          number for the same plant — 340 installed against 391 scheduled at
          Bull Shoals. Two bare megawatt figures on one screen read as a
          contradiction; two labelled ones read as what they are. */}
      {dam.nameplate ? (
        <Text style={[styles.plant, { color: colors.textSubtle }]}>
          {dam.nameplate.units} generating {dam.nameplate.units === 1 ? 'unit' : 'units'} ·{' '}
          {dam.nameplate.megawatts} MW nameplate
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 14, padding: 16, gap: 12 },
  observed: { fontSize: 14, lineHeight: 19, fontFamily: fonts.heading },
  chipRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  chipText: { ...t.sm, fontFamily: fonts.semibold },
  chipAside: { ...t.sm, flexShrink: 1 },
  nextChangeRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 5 },
  nextChange: { ...t.sm, fontFamily: fonts.semibold },
  nextChangeAside: { ...t.xs },
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  // A floor rather than a fixed width, so two stats share a row on a phone and
  // four fit on a tablet without a breakpoint.
  stat: { minWidth: 130, flexGrow: 1, flexBasis: '40%', gap: 2 },
  statLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statLabel: { ...t.xs, fontFamily: fonts.semibold, textTransform: 'uppercase' },
  statValue: { ...t.xl, fontFamily: fonts.heading },
  statSuffix: { ...t.sm, fontFamily: fonts.medium },
  statSub: { ...t.xs },
  plant: { ...t.xs },
});
