// eddy-ios/src/components/dam/GenerationSchedule.tsx
// SWPA's hourly generation schedule for one dam — the part CWMS cannot give,
// and the reason the dam feature exists.
//
// ── Flexbox, not a chart ───────────────────────────────────────────────────
// The web version's day boxes were designed for this port: "there is neither a
// chart library nor react-native-svg" in this app, and none is needed. Twenty-
// four Views in a row with `flex: 1` and a percentage height IS the bar chart.
//
// ── Precision discipline, measured rather than assumed ─────────────────────
// Validated against CWMS turbine flow for Table Rock:
//   - idle hours are EXACT (0 MW scheduled matched ~20 cfs leakage every time)
//   - steady generation lands within ~10%
//   - RAMP hours ran -41% to +117% off, because units spin up partway through
//     the hour while CWMS reports an hourly average
// So the on/off PATTERN is stated plainly, cfs is always rounded with a "~",
// and a ramp hour shows NO number at all. Overstating what SWPA knows here
// would be telling someone it is safe to stand in a river.
//
// Hours are SWPA's own "hour ending" convention, and the arithmetic for it
// lives in @eddy/conditions/dam-schedule-copy so this screen and the website
// cannot drift: an off-by-one puts an angler in the water an hour early.

import { StyleSheet, Text, View } from 'react-native';
import type { DamScheduleDay } from '@eddy/types';
import {
  idleWindowSentence,
  retrievalSentence,
  scheduleDayLabel,
  scheduleIsStale,
} from '@eddy/conditions/dam-schedule-copy';
import { CollapsibleSection } from '@/components/CollapsibleSection';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';

function DayBars({ day }: { day: DamScheduleDay }) {
  const { colors } = useTheme();
  const peak = day.hours.reduce((max, h) => (h.megawatts > max ? h.megawatts : max), 0);

  return (
    <View>
      {/* Height encodes load; colour encodes ONLY on/off, because on/off is the
          part that measured exact. A 12% floor keeps an idle hour visible as a
          tick rather than a gap — an invisible bar reads as missing data. */}
      <View style={styles.bars} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
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
      </View>
      <View style={styles.barAxis}>
        <Text style={[styles.axisText, { color: colors.textSubtle }]}>midnight</Text>
        <Text style={[styles.axisText, { color: colors.textSubtle }]}>noon</Text>
        <Text style={[styles.axisText, { color: colors.textSubtle }]}>midnight</Text>
      </View>
    </View>
  );
}

function DayRow({ day, defaultExpanded }: { day: DamScheduleDay; defaultExpanded: boolean }) {
  const { colors } = useTheme();

  const generatingHours = day.hours.filter((h) => h.megawatts > 0).length;

  // Magnitude, only where the estimate is meaningful: steady hours with a real
  // load. Ramp hours are excluded by isRamp, because their cfs is unreliable.
  const steady = day.hours.filter((h) => !h.isRamp && h.cfs !== null);
  const low = steady.length > 0 ? Math.min(...steady.map((h) => h.cfs!)) : null;
  const high = steady.length > 0 ? Math.max(...steady.map((h) => h.cfs!)) : null;

  return (
    <CollapsibleSection
      title={scheduleDayLabel(day.scheduleDate)}
      // The summary is the whole point of collapsing this: a shut section must
      // still answer "when is the water off", which is what somebody opened the
      // screen to find out.
      summary={idleWindowSentence(day.idle)}
      defaultExpanded={defaultExpanded}
      trailing={
        <Text style={[styles.hoursCount, { color: colors.textSubtle }]}>
          {generatingHours === 0 ? 'idle' : `${generatingHours}/24 h`}
        </Text>
      }
    >
      <DayBars day={day} />
      {low !== null && high !== null ? (
        <Text style={[styles.estimate, { color: colors.textSubtle }]}>
          When running, roughly{' '}
          {low === high
            ? `${low.toLocaleString()} cfs`
            : `${low.toLocaleString()}–${high.toLocaleString()} cfs`}{' '}
          (estimated from scheduled megawatts)
        </Text>
      ) : null}
    </CollapsibleSection>
  );
}

export function GenerationSchedule({ schedule }: { schedule: DamScheduleDay[] }) {
  const { colors, elevation } = useTheme();

  if (schedule.length === 0) return null;

  // The block is only as fresh as its OLDEST day: the days come from different
  // files (mon.htm, tue.htm) with independent CDN ages, so the newest would
  // overstate it. One line for the section rather than one per day — three
  // near-identical timestamps invite the reader to think they differ.
  const oldestRetrieval = schedule.reduce<string | null>((oldest, day) => {
    if (!day.retrievedAt) return oldest;
    return !oldest || day.retrievedAt < oldest ? day.retrievedAt : oldest;
  }, null);
  const retrieval = retrievalSentence(oldestRetrieval);

  return (
    <View style={[styles.card, { backgroundColor: colors.card }, elevation(2)]}>
      <Text style={[styles.title, { color: colors.text }]}>Generation schedule</Text>
      <Text style={[styles.intro, { color: colors.textMuted }]}>
        Posted each afternoon by Southwestern Power Administration, in “hour
        ending” terms.
      </Text>

      <View style={styles.days}>
        {schedule.map((day, i) => (
          <DayRow key={day.scheduleDate} day={day} defaultExpanded={i === 0} />
        ))}
      </View>

      {/* Freshness and the "subject to change" disclaimer share one block on
          purpose: that disclaimer has to travel with the data everywhere it
          appears, and how old the data is means little without it.
          `retrieval` is null when the retrieval time is unknown, and unknown
          renders nothing — SWPA publishes no timestamp at all, so this is
          Eddy's fetch, never their post. */}
      <View style={[styles.footer, { borderTopColor: colors.border }]}>
        <Text style={[styles.footerText, { color: colors.textSubtle }]}>
          {retrieval ? (
            <Text
              style={{
                color: scheduleIsStale(oldestRetrieval) ? colors.error : colors.textSubtle,
              }}
            >
              {retrieval}{' '}
            </Text>
          ) : null}
          Schedules can change without notice — power demand, transmission
          constraints, generator outages and inflow all move them. Never wade or
          anchor below a dam without checking the horn and posted warnings.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 14, padding: 16 },
  title: { ...t.lg, fontFamily: fonts.display },
  intro: { ...t.sm, marginTop: 2 },
  days: { marginTop: 8 },
  bars: { flexDirection: 'row', alignItems: 'flex-end', height: 44, gap: 1, marginTop: 4 },
  bar: { flex: 1, borderRadius: 2 },
  barAxis: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 3 },
  axisText: { fontSize: 10, lineHeight: 14 },
  hoursCount: { ...t.xs },
  estimate: { ...t.xs, marginTop: 8 },
  footer: { borderTopWidth: 1, marginTop: 12, paddingTop: 10 },
  footerText: { ...t.xs },
});
