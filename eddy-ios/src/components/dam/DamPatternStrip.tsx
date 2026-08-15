// eddy-ios/src/components/dam/DamPatternStrip.tsx
// The rhythm: what this powerhouse actually did for the past week, and what it
// is scheduled to do for the next few days, on one fixed scale.
//
// Ported from the web strip, same rules, same shared arithmetic.
//
// ── Why this section is worth its screen ───────────────────────────────────
// "Start watching these patterns a week or two before you visit" is the advice
// every tailwater guide gives, and nobody publishes the thing that would let
// you follow it. A dam that runs mornings on weekdays and all day Saturday is a
// fact you can plan a trip around; no single current reading contains it.
//
// ── The rule that keeps it honest ──────────────────────────────────────────
// THE PAST COMES FROM OBSERVATIONS, THE FUTURE FROM SCHEDULES, AND THEY ARE
// DRAWN DIFFERENTLY. An old schedule is what was PLANNED; redrawing it as
// history would present a plan as a record of the river. Observed hours are
// solid, scheduled hours are outlined, and today's row switches from one to the
// other at the now marker — exactly where what Eddy knows changes.
//
// A third treatment exists for hours with NO observation, and it is not the
// idle treatment. A gap drawn as an empty bar says the units were off, which is
// a claim about the river during an outage.

import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { DamPatternDay, DamScheduleDay } from '@eddy/types';
// Row construction lives in shared/ because it was written twice, once per
// platform, and every rule it encodes — the past is measured, the future is
// planned, a gap is neither — is one a port can quietly get backwards.
import {
  patternRowLabel as rowLabel,
  patternRowVoiceOver as rowVoiceOver,
  patternRows,
  type GenerationReference,
  type PatternRow as Row,
} from '@eddy/conditions/dam-generation';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';

export function DamPatternStrip({
  pattern,
  schedule,
  reference,
  generationFloorCfs,
}: {
  pattern: DamPatternDay[];
  schedule: DamScheduleDay[];
  reference?: GenerationReference | null;
  generationFloorCfs?: number;
}) {
  const { colors, elevation } = useTheme();

  const rows = useMemo<Row[]>(
    () => patternRows(pattern, schedule, reference, generationFloorCfs),
    [pattern, schedule, reference, generationFloorCfs]
  );

  if (rows.length === 0) return null;
  const todayIndex = rows.findIndex((r) => r.today);

  return (
    <View style={[styles.card, { backgroundColor: colors.card }, elevation(2)]}>
      <Text style={[styles.title, { color: colors.text }]}>Generation pattern</Text>
      {/* A legend, not a paragraph. The prose said "hatched" while the drawing
          used dashed outlines — a mismatch that survives review precisely
          because nobody reads the sentence and the picture at the same time. */}
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendSwatch, { backgroundColor: colors.generationHigh }]} />
          <Text style={[styles.legendText, { color: colors.textMuted }]}>Measured</Text>
        </View>
        <View style={styles.legendItem}>
          <View
            style={[
              styles.legendSwatch,
              { borderWidth: StyleSheet.hairlineWidth, borderColor: colors.generationMid },
            ]}
          />
          <Text style={[styles.legendText, { color: colors.textMuted }]}>Scheduled</Text>
        </View>
        <View style={styles.legendItem}>
          <View
            style={[
              styles.legendSwatch,
              {
                borderWidth: StyleSheet.hairlineWidth,
                borderStyle: 'dashed',
                borderColor: colors.border,
              },
            ]}
          />
          <Text style={[styles.legendText, { color: colors.textMuted }]}>No reading</Text>
        </View>
      </View>

      <View style={styles.rows}>
        {rows.map((row, index) => (
          <View key={row.dayKey}>
            {/* The line between what happened and what is planned. */}
            {todayIndex >= 0 && index === todayIndex + 1 ? (
              <View style={[styles.divider, { borderTopColor: colors.border }]} />
            ) : null}
            <View style={styles.row}>
              <Text
                style={[
                  styles.rowLabel,
                  { color: row.today ? colors.text : colors.textSubtle },
                  row.today && { fontFamily: fonts.heading },
                ]}
              >
                {rowLabel(row.dayKey, row.today)}
              </Text>

              <View
                style={styles.bars}
                accessible
                accessibilityRole="image"
                accessibilityLabel={rowVoiceOver(row)}
              >
                {/* Each hour is a fixed 1/24 slot with the bar inset inside it,
                    rather than 24 flexed bars separated by `gap`. The gap
                    version is one bar-width narrower than it looks — 24 bars
                    carry 23 gaps — so a marker placed by percentage drifts
                    across the day. DayBars solves that with markerLeft()
                    because it already measures its own width; here the slot IS
                    exactly 1/24, so the marker below needs no correction. */}
                {row.cells.map((cell, i) => (
                  <View key={i} style={styles.slot}>
                    {cell.kind === 'missing' ? (
                      <View style={[styles.gap, { borderColor: colors.border }]} />
                    ) : cell.kind === 'scheduled' ? (
                      <View
                        style={[
                          styles.bar,
                          {
                            height: `${Math.max(cell.fraction * 100, 14)}%`,
                            borderWidth: StyleSheet.hairlineWidth,
                            // `generating`, not `fraction > 0`: without a
                            // reference every fraction is 0, and a full-load
                            // hour would draw in the idle treatment.
                            borderColor: cell.generating ? colors.generationMid : colors.border,
                            backgroundColor: 'transparent',
                          },
                        ]}
                      />
                    ) : (
                      <View
                        style={[
                          styles.bar,
                          {
                            height: `${Math.max(cell.fraction * 100, 14)}%`,
                            backgroundColor: cell.generating
                              ? colors.generationHigh
                              : colors.border,
                          },
                        ]}
                      />
                    )}
                  </View>
                ))}

                {/* Now, on today's row only. The solid-to-outlined switch marks
                    the same instant, but only for someone who can tell the two
                    fills apart at 18pt tall. */}
                {/* Drawn from the row's OWN split rather than elapsed/24: on a
                    23- or 25-hour day the two disagree by a whole bar, and the
                    boundary between measured and scheduled cells is the instant
                    the marker is trying to name anyway. */}
                {row.splitIndex !== null ? (
                  <View
                    pointerEvents="none"
                    style={[
                      styles.nowLine,
                      {
                        backgroundColor: colors.accent,
                        left: `${(row.splitIndex / row.cells.length) * 100}%`,
                      },
                    ]}
                  />
                ) : null}
              </View>

              <Text
                style={[
                  styles.rowTag,
                  { color: row.scheduleStale ? colors.accent : colors.textSubtle },
                ]}
              >
                {row.today ? 'now' : row.scheduled ? (row.scheduleStale ? 'stale' : 'ahead') : ''}
              </Text>
            </View>
          </View>
        ))}
      </View>

      <Text style={[styles.footer, { color: colors.textSubtle, borderTopColor: colors.border }]}>
        Central time, at the dam. A pattern is a habit, not a promise — schedules change
        without notice, and a change at the dam does not reach every downstream location
        at the same time.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 14, padding: 16, gap: 10 },
  title: { ...t.lg, fontFamily: fonts.display },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendSwatch: { width: 10, height: 12, borderRadius: 1 },
  legendText: { fontSize: 11, lineHeight: 15 },
  rows: { gap: 3 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rowLabel: { width: 40, fontSize: 10, lineHeight: 14, fontVariant: ['tabular-nums'] },
  rowTag: { width: 36, fontSize: 9, lineHeight: 13, textAlign: 'right' },
  bars: { flex: 1, flexDirection: 'row', alignItems: 'flex-end', height: 18 },
  slot: { flex: 1, height: '100%', justifyContent: 'flex-end', paddingHorizontal: 0.5 },
  bar: { width: '100%', borderRadius: 1 },
  nowLine: { position: 'absolute', top: -2, bottom: -2, width: 2, borderRadius: 1 },
  gap: { width: '100%', height: '100%', borderRadius: 1, borderWidth: StyleSheet.hairlineWidth, borderStyle: 'dashed' },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderStyle: 'dashed', marginVertical: 6 },
  footer: { fontSize: 11, lineHeight: 15, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 10 },
});
