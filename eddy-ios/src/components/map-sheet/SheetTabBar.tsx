// eddy-ios/src/components/map-sheet/SheetTabBar.tsx
// The tab row, and the underline that follows your thumb.
//
// ── Why not ScopeSwitch ───────────────────────────────────────────────────
// src/components/ScopeSwitch.tsx is the app's segmented control and its header
// argues precisely this relationship: exactly one is live, they are not
// composable with each other, and everything below belongs to whichever is
// chosen. It is still the wrong control here, for three reasons.
//
//   THE INDICATOR HAS TO TRACK A DRAG. A filled pill cannot sit half way
//   between two segments without looking broken; an underline can, and a
//   swipe that moves the pages without moving the indicator is the thing this
//   whole file exists to avoid.
//
//   FOUR LABELS DO NOT FIT AT flex: 1. On a 375pt screen four equal segments
//   are ~86pt each, and "Conditions" at the 14pt floor this screen uses
//   (typography.ts, and the note about outdoor legibility in the map screen)
//   is close enough to that to be a coin toss. Underline tabs size to their
//   label; segments cannot.
//
//   IT IS memo'd OVER PLAIN PROPS, with nowhere to take a SharedValue.
//
// What IS taken from it, deliberately and verbatim, is the contract: the
// accessibility roles, and the active/inactive ink and weight. A tab bar that
// announced itself differently from the app's other one-of-many control would
// be a second dialect for no gain.
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import Animated, {
  interpolate,
  useAnimatedStyle,
  type SharedValue,
} from 'react-native-reanimated';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';

interface Props {
  labels: string[];
  index: number;
  onSelect: (index: number) => void;
  /** Written by SheetPager every frame. 0..labels.length-1, continuous. */
  progress: SharedValue<number>;
}

export function SheetTabBar({ labels, index, onSelect, progress }: Props) {
  const { colors } = useTheme();
  // Measured, because the labels differ in width and the whole point of an
  // underline is that it is as wide as the word it underlines.
  const [spans, setSpans] = useState<{ x: number; width: number }[]>([]);

  const onTabLayout = useCallback((i: number) => (event: LayoutChangeEvent) => {
    const { x, width } = event.nativeEvent.layout;
    setSpans((prev) => {
      const existing = prev[i];
      if (existing && existing.x === x && existing.width === width) return prev;
      const next = [...prev];
      next[i] = { x, width };
      return next;
    });
  }, []);

  const measured = spans.length === labels.length && spans.every(Boolean);

  const indicatorStyle = useAnimatedStyle(() => {
    if (!measured) return { opacity: 0 };
    const input = labels.map((_, i) => i);
    return {
      opacity: 1,
      width: interpolate(progress.value, input, spans.map((s) => s.width)),
      transform: [{ translateX: interpolate(progress.value, input, spans.map((s) => s.x)) }],
    };
  });

  return (
    <View style={styles.bar}>
      <View style={styles.row}>
        {labels.map((label, i) => {
          const active = i === index;
          return (
            <Pressable
              key={label}
              onPress={() => onSelect(i)}
              onLayout={onTabLayout(i)}
              style={styles.tab}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
            >
              <Text
                style={[
                  styles.label,
                  {
                    color: active ? colors.selectionText : colors.textMuted,
                    fontFamily: active ? fonts.semibold : fonts.medium,
                  },
                ]}
                numberOfLines={1}
              >
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {/* Absolutely positioned so its width can be animated without the row
          re-laying out under it forty times a second. */}
      <Animated.View
        style={[styles.indicator, { backgroundColor: colors.interactive }, indicatorStyle]}
        pointerEvents="none"
      />
      <View style={[styles.rule, { backgroundColor: colors.border }]} pointerEvents="none" />
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { marginTop: 4 },
  row: { flexDirection: 'row', paddingHorizontal: 16, gap: 18 },
  // No flex: 1 — a tab is as wide as its label, which is what lets four of
  // them fit on the narrowest phone without abbreviating one.
  tab: { paddingVertical: 9, minHeight: 44, justifyContent: 'center' },
  label: { ...t.sm },
  indicator: {
    position: 'absolute',
    bottom: 0,
    left: 16,
    height: 2,
    borderRadius: 999,
  },
  // Under the indicator, so the active tab reads as lifted off a continuous
  // line rather than as one of four disconnected marks.
  rule: { position: 'absolute', bottom: 0, left: 0, right: 0, height: StyleSheet.hairlineWidth },
});
