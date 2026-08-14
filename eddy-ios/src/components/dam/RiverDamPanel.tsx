// eddy-ios/src/components/dam/RiverDamPanel.tsx
// The dam section on a river screen — for a TAILWATER only, meaning a reach
// whose level is the release rather than the weather.
//
// ── Why this exists on a river screen at all ───────────────────────────────
// Because on a regulated reach the dam IS the forecast. A rain-fed Ozark river
// is a guess two days out; what the Corps will release tomorrow is knowable
// today. Leaving that on a separate dam screen would mean the controlling fact
// about the river is findable only by someone who already thought to look for a
// dam.
//
// Returns null when no dam controls this river, which is every river but the
// Black today. Absent is the ordinary case, not a failure.
//
// ── No round trip ──────────────────────────────────────────────────────────
// There is no /api/rivers/[slug]/dam route, and this does not need one. The dam
// list is short — ~20 items — and the river screen already holds it; `tailwater`
// on the snapshot names the reach, so the lookup is a filter rather than a fetch.
//
// ── What it must never do ──────────────────────────────────────────────────
// Imply the release is a promise. The Corps changes schedules for power demand,
// transmission constraints, outages and inflow, and this sits next to a number
// somebody may wade into.

import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import type { DamSnapshot } from '@eddy/types';
import {
  centralDayKey,
  idleWindowSentence,
  relativeAge,
  readingStaleness,
} from '@eddy/conditions/dam-schedule-copy';
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

export function RiverDamPanel({ dam }: { dam: DamSnapshot | null }) {
  const { colors, elevation } = useTheme();
  const router = useRouter();

  if (!dam) return null;

  const release = dam.metrics.release;
  // By date, not by position: the payload carries two days now, and a day whose
  // file fails to parse is dropped independently of the other — so `[0]` can be
  // TOMORROW, and this panel would print tomorrow's idle windows as the ones a
  // wading angler has today. See the same read in DamRow.
  const todayKey = centralDayKey();
  const today = dam.schedule.find((entry) => entry.scheduleDate === todayKey) ?? null;

  // Nothing to say without either half. Better an absent section than a section
  // explaining its own emptiness.
  if (!release && !today) return null;

  // Null is "the timestamp could not be read", which is not a lag and must not
  // be announced as one — `!== 'fresh'` swept it in, so a malformed `at` printed
  // "reading is lagging" beside an age that relativeAge had already dropped for
  // the same reason. Say nothing about liveness rather than guess at it.
  const releaseLag = release ? readingStaleness(release.at) : null;
  const releaseIsLagging = releaseLag === 'lagging' || releaseLag === 'stale';

  return (
    <View style={[styles.card, { backgroundColor: colors.card }, elevation(2)]}>
      <View style={styles.header}>
        <Ionicons name="water-outline" size={16} color={colors.interactive} />
        <Text style={[styles.title, { color: colors.text }]}>{dam.name}</Text>
      </View>

      {release ? (
        <View style={styles.releaseBlock}>
          <Text style={[styles.release, { color: colors.text }]}>
            {Math.round(release.value).toLocaleString()}{' '}
            <Text style={[styles.releaseUnit, { color: colors.textMuted }]}>cfs</Text>
          </Text>
          <Text style={[styles.releaseSub, { color: colors.textMuted }]}>
            {[
              // A daily mean is labelled. The St. Louis district publishes
              // release that way, about a day behind, and showing it as
              // "releasing now" would be a correctness bug.
              release.dailyMean ? 'daily average release' : 'releasing now',
              relativeAge(release.at),
              // From the timestamp, not the wire's `staleness` — that band is
              // stamped at snapshot assembly and frozen, so a payload held on
              // this device keeps claiming freshness as it ages, contradicting
              // the age printed beside it. See readingStaleness in shared/.
              releaseIsLagging ? 'reading is lagging' : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </Text>
        </View>
      ) : null}

      {/* Today's idle windows — the part of the schedule that measured EXACT
          against turbine flow, and the one a wading angler is actually after. */}
      {today ? (
        <Text style={[styles.windows, { color: colors.text }]}>
          {idleWindowSentence(today.idle)}
        </Text>
      ) : null}

      <Text
        style={[styles.link, { color: colors.interactive }]}
        onPress={() => router.push(`/dam/${dam.id}`)}
        accessibilityRole="link"
      >
        Lake &amp; dam detail →
      </Text>

      <View style={[styles.footer, { borderTopColor: colors.border }]}>
        <Text style={[styles.footerText, { color: colors.textSubtle }]}>
          This reach runs at whatever {dam.name} releases, so it follows the dam
          rather than the rain. Schedules can change without notice — never wade
          or anchor below a dam without checking the horn and posted warnings.
          {dam.sources.length > 0 ? ` Source: ${dam.sources.join(' · ')}.` : ''}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // No marginHorizontal: this panel appears only on the river screen, whose
  // ScrollView already pads 16, so carrying its own margin inset it to 32 while
  // every card beside it sat at 16. Radius matches that screen's cards too.
  card: { marginBottom: 14, borderRadius: 16, padding: 16 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  title: { ...t.lg, fontFamily: fonts.display, flexShrink: 1 },
  releaseBlock: { marginTop: 8 },
  release: { ...t['2xl'], fontFamily: fonts.heading },
  releaseUnit: { ...t.base, fontFamily: fonts.medium },
  releaseSub: { ...t.sm },
  windows: { ...t.sm, fontFamily: fonts.semibold, marginTop: 10 },
  link: { ...t.sm, fontFamily: fonts.semibold, marginTop: 12 },
  footer: { borderTopWidth: 1, marginTop: 12, paddingTop: 10 },
  footerText: { ...t.xs },
});
