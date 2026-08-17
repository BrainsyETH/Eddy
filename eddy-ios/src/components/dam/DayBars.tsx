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

import { useMemo, useState } from 'react';
import { LayoutChangeEvent, PanResponder, StyleSheet, Text, View } from 'react-native';
import type { DamScheduleDay, ScheduledHour } from '@eddy/types';
import {
  hourEndingLabel,
  hourEndingNow,
  scheduleHoursElapsed,
} from '@eddy/conditions/dam-schedule-copy';
import {
  scheduledBar,
  type GenerationReference,
  type SchedulePeak,
} from '@eddy/conditions/dam-generation';
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
  /**
   * The day's peak, from the SAME derivation the line above the chart prints.
   *
   * Passed in rather than recomputed here on purpose: a highlight built from a
   * second call would be free to disagree with the words over it, which is the
   * one thing a highlight must never do. Absent in the compact row, where there
   * is no headline for it to agree with.
   */
  peakSchedule?: SchedulePeak | null;
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
/**
 * Where a block of hours sits, in points, as {left, width}.
 *
 * The same bar-and-gap arithmetic markerLeft solves for a single instant, run
 * over a span: `flex: 1` bars carry 23 gaps between 24 of them, so a highlight
 * placed by percentage drifts by most of a bar by evening and would tint the
 * wrong hours — the failure that matters most on precisely the block the chart
 * is drawing attention to.
 *
 * `from`/`to` are SWPA hour-endings, so hour-ending 17 is the bar for 4–5 PM
 * and its index is 16.
 */
function runBounds(
  from: number,
  to: number,
  rowWidth: number
): { left: number; width: number } {
  const barWidth = (rowWidth - BAR_GAP * (HOURS - 1)) / HOURS;
  const startIndex = Math.max(0, from - 1);
  const endIndex = Math.min(HOURS - 1, to - 1);
  const left = startIndex * (barWidth + BAR_GAP);
  const width = (endIndex - startIndex + 1) * barWidth + (endIndex - startIndex) * BAR_GAP;
  return { left, width };
}

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

/**
 * The readout for one scrubbed hour.
 *
 * Mirrors the web timeline's line exactly, including what it refuses to print:
 * a ramp hour's cfs estimate ran -41% to +117% against CWMS, so the number is
 * withheld there and only the load is shown.
 */
function hourReadout(
  hour: ScheduledHour,
  reference: GenerationReference | null | undefined,
  dayPeak: number
): string {
  const window = `${hourEndingLabel(hour.hourEnding)}–${hourEndingLabel(hour.hourEnding + 1)}`;
  if (hour.megawatts <= 0) return `${window} · no generation scheduled`;
  const share = reference
    ? ` · ${Math.round(shareOf(hour.megawatts, reference, dayPeak) * 100)}% of capacity`
    : '';
  const flow = hour.isRamp || hour.cfs === null ? '' : ` · ~${hour.cfs.toLocaleString()} cfs`;
  return `${window} · ${hour.megawatts.toLocaleString()} MW${share}${flow}`;
}

export function DayBars({ day, reference, compact = false, peakSchedule = null }: Props) {
  const { colors } = useTheme();
  const [rowWidth, setRowWidth] = useState(0);
  const [scrubbed, setScrubbed] = useState<number | null>(null);

  // Sorted by hour ending before anything positional touches it. The parser
  // currently guarantees 24 hours emitted 1..24, but bars render in ARRAY
  // order while the now marker and the scrub readout are both keyed by
  // hourEnding — so this component drawing from raw wire order would quietly
  // depend on that guarantee holding forever, and an unsorted day would put a
  // different hour under the finger than under the marker. The shared walkers
  // refuse iteration order for the same reason; the web timeline indexes by
  // hourEnding to the same end.
  const hours = useMemo(
    () => [...day.hours].sort((a, b) => a.hourEnding - b.hourEnding),
    [day.hours]
  );

  const peak = hours.reduce((max, h) => (h.megawatts > max ? h.megawatts : max), 0);

  // Null on every day but today, which is the point — see scheduleHoursElapsed.
  const hoursElapsed = scheduleHoursElapsed(day.scheduleDate);
  const showMarker = hoursElapsed !== null && rowWidth > 0;

  const onLayout = (e: LayoutChangeEvent) => setRowWidth(e.nativeEvent.layout.width);

  /**
   * Scrub, at the ROW level.
   *
   * ── Why not a target per bar ───────────────────────────────────────────────
   * Twenty-four bars across a phone is about 14pt each, far under the 44pt
   * floor DESIGN.md §6 sets and PinCallout calls non-negotiable. So the row is
   * the control: 44pt tall, one gesture, one readout line above it. This is the
   * same answer the web timeline reaches with pointer and arrow keys.
   *
   * Not offered in `compact`: that variant renders inside a FlatList row that
   * is itself a link, and a horizontal pan there would fight the list.
   */
  const responder = useMemo(() => {
    // Rebuilt when the measured width changes rather than reading a ref inside
    // the handlers: a ref read during render is exactly what react-hooks/refs
    // forbids, and the width only changes on layout — an orientation flip, not
    // a gesture.
    const hourAt = (x: number): number | null => {
      if (!rowWidth) return null;
      return Math.max(0, Math.min(HOURS - 1, Math.floor((x / rowWidth) * HOURS)));
    };
    return PanResponder.create({
      onStartShouldSetPanResponder: () => !compact,
      onMoveShouldSetPanResponder: () => !compact,
      onPanResponderGrant: (e) => setScrubbed(hourAt(e.nativeEvent.locationX)),
      onPanResponderMove: (e) => setScrubbed(hourAt(e.nativeEvent.locationX)),
      onPanResponderRelease: () => setScrubbed(null),
      onPanResponderTerminate: () => setScrubbed(null),
    });
  }, [compact, rowWidth]);

  const scrubbedHour =
    scrubbed === null ? null : hours.find((h) => h.hourEnding === scrubbed + 1) ?? null;

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
          {/* One readout line, replacing per-bar tooltips. It holds the day's
              scale until something is scrubbed so the space never jumps. */}
          {/* ── THE PEAK LINE MOVED OUT AND UP ──────────────────────────
              This read "peaks at 335 MW · 86% of capacity", which repeated the
              headline above the chart in the unit the schedule is published in
              rather than the one anybody fishes in. The peak is stated once
              now, over the chart, in cfs and hours — and the highlight below
              shows it rather than restating it.

              The row still renders, holding a space, because it is where a
              scrubbed hour reports itself. Collapsing it when idle would make
              the chart jump the first time a finger touched it. */}
          <Text style={[styles.scaleText, { color: colors.textSubtle }]} numberOfLines={1}>
            {scrubbedHour ? hourReadout(scrubbedHour, reference, peak) : ' '}
          </Text>
        </View>
      ) : null}

      {/* ── WHEN THE PEAK RUNS, AS A WINDOW ─────────────────────────────────
          A vertical line would name an instant, and a peak is not an instant —
          it is four hours of full load, and somebody deciding when to be off
          the gravel needs the span. So each contiguous block gets a bracket the
          width of its own bars, and the bars themselves are tinted beneath it.

          EVERY block, never just the first: a plant that peaks twice is the
          commonest shape there is, and a highlight over one of two would
          contradict a headline that names both.

          Teal — the generation family's own colour — and never the accent, which
          belongs to Now below. Two markers in one hue on one chart is how a
          reader comes to think the peak is happening right now. */}
      {!compact && peakSchedule && rowWidth > 0 && peakSchedule.windows.length > 0 ? (
        <View pointerEvents="none" style={styles.peakRow}>
          {peakSchedule.windows.map((w) => {
            const { left, width } = runBounds(w.from, w.to, rowWidth);
            return (
              <View
                key={`${w.from}-${w.to}`}
                style={[styles.peakBracket, { left, width, borderColor: colors.generationHigh }]}
              />
            );
          })}
          <Text style={[styles.peakCaption, { color: colors.generationHigh }]}>Peak window</Text>
        </View>
      ) : null}

      <View
        style={[styles.bars, compact && styles.barsCompact]}
        onLayout={onLayout}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        {...responder.panHandlers}
      >
        {/* The peak hours, tinted behind their own bars. The bracket above
            names the span; this is what ties the name to the bars it is about,
            and it is deliberately faint — the bars are the data and a wash that
            competed with them would be a second chart. */}
        {!compact && peakSchedule && rowWidth > 0
          ? peakSchedule.windows.map((w) => {
              const { left, width } = runBounds(w.from, w.to, rowWidth);
              return (
                <View
                  key={`tint-${w.from}-${w.to}`}
                  pointerEvents="none"
                  style={[styles.peakTint, { left, width, backgroundColor: colors.generationHigh }]}
                />
              );
            })
          : null}

        {/* Half capacity, as a hairline behind the bars. One reference line is
            enough to read a bar as "about two thirds" instead of "tall-ish",
            and a full gridline stack would out-weigh the data on a 44pt plot. */}
        {!compact ? (
          <View style={[styles.halfLine, { backgroundColor: colors.border }]} />
        ) : null}

        {/* A 12% floor keeps an idle hour visible as a tick rather than a gap —
            an invisible bar reads as missing data, which is a different fact. */}
        {hours.map((h) => {
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
                scrubbed === h.hourEnding - 1 && {
                  borderWidth: 1,
                  borderColor: colors.text,
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
      {/* NAMED, because an unlabelled coral line beside a labelled teal window
          invites the reader to take it for part of the same mark. */}
      {!compact && showMarker && rowWidth > 0 ? (
        <View pointerEvents="none" style={styles.nowRow}>
          <Text
            style={[
              styles.nowLabel,
              { color: colors.accent, left: markerLeft(hoursElapsed, rowWidth) - 12 },
            ]}
          >
            Now
          </Text>
        </View>
      ) : null}

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
 * What the SCHEDULE says about the hour running right now, or null when the day
 * is not today.
 *
 * Lives here beside the marker because it is the SAME fact said in words, and
 * the bar row is hidden from VoiceOver — without this line the marker exists
 * only for people who can see it.
 *
 * ── Why it no longer says "Generating now" ─────────────────────────────────
 * Because it never knew that. This function reads `day.hours`, which is SWPA's
 * plan; whether the units are actually turning is `DamSnapshot.generating`,
 * read from CWMS, and the two can disagree whenever a unit trips or a schedule
 * is revised after Eddy fetched it. It rendered in a collapsed section header
 * directly under a hero capable of saying "No turbine generation observed",
 * which put a measurement and a plan on adjacent lines in the same voice, both
 * present tense, with nothing to tell them apart.
 *
 * "This hour" rather than "now" for the same reason hourEndingLabel exists:
 * the schedule's unit of truth is the hour, not the instant.
 *
 * ── Why it returns a flag beside the label ─────────────────────────────────
 * GenerationSchedule colours its header from this, and it used to decide by
 * comparing the string against a literal — so when the wording above changed,
 * the comparison silently went permanently false and the accent highlight
 * died with nobody the wiser. A styling decision may not hang off copy;
 * `generating` carries the fact and the label carries the words.
 */
export function nowSentence(
  day: DamScheduleDay
): { generating: boolean; label: string } | null {
  const hoursElapsed = scheduleHoursElapsed(day.scheduleDate);
  if (hoursElapsed === null) return null;
  const hour = day.hours.find((h) => h.hourEnding === hourEndingNow(hoursElapsed));
  if (!hour) return null;
  const generating = hour.megawatts > 0;
  // ── SHORT, BECAUSE IT IS NO LONGER THE ONLY THING SAYING THIS ──────────
  // This read "Generation scheduled this hour", which is a whole sentence in a
  // collapsed row header that now sits directly beneath a NEXT SCHEDULED
  // CHANGE panel naming the hour it stops. The row's job is narrower: what the
  // plan says about the hour running right now.
  //
  // "Scheduled" stays in the words. Every string on this row reads a PLAN, and
  // a bare "On now" beside an observed turbine reading three inches above is
  // exactly the confusion the two-clause rule exists to prevent.
  return {
    generating,
    label: generating ? 'Scheduled on now' : 'Scheduled off now',
  };
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
  // The bracket sits in its own 14pt band above the bars: inside the plot it
  // would compete with a full-height bar, and below it would collide with the
  // hour axis.
  peakRow: { height: 14, marginTop: 2 },
  peakBracket: {
    position: 'absolute',
    bottom: 0,
    height: 5,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderTopLeftRadius: 2,
    borderTopRightRadius: 2,
  },
  peakCaption: { fontSize: 9, lineHeight: 12, fontFamily: fonts.medium, textAlign: 'center' },
  // Faint enough to stay behind the data. The bars draw over it either way, so
  // this only ever shows in the air above them.
  peakTint: { position: 'absolute', top: 0, bottom: 0, borderRadius: 2, opacity: 0.1 },
  nowRow: { height: 12 },
  nowLabel: { position: 'absolute', top: 0, width: 24, fontSize: 9, lineHeight: 12, textAlign: 'center', fontFamily: fonts.medium },
  barAxis: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 3 },
  axisText: { fontSize: 10, lineHeight: 14 },
});

export const _test = { markerLeft, shareOf, barColor, BAR_GAP, HOURS };
