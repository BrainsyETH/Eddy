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
  oldestRetrievedAt,
  retrievalSentence,
  scheduleDayLabel,
  scheduledHoursSummary,
  scheduleIsStale,
} from '@eddy/conditions/dam-schedule-copy';
import { CollapsibleSection } from '@/components/CollapsibleSection';
import { DayBars, nowSentence } from '@/components/dam/DayBars';
import {
  PEAK_RELEASE_HEADING,
  schedulePeak,
  schedulePeakValue,
  schedulePeakVoiceOver,
  type GenerationReference,
} from '@eddy/conditions/dam-generation';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';

function DayRow({
  day,
  reference,
  defaultExpanded,
}: {
  day: DamScheduleDay;
  reference?: GenerationReference | null;
  defaultExpanded: boolean;
}) {
  const { colors } = useTheme();

  // Null on every day but today. Carried in the collapsed header because the
  // bar row it mirrors is hidden from VoiceOver, and because "is the water on
  // RIGHT NOW" is the question this whole screen exists to answer — it should
  // not require opening a section.
  const now = nowSentence(day);

  // THE RIVER NUMBER FIRST. This showed "roughly 500–22,600 cfs" — a 45x range
  // with no time attached, which answers nothing a reader can act on. The peak
  // pins magnitude to the hours it actually happens in, and refuses a cfs
  // estimate built from ramp hours entirely. See schedulePeak.
  const peak = schedulePeak(day, reference);

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
                // The flag, never the label text: a string comparison here
                // went permanently false the last time the wording changed,
                // and the accent silently died. See nowSentence.
                { color: now.generating ? colors.accent : colors.textSubtle },
              ]}
            >
              {now.label}
            </Text>
          ) : null}
          <Text style={[styles.hoursCount, { color: colors.textSubtle }]}>
            {scheduledHoursSummary(day.hours, { compact: true })}
          </Text>
        </View>
      }
    >
      {/* ── HOW BIG, AND WHEN. Nothing else. ─────────────────────────────
          A technical line used to sit under this — "335 MW · 86% of scheduling
          capacity" — and it lost its place to the two facts a reader acts on.
          Megawatts are the unit the schedule is PUBLISHED in, not the unit
          anybody fishes in, and the capacity share is a fact about the plant
          rather than about the river.

          The heading says SCHEDULED because "Peak release" alone reads as a
          measurement taken downstream, and this is SWPA's plan — the hero above
          is what the turbines are actually doing, and the two may legitimately
          disagree. */}
      {peak ? (
        <View
          style={styles.peakBlock}
          accessible
          accessibilityLabel={schedulePeakVoiceOver(peak)}
        >
          <Text style={[styles.peakHeading, { color: colors.textMuted }]}>
            {PEAK_RELEASE_HEADING}
          </Text>
          <Text style={[styles.peak, { color: colors.text }]}>{schedulePeakValue(peak)}</Text>
        </View>
      ) : null}
      <DayBars day={day} reference={reference} peakSchedule={peak} />
    </CollapsibleSection>
  );
}

export function GenerationSchedule({
  schedule,
  reference,
}: {
  schedule: DamScheduleDay[];
  /** SWPA's published pair, so every day is drawn on the project's scale. */
  reference?: GenerationReference | null;
}) {
  const { colors, elevation } = useTheme();

  if (schedule.length === 0) return null;

  // The block is only as fresh as its OLDEST day — see oldestRetrievedAt.
  // One line for the section rather than one per day: three near-identical
  // timestamps invite the reader to think they differ.
  const oldestRetrieval = oldestRetrievedAt(schedule);
  const retrieval = retrievalSentence(oldestRetrieval);

  return (
    <View style={[styles.card, { backgroundColor: colors.card }, elevation(2)]}>
      <Text style={[styles.title, { color: colors.text }]}>Generation schedule</Text>
      {/* ── Why "hour ending" is no longer in the opening line ───────────────
          It is SWPA's internal convention and the reader never sees it: the
          bars and every window label are already converted to the hour the
          water starts moving, so explaining it up front spent the most
          valuable line on the card teaching a term that does not appear on it.
          The attribution stays — the screen's credibility rests on naming the
          publisher. */}
      <Text style={[styles.intro, { color: colors.textMuted }]}>
        Posted each afternoon by Southwestern Power Administration.
      </Text>

      <View style={styles.days}>
        {schedule.map((day, i) => (
          <DayRow
            key={day.scheduleDate}
            day={day}
            reference={reference}
            defaultExpanded={i === 0}
          />
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
  // The heading is the quiet half and the figure is the loud one: a reader
  // scanning for "how big" should land on the number, not on the label over it.
  peakBlock: { marginTop: 10 },
  peakHeading: { fontSize: 11, lineHeight: 15, fontFamily: fonts.medium, letterSpacing: 0.3, textTransform: 'uppercase' },
  peak: { fontSize: 17, lineHeight: 23, fontFamily: fonts.heading, marginTop: 1 },
  estimate: { ...t.xs },
  footer: { borderTopWidth: 1, marginTop: 12, paddingTop: 10 },
  footerText: { ...t.xs },
  retrieval: { ...t.xs, fontFamily: fonts.semibold, textAlign: 'center', marginTop: 12 },
});
