// eddy-ios/src/components/lake/LakeLevelCard.tsx
// The lake's level: the number, how it moved, where it sits against the
// documented pool, and the week behind it. The same facts in the same words
// as the web lake page (shared lake-status / lake-reading), in that order.
//
// A signed change, never a verdict: rising water is not automatically good on
// a lake, and the arrow carries no "good" colour.

import { StyleSheet, Text, View } from 'react-native';
import { ControlIcon } from '@/components/ControlIcon';
import { EddySymbol } from '@/components/EddySymbol';
import { lakeReadingIsStale, lakeReadingLabel } from '@eddy/conditions/lake-reading';
import { levelChangeLabel, poolPositionSentence } from '@eddy/conditions/lake-status';
import type { LakeSection } from '@eddy/conditions/lake-types';
import { useTheme } from '@/theme/ThemeProvider';
import { radii } from '@/theme/layout';
import { fonts, type as t } from '@/theme/typography';
import { LakeLevelChart } from './LakeLevelChart';

function Movement({ delta, hours }: { delta?: number; hours: number }) {
  const { colors } = useTheme();
  const label = levelChangeLabel(delta ?? null, hours);
  if (!label || delta === undefined) return null;
  const unchanged = Math.abs(delta) < 0.05;
  return (
    <View style={styles.movement}>
      <ControlIcon name={unchanged ? 'remove' : delta > 0 ? 'arrow-up' : 'arrow-down'} size={14} color={colors.textMuted} />
      <Text style={[styles.movementText, { color: colors.text }]}>{label}</Text>
    </View>
  );
}

export function LakeLevelCard({ lake, now }: { lake: LakeSection; now: number }) {
  const { colors, elevation } = useTheme();
  const pool = lake.pool;
  const stale = pool ? lakeReadingIsStale(pool, now) : false;
  return (
    <View style={[styles.card, { backgroundColor: colors.card }, elevation(2)]}>
      <View style={styles.header}>
        <EddySymbol name="gauge" size={28} />
        <Text style={[styles.title, { color: colors.text }]} accessibilityRole="header">Lake level</Text>
      </View>
      {pool ? (
        <View style={styles.reading}>
          <Text
            style={[styles.value, { color: stale ? colors.textMuted : colors.text }]}
            accessibilityLabel={`${pool.valueFt.toFixed(2)} feet elevation, ${lake.datum}`}
          >
            {pool.valueFt.toFixed(2)}<Text style={[styles.unit, { color: colors.textSubtle }]}> ft</Text>
          </Text>
          <Text style={[styles.note, { color: stale ? colors.agingText : colors.textSubtle }]}>
            {lakeReadingLabel(pool, now)} · Elevation {lake.datum}
          </Text>
          {!stale ? (
            <View style={styles.movements}>
              <Movement delta={lake.change24hFt} hours={24} />
              <Movement delta={lake.change7dFt} hours={168} />
            </View>
          ) : null}
          <Text style={[styles.sentence, { color: colors.text }]}>
            {poolPositionSentence(lake.poolPosition ?? null, pool.valueFt, lake.operatingRange ?? null)}
          </Text>
        </View>
      ) : (
        <Text style={[styles.sentence, { color: colors.textMuted }]}>Lake level is currently unavailable.</Text>
      )}
      {lake.history.length > 1 ? (
        <LakeLevelChart history={lake.history} conservationFt={lake.operatingRange?.conservationFt} now={now} timeZone={lake.timeZone} datum={lake.datum} />
      ) : (
        <Text style={[styles.note, { color: colors.textMuted }]}>Lake-level history is currently unavailable.</Text>
      )}
      {lake.operatingRange ? (
        <Text style={[styles.note, { color: colors.textSubtle }]}>
          {lake.operatingRange.source}. These are lake elevations, not water depths.
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radii.card, padding: 16, gap: 12 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { ...t.lg, fontFamily: fonts.heading, flexShrink: 1 },
  reading: { gap: 4 },
  value: { ...t['3xl'], fontFamily: fonts.monoMedium, fontVariant: ['tabular-nums'] },
  unit: { ...t.base, fontFamily: fonts.medium },
  note: { ...t.xs },
  movements: { gap: 2, marginTop: 4 },
  movement: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  movementText: { ...t.sm, fontFamily: fonts.semibold, fontVariant: ['tabular-nums'] },
  sentence: { ...t.sm, marginTop: 4 },
});
