// eddy-ios/src/components/dam/RiverDamPanel.tsx
// The dam's part of a tailwater river's reading card: the dam's name and the
// schedule's source, NOW and the next two days side by side, and at most two
// lines of what the water below the dam may be doing. The iOS half of the web
// component of the same name — same shared derivations (shared/river-dam-panel,
// shared/tailwater-status), so the two platforms cannot describe one dam
// differently.
//
// ── Inside the reading card ────────────────────────────────────────────────
// On a tailwater the posted schedule is what decides the day, so it lives in
// the card rather than in a row under it. Two positions (the river screen
// picks, per shared/dam-release-tab.ts):
//
//   lead    on the dam's own unrated release, in place of "Not rated" and a
//           bare number. A release has no float ladder, and one cannot be
//           borrowed (shared/tailwater-status.ts); the dam is the answer.
//   footer  under the reading on every other tab: a rated gauge keeps its
//           verdict, a downstream gauge its own reading.
//
// Nothing here borrows a condition colour: a second coloured badge in the card
// reads as a second rating.
//
// Hydropower dams only. A flood-control project (Clearwater) has no posted
// schedule, and the dam list carries no release forecast, so it keeps the
// TailwaterStatusRow handoff instead.
//
// ── What it must never do ──────────────────────────────────────────────────
// Imply the release is a promise, or say when water reaches an access. Times
// are at the dam (ADR 0017), and the Corps changes schedules without notice.

import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ControlIcon } from '@/components/ControlIcon';
import type { DamSnapshot } from '@eddy/types';
import { readingStaleness, relativeAge } from '@eddy/conditions/dam-schedule-copy';
import { generationNow } from '@eddy/conditions/dam-generation';
import { scheduleDaySummaries } from '@eddy/conditions/river-dam-panel';
import { buildTailwaterStatus } from '@eddy/conditions/tailwater-status';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';

/**
 * The dam controlling a river, from a list the caller already holds.
 *
 * Matches on `tailwater.riverSlug`, which the registry sets only for a reach
 * whose level IS the release — a river that merely feeds the pool is excluded
 * upstream rather than filtered here, so there is no inflow case to mistake for
 * a release.
 */
export function damForRiver(dams: DamSnapshot[], slug: string): DamSnapshot | null {
  return dams.find((d) => d.tailwater?.riverSlug === slug) ?? null;
}

interface Column {
  key: string;
  label: string;
  generating: boolean;
  value: string;
  detail: string;
}

function cfs(n: number): string {
  return `${Math.round(n).toLocaleString()} cfs`;
}

/** Whether this dam gets the panel; otherwise the screen keeps the status row. */
export function damHasPanel(dam: DamSnapshot | null): dam is DamSnapshot {
  return Boolean(dam?.hasTurbines);
}

export function RiverDamPanel({ dam, position, now }: {
  dam: DamSnapshot | null;
  position: 'lead' | 'footer';
  /** The screen's observation clock, so "Now" ages with the reading beside it. */
  now: number;
}) {
  const { colors } = useTheme();
  const router = useRouter();

  if (!damHasPanel(dam)) return null;

  const columns: Column[] = [];
  const release = dam.metrics.release;
  if (release) {
    const state = generationNow(dam, now);
    const current = readingStaleness(release.at, now) === 'fresh';
    columns.push({
      key: 'now',
      // A reading past two hours does not get to say "now"; it says its age.
      label: current ? 'Now' : (relativeAge(release.at, now) ?? 'Last reading'),
      generating: state.kind === 'generating',
      value: cfs(release.value),
      detail: state.kind === 'generating'
        ? 'Generating'
        : state.kind === 'not-generating'
          ? state.minimumFlow ? 'Min flow' : 'Not generating'
          : release.dailyMean ? 'Daily avg' : 'Release',
    });
  }
  for (const d of scheduleDaySummaries(dam.schedule, dam.generationReference, now).slice(0, 2)) {
    columns.push({ key: d.key, label: d.dayName, generating: d.generates, value: d.value, detail: d.detail });
  }
  if (columns.length === 0) return null;

  const supporting = buildTailwaterStatus(dam, now)?.supporting ?? [];
  const subtitle = dam.schedule.length > 0 ? 'SWPA generation schedule' : 'Schedule not posted yet';

  return (
    <View style={[position === 'footer' ? [styles.footer, { borderTopColor: colors.border }] : styles.lead]}>
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>{dam.name}</Text>
          <Text style={[styles.subtitle, { color: colors.textMuted }]}>{subtitle.toUpperCase()}</Text>
        </View>
        <Pressable
          // navigate, not push: the dam screen links back to this river, and
          // push let the pair stack full screens indefinitely.
          onPress={() => router.navigate(`/dam/${dam.id}`)}
          accessibilityRole="button"
          accessibilityLabel={`Full schedule for ${dam.name}`}
          hitSlop={8}
          style={({ pressed }) => [styles.link, { opacity: pressed ? 0.6 : 1 }]}
        >
          <Text style={[styles.linkText, { color: colors.interactive }]}>Full schedule</Text>
          <ControlIcon name="chevron-forward" size={13} color={colors.interactive} />
        </Pressable>
      </View>

      <View style={[styles.columns, { borderColor: colors.border }]}>
        {columns.map((c, index) => (
          <View
            key={c.key}
            accessible
            accessibilityLabel={`${c.label}: ${c.value}, ${c.detail}`}
            style={[styles.column, index > 0 ? { borderLeftWidth: 1, borderLeftColor: colors.border } : null]}
          >
            <Text style={[styles.columnLabel, { color: colors.textSubtle }]}>{c.label.toUpperCase()}</Text>
            <ControlIcon
              name={c.generating ? 'flash-outline' : 'water-outline'}
              size={22}
              color={c.generating ? colors.accent : colors.interactive}
              style={styles.columnIcon}
            />
            <Text style={[styles.columnValue, { color: colors.text }]} numberOfLines={1} adjustsFontSizeToFit>{c.value}</Text>
            <Text
              style={[styles.columnDetail, { color: c.generating ? colors.accent : colors.textMuted, fontFamily: c.generating ? fonts.semibold : fonts.body }]}
              numberOfLines={2}
            >
              {c.detail}
            </Text>
          </View>
        ))}
      </View>

      {supporting.map((line) => (
        <Text key={line} style={[styles.supporting, { color: colors.textMuted }]}>{line}</Text>
      ))}
      <Text style={[styles.note, { color: colors.textSubtle }]}>
        Schedules are posted for the dam and can change without notice.
      </Text>
    </View>
  );
}

// Layout only — every colour is applied inline from the theme. The card around
// this already pads 16, so nothing here carries a horizontal margin.
const styles = StyleSheet.create({
  lead: { marginBottom: 4 },
  footer: { borderTopWidth: StyleSheet.hairlineWidth, marginTop: 12, paddingTop: 12 },
  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
  headerCopy: { flex: 1, minWidth: 0 },
  title: { ...t.base, fontFamily: fonts.heading },
  subtitle: { ...t.xs, fontFamily: fonts.semibold, letterSpacing: 0.6, marginTop: 1 },
  link: { flexDirection: 'row', alignItems: 'center', gap: 2, minHeight: 44, paddingLeft: 8 },
  linkText: { ...t.xs, fontFamily: fonts.semibold },
  columns: { flexDirection: 'row', borderWidth: 1, borderRadius: 10, marginTop: 6 },
  column: { flex: 1, minWidth: 0, alignItems: 'center', paddingVertical: 10, paddingHorizontal: 4 },
  columnLabel: { ...t.xs, fontFamily: fonts.heading, letterSpacing: 0.6 },
  columnIcon: { marginVertical: 4 },
  columnValue: { ...t.sm, fontFamily: fonts.monoMedium },
  columnDetail: { ...t.xs, textAlign: 'center', marginTop: 2 },
  supporting: { ...t.sm, fontFamily: fonts.body, marginTop: 8 },
  note: { ...t.xs, fontFamily: fonts.body, marginTop: 6 },
});
