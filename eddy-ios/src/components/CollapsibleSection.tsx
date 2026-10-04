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
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { ControlIcon } from '@/components/ControlIcon';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';

interface Props {
  title: string;
  /** Describes what is inside, shown whether open or shut. */
  summary?: string | null;
  /** Place long summaries below the entire header, with unrestricted wrapping. */
  summaryLayout?: 'inline' | 'below';
  /**
   * A mark before the title. Decorative only — the title already names the
   * section, so the accessibility label below deliberately ignores this.
   */
  leading?: ReactNode;
  /** Cues that must survive the fold — severity dots, a count, a warning. */
  trailing?: ReactNode;
  /** Read a trailing status together with its heading, rather than losing it. */
  accessibilitySummary?: string;
  /** Open on mount. Defaults to shut. */
  defaultExpanded?: boolean;
  children: ReactNode;
}

export function CollapsibleSection({
  title,
  summary = null,
  summaryLayout = 'inline',
  leading = null,
  trailing = null,
  accessibilitySummary,
  defaultExpanded = false,
  children,
}: Props) {
  const { colors } = useTheme();
  const { fontScale, width } = useWindowDimensions();
  const stacked = fontScale >= 1.3 || width < 360;
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <View style={styles.section}>
      <Pressable
        onPress={() => setExpanded((prev) => !prev)}
        style={({ pressed }) => [styles.trigger, { opacity: pressed ? 0.6 : 1 }]}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={[title, summary, accessibilitySummary].filter(Boolean).join(', ')}
      >
        <View style={styles.head}>
          {leading}
          <View style={styles.headText}>
            <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
            {summary && summaryLayout === 'inline' ? (
              <Text style={[styles.summary, { color: colors.textSubtle }]} numberOfLines={stacked ? undefined : 1}>
                {summary}
              </Text>
            ) : null}
            {stacked && trailing ? <View style={{ alignItems: 'flex-start', marginTop: 8 }}>{trailing}</View> : null}
          </View>
          {!stacked && trailing ? <View style={{ flexShrink: 1 }}>{trailing}</View> : null}
          <ControlIcon
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={16}
            color={colors.textSubtle}
          />
        </View>
        {summary && summaryLayout === 'below' ? (
          <Text style={[styles.summary, { color: colors.textSubtle }]}>{summary}</Text>
        ) : null}
      </Pressable>

      {expanded ? <View style={styles.body}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginBottom: 18 },
  // The whole trigger, including a below-header summary, is a 44pt touch target.
  trigger: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headText: { flex: 1, minWidth: 0 },
  title: { ...t.lg, fontFamily: fonts.heading },
  summary: { ...t.xs, fontFamily: fonts.body, marginTop: 2 },
  body: { marginTop: 10 },
});
