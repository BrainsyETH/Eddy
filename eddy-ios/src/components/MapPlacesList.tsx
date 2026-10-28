import { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import type { MapPin } from '@/map/RiverMap';
import { useTheme } from '@/theme/ThemeProvider';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { fonts, type as t } from '@/theme/typography';
import { MAP_LAYERS } from '@/map/layers';

/** A native list makes active map layers discoverable without precise map gestures. */
export function MapPlacesList({ pins, onSelect, onClose }: {
  pins: MapPin[]; onSelect: (pin: MapPin) => void; onClose: () => void;
}) {
  const { colors } = useTheme();
  const reducedMotion = useReducedMotion(true);
  const [query, setQuery] = useState('');
  const results = useMemo(() => pins.filter(p =>
    `${p.name} ${p.subtitle ?? ''}`.toLowerCase().includes(query.trim().toLowerCase()),
  ).sort((a, b) => a.name.localeCompare(b.name)), [pins, query]);
  return <Modal visible animationType={reducedMotion ? 'none' : 'slide'} presentationStyle="pageSheet" onRequestClose={onClose}>
    <SafeAreaProvider><SafeAreaView onAccessibilityEscape={onClose} style={[styles.fill, { backgroundColor: colors.bg }]}>
      <View style={styles.header}>
        <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>Places in this area</Text>
        <Pressable onPress={onClose} accessibilityRole="button" style={styles.button}>
          <Text style={[t.base, { color: colors.interactive }]}>Done</Text>
        </Pressable>
      </View>
      <TextInput value={query} onChangeText={setQuery} accessibilityLabel="Filter places in this area"
        placeholder="Filter by name or station number" placeholderTextColor={colors.textMuted}
        style={[styles.search, { color: colors.text, borderColor: colors.border }]} />
      <FlatList data={results} keyExtractor={p => p.id} keyboardShouldPersistTaps="handled"
        ListEmptyComponent={<Text style={[styles.empty, { color: colors.textMuted }]}>
          {query ? 'No matching places.' : 'No places in this area from your enabled layers. Move the map or change Layers.'}
        </Text>}
        renderItem={({ item }) => <Pressable accessibilityRole="button" onPress={() => onSelect(item)}
          accessibilityLabel={`${item.name}. ${MAP_LAYERS.find(l => l.key === item.layer)?.label ?? item.layer}. ${item.value ?? ''}`}
          style={[styles.row, { borderBottomColor: colors.border }]}>
          <Text style={[styles.name, { color: colors.text }]}>{item.name}</Text>
          <Text style={[t.sm, { color: colors.textMuted }]}>{item.subtitle ?? item.layer}{item.value ? ` · ${item.value}` : ''}</Text>
        </Pressable>} />
    </SafeAreaView></SafeAreaProvider>
  </Modal>;
}
const styles = StyleSheet.create({
  fill: { flex: 1 }, header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16 },
  title: { ...t.xl, fontFamily: fonts.heading, flex: 1 }, button: { minWidth: 44, minHeight: 44, justifyContent: 'center' },
  search: { margin: 16, padding: 12, minHeight: 44, borderWidth: 1, borderRadius: 10, ...t.base },
  row: { minHeight: 60, padding: 16, gap: 4, borderBottomWidth: StyleSheet.hairlineWidth },
  name: { ...t.base, fontFamily: fonts.medium }, empty: { ...t.base, padding: 16 },
});
