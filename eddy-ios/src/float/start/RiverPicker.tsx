// eddy-ios/src/float/start/RiverPicker.tsx
// Which river: a nearby suggestion to confirm, or the full list behind search.

import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Text, TextInput, View } from 'react-native';
import type { RiverListItem } from '@eddy/types';
import { ControlIcon } from '@/components/ControlIcon';
import { suggestRivers } from '@/lib/floatSession';
import { readBestIndex } from '@/lib/riverCache';
import { useTheme } from '@/theme/ThemeProvider';
import type { StartLocation } from './useStart';
import { Card, PrimaryButton, RiverName, Row, Shell, TextButton, styles } from './ui';

export function RiverPicker({ location, onChoose }: { location: StartLocation; onChoose: (slug: string) => void }) {
  const { colors } = useTheme();
  const [rivers, setRivers] = useState<RiverListItem[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState('');
  useEffect(() => {
    let current = true;
    void readBestIndex()
      .then((index) => {
        if (current) setRivers(index?.payload ?? []);
      })
      .catch(() => {
        if (current) setRivers([]);
      });
    return () => {
      current = false;
    };
  }, []);
  const suggestions = useMemo(
    () =>
      rivers && location.fix
        ? suggestRivers(rivers, { lat: location.fix.point[1], lng: location.fix.point[0] }).filter(
            (river) => river.miles <= 25,
          )
        : [],
    [rivers, location.fix],
  );
  const first = suggestions[0];
  const filtered = useMemo(
    () =>
      [...(rivers ?? [])]
        .filter((river) => river.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [rivers, query],
  );

  return (
    <Shell>
      {location.busy ? (
        <View style={styles.inline}>
          <ActivityIndicator color={colors.interactive} />
          <Text style={[styles.body, { color: colors.textMuted }]}>Finding your location…</Text>
        </View>
      ) : null}
      {location.error ? (
        <Text style={[styles.body, { color: colors.textMuted }]}>{location.error}</Text>
      ) : null}
      <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>
        {first && !searching ? 'Is this your river?' : 'Which river are you on?'}
      </Text>
      {first && !searching ? (
        <>
          <Card>
            <RiverName name={first.name} large />
            <Text style={[styles.body, { color: colors.textMuted }]}>
              {first.miles.toFixed(1)} mi to the nearest access
            </Text>
            <PrimaryButton label="Use this river" onPress={() => onChoose(first.slug)} />
          </Card>
          {suggestions.length > 1 ? (
            <View style={styles.group}>
              <Text style={[styles.label, { color: colors.textMuted }]}>Other rivers nearby</Text>
              <Card padded={false}>
                {suggestions.slice(1).map((river) => (
                  <Row
                    key={river.slug}
                    title={river.name}
                    detail={`${river.miles.toFixed(1)} mi`}
                    onPress={() => onChoose(river.slug)}
                  />
                ))}
              </Card>
            </View>
          ) : null}
          <Text style={[styles.caption, { color: colors.textMuted }]}>
            Straight-line distance to each river’s nearest access.
          </Text>
        </>
      ) : null}
      <View style={[styles.search, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <ControlIcon name="search-outline" size={20} color={colors.textMuted} />
        <TextInput
          accessibilityLabel="Search all rivers"
          placeholder="Search all rivers"
          placeholderTextColor={colors.textMuted}
          value={query}
          onChangeText={setQuery}
          onFocus={() => setSearching(true)}
          autoCorrect={false}
          clearButtonMode="while-editing"
          returnKeyType="search"
          style={[styles.searchInput, { color: colors.text }]}
        />
      </View>
      {searching || !first ? (
        rivers == null ? (
          <ActivityIndicator color={colors.interactive} />
        ) : (
          <Card padded={false}>
            {filtered.map((river) => (
              <Row key={river.slug} title={river.name} onPress={() => onChoose(river.slug)} />
            ))}
            {filtered.length === 0 ? (
              <Text style={[styles.body, styles.empty, { color: colors.textMuted }]}>
                {rivers.length
                  ? 'No rivers match your search.'
                  : 'Open Eddy with a signal to load the river list.'}
              </Text>
            ) : null}
          </Card>
        )
      ) : null}
      {!location.busy && location.state === 'ready' ? (
        <TextButton
          label="Find me again"
          onPress={() => {
            void location.act();
          }}
        />
      ) : null}
    </Shell>
  );
}
