import { useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';
import { nightPhrase, type NightChoice } from './availability';

/** Dates are calendar cells; site kinds remain filter chips. */
export function CampingNightPicker({ nights, selected, onSelect }: {
  nights: NightChoice[]; selected: string; onSelect: (date: string) => void;
}) {
  const { colors } = useTheme();
  const scroll = useRef<ScrollView>(null);
  const revealed = useRef<string | null>(null);
  return <ScrollView ref={scroll} horizontal showsHorizontalScrollIndicator={false} style={styles.scroll}
    contentContainerStyle={styles.days}>
    {nights.map(night => {
      const active = selected === night.date;
      const detail = night.mark === 'dash'
        ? night.status === 'closed' ? 'Closed' : night.status === 'not_yet_released' ? 'Not released' : (night.walkUp ?? 0) > 0 ? 'First come' : 'No reservable sites'
        : night.count == null ? 'Not updated' : `${night.count} open`;
      return <Pressable key={night.date} onPress={() => onSelect(night.date)} accessibilityRole="button"
        accessibilityLabel={`${night.longLabel}. ${nightPhrase(night) ?? 'Availability not updated'}`}
        accessibilityState={{ selected: active }}
        onLayout={event => {
          if (active && revealed.current !== selected) {
            revealed.current = selected;
            scroll.current?.scrollTo({ x: Math.max(0, event.nativeEvent.layout.x - 8), animated: false });
          }
        }}
        style={[styles.day, { borderColor: active ? colors.interactive : colors.border,
          backgroundColor: active ? colors.selectionBg : colors.card }]}>
        <Text style={[styles.label, { color: active ? colors.selectionText : colors.text }]}>{night.label}</Text>
        <Text style={[styles.count, { color: active ? colors.selectionText : colors.textMuted }]}>{detail}</Text>
      </Pressable>;
    })}
  </ScrollView>;
}
const styles = StyleSheet.create({
  scroll: { flexGrow: 0, marginTop: 10 },
  days: { gap: 8, paddingRight: 8 },
  day: { minHeight: 60, minWidth: 76, maxWidth: 144, borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, justifyContent: 'center', alignItems: 'center', gap: 4 },
  label: { ...t.xs, fontFamily: fonts.semibold, textAlign: 'center' },
  count: { ...t.xs, fontFamily: fonts.body, textAlign: 'center' },
});
