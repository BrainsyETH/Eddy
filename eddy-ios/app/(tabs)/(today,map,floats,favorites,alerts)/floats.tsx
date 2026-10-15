import { useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import type { CompletedFloat } from '@eddy/conditions/float-archive';
import { NativeHeaderHome } from '@/components/NativeHeaderHome';
import { ControlIcon } from '@/components/ControlIcon';
import { EddyScene } from '@/components/EddyScene';
import { FloatCollectionControls } from '@/components/FloatCollectionControls';
import { SavedFloatRow } from '@/components/SavedFloatRow';
import { useSavedFloats, type SavedFloat } from '@/hooks/useSavedFloats';
import { useFloatArchive } from '@/hooks/useFloatArchive';
import { useCachedRiverPhotos } from '@/hooks/useCachedRiverPhotos';
import { useNavigationAction } from '@/hooks/useNavigationAction';
import { useOfflineBadges } from '@/float/useOfflineBadges';
import { useAppConfig } from '@/hooks/useAppConfig';
import { floatPlanDestination } from '@/lib/planRequest';
import { floatCollectionStatus, visibleFloats } from '@/lib/floatCollection';
import { formatDuration } from '@/lib/floatSession';
import { useTheme } from '@/theme/ThemeProvider';
import { textStyles, type as t } from '@/theme/typography';

type Item = { kind: 'saved'; value: SavedFloat } | { kind: 'history'; value: CompletedFloat };

export default function SavedFloatsScreen() {
  const { floats, forget } = useSavedFloats();
  const archive = useFloatArchive();
  const photos = useCachedRiverPhotos();
  const { features } = useAppConfig();
  const { colors, elevation } = useTheme();
  const router = useRouter();
  const navigate = useNavigationAction();
  const params = useLocalSearchParams<{ view?: string }>();
  const view = params.view === 'history' ? 'history' : 'saved';
  const [river, setRiver] = useState('');
  const [sort, setSort] = useState<'default' | 'river'>('default');
  const [refreshing, setRefreshing] = useState(false);
  const refresh = async () => {
    setRefreshing(true);
    try {
      await archive.refresh();
    } finally {
      setRefreshing(false);
    }
  };
  const trips = archive.rows
    .filter((row) => row.kind === 'completed' && !row.deleted && row.payload)
    .map((row) => row.payload as CompletedFloat)
    .sort((a, b) => b.startedAt - a.startedAt);
  const all = [...floats, ...trips];
  const selectedRiver = all.some((item) => item.riverSlug === river) ? river : '';
  const visibleSaved = visibleFloats(floats, selectedRiver, sort);
  const offline = useOfflineBadges(
    visibleSaved.map((item) => item.shortCode),
    features.floatMode && view === 'saved',
  );
  const items: Item[] =
    view === 'saved'
      ? visibleSaved.map((value) => ({ kind: 'saved', value }))
      : visibleFloats(trips, selectedRiver, sort).map((value) => ({
          kind: 'history',
          value,
        }));
  const collection = floatCollectionStatus(archive);
  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.bg }]} edges={['left', 'right']}>
      <NativeHeaderHome />
      <FlatList<Item>
        key={view}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.content}
        data={items}
        keyExtractor={(item) => (item.kind === 'saved' ? item.value.shortCode : item.value.id)}
        refreshControl={
          <RefreshControl
            refreshing={refreshing || archive.syncing}
            onRefresh={() => void refresh()}
            tintColor={colors.interactive}
          />
        }
        ListHeaderComponent={
          <View style={styles.gutter}>
            <View style={[styles.tabs, { backgroundColor: colors.cardRaised }]} accessibilityRole="tablist">
              {(['saved', 'history'] as const).map((tab) => (
                <Pressable
                  key={tab}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: view === tab }}
                  onPress={() => router.setParams({ view: tab })}
                  style={[
                    styles.tab,
                    {
                      backgroundColor: view === tab ? colors.card : colors.cardRaised,
                    },
                  ]}
                >
                  <Text style={[t.base, { color: view === tab ? colors.text : colors.textMuted }]}>
                    {tab === 'saved' ? 'Saved' : 'History'}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Pressable
              accessibilityRole="button"
              onPress={() => navigate(() => router.push('/float-backup'))}
              style={styles.backup}
            >
              <ControlIcon name="cloud-outline" size={20} color={colors.interactive} />
              <View style={styles.grow}>
                <Text style={[t.base, { color: colors.text }]}>Backup &amp; sharing</Text>
                <Text style={[t.sm, { color: colors.textMuted }]}>{collection.backup}</Text>
              </View>
              <ControlIcon name="chevron-forward" size={16} color={colors.interactive} />
            </Pressable>
            {archive.recovered ? (
              <Text style={[t.sm, { color: colors.textMuted }]}>
                Some local history could not be opened. A recovery copy is kept on this phone. Open Backup
                &amp; sharing to recover backed-up floats.
              </Text>
            ) : null}
            {all.length ? (
              <FloatCollectionControls
                items={all}
                river={selectedRiver}
                onRiver={setRiver}
                sort={sort}
                onSort={setSort}
              />
            ) : null}
          </View>
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            {collection.load !== 'ready' ? (
              <>
                <Text
                  accessibilityRole={collection.load === 'error' ? 'alert' : undefined}
                  style={[t.base, { color: colors.textMuted }]}
                >
                  {collection.load === 'error'
                    ? view === 'history'
                      ? 'Your history could not be opened.'
                      : 'Your saved routes could not be opened.'
                    : view === 'history'
                      ? 'Loading your history…'
                      : 'Loading your saved routes…'}
                </Text>
                {collection.load === 'error' ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ disabled: refreshing }}
                    disabled={refreshing}
                    onPress={() => void refresh()}
                    style={styles.button}
                  >
                    <Text style={[t.base, { color: colors.interactive }]}>
                      {refreshing
                        ? 'Retrying…'
                        : view === 'history'
                          ? 'Retry loading history'
                          : 'Retry loading saved routes'}
                    </Text>
                  </Pressable>
                ) : null}
              </>
            ) : (
              <>
                <EddyScene name="routePlanning" size={100} />
                <Text style={[textStyles.cardTitle, { color: colors.text }]}>
                  {selectedRiver
                    ? `No ${view === 'saved' ? 'saved routes' : 'completed floats'} on this river`
                    : view === 'saved'
                      ? 'Keep a route for your next trip'
                      : 'Your completed floats go here'}
                </Text>
                <Text style={[t.base, styles.center, { color: colors.textMuted }]}>
                  {view === 'saved'
                    ? 'Build a route or find one you like, then tap Save.'
                    : 'Finish a float in Float Mode to see its recap here.'}
                </Text>
                {selectedRiver ? (
                  <Pressable accessibilityRole="button" onPress={() => setRiver('')} style={styles.button}>
                    <Text style={[t.base, { color: colors.interactive }]}>Show all rivers</Text>
                  </Pressable>
                ) : view === 'saved' ? (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => navigate(() => router.push(floatPlanDestination()))}
                    style={[styles.button, { backgroundColor: colors.accentFill }]}
                  >
                    <Text style={[t.base, { color: colors.onAccent }]}>Build a Route</Text>
                  </Pressable>
                ) : null}
              </>
            )}
          </View>
        }
        renderItem={({ item }) =>
          item.kind === 'saved' ? (
            <SavedFloatRow
              float={item.value}
              riverPhotoUrl={photos.get(item.value.riverSlug)}
              offline={offline.get(item.value.shortCode)}
              onOpen={() => navigate(() => router.push(`/float/${item.value.shortCode}`))}
              onForget={() => forget(item.value.shortCode)}
              elevation={elevation(1)}
            />
          ) : (
            <Pressable
              accessibilityRole="button"
              onPress={() =>
                navigate(() =>
                  router.push({
                    pathname: '/float-recap',
                    params: { id: item.value.id },
                  }),
                )
              }
              style={({ pressed }) => [
                styles.trip,
                { backgroundColor: colors.card, opacity: pressed ? 0.7 : 1 },
                elevation(1),
              ]}
            >
              <View style={styles.grow}>
                <Text style={[t.sm, { color: colors.textMuted }]}>{item.value.riverName}</Text>
                <Text style={[textStyles.cardTitle, { color: colors.text }]}>
                  {item.value.putInName ?? 'On-river start'} → {item.value.takeOutName}
                </Text>
                <Text style={[t.sm, { color: colors.textMuted }]}>
                  {new Date(item.value.startedAt).toLocaleDateString()} ·{' '}
                  {formatDuration(Math.round(item.value.elapsedMs / 60000))} ·{' '}
                  {item.value.distanceMiles.toFixed(1)} mi tracked
                </Text>
              </View>
              <ControlIcon name="chevron-forward" size={18} color={colors.interactive} />
            </Pressable>
          )
        }
      />
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingTop: 12, paddingBottom: 28 },
  gutter: { paddingHorizontal: 16 },
  tabs: { flexDirection: 'row', padding: 3, borderRadius: 13 },
  tab: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 8,
    borderRadius: 10,
  },
  backup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 16,
  },
  grow: { flex: 1, minWidth: 0, gap: 4 },
  empty: { padding: 24, gap: 12, alignItems: 'center' },
  center: { textAlign: 'center' },
  button: { minHeight: 44, borderRadius: 12, padding: 12 },
  trip: {
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 16,
    borderRadius: 16,
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
});
