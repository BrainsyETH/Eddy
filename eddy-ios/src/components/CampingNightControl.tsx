import { useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { ControlIcon } from '@/components/ControlIcon';
import { useTheme } from '@/theme/ThemeProvider';
import { textStyles } from '@/theme/typography';
import { dateLabel } from '@/lib/campingHeatmap';
import { useReducedMotion } from '@/hooks/useReducedMotion';

/** One common night for every campground. The date list exposes the full horizon. */
export function CampingNightControl({ nights, selected, onSelect }: {
  nights: string[]; selected: string; onSelect: (night: string) => void;
}) {
  const { colors } = useTheme();
  const reducedMotion = useReducedMotion();
  const [open, setOpen] = useState(false);
  const index = nights.indexOf(selected);
  function arrow(direction: -1 | 1) {
    const next = index < 0 ? undefined : nights[index + direction];
    return <Pressable style={styles.arrow} disabled={!next}
      accessibilityRole="button" accessibilityLabel={direction < 0 ? 'Previous night' : 'Next night'}
      accessibilityState={{ disabled: !next }} onPress={() => { if (next) onSelect(next); }}>
      <ControlIcon name={direction < 0 ? 'chevron-back' : 'chevron-forward'} size={22} color={next ? colors.interactive : colors.textSubtle} />
    </Pressable>;
  }
  return <View>
    <View style={styles.controls}>
      {arrow(-1)}
      <Pressable style={styles.date} accessibilityRole="button"
        accessibilityLabel={`Change camping night. ${dateLabel(selected)}`}
        onPress={() => setOpen(true)}>
        <Text style={[textStyles.body, { color: colors.interactive, textAlign: 'center' }]}>{dateLabel(selected)} ▾</Text>
      </Pressable>
      {arrow(1)}
    </View>
    <Modal visible={open} presentationStyle="pageSheet" animationType={reducedMotion ? 'none' : 'slide'} onRequestClose={() => setOpen(false)}>
      <SafeAreaProvider>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} onAccessibilityEscape={() => setOpen(false)}>
        <View style={styles.heading}>
          <Text accessibilityRole="header" style={[textStyles.sectionTitle, { color: colors.text, flex: 1 }]}>Camping night</Text>
          <Pressable accessibilityRole="button" style={styles.arrow} onPress={() => setOpen(false)}>
            <Text style={[textStyles.body, { color: colors.interactive }]}>Done</Text>
          </Pressable>
        </View>
        <FlatList data={nights} keyExtractor={(date) => date} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 20 }}
          renderItem={({ item }) => <Pressable style={[styles.option, { borderColor: colors.border }]}
            accessibilityRole="button" accessibilityState={{ selected: item === selected }}
            onPress={() => { onSelect(item); setOpen(false); }}>
            <Text style={[textStyles.body, { color: item === selected ? colors.interactive : colors.text, flex: 1 }]}>{dateLabel(item)}</Text>
            {item === selected ? <ControlIcon name="checkmark" size={22} color={colors.interactive} accessible={false} /> : null}
          </Pressable>} />
      </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  </View>;
}
const styles = StyleSheet.create({
  controls: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  date: { flex: 1, minWidth: 0, minHeight: 44, justifyContent: 'center', paddingVertical: 8 },
  arrow: { minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center' },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 20 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
});
