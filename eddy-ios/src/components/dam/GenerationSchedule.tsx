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

import { useSyncExternalStore, type ReactNode } from 'react';
import { Settings, StyleSheet, Text, View } from 'react-native';
import type { DamScheduleDay } from '@eddy/types';
import {
  oldestRetrievedAt,
  retrievalSentence,
  SCHEDULE_POSTED_BY,
  scheduleDayLabel,
  scheduledHoursSummary,
  scheduleIsStale,
} from '@eddy/conditions/dam-schedule-copy';
import { CollapsibleSection } from '@/components/CollapsibleSection';
import { DayBars, nowSentence } from '@/components/dam/DayBars';
import {
  scheduleWindowSummary,
  type GenerationReference,
} from '@eddy/conditions/dam-generation';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';

// A single device preference applies to the schedule at every dam. iOS Settings
// reads synchronously, so a returning reader gets the saved layout on first paint.
const expandedKey = 'eddy.dam.schedule.expanded';
const listeners = new Set<() => void>();
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
function isExpanded() {
  return Settings.get(expandedKey) !== false;
}
function saveExpanded(expanded: boolean) {
  Settings.set({ [expandedKey]: expanded });
  for (const listener of listeners) listener();
}

function DayRow({
  day,
  reference,
  defaultExpanded,
  inline = false,
  now,
}: {
  day: DamScheduleDay;
  reference?: GenerationReference | null;
  defaultExpanded: boolean;
  inline?: boolean;
  now: number;
}) {
  const { colors } = useTheme();

  const current = nowSentence(day, now);

  // All schedule surfaces distinguish a real peak from a flat-output day.
  const summary = scheduleWindowSummary(day, reference);
  const peak = summary?.varied ? summary.peak : null;

  const date = scheduleDayLabel(day.scheduleDate);
  const dateSummary = [current?.label, scheduledHoursSummary(day.hours), summary?.text, 'Central time'].filter(Boolean).join('. ');
  const windowLabel = summary ? (
    <Text style={[styles.windowLabel, { color: colors.textMuted }]} accessibilityLabel={summary.text}>
      {summary.varied ? 'Peak' : 'Scheduled generation'} <Text style={{ color: colors.text }}>{summary.window}</Text>
    </Text>
  ) : null;
  const bars = <DayBars day={day} reference={reference} peakSchedule={peak} now={now} />;
  if (inline) {
    return <View>
      <View style={styles.dayHeading} accessible accessibilityLabel={`${date}. ${dateSummary}`}>
        <Text style={[styles.date, { color: colors.text }]}>{date}</Text>
        {windowLabel}
      </View>
      {bars}
      {current ? <Text style={[styles.nowLabel, { color: colors.textMuted }]}>{current.label}</Text> : null}
    </View>;
  }
  return (
    <CollapsibleSection title={date} accessibilitySummary={dateSummary} defaultExpanded={defaultExpanded}
      trailing={current ? <Text style={[styles.nowLabel, { color: current.generating ? colors.accent : colors.textSubtle }]}>{current.label}</Text> : null}>
      {windowLabel}
      {bars}
    </CollapsibleSection>
  );
}

export function GenerationSchedule({
  schedule,
  reference,
  embedded = false,
  headline = 'Generation schedule',
  changeTime,
  stopDetail,
  sourceFooter,
  showFooterWhenCollapsed = false,
  now,
}: {
  schedule: DamScheduleDay[];
  /** SWPA's published pair, so every day is drawn on the project's scale. */
  reference?: GenerationReference | null;
  /** The release card supplies the disclosure headline and the source footer. */
  embedded?: boolean;
  headline?: string;
  changeTime?: string;
  stopDetail?: string;
  sourceFooter?: ReactNode;
  showFooterWhenCollapsed?: boolean;
  now: number;
}) {
  const { colors, elevation } = useTheme();

  const expanded = useSyncExternalStore(subscribe, isExpanded, () => true);

  if (schedule.length === 0) return null;

  // The block is only as fresh as its OLDEST day — see oldestRetrievedAt.
  // One line for the section rather than one per day: three near-identical
  // timestamps invite the reader to think they differ.
  const oldestRetrieval = oldestRetrievedAt(schedule);
  const retrieval = retrievalSentence(oldestRetrieval, now, 'Schedule');

  const body = (
    <>
      {embedded ? null : (
        <Text style={[styles.title, { color: colors.text }]}>Generation schedule</Text>
      )}
      {/* ── Why "hour ending" is no longer in the opening line ───────────────
          It is SWPA's internal convention and the reader never sees it: the
          bars and every window label are already converted to the hour the
          water starts moving, so explaining it up front spent the most
          valuable line on the card teaching a term that does not appear on it.
          The attribution stays — the screen's credibility rests on naming the
          publisher. */}
      {embedded ? null : (
        <Text style={[styles.intro, { color: colors.textMuted }]}>
          {SCHEDULE_POSTED_BY}
        </Text>
      )}

      <View style={styles.days}>
        {schedule.map((day, i) => (
          <DayRow
            key={day.scheduleDate}
            day={day}
            reference={reference}
            defaultExpanded={i === 0}
            inline={embedded && i === 0}
            now={now}
          />
        ))}
      </View>

      {/* The "subject to change" disclaimer travels with the data wherever it
          appears, and it is the last WARNING on the card. Inside the merged
          card the card's own footer carries it, once, for both halves. */}
      {embedded ? null : (
      <View style={[styles.footer, { borderTopColor: colors.border }]}>
        <Text style={[styles.footerText, { color: colors.textSubtle }]}>
          Schedules can change without notice — power demand, transmission
          constraints, generator outages and inflow all move them. Never wade or
          anchor below a dam without checking the horn and posted warnings.
        </Text>
      </View>
      )}

      {/* HOW FRESH THIS IS, on its own line and at the foot of the card.
          It used to be the opening clause of the paragraph above, set in the
          same 12px subtle grey — which put a live status inside a block of
          standing safety text, where it read as more disclaimer and was skipped
          with the rest of it. Freshness is the one line here that changes, so it
          gets its own weight and the brand's teal, centred under everything it
          describes.
          Still Eddy's fetch, never SWPA's post: they publish no timestamp of any
          kind, so the label says "Schedule checked". Unknown renders
          nothing at all. Stale flips it to the error colour, because a schedule
          somebody may wade against should say when it has stopped arriving. */}
      {embedded || !retrieval ? null : (
        <Text
          style={[
            styles.retrieval,
            { color: scheduleIsStale(oldestRetrieval, now) ? colors.error : colors.interactive },
          ]}
        >
          {retrieval}
        </Text>
      )}
    </>
  );

  if (embedded) return <>
    <CollapsibleSection compact title={headline} summary={stopDetail} summaryLayout="below"
      expanded={expanded} onExpandedChange={saveExpanded} accessibilitySummary={changeTime}
      trailing={changeTime ? <Text style={[styles.changeTime, { color: colors.text }]}>{changeTime}</Text> : null}>
      {body}
    </CollapsibleSection>
    {expanded || showFooterWhenCollapsed ? sourceFooter : null}
  </>;
  return <View style={[styles.card, { backgroundColor: colors.card }, elevation(2)]}>{body}</View>;
}

const styles = StyleSheet.create({
  card: { borderRadius: 14, padding: 16 },
  title: { ...t.lg, fontFamily: fonts.display },
  intro: { ...t.sm, marginTop: 2 },
  days: { gap: 4 },
  dayHeading: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'baseline', gap: 4 },
  date: { ...t.sm, fontFamily: fonts.semibold },
  windowLabel: { ...t.xs, fontFamily: fonts.body },
  changeTime: { ...t.base, fontFamily: fonts.heading, fontVariant: ['tabular-nums'] },
  nowLabel: { ...t.xs, fontFamily: fonts.medium },
  footer: { borderTopWidth: 1, marginTop: 12, paddingTop: 10 },
  footerText: { ...t.xs },
  retrieval: { ...t.xs, fontFamily: fonts.semibold, textAlign: 'center', marginTop: 12 },
});
