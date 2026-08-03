// eddy-ios/src/components/SearchResultsList.tsx
// The dropdown under the Map's search field.
//
// Presentation only — it does not know where results come from, and it does not
// decide what a row says. The subtitle is composed by whoever produced the
// result (the server for access points, useEddySearch for the local rivers and
// gauges) so the same wording appears whichever half answered.

import { memo } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { SearchResult } from '@eddy/types';
import { KindMark } from '@/components/KindMark';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';

interface Props {
  results: SearchResult[];
  onSelect: (result: SearchResult) => void;
  /** Shown when a query is active and nothing matched. */
  emptyMessage: string;
  /** True while the server half is still working, so "nothing" stays unsaid. */
  loading: boolean;
}

function SearchResultsListComponent({ results, onSelect, emptyMessage, loading }: Props) {
  const { colors, elevation } = useTheme();

  if (results.length === 0) {
    return (
      <View style={[styles.panel, { backgroundColor: colors.card }, elevation(2)]}>
        <Text style={[styles.empty, { color: colors.textMuted }]}>
          {loading ? 'Searching…' : emptyMessage}
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.panel, { backgroundColor: colors.card }, elevation(2)]}>
      <FlatList
        data={results}
        keyExtractor={(item) => `${item.kind}:${item.id}`}
        // The list overlays a map. Without this a tap that lands while the
        // keyboard is up is eaten by the dismiss, and the user has to tap twice.
        keyboardShouldPersistTaps="handled"
        // Its other half, which was missing here and on the Today tab alike:
        // `keyboardDismissMode` defaults to 'none', so scrolling the results
        // left the keyboard covering them with no way out but the return key.
        keyboardDismissMode="on-drag"
        ItemSeparatorComponent={() => (
          <View style={[styles.separator, { backgroundColor: colors.border }]} />
        )}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => onSelect(item)}
            style={({ pressed }) => [styles.row, { opacity: pressed ? 0.6 : 1 }]}
            accessibilityRole="button"
            accessibilityLabel={[item.name, item.subtitle].filter(Boolean).join(', ')}
          >
            <KindMark kind={item.kind} color={colors.textMuted} />
            <View style={styles.rowText}>
              <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
                {item.name}
              </Text>
              {item.subtitle ? (
                <Text style={[styles.subtitle, { color: colors.textSubtle }]} numberOfLines={1}>
                  {item.subtitle}
                </Text>
              ) : null}
            </View>
            <Ionicons name="chevron-forward" size={15} color={colors.textSubtle} />
          </Pressable>
        )}
      />
    </View>
  );
}

export const SearchResultsList = memo(SearchResultsListComponent);

const styles = StyleSheet.create({
  // Capped rather than free-growing: the map underneath is the point of the
  // screen, and a result list that fills it hides the thing being searched.
  panel: { maxHeight: 300, borderRadius: 14, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 14, paddingVertical: 11 },
  rowText: { flex: 1, minWidth: 0 },
  name: { ...t.sm, fontFamily: fonts.semibold },
  subtitle: { ...t.xs, fontFamily: fonts.body, marginTop: 1 },
  separator: { height: StyleSheet.hairlineWidth, marginLeft: 42 },
  empty: { ...t.sm, fontFamily: fonts.body, padding: 16, textAlign: 'center' },
});
