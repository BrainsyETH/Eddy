// eddy-ios/src/components/dam/RiverDamPanel.tsx
// The dam's part of a tailwater river's reading card, drawn as the Favorites
// dam card's body (DamGlance): observed turbine flow and its status, the
// posted hourly bars with the now marker, and "At the dam" with the
// observation's age. One drawing of a dam across the app, rather than a
// third one invented for the river screen.
//
// ── Inside the reading card ────────────────────────────────────────────────
// On a tailwater the posted schedule decides the day, so it lives in the card
// rather than in a row under it. Two positions (the river screen picks, per
// shared/dam-release-tab.ts):
//
//   lead    on the dam's own unrated release, in place of "Not rated" and a
//           bare number. A release has no float ladder, and one cannot be
//           borrowed (shared/tailwater-status.ts); the dam is the answer. It
//           draws Tomorrow's bars too: anglers plan the night before, and SWPA
//           posts the afternoon before.
//   footer  under the reading on every other tab, Today only: a rated gauge
//           keeps its verdict, a downstream gauge its own reading.
//
// ── What the Favorites card does not say, and this does ───────────────────
// A dam card is read at the dam; a river screen is read downstream. So the
// tailwater lines from buildTailwaterStatus() follow the bars — chiefly "Water
// already released may still be moving downstream", the caveat the old status
// row carried. Same strings as the web panel.
//
// Hydropower dams only. A flood-control project (Clearwater) has no posted
// schedule, and the dam list carries no release forecast, so it keeps the
// TailwaterStatusRow handoff instead.

import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ControlIcon } from '@/components/ControlIcon';
import { DamGlance } from '@/components/dam/DamFavoriteCard';
import type { DamSnapshot } from '@eddy/types';
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

/** Whether this dam gets the panel; otherwise the screen keeps the status row. */
export function damHasPanel(dam: DamSnapshot | null): dam is DamSnapshot {
  return Boolean(dam?.hasTurbines);
}

export function RiverDamPanel({ dam, position, now }: {
  dam: DamSnapshot | null;
  position: 'lead' | 'footer';
  /** The screen's observation clock, so the caveat lines age with the reading. */
  now: number;
}) {
  const { colors } = useTheme();
  const router = useRouter();

  if (!damHasPanel(dam)) return null;

  // navigate, not push: the dam screen links back to this river, and push let
  // the pair stack full screens indefinitely.
  const open = () => router.navigate(`/dam/${dam.id}`);
  const supporting = buildTailwaterStatus(dam, now)?.supporting ?? [];

  return (
    <View style={position === 'footer' ? [styles.footer, { borderTopColor: colors.border }] : styles.lead}>
      <Pressable
        onPress={open}
        accessibilityRole="button"
        accessibilityLabel={`${dam.name}. Opens dam details and the full schedule`}
        style={({ pressed }) => [styles.header, { opacity: pressed ? 0.65 : 1 }]}
      >
        <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>{dam.name}</Text>
        <View style={styles.link}>
          <Text style={[styles.linkText, { color: colors.interactive }]}>Full report</Text>
          <ControlIcon name="chevron-forward" size={13} color={colors.interactive} />
        </View>
      </Pressable>

      <DamGlance dam={dam} onPress={open} withTomorrow={position === 'lead'} />

      {supporting.map((line) => (
        <Text key={line} style={[styles.supporting, { color: colors.textMuted }]}>{line}</Text>
      ))}
    </View>
  );
}

// Layout only — every colour is applied inline from the theme. The card around
// this already pads 16, so nothing here carries a horizontal margin.
const styles = StyleSheet.create({
  lead: { marginBottom: 4 },
  footer: { borderTopWidth: StyleSheet.hairlineWidth, marginTop: 12, paddingTop: 4 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, minHeight: 44 },
  title: { ...t.base, fontFamily: fonts.heading, flexShrink: 1 },
  link: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  linkText: { ...t.xs, fontFamily: fonts.semibold },
  supporting: { ...t.sm, fontFamily: fonts.body, marginTop: 8 },
});
