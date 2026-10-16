// Search and nearby rivers share one list. A row tap is the selection.
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ActivityIndicator, Keyboard, Pressable, SectionList, StyleSheet, Text, TextInput, View } from 'react-native';
import type { RiverListItem } from '@eddy/types';
import { fetchRivers } from '@/api/client';
import { ControlIcon } from '@/components/ControlIcon';
import { suggestRivers } from '@/lib/floatSession';
import { usableStartFix } from '@/lib/floatStart';
import { readBestIndex } from '@/lib/riverCache';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';
import type { StartLocation } from './useStart';

export function RiverPicker({ location, selectedSlug, header, inline = false, onChoose, onSearchChange }: {
  inline?: boolean; location: StartLocation; selectedSlug?: string; header?: ReactNode; onChoose: (river: RiverListItem) => void;
  onSearchChange?: () => void;
}) {
  const { colors } = useTheme();
  const [rivers, setRivers] = useState<RiverListItem[] | null>(null);
  const [query, setQuery] = useState('');
  const [reload, setReload] = useState(0);
  const [error, setError] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      const index = await readBestIndex();
      if (controller.signal.aborted) return;
      setRivers(index?.payload ?? []);
      setError(false);
      try {
        const live = await fetchRivers(controller.signal);
        if (!controller.signal.aborted) setRivers(live);
      } catch {
        if (!controller.signal.aborted) setError(true);
      }
    })();
    return () => controller.abort();
  }, [reload]);
  const nearby = useMemo(() => rivers && usableStartFix(location.fix, location.checkedAt)
    ? suggestRivers(rivers, { lat: location.fix.point[1], lng: location.fix.point[0] }).filter(river => river.miles <= 25)
    : [], [rivers, location.fix, location.checkedAt]);
  const sections = useMemo(() => {
    const all = [...(rivers ?? [])].sort((a, b) => a.name.localeCompare(b.name));
    const needle = query.trim().toLocaleLowerCase();
    if (needle) return [{ title: 'Results', data: all.filter(river => river.name.toLocaleLowerCase().includes(needle)) }];
    const close = nearby.flatMap(item => all.find(river => river.slug === item.slug) ?? []);
    return [
      ...(close.length ? [{ title: 'Nearby rivers', data: close }] : []),
      { title: close.length ? 'Other rivers' : 'All rivers', data: all.filter(river => !close.some(item => item.slug === river.slug)) },
    ];
  }, [rivers, nearby, query]);
  const count = sections.reduce((sum, section) => sum + section.data.length, 0);
  const listHeader = <View>
        {header}
        {location.busy && !location.fix ? <View style={local.status}>
          <ActivityIndicator color={colors.interactive} />
          <Text style={[t.sm, { color: colors.textMuted }]}>Finding nearby rivers…</Text>
        </View> : null}
        {rivers == null ? <ActivityIndicator accessibilityLabel="Loading rivers" color={colors.interactive} /> : null}
        {rivers != null && count === 0 ? <Text style={[local.empty, t.base, { color: colors.textMuted }]}>
          {rivers.length ? 'No rivers match your search.' : 'Connect to load the river list.'}
        </Text> : null}
      </View>;
  const listFooter = error ? <View style={local.retry}>
        <Text style={[t.sm, { color: colors.textMuted }]}>{rivers?.length ? 'Showing rivers saved on this phone.' : 'Couldn’t load rivers.'}</Text>
        <Pressable onPress={() => setReload(value => value + 1)} accessibilityRole="button" style={local.retryButton}>
          <Text style={[t.base, { color: colors.interactive }]}>Retry</Text>
        </Pressable>
      </View> : null;
  const sectionHeader = (section: { title: string; data: RiverListItem[] }) => section.data.length ? <Text accessibilityRole="header"
    style={[local.section, { color: colors.textMuted }]}>{section.title}</Text> : null;
  const renderRiver = ({ item, index, section }: { item: RiverListItem; index: number; section: { data: RiverListItem[] } }) => {
        const distance = nearby.find(river => river.slug === item.slug)?.miles;
        const selected = selectedSlug === item.slug;
        return <Pressable onPress={() => { Keyboard.dismiss(); onChoose(item); }} accessibilityRole="button"
          accessibilityState={{ selected }} style={({ pressed }) => [local.row,
            index === 0 && local.firstRow, index === section.data.length - 1 && local.lastRow,
            { backgroundColor: pressed || selected ? colors.selectionBg : colors.card, borderBottomColor: colors.border }]}>
          <ControlIcon name="map-outline" size={22} color={colors.interactive} />
          <View style={local.copy}>
            <Text style={[local.name, { color: colors.text }]}>{item.name}</Text>
            {distance != null ? <Text style={[t.sm, { color: colors.textMuted }]}>
              {distance < 0.1 ? 'Less than 0.1' : distance.toFixed(1)} mi to nearest access
            </Text> : null}
          </View>
          {selected ? <ControlIcon name="checkmark" size={20} color={colors.interactive} /> : null}
        </Pressable>;
      };
  return <View style={inline ? undefined : local.fill}>
    <View style={local.searchContainer}>
      <View style={[local.search, { backgroundColor: colors.cardRaised }]}>
        <ControlIcon name="search-outline" size={20} color={colors.textMuted} />
        <TextInput accessibilityLabel="Search rivers" placeholder="Search rivers" placeholderTextColor={colors.textMuted}
          value={query} onChangeText={value => { onSearchChange?.(); setQuery(value); }} autoCorrect={false} autoCapitalize="none" maxLength={120}
          clearButtonMode="while-editing" returnKeyType="search" style={[local.input, { color: colors.text }]} />
      </View>
    </View>
    {inline ? <View style={local.list}>
      {listHeader}
      {sections.map(section => <View key={section.title}>
        {sectionHeader(section)}
        {section.data.map((item, index) => <View key={item.slug}>{renderRiver({ item, index, section })}</View>)}
      </View>)}
      {listFooter}
    </View> : <SectionList sections={sections} keyExtractor={river => river.slug} stickySectionHeadersEnabled={false}
      keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={local.list}
      ListHeaderComponent={listHeader} ListFooterComponent={listFooter}
      renderSectionHeader={({ section }) => sectionHeader(section)} renderItem={renderRiver} />}
  </View>;
}

const local = StyleSheet.create({
  fill: { flex: 1 },
  searchContainer: { paddingHorizontal: 16, paddingBottom: 8 },
  search: { minHeight: 44, borderRadius: 12, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, gap: 8 },
  input: { ...t.base, flex: 1, paddingVertical: 10 },
  list: { padding: 16, paddingTop: 0, paddingBottom: 32 },
  section: { ...t.sm, fontFamily: fonts.semibold, paddingTop: 20, paddingBottom: 8 },
  row: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  firstRow: { borderTopLeftRadius: 12, borderTopRightRadius: 12 },
  lastRow: { borderBottomLeftRadius: 12, borderBottomRightRadius: 12, borderBottomWidth: 0 },
  copy: { flex: 1, gap: 3 },
  name: { ...t.base, fontFamily: fonts.medium },
  status: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 },
  empty: { paddingVertical: 24 },
  retry: { paddingTop: 20 },
  retryButton: { minHeight: 44, justifyContent: 'center' },
});
