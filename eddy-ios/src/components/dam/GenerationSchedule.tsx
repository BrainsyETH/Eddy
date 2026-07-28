// eddy-ios/src/components/dam/GenerationSchedule.tsx
// SWPA's hourly generation schedule for one dam — the part CWMS cannot give,
// and the reason the dam feature exists.
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
//
// The bars themselves live in ./DayBars, shared with the Favorites row.

import { StyleSheet, Text, View } from 'react-native';
import type { DamScheduleDay } from '@eddy/types';
import {
  idleWindowSentence,
  retrievalSentence,
  scheduleDayLabel,
  scheduleIsStale,
} from '@eddy/conditions/dam-schedule-copy';
import { CollapsibleSection } from '@/components/CollapsibleSection';
import { DayBars, nowSentence } from '@/components/dam/DayBars';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';

function DayRow({ day, defaultExpanded }: { day: DamScheduleDay; defaultExpanded: boolean }) {
  const { colors } = useTheme();

  const generatingHours = day.hours.filter((h) => h.megawatts > 0).length;
  // Null on every day but today. Carried in the collapsed header because the
  // bar row it mirrors is hidden from VoiceOver, and because "is the water on
  // RIGHT NOW" is the question this whole screen exists to answer — it should
  // not require opening a section.
  const now = nowSentence(day);

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
        <View style={styles.trailing}>
          {now ? (
            <Text
              style={[
                styles.nowLabel,
                { color: now === 'Generating now' ? colors.accent : colors.textSubtle },
              ]}
            >
              {now}
            </Text>
          ) : null}
          <Text style={[styles.hoursCount, { color: colors.textSubtle }]}>
            {generatingHours === 0 ? 'idle' : `${generatingHours}/24 h`}
          </Text>
        </View>
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

      {/* The "subject to change" disclaimer travels with the data wherever it
          appears, and it is the last WARNING on the card. */}
      <View style={[styles.footer, { borderTopColor: colors.border }]}>
        <Text style={[styles.footerText, { color: colors.textSubtle }]}>
          Schedules can change without notice — power demand, transmission
          constraints, generator outages and inflow all move them. Never wade or
          anchor below a dam without checking the horn and posted warnings.
        </Text>
      </View>

      {/* HOW FRESH THIS IS, on its own line and at the foot of the card.
          It used to be the opening clause of the paragraph above, set in the
          same 12px subtle grey — which put a live status inside a block of
          standing safety text, where it read as more disclaimer and was skipped
          with the rest of it. Freshness is the one line here that changes, so it
          gets its own weight and the brand's teal, centred under everything it
          describes.
          Still Eddy's fetch, never SWPA's post: they publish no timestamp of any
          kind, so the subject stays "Eddy last checked". Unknown renders
          nothing at all. Stale flips it to the error colour, because a schedule
          somebody may wade against should say when it has stopped arriving. */}
      {retrieval ? (
        <Text
          style={[
            styles.retrieval,
            { color: scheduleIsStale(oldestRetrieval) ? colors.error : colors.interactive },
          ]}
        >
          {retrieval}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 14, padding: 16 },
  title: { ...t.lg, fontFamily: fonts.display },
  intro: { ...t.sm, marginTop: 2 },
  days: { marginTop: 8 },
  trailing: { alignItems: 'flex-end', gap: 2 },
  nowLabel: { ...t.xs, fontFamily: fonts.semibold },
  hoursCount: { ...t.xs },
  estimate: { ...t.xs, marginTop: 8 },
  footer: { borderTopWidth: 1, marginTop: 12, paddingTop: 10 },
  footerText: { ...t.xs },
  retrieval: { ...t.xs, fontFamily: fonts.semibold, textAlign: 'center', marginTop: 12 },
});
