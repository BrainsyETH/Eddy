import { useState } from 'react';
import { Modal, FlatList, Pressable, Text, TextInput, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '@/theme/ThemeProvider';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { DAM_CATALOG } from '@/lib/damCatalog';
import { sortedPlaceDams } from '@/lib/savedPlaceDisplay';
import { fonts, type as t } from '@/theme/typography';
import { PlaceAction } from './PlaceAction';

export function SavedPlaceDamPicker({ relatedIds, selectedId, onSelect, onClose }: {
  relatedIds: string[]; selectedId: string | null; onSelect: (id: string | null) => void; onClose: () => void;
}) {
  const { colors } = useTheme();
  const reducedMotion = useReducedMotion();
  const [query, setQuery] = useState('');
  const items = sortedPlaceDams(DAM_CATALOG, relatedIds, query);
  return <Modal visible presentationStyle="pageSheet" animationType={reducedMotion ? 'none' : 'slide'} onRequestClose={onClose} allowSwipeDismissal>
    <SafeAreaProvider><SafeAreaView style={{ flex: 1, backgroundColor: colors.sheetGrouped }} accessibilityViewIsModal onAccessibilityEscape={onClose}>
      <View style={{ paddingHorizontal: 20, gap: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text accessibilityRole="header" style={[t.lg, { fontFamily: fonts.heading, color: colors.text, flexShrink: 1 }]}>Dam schedule</Text>
          <PlaceAction label="Done" variant="link" onPress={onClose} />
        </View>
        <TextInput value={query} onChangeText={setQuery} placeholder="Search dams" accessibilityLabel="Search dams" placeholderTextColor={colors.textMuted}
          autoCorrect={false} style={[t.base, { minHeight: 52, padding: 12, borderWidth: 1, borderRadius: 12, borderColor: colors.border, color: colors.text }]} />
        {selectedId ? <PlaceAction label="Remove dam schedule" variant="link" onPress={() => onSelect(null)} /> : null}
      </View>
      <FlatList data={items} keyExtractor={item => item.id} keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 20 }}
        ListEmptyComponent={<Text style={[t.base, { color: colors.textMuted }]}>No dams found</Text>}
        renderItem={({ item }) => <Pressable onPress={() => onSelect(item.id)} accessibilityRole="button" accessibilityState={{ selected: item.id === selectedId }}
          style={({ pressed }) => ({ minHeight: 56, paddingVertical: 14, gap: 4, borderBottomWidth: 1, borderBottomColor: colors.border, opacity: pressed ? 0.6 : 1 })}>
          <Text style={[t.base, { fontFamily: fonts.semibold, color: colors.text }]}>{item.name}{item.id === selectedId ? ' ✓' : ''}</Text>
          <Text style={[t.sm, { color: colors.textMuted }]}>{relatedIds.includes(item.id) ? 'On this river' : [item.lakeName, item.state].filter(Boolean).join(' · ')}</Text>
        </Pressable>} />
    </SafeAreaView></SafeAreaProvider>
  </Modal>;
}
