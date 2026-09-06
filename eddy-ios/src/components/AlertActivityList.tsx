// eddy-ios/src/components/AlertActivityList.tsx
// What your gauge alerts did this week, under the rules on the Mine segment.
//
// ── Why it is here ──────────────────────────────────────────────────────────
// Quiet hours held an alert back at 2am and nothing anywhere said so; the copy
// pointed at an "Alerts feed" that had been replaced by a statewide high-water
// snapshot. This is the per-user record from /api/me/alert-events: sent, held
// back, or never reached this phone — including the ones that never arrived,
// which is the whole reason a list of past pushes is worth having.
//
// Compact by design. A row is the water, the rule read back (the same sentence
// the push body used), and what happened when. It renders nothing while there
// is nothing to show, and nothing while signed out.

import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { describeAlertRule, type AlertEventEntry } from '@eddy/types';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';
import { formatReading } from '@/lib/readingCopy';

function when(iso: string, now: Date): string {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return '';
  const mins = Math.round((now.getTime() - then.getTime()) / 60_000);
  if (mins < 2) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

function sentenceCase(text: string): string {
  return text.length > 0 ? text[0].toUpperCase() + text.slice(1) : text;
}

/** One line on what became of the event, honest about the ones that did not arrive. */
export function activityOutcome(event: AlertEventEntry, now: Date = new Date()): string {
  const at = when(event.detectedAt, now);
  switch (event.status) {
    case 'sent':
      return `Sent ${at}`;
    case 'suppressed':
      return event.rearmedAt
        ? `Held back by quiet hours ${at} · re-checked when the window ended`
        : `Held back by quiet hours ${at} · Eddy re-checks when the window ends`;
    case 'not_delivered':
      return `Couldn’t reach this phone ${at}`;
    default:
      return `Sending… (${at})`;
  }
}

export function AlertActivityList({ events }: { events: AlertEventEntry[] | null }) {
  const { colors } = useTheme();
  if (!events || events.length === 0) return null;
  const now = new Date();

  return (
    <View style={styles.section}>
      <Text style={[styles.heading, { color: colors.textMuted }]}>Recent activity</Text>
      {events.slice(0, 20).map((event) => {
        const water = event.riverName ?? event.gaugeName ?? 'Your gauge';
        const reading =
          event.readingValue != null && event.readingUnit
            ? formatReading(event.readingValue, event.readingUnit)
            : null;
        const held = event.status === 'suppressed';
        const missed = event.status === 'not_delivered';
        return (
          <View
            key={event.id}
            style={[styles.row, { backgroundColor: colors.card, borderColor: colors.border }]}
            accessible
            accessibilityLabel={`${water}, ${describeAlertRule(event.rule)}${reading ? `, at ${reading}` : ''}. ${activityOutcome(event, now)}`}
          >
            <Ionicons
              name={held ? 'moon-outline' : missed ? 'alert-circle-outline' : 'notifications-outline'}
              size={16}
              color={held || missed ? colors.textMuted : colors.interactive}
              style={styles.icon}
            />
            <View style={styles.body}>
              <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
                {water}
                {reading ? <Text style={[styles.reading, { color: colors.textMuted }]}>{`  ${reading}`}</Text> : null}
              </Text>
              <Text style={[styles.rule, { color: colors.textMuted }]} numberOfLines={2}>
                {sentenceCase(describeAlertRule(event.rule))}
              </Text>
              <Text style={[styles.outcome, { color: held || missed ? colors.text : colors.textSubtle }]}>
                {activityOutcome(event, now)}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: 8, marginBottom: 24 },
  heading: {
    ...t.xs,
    fontFamily: fonts.body,
    letterSpacing: 0.7,
    textTransform: 'uppercase',
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 12,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  icon: { marginTop: 2 },
  body: { flex: 1 },
  title: { ...t.sm, fontFamily: fonts.semibold },
  reading: { ...t.xs, fontFamily: fonts.mono },
  rule: { ...t.xs, fontFamily: fonts.body, marginTop: 2 },
  outcome: { ...t.xs, fontFamily: fonts.medium, marginTop: 4 },
});
