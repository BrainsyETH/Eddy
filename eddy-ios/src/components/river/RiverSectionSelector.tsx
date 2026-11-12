// eddy-ios/src/components/river/RiverSectionSelector.tsx
// Which stretch of a sectioned river (today only the Black) the report reads.
//
// ── A segmented control, not stacked option cards ────────────────────────
// It shipped as two full-width radio cards under a header legend: ~160pt of
// chrome ahead of the reading it controls. Exactly one
// section is live and everything below belongs to it, which is the
// relationship a segmented control states (see ScopeSwitch, the app's other
// one). The endpoints are not repeated in every segment: one line under the
// control names the SELECTED section's put-in and take-out. Segments have a
// 44pt minimum target and grow together when larger text wraps their labels.
//
// ── Built in JS, not UISegmentedControl ──────────────────────────────────
// The native control is a new native module (a fingerprint change and a new
// binary), cannot take Geist, and draws its own fills. This one ships OTA.
//
// ── Selection is not carried by fill alone ───────────────────────────────
// README › Theming: dark selected backgrounds stay neutral, so the selected
// segment gets a teal outline and teal semibold label as well as the lifted
// fill. Colour is inline (StyleSheet is frozen at launch scheme).

import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { riverSectionLabel } from '@eddy/conditions/river-section-label';
import { selectionFeedback } from '@/lib/haptics';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';

/** Past three, equal-width segments get too narrow to read; the row scrolls. */
const MAX_FIXED_SEGMENTS = 3;

export function RiverSectionSelector({ sections, selectedSlug, onSelect }: {
  sections: { sectionSlug: string; name: string }[];
  selectedSlug: string | null;
  onSelect: (slug: string) => void;
}) {
  const { colors } = useTheme();
  const selected = sections.find(section => section.sectionSlug === selectedSlug);
  const endpoints = selected ? riverSectionLabel(selected).subtitle : '';
  const scrolls = sections.length > MAX_FIXED_SEGMENTS;

  return (
    <View style={styles.selector}>
      <View accessibilityRole="radiogroup" accessibilityLabel="River section"
        style={[styles.viewport, scrolls ? null : styles.track, { backgroundColor: colors.cardRaised }]}>
        {wrap(scrolls, sections.map(section => {
          const active = section.sectionSlug === selectedSlug;
          const label = riverSectionLabel(section);
          return (
            <Pressable key={section.sectionSlug} accessibilityRole="radio"
              accessibilityState={{ checked: active }}
              accessibilityLabel={label.subtitle ? `${label.title}, ${label.subtitle}` : label.title}
              accessibilityHint={active ? undefined : 'Updates the readings, chart and Eddy’s Read.'}
              onPress={() => { if (!active) { selectionFeedback(); onSelect(section.sectionSlug); } }}
              style={({ pressed }) => [
                styles.segment, scrolls ? styles.segmentScrolling : styles.segmentFixed,
                active
                  ? { backgroundColor: colors.card, borderColor: colors.interactive }
                  : { borderColor: 'transparent', opacity: pressed ? 0.6 : 1 },
              ]}>
              <Text style={[styles.label, {
                color: active ? colors.interactive : colors.textMuted,
                fontFamily: active ? fonts.semibold : fonts.medium,
              }]}>
                {label.title}
              </Text>
            </Pressable>
          );
        }))}
      </View>
      {/* Hidden from VoiceOver: each segment already speaks its endpoints. */}
      {endpoints ? (
        <Text importantForAccessibility="no-hide-descendants" accessibilityElementsHidden
          style={[styles.endpoints, { color: colors.textMuted }]}>
          {endpoints}
        </Text>
      ) : null}
    </View>
  );
}

function wrap(scrolls: boolean, segments: ReactNode) {
  return scrolls ? (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.track}>
      {segments}
    </ScrollView>
  ) : segments;
}

// Layout only — every colour is applied inline from the theme.
const styles = StyleSheet.create({
  selector: { gap: 6, marginBottom: 14 },
  viewport: { borderRadius: 12 },
  track: { flexDirection: 'row', padding: 3, gap: 3 },
  segment: {
    minHeight: 44,
    minWidth: 44,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentFixed: { flex: 1, flexBasis: 0 },
  segmentScrolling: { flexShrink: 0 },
  label: { ...t.base, maxWidth: '100%', textAlign: 'center' },
  endpoints: { ...t.sm, fontFamily: fonts.body, paddingHorizontal: 4 },
});
