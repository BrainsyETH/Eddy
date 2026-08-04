// eddy-ios/src/components/map-sheet/sections.tsx
// The handful of shapes every tab is built from.
//
// Shared rather than repeated because the tabs are the same KIND of thing said
// about different subjects: a heading with facts under it. Four tabs each
// inventing their own spacing would read as four screens that happened to be
// next to each other, which is the opposite of what a tab bar promises.
//
// ── Absent, never empty ───────────────────────────────────────────────────
// Every component here returns null rather than a placeholder when it has
// nothing. That is the rule the access-point detail screen already follows
// (see its header), and it matters more inside a sheet: a row reading
// "Parking: unknown" is a row about the database, and it costs a line of a
// surface that is already competing with the map for the screen.
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';

export function Section({
  title,
  children,
}: {
  title?: string;
  children: React.ReactNode;
}) {
  const { colors } = useTheme();
  if (!children) return null;
  return (
    <View style={styles.section}>
      {title ? (
        <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>{title}</Text>
      ) : null}
      {children}
    </View>
  );
}

/** A fact and its name. Absent when there is no fact. */
export function Fact({ label, value }: { label: string; value: string | null | undefined }) {
  const { colors } = useTheme();
  if (!value) return null;
  return (
    <View style={styles.fact}>
      <Text style={[styles.factLabel, { color: colors.textMuted }]}>{label}</Text>
      <Text style={[styles.factValue, { color: colors.text }]}>{value}</Text>
    </View>
  );
}

/** Free prose — a description, a road note, somebody's tip. */
export function Prose({ children }: { children: string | null | undefined }) {
  const { colors } = useTheme();
  if (!children) return null;
  return <Text style={[styles.prose, { color: colors.text }]}>{children}</Text>;
}

export function Chips({ labels }: { labels: string[] }) {
  const { colors } = useTheme();
  if (!labels.length) return null;
  return (
    <View style={styles.chips}>
      {labels.map((label) => (
        <View key={label} style={[styles.chip, { backgroundColor: colors.cardRaised }]}>
          <Text style={[styles.chipText, { color: colors.textMuted }]}>{label}</Text>
        </View>
      ))}
    </View>
  );
}

/**
 * A tappable row. Chevron for somewhere in the app, the outward arrow for
 * somewhere that is not — the distinction is worth a glyph, because one of
 * them leaves for Safari or the phone app.
 */
export function LinkRow({
  label,
  detail,
  external = false,
  onPress,
  accessibilityLabel,
}: {
  label: string;
  detail?: string | null;
  external?: boolean;
  onPress: () => void;
  accessibilityLabel?: string;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.linkRow, { opacity: pressed ? 0.6 : 1 }]}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
    >
      <View style={styles.linkText}>
        <Text style={[styles.linkLabel, { color: colors.text }]} numberOfLines={1}>
          {label}
        </Text>
        {detail ? (
          <Text style={[styles.linkDetail, { color: colors.textMuted }]} numberOfLines={1}>
            {detail}
          </Text>
        ) : null}
      </View>
      <Ionicons
        name={external ? 'open-outline' : 'chevron-forward'}
        size={16}
        color={colors.textSubtle}
      />
    </Pressable>
  );
}

/**
 * What a tab says when the request has not landed, or landed with nothing.
 *
 * One line, in the quiet ink, and never a spinner: the sheet is already useful
 * without any of this, and a spinner would claim otherwise.
 */
export function Absent({ children }: { children: string }) {
  const { colors } = useTheme();
  return <Text style={[styles.absent, { color: colors.textMuted }]}>{children}</Text>;
}

const styles = StyleSheet.create({
  section: { marginTop: 14 },
  sectionTitle: { ...t.sm, fontFamily: fonts.semibold, marginBottom: 6 },
  fact: { flexDirection: 'row', gap: 10, marginTop: 4 },
  factLabel: { ...t.sm, fontFamily: fonts.medium, width: 96 },
  factValue: { ...t.sm, fontFamily: fonts.body, flex: 1 },
  prose: { ...t.sm, fontFamily: fonts.body, marginTop: 4, lineHeight: 20 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  chip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  chipText: { ...t.sm, fontFamily: fonts.medium },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 },
  linkText: { flex: 1, minWidth: 0 },
  linkLabel: { ...t.sm, fontFamily: fonts.medium },
  linkDetail: { ...t.sm, fontFamily: fonts.body, marginTop: 1 },
  absent: { ...t.sm, fontFamily: fonts.body, marginTop: 14 },
});
