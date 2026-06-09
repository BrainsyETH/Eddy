import { Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';

import type {
  AccessPoint,
  ConditionResponse,
  RiverWithDetails,
} from '@eddy/shared/types/api';
import { CONDITION_COLORS, CONDITION_LABELS } from '@eddy/shared/constants';
import { formatDistance } from '@eddy/shared/calculations/floatTime';

import { RiverMap } from '@/components/river-map';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { api } from '@/lib/api';

export default function RiverDetailScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const [river, setRiver] = useState<RiverWithDetails | null>(null);
  const [accessPoints, setAccessPoints] = useState<AccessPoint[]>([]);
  const [condition, setCondition] = useState<ConditionResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!slug) return;
    try {
      const [{ river }, { accessPoints }] = await Promise.all([
        api.getRiver(slug),
        api.getRiverAccessPoints(slug),
      ]);
      setRiver(river);
      setAccessPoints(accessPoints);
      api
        .getCondition(river.id)
        .then(setCondition)
        .catch(() => setCondition(null));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load river');
    }
  }, [slug]);

  useEffect(() => {
    load();
  }, [load]);

  if (error) {
    return (
      <ThemedView style={[styles.container, styles.center]}>
        <ThemedText>Couldn&apos;t load this river.</ThemedText>
        <ThemedText type="small">{error}</ThemedText>
      </ThemedView>
    );
  }

  if (!river) {
    return (
      <ThemedView style={[styles.container, styles.center]}>
        <ActivityIndicator />
      </ThemedView>
    );
  }

  const code = condition?.condition?.code;

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ title: river.name }} />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.statsRow}>
          <Stat label="Length" value={formatDistance(river.lengthMiles)} />
          {river.difficultyRating && (
            <Stat label="Difficulty" value={river.difficultyRating} />
          )}
          {river.region && <Stat label="Region" value={river.region} />}
        </View>

        {code && (
          <View
            style={[styles.conditionBanner, { backgroundColor: CONDITION_COLORS[code] }]}
          >
            <ThemedText style={styles.conditionText}>
              {CONDITION_LABELS[code]}
            </ThemedText>
          </View>
        )}

        <View style={styles.mapWrapper}>
          <RiverMap route={river.geometry} bounds={river.bounds} />
        </View>

        {river.description && <ThemedText>{river.description}</ThemedText>}

        <ThemedText type="subtitle" style={styles.sectionTitle}>
          Access Points
        </ThemedText>
        {accessPoints.map((ap) => (
          <ThemedView key={ap.id} type="backgroundElement" style={styles.apRow}>
            <View style={styles.apText}>
              <ThemedText style={styles.semibold}>{ap.name}</ThemedText>
              <ThemedText type="small">
                Mile {ap.riverMile}
                {ap.ownership ? ` · ${ap.ownership}` : ''}
              </ThemedText>
            </View>
          </ThemedView>
        ))}
      </ScrollView>
    </ThemedView>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <ThemedView type="backgroundElement" style={styles.stat}>
      <ThemedText type="small">{label}</ThemedText>
      <ThemedText style={styles.semibold}>{value}</ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
  },
  content: {
    padding: Spacing.four,
    gap: Spacing.three,
  },
  statsRow: {
    flexDirection: 'row',
    gap: Spacing.two,
    flexWrap: 'wrap',
  },
  stat: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.two,
    gap: 2,
  },
  conditionBanner: {
    borderRadius: Spacing.two,
    padding: Spacing.three,
  },
  mapWrapper: {
    height: 240,
  },
  conditionText: {
    color: '#fff',
    fontWeight: '600',
  },
  sectionTitle: {
    marginTop: Spacing.two,
  },
  apRow: {
    borderRadius: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
  },
  apText: {
    gap: 2,
  },
  semibold: {
    fontWeight: '600',
  },
});
