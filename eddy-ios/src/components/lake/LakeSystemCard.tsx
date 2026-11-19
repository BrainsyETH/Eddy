// eddy-ios/src/components/lake/LakeSystemCard.tsx
// The lake's neighbours, upstream to downstream: what feeds it, the dam that
// holds it, where the release goes. Each row opens the screen Eddy already has
// for it, which is the point: the lake screen links the river and dam screens
// instead of repeating them.
//
// Copy is shared with the web card (lake-system). Observations only; the dam
// screen keeps the schedule and its caveat.

import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRouter } from 'expo-router';
import { ControlIcon } from '@/components/ControlIcon';
import { EddySymbol, type EddySymbolName } from '@/components/EddySymbol';
import { LAKE_SYSTEM_STAGE_LABELS, lakeSystemRowCopy, lakeSystemRowRelation } from '@eddy/conditions/lake-system';
import type { LakeSystemRow, LakeSystemStage } from '@eddy/conditions/lake-types';
import { previousRouteIs } from '@/lib/stackReturn';
import { useTheme } from '@/theme/ThemeProvider';
import { radii } from '@/theme/layout';
import { fonts, type as t } from '@/theme/typography';

const STAGES: LakeSystemStage[] = ['coming_in', 'dam', 'below'];

function rowIcon(row: LakeSystemRow): EddySymbolName {
  if (row.kind === 'inflow') return 'inflow';
  if (row.kind === 'river') return 'river';
  return row.stage === 'below' ? 'gauge' : 'dam';
}

function rowKey(row: LakeSystemRow): string {
  return row.kind === 'river' ? `river:${row.slug}` : row.kind === 'dam' ? `dam:${row.damId}` : 'inflow';
}

function Row({ row, now }: { row: LakeSystemRow; now: number }) {
  const { colors } = useTheme();
  const router = useRouter();
  const navigation = useNavigation();
  const copy = lakeSystemRowCopy(row, now);
  if (!copy) return null;
  const relation = lakeSystemRowRelation(row);
  const facts = copy.facts.join(' · ');
  const age = copy.age ? `${copy.age}${copy.stale ? ' · Outdated' : ''}` : null;
  // A dam row that points at the screen this lake was opened from goes BACK
  // to it. The dam screen links here and this row links there; pushing each
  // way grew the history by two screens per round trip (stackReturn.ts).
  // Every other row is a new place and is pushed.
  const open = row.kind === 'river'
    ? () => router.push({ pathname: '/river/[slug]', params: { slug: row.slug } })
    : row.kind === 'dam'
      ? () => {
          if (previousRouteIs(navigation.getState(), 'dam/[damId]', 'damId', row.damId)) navigation.goBack();
          else router.push({ pathname: '/dam/[damId]', params: { damId: row.damId } });
        }
      : null;
  const body = (
    <>
      <EddySymbol name={rowIcon(row)} size={28} />
      <View style={styles.rowText}>
        <Text style={[styles.name, { color: colors.text }]}>{copy.title}</Text>
        {relation ? <Text style={[styles.note, { color: colors.textSubtle }]}>{relation}</Text> : null}
        {facts ? <Text style={[styles.facts, { color: copy.stale ? colors.textMuted : colors.text }]}>{facts}</Text> : null}
        {age ? <Text style={[styles.note, { color: copy.stale ? colors.agingText : colors.textSubtle }]}>{age}</Text> : null}
      </View>
      {open ? <ControlIcon name="chevron-forward" size={16} color={colors.textMuted} /> : null}
    </>
  );
  const label = [copy.title, relation, facts, age].filter(Boolean).join('. ');
  return open ? (
    <Pressable onPress={open} accessibilityRole="button" accessibilityLabel={label}
      style={({ pressed }) => [styles.row, { opacity: pressed ? 0.6 : 1 }]}>
      {body}
    </Pressable>
  ) : (
    <View style={styles.row} accessible accessibilityLabel={label}>{body}</View>
  );
}

export function LakeSystemCard({ rows, now }: { rows: LakeSystemRow[]; now: number }) {
  const { colors, elevation } = useTheme();
  const groups = STAGES.map((stage) => ({ stage, rows: rows.filter((row) => row.stage === stage) })).filter((group) => group.rows.length > 0);
  if (groups.length === 0) return null;
  return (
    <View style={[styles.card, { backgroundColor: colors.card }, elevation(2)]}>
      <View style={styles.header}>
        <EddySymbol name="river" size={28} />
        <Text style={[styles.title, { color: colors.text }]} accessibilityRole="header">Water in and out</Text>
      </View>
      {groups.map((group, index) => (
        <View key={group.stage} style={index > 0 ? [styles.group, { borderTopColor: colors.border }] : undefined}>
          <Text style={[styles.stage, { color: colors.textSubtle }]} accessibilityRole="header">{LAKE_SYSTEM_STAGE_LABELS[group.stage]}</Text>
          {group.rows.map((row) => <Row key={rowKey(row)} row={row} now={now} />)}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radii.card, padding: 16, gap: 10 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { ...t.lg, fontFamily: fonts.heading, flexShrink: 1 },
  group: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 10 },
  stage: { ...t.xs, fontFamily: fonts.semibold },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44, paddingVertical: 6 },
  rowText: { flex: 1, gap: 1 },
  name: { ...t.base, fontFamily: fonts.heading },
  facts: { ...t.sm },
  note: { ...t.xs },
});
