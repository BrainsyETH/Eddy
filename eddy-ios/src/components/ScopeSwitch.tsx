// eddy-ios/src/components/ScopeSwitch.tsx
// Which KIND of thing the Search tab is searching.
//
// ── Why this is not another chip row ───────────────────────────────────────
// The tab already has one, and adding scopes to it would have been wrong twice
// over. FilterChips answers "which of these?" — every chip narrows one set, and
// its counts describe that set. A scope changes WHAT SET IS BEING COUNTED, so a
// scope chip sitting beside "Floatable now" would look like a peer of it and
// silently reset the meaning of its neighbour's number.
//
// A segmented control says the thing chips cannot: exactly one is live, they
// are not composable with each other, and everything below belongs to whichever
// is chosen. That is the actual relationship.
//
// ── The scopes have DIFFERENT filters under them, on purpose ──────────────
// Rivers get condition chips ("Floatable now"), gauges get flow-band chips
// ("Much higher"), and those two vocabularies must never share a row — the one
// is a verdict about floating and the other a comparison to a station's own
// history, and the whole of src/theme/flow.ts exists to keep them apart. The
// switch is what makes that possible: pick a scope, get the filters that mean
// something for it.

import { memo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';

export interface ScopeOption<K extends string> {
  key: K;
  label: string;
}

interface Props<K extends string> {
  options: ScopeOption<K>[];
  value: K;
  onChange: (key: K) => void;
}

function ScopeSwitchComponent<K extends string>({ options, value, onChange }: Props<K>) {
  const { colors } = useTheme();

  return (
    <ScrollView
      horizontal
      keyboardShouldPersistTaps="handled"
      showsHorizontalScrollIndicator
      style={[styles.viewport, { backgroundColor: colors.cardRaised }]}
      contentContainerStyle={styles.track}
    >
      {options.map((option) => {
        const active = option.key === value;
        return (
          <Pressable
            key={option.key}
            onPress={() => onChange(option.key)}
            style={[styles.segment, active && { backgroundColor: colors.selectionBg }]}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={`Search ${option.label}`}
          >
            <Text
              style={[
                styles.label,
                {
                  color: active ? colors.selectionText : colors.textMuted,
                  fontFamily: active ? fonts.semibold : fonts.medium,
                },
              ]}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

export const ScopeSwitch = memo(ScopeSwitchComponent) as typeof ScopeSwitchComponent;

const styles = StyleSheet.create({
  viewport: { marginHorizontal: 16, marginTop: 10, borderRadius: 12, flexGrow: 0 },
  track: {
    flexGrow: 1,
    flexDirection: 'row',
    padding: 3,
    borderRadius: 11,
    gap: 3,
  },
  segment: {
    flexGrow: 1,
    flexShrink: 0,
    minHeight: 44,
    minWidth: 44,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { ...t.sm },
});
