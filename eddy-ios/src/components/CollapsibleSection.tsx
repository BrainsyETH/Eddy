// eddy-ios/src/components/CollapsibleSection.tsx
// A titled section that can be folded away.
//
// Extracted from the since-removed offline map row, which was the app's only
// disclosure control and had already settled every question this raises: a pressable summary row, a
// chevron that flips, `accessibilityState={{ expanded }}` rather than a hand-
// written label, and a CONDITIONAL RENDER rather than a height animation — an
// animated collapse on a list of unknown length is a frame-rate problem for no
// gain, since nothing here is a surprise worth easing into.
//
// ── The trailing slot is not decoration ─────────────────────────────────────
// A section that hides its contents has to say what it is hiding, or collapsing
// it turns into losing it. That matters most for Hazards: a river with a
// low-water dam on it must say so with the section shut, which is what `summary`
// and the severity dots passed into `trailing` are for. A bare chevron would
// make "collapsed by default" a way of hiding a safety fact.

import { type ReactNode, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';

interface Props {
  title: string;
  /** One line describing what is inside, shown whether open or shut. */
  summary?: string | null;
  /**
   * A mark before the title. Decorative only — the title already names the
   * section, so the accessibility label below deliberately ignores this.
   */
  leading?: ReactNode;
  /** Cues that must survive the fold — severity dots, a count, a warning. */
  trailing?: ReactNode;
  /** Open on mount. Defaults to shut. */
  defaultExpanded?: boolean;
  children: ReactNode;
}

export function CollapsibleSection({
  title,
  summary = null,
  leading = null,
  trailing = null,
  defaultExpanded = false,
  children,
}: Props) {
  const { colors } = useTheme();
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <View style={styles.section}>
      <Pressable
        onPress={() => setExpanded((prev) => !prev)}
        style={({ pressed }) => [styles.head, { opacity: pressed ? 0.6 : 1 }]}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={summary ? `${title}, ${summary}` : title}
      >
        {leading}
        <View style={styles.headText}>
          <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
          {summary ? (
            <Text style={[styles.summary, { color: colors.textSubtle }]} numberOfLines={1}>
              {summary}
            </Text>
          ) : null}
        </View>
        {trailing}
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={16}
          color={colors.textSubtle}
        />
      </Pressable>

      {expanded ? <View style={styles.body}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginBottom: 18 },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 4,
    // 44 is the touch-target floor and this row is the only way in.
    minHeight: 44,
  },
  headText: { flex: 1, minWidth: 0 },
  title: { ...t.lg, fontFamily: fonts.heading },
  summary: { ...t.xs, fontFamily: fonts.body, marginTop: 2 },
  body: { marginTop: 10 },
});
