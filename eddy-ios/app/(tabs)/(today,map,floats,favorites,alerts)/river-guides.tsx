import { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import { NativeHeaderHome } from '@/components/NativeHeaderHome';
import { RiverGuideCard } from '@/components/RiverGuideCard';
import { useRiverGuides } from '@/hooks/useRiverGuides';
import { selectRiverGuides } from '@/lib/riverGuides';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';

export default function RiverGuidesScreen() {
  const { colors } = useTheme();
  const { guides, error, loading, refresh } = useRiverGuides();
  const [search, setSearch] = useState('');
  const filtered = useMemo(() => selectRiverGuides(guides ?? [], search), [guides, search]);
  return (
    <SafeAreaView edges={['left', 'right']} style={[styles.safe, { backgroundColor: colors.bg }]}>
      <Stack.Screen options={{ title: 'River guides' }} />
      <NativeHeaderHome destination="today" />
      <FlatList data={filtered} keyExtractor={item => item.slug}
        contentInsetAdjustmentBehavior="automatic" keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={loading && guides !== null} onRefresh={refresh} tintColor={colors.interactive} />}
        ListHeaderComponent={<View style={styles.header}>
          <Text style={[styles.title, { color: colors.text }]}>Get to know your next river.</Text>
          <Text style={[styles.body, { color: colors.textMuted }]}>Float sections, local stops, and a little know-how before you go. Free guides from Eddy.</Text>
          <TextInput value={search} onChangeText={setSearch} placeholder="Find a river"
            accessibilityLabel="Search river guides" clearButtonMode="while-editing" autoCorrect={false}
            placeholderTextColor={colors.textMuted}
            style={[styles.search, { color: colors.text, backgroundColor: colors.card, borderColor: colors.border }]} />
          {error ? <View accessibilityLiveRegion="polite">
            <Text style={[styles.body, { color: colors.textMuted }]}>{guides ? 'Couldn’t refresh the guides. Showing the last list.' : 'Couldn’t load the guides. Check your connection and try again.'}</Text>
            <Pressable onPress={refresh} accessibilityRole="button" style={styles.retry}><Text style={[styles.link, { color: colors.interactive }]}>Try again</Text></Pressable>
          </View> : null}
        </View>}
        ListEmptyComponent={loading && !guides ? <ActivityIndicator accessibilityLabel="Loading river guides" color={colors.interactive} />
          : error ? null : <Text style={[styles.body, { color: colors.textMuted }]}>{search.trim() ? 'No guides match that search. Try another river.' : 'River guides are on their way. Check back soon.'}</Text>}
        renderItem={({ item }) => <RiverGuideCard guide={item} />} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { padding: 16, paddingBottom: 32 },
  header: { gap: 12, marginBottom: 20 },
  title: { ...t['2xl'], fontFamily: fonts.display },
  body: { ...t.base, fontFamily: fonts.body },
  search: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, minHeight: 48, ...t.base, fontFamily: fonts.body },
  retry: { minHeight: 44, justifyContent: 'center' },
  link: { ...t.base, fontFamily: fonts.semibold },
});
