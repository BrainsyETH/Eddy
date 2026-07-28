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
// ── What the numbers may and may not claim ─────────────────────────────────
// Validated against CWMS turbine flow for Table Rock:
//   - idle hours are EXACT (0 MW scheduled matched ~20 cfs leakage every time)
//   - steady generation lands within ~10%
//   - RAMP hours ran -41% to +117% off, because units spin up partway through
//     the hour while CWMS reports an hourly average
// So height encodes load, COLOUR encodes only on/off, and the scale is labelled
// in megawatts — the number SWPA actually published — never in cfs. cfs is an
// estimate and belongs in the prose beneath, hedged.

import { useState } from 'react';
import { LayoutChangeEvent, StyleSheet, Text, View } from 'react-native';
import type { DamScheduleDay } from '@eddy/types';
import { hourEndingNow, scheduleHoursElapsed } from '@eddy/conditions/dam-schedule-copy';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts } from '@/theme/typography';

/** The gap between bars, in points. Also the arithmetic the marker has to undo. */
const BAR_GAP = 1;
const HOURS = 24;

interface Props {
  day: DamScheduleDay;
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

export function DayBars({ day, compact = false }: Props) {
  const { colors } = useTheme();
  const [rowWidth, setRowWidth] = useState(0);

  const peak = day.hours.reduce((max, h) => (h.megawatts > max ? h.megawatts : max), 0);

  // Null on every day but today, which is the point — see scheduleHoursElapsed.
  const hoursElapsed = scheduleHoursElapsed(day.scheduleDate);
  const showMarker = hoursElapsed !== null && rowWidth > 0;

  const onLayout = (e: LayoutChangeEvent) => setRowWidth(e.nativeEvent.layout.width);

  return (
    <View>
      {/* THE SCALE, which this chart went without for too long. Bars drawn to a
          per-day peak with nothing naming that peak are a shape, not a
          measurement: 24 bars at the same height mean "flat out" on one dam and
          "ticking over" on another, and the reader had no way to tell. The peak
          is SWPA's own scheduled megawatts, so it is quotable as published.
          A dam with a wholly idle day has no peak worth naming, and prints
          nothing rather than "0 MW". */}
      {!compact && peak > 0 ? (
        <View style={styles.scaleRow}>
          <Text style={[styles.scaleText, { color: colors.textSubtle }]}>
            peak {Math.round(peak).toLocaleString()} MW
          </Text>
        </View>
      ) : null}

      <View
        style={[styles.bars, compact && styles.barsCompact]}
        onLayout={onLayout}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {/* Half the peak, as a hairline behind the bars. One reference line is
            enough to read a bar as "about two thirds" instead of "tall-ish",
            and a full gridline stack would out-weigh the data on a 44pt plot. */}
        {!compact && peak > 0 ? (
          <View style={[styles.halfLine, { backgroundColor: colors.border }]} />
        ) : null}

        {/* Height encodes load; colour encodes ONLY on/off, because on/off is the
            part that measured exact. A 12% floor keeps an idle hour visible as a
            tick rather than a gap — an invisible bar reads as missing data. */}
        {day.hours.map((h) => {
          const share = peak > 0 ? h.megawatts / peak : 0;
          return (
            <View
              key={h.hourEnding}
              style={[
                styles.bar,
                {
                  height: `${Math.max(share * 100, 12)}%`,
                  backgroundColor: h.megawatts > 0 ? colors.interactive : colors.border,
                },
              ]}
            />
          );
        })}

        {/* Now. Drawn over the bars rather than under them so it survives a
            full-height bar, and in the accent rather than the interactive teal
            the bars themselves use — a marker the same colour as the data is a
            bar with a strange edge. */}
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
 * "Generating now" / "Water off now", or null when the day is not today.
 *
 * Lives here beside the marker because it is the SAME fact said in words, and
 * the bar row is hidden from VoiceOver — without this line the marker exists
 * only for people who can see it.
 */
export function nowSentence(day: DamScheduleDay): string | null {
  const hoursElapsed = scheduleHoursElapsed(day.scheduleDate);
  if (hoursElapsed === null) return null;
  const hour = day.hours.find((h) => h.hourEnding === hourEndingNow(hoursElapsed));
  if (!hour) return null;
  return hour.megawatts > 0 ? 'Generating now' : 'Water off now';
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

export const _test = { markerLeft, BAR_GAP, HOURS };
