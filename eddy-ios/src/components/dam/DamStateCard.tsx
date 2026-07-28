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
// ── Why the generating chip is not a condition colour ──────────────────────
// It uses `accent`, never conditionColor(). CONDITION_SYSTEM's palette means
// "should you float this river", and generating/idle is not that verdict — it
// is a fact about machinery. Painting "Generating" in the `dangerous` red would
// make the app appear to have issued a floatability call it has not made, on a
// reach it may not even carry.

import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { DamSnapshot } from '@eddy/types';
import { relativeAge } from '@eddy/conditions/dam-schedule-copy';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';

function formatCfs(value: number): string {
  return `${Math.round(value).toLocaleString()} cfs`;
}

interface StatProps {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  value: string;
  sub?: string | null;
  /** A stale reading stays visible and loses emphasis. */
  dim?: boolean;
}

function Stat({ icon, label, value, sub, dim }: StatProps) {
  const { colors } = useTheme();
  return (
    <View style={styles.stat}>
      <View style={styles.statLabelRow}>
        <Ionicons name={icon} size={12} color={colors.textSubtle} />
        <Text style={[styles.statLabel, { color: colors.textSubtle }]}>{label}</Text>
      </View>
      <Text style={[styles.statValue, { color: dim ? colors.textMuted : colors.text }]}>
        {value}
      </Text>
      {sub ? <Text style={[styles.statSub, { color: colors.textSubtle }]}>{sub}</Text> : null}
    </View>
  );
}

export function DamStateCard({ dam }: { dam: DamSnapshot }) {
  const { colors, elevation } = useTheme();

  const release = dam.metrics.release;
  const pool = dam.metrics.poolElevation;
  const floodPool = dam.metrics.pctFloodPool;
  const tailwaterTemp = dam.metrics.tailwaterTempF;
  const generationFlow = dam.metrics.generationFlow;

  return (
    <View style={[styles.card, { backgroundColor: colors.card }, elevation(2)]}>
      {/* Generating or not, first and in words.
          `generating` is NULL — not false — for a dam that publishes no turbine
          flow, and null must render nothing. Stockton and Truman are SWPA
          schedule entries with no CWMS feed at all; printing "Not generating"
          for them would be an observation nobody made. */}
      {dam.generating !== null ? (
        <View style={styles.chipRow}>
          <View
            style={[
              styles.chip,
              {
                backgroundColor: dam.generating ? colors.accent : colors.cardRaised,
                borderColor: dam.generating ? colors.accent : colors.border,
              },
            ]}
          >
            <Ionicons
              name={dam.generating ? 'flash' : 'flash-off-outline'}
              size={13}
              color={dam.generating ? colors.onAccent : colors.textMuted}
            />
            <Text
              style={[
                styles.chipText,
                { color: dam.generating ? colors.onAccent : colors.textMuted },
              ]}
            >
              {dam.generating ? 'Generating now' : 'Not generating'}
            </Text>
          </View>
          {generationFlow ? (
            <Text style={[styles.chipAside, { color: colors.textSubtle }]}>
              {formatCfs(generationFlow.value)} through the turbines
            </Text>
          ) : null}
        </View>
      ) : null}

      <View style={styles.statGrid}>
        {release ? (
          <Stat
            icon="water-outline"
            label={release.dailyMean ? 'Release (daily avg)' : 'Releasing'}
            value={formatCfs(release.value)}
            sub={
              release.dailyMean
                ? ['daily average', relativeAge(release.at)].filter(Boolean).join(', ')
                : relativeAge(release.at)
            }
            dim={release.staleness === 'stale'}
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
            dim={pool.staleness === 'stale'}
          />
        ) : null}

        {tailwaterTemp ? (
          <Stat
            icon="thermometer-outline"
            label="Tailwater"
            value={`${tailwaterTemp.value.toFixed(1)} °F`}
            sub={tailwaterTemp.value < 60 ? 'cold release' : null}
            dim={tailwaterTemp.staleness === 'stale'}
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

      {dam.nameplate ? (
        <Text style={[styles.plant, { color: colors.textSubtle }]}>
          {dam.nameplate.units} {dam.nameplate.units === 1 ? 'unit' : 'units'} ·{' '}
          {dam.nameplate.megawatts} MW
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 14, padding: 16, gap: 12 },
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
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  // A floor rather than a fixed width, so two stats share a row on a phone and
  // four fit on a tablet without a breakpoint.
  stat: { minWidth: 130, flexGrow: 1, flexBasis: '40%', gap: 2 },
  statLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statLabel: { ...t.xs, fontFamily: fonts.semibold, textTransform: 'uppercase' },
  statValue: { ...t.xl, fontFamily: fonts.heading },
  statSub: { ...t.xs },
  plant: { ...t.xs },
});
