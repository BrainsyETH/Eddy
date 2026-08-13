// eddy-ios/src/components/dam/DayBars.tsx
// One day of SWPA's hourly schedule as twenty-four bars.
//
// ── Flexbox, not a chart ───────────────────────────────────────────────────
// Twenty-four Views in a row with `flex: 1` and a percentage height IS the bar
// chart. The app does have react-native-svg now, and this still does not need
// it: an Svg here would buy nothing and would put a native dependency inside a
// row that renders in a FlatList.
//
// ── Why it is its own file ─────────────────────────────────────────────────
// Two screens ask the same question. The dam screen shows three days in full;
// a favourited dam on the Favorites tab shows today, small, in a row. Those had
// better be the same drawing — a bar pattern somebody learns on one screen and
// re-reads on the other is only useful if it means the same thing — so the
// component takes a `compact` flag rather than being copied.
//
// ── THE SCALE IS THE PROJECT, NOT THE DAY ──────────────────────────────────
// This drew every day against that day's own peak, which meant a day running
// two units for four hours and a day running all eight flat out produced
// identical pictures. Comparing days is the entire reason three of them are on
// screen at once. Height is now scheduled megawatts over the project's SWPA
// scheduling capacity, so the same bar height means the same thing on every day
// and every dam — see scheduledBar in shared/dam-generation.ts.
//
// ── What the numbers may and may not claim ─────────────────────────────────
// Validated against CWMS turbine flow for Table Rock:
//   - idle hours are EXACT (0 MW scheduled matched ~20 cfs leakage every time)
//   - steady generation lands within ~10%
//   - RAMP hours ran -41% to +117% off, because units spin up partway through
//     the hour while CWMS reports an hourly average
// So height encodes load, colour encodes load in three steps of ONE hue, and
// the scale is labelled in megawatts — the number SWPA actually published —
// never in cfs. cfs is an estimate and belongs in the prose beneath, hedged.

import { useState } from 'react';
import { LayoutChangeEvent, StyleSheet, Text, View } from 'react-native';
import type { DamScheduleDay } from '@eddy/types';
import { hourEndingNow, scheduleHoursElapsed } from '@eddy/conditions/dam-schedule-copy';
import { scheduledBar, type GenerationReference } from '@eddy/conditions/dam-generation';
import { useTheme } from '@/theme/ThemeProvider';
import type { Palette } from '@/theme/palette';
import { fonts } from '@/theme/typography';

/** The gap between bars, in points. Also the arithmetic the marker has to undo. */
const BAR_GAP = 1;
const HOURS = 24;

interface Props {
  day: DamScheduleDay;
  /**
   * SWPA's published pair for this project. Absent on a payload from a deploy
   * older than the generation console, and the fallback below is what keeps
   * that build drawing something rather than nothing.
   */
  reference?: GenerationReference | null;
  /** Row context: shorter bars, no axis labels, no scale line. */
  compact?: boolean;
}

/**
 * Where the "now" line sits, in points from the left edge of the bar row.
 *
 * `flex: 1` bars separated by `gap` are NOT evenly spaced across the full
 * width: 24 bars carry 23 gaps between them, so a naive `hours / 24` drifts by
 * the whole gap total — 23pt on a phone, most of a bar — and by late evening
 * the marker points at the wrong hour. Solve for the bar width first, then
 * place the marker inside its own bar.
 */
function markerLeft(hoursElapsed: number, rowWidth: number): number {
  const barWidth = (rowWidth - BAR_GAP * (HOURS - 1)) / HOURS;
  const index = Math.min(Math.floor(hoursElapsed), HOURS - 1);
  const withinBar = hoursElapsed - index;
  return index * (barWidth + BAR_GAP) + withinBar * barWidth;
}

/**
 * The share of the plant an hour runs at, on the fixed project scale.
 *
 * Falls back to the day's own peak ONLY when the payload carries no reference —
 * an app newer than its server. That fallback is the old, misleading scaling,
 * so it is confined to the case where the alternative is no bars at all.
 */
function shareOf(
  megawatts: number,
  reference: GenerationReference | null | undefined,
  dayPeak: number
): number {
  const bar = scheduledBar(megawatts, reference);
  if (bar) return bar.fraction;
  return dayPeak > 0 ? megawatts / dayPeak : 0;
}

/**
 * Load in three steps of one hue, redundant with height.
 *
 * Never a green→yellow→red progression: those are the condition ladder's
 * colours and they would make the app appear to have issued a floatability call
 * about the reach below, which it has not.
 */
function barColor(share: number, generating: boolean, colors: Palette): string {
  if (!generating) return colors.border;
  if (share < 0.34) return colors.generationLow;
  if (share < 0.67) return colors.generationMid;
  return colors.generationHigh;
}

export function DayBars({ day, reference, compact = false }: Props) {
  const { colors } = useTheme();
  const [rowWidth, setRowWidth] = useState(0);

  const peak = day.hours.reduce((max, h) => (h.megawatts > max ? h.megawatts : max), 0);
  const peakShare = shareOf(peak, reference, peak);

  // Null on every day but today, which is the point — see scheduleHoursElapsed.
  const hoursElapsed = scheduleHoursElapsed(day.scheduleDate);
  const showMarker = hoursElapsed !== null && rowWidth > 0;

  const onLayout = (e: LayoutChangeEvent) => setRowWidth(e.nativeEvent.layout.width);

  return (
    <View>
      {/* THE SCALE, which this chart went without for too long. Bars with
          nothing naming what they are drawn against are a shape, not a
          measurement. Now it names BOTH halves: the day's own peak in SWPA's
          published megawatts, and what fraction of the plant that is — because
          the second is the number that makes two days comparable.
          A wholly idle day has no peak worth naming and prints nothing rather
          than "0 MW". */}
      {!compact && peak > 0 ? (
        <View style={styles.scaleRow}>
          <Text style={[styles.scaleText, { color: colors.textSubtle }]}>
            peaks at {Math.round(peak).toLocaleString()} MW
            {reference ? ` · ${Math.round(peakShare * 100)}% of capacity` : ''}
          </Text>
        </View>
      ) : null}

      <View
        style={[styles.bars, compact && styles.barsCompact]}
        onLayout={onLayout}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {/* Half capacity, as a hairline behind the bars. One reference line is
            enough to read a bar as "about two thirds" instead of "tall-ish",
            and a full gridline stack would out-weigh the data on a 44pt plot. */}
        {!compact ? (
          <View style={[styles.halfLine, { backgroundColor: colors.border }]} />
        ) : null}

        {/* A 12% floor keeps an idle hour visible as a tick rather than a gap —
            an invisible bar reads as missing data, which is a different fact. */}
        {day.hours.map((h) => {
          const share = shareOf(h.megawatts, reference, peak);
          const generating = h.megawatts > 0;
          // The elapsed part of today is context, not plan: the schedule is a
          // forward-looking document and what already happened is answered by
          // the pattern strip's measured bars instead.
          const past = hoursElapsed !== null && h.hourEnding <= Math.floor(hoursElapsed);
          return (
            <View
              key={h.hourEnding}
              style={[
                styles.bar,
                {
                  height: `${Math.max(share * 100, 12)}%`,
                  backgroundColor: barColor(share, generating, colors),
                  opacity: past ? 0.45 : 1,
                },
              ]}
            />
          );
        })}

        {/* Now. Drawn over the bars rather than under them so it survives a
            full-height bar, and in the accent rather than the teal the bars
            themselves use — a marker the same colour as the data is a bar with
            a strange edge. */}
        {showMarker ? (
          <View
            pointerEvents="none"
            style={[
              styles.nowLine,
              { backgroundColor: colors.accent, left: markerLeft(hoursElapsed, rowWidth) },
            ]}
          />
        ) : null}
      </View>

      {/* Four ticks instead of the three words this had, because "noon" alone
          left a reader counting bars to find 6 PM — the hour a weekday release
          most often starts. Still words rather than a 0-23 axis: nobody reads a
          release schedule in 24-hour time. */}
      {!compact ? (
        <View style={styles.barAxis}>
          <Text style={[styles.axisText, { color: colors.textSubtle }]}>midnight</Text>
          <Text style={[styles.axisText, { color: colors.textSubtle }]}>6 AM</Text>
          <Text style={[styles.axisText, { color: colors.textSubtle }]}>noon</Text>
          <Text style={[styles.axisText, { color: colors.textSubtle }]}>6 PM</Text>
          <Text style={[styles.axisText, { color: colors.textSubtle }]}>midnight</Text>
        </View>
      ) : null}
    </View>
  );
}

/**
 * "Generating now" / "No generation scheduled now", or null when the day is not
 * today.
 *
 * Lives here beside the marker because it is the SAME fact said in words, and
 * the bar row is hidden from VoiceOver — without this line the marker exists
 * only for people who can see it.
 *
 * That is also why the subject is the plant and not the water. This string is
 * the ONLY form of the fact a VoiceOver user gets, so it carries the whole
 * burden of not implying the river downstream is off — see idleWindowSentence
 * in shared/dam-schedule-copy.ts.
 */
export function nowSentence(day: DamScheduleDay): string | null {
  const hoursElapsed = scheduleHoursElapsed(day.scheduleDate);
  if (hoursElapsed === null) return null;
  const hour = day.hours.find((h) => h.hourEnding === hourEndingNow(hoursElapsed));
  if (!hour) return null;
  return hour.megawatts > 0 ? 'Generating now' : 'No generation scheduled now';
}

const styles = StyleSheet.create({
  scaleRow: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 6 },
  scaleText: { fontSize: 10, lineHeight: 14, fontFamily: fonts.medium },
  bars: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 44,
    gap: BAR_GAP,
    marginTop: 4,
  },
  barsCompact: { height: 26, marginTop: 6 },
  bar: { flex: 1, borderRadius: 2 },
  halfLine: { position: 'absolute', left: 0, right: 0, top: '50%', height: StyleSheet.hairlineWidth },
  nowLine: { position: 'absolute', top: -3, bottom: -3, width: 2, borderRadius: 1 },
  barAxis: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 3 },
  axisText: { fontSize: 10, lineHeight: 14 },
});

export const _test = { markerLeft, shareOf, barColor, BAR_GAP, HOURS };
