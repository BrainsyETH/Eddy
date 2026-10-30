import { useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import type { CompletedFloat } from '@eddy/conditions/float-archive';
import { NativeHeaderHome } from '@/components/NativeHeaderHome';
import { ControlIcon } from '@/components/ControlIcon';
import { EddyScene } from '@/components/EddyScene';
import { FloatCollectionControls } from '@/components/FloatCollectionControls';
import { SavedFloatRow } from '@/components/SavedFloatRow';
import { FloatHistoryCard } from '@/float/FloatHistoryCard';
import { useSavedFloats, type SavedFloat } from '@/hooks/useSavedFloats';
import { useFloatArchive } from '@/hooks/useFloatArchive';
import { useCachedRiverPhotos } from '@/hooks/useCachedRiverPhotos';
import { useNavigationAction } from '@/hooks/useNavigationAction';
import { useOfflineBadges } from '@/float/useOfflineBadges';
import { useAppConfig } from '@/hooks/useAppConfig';
import { floatPlanDestination } from '@/lib/planRequest';
import { floatCollectionStatus, visibleFloats } from '@/lib/floatCollection';
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
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button
          icon="cloud"
          accessibilityLabel={`Backup and sharing. ${collection.backup}`}
          onPress={() => navigate(() => router.push('/float-backup'))}
        >
          Backup
        </Stack.Toolbar.Button>
      </Stack.Toolbar>
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
            {archive.error || archive.rows.some((row) => row.backupError) ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => navigate(() => router.push('/float-backup'))}
                style={styles.backup}
              >
                <ControlIcon name="alert-circle-outline" size={20} color={colors.interactive} />
                <Text style={[t.sm, styles.grow, { color: colors.text }]}>{collection.backup}</Text>
                <ControlIcon name="chevron-forward" size={16} color={colors.interactive} />
              </Pressable>
            ) : null}
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
                      : 'Your saved floats could not be opened.'
                    : view === 'history'
                      ? 'Loading your history…'
                      : 'Loading your saved floats…'}
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
                          : 'Retry loading saved floats'}
                    </Text>
                  </Pressable>
                ) : null}
              </>
            ) : (
              <>
                <EddyScene name="routePlanning" size={100} />
                <Text style={[textStyles.cardTitle, { color: colors.text }]}>
                  {selectedRiver
                    ? `No ${view === 'saved' ? 'saved floats' : 'completed floats'} on this river`
                    : view === 'saved'
                      ? 'Save a float for your next trip'
                      : 'Your completed floats go here'}
                </Text>
                <Text style={[t.base, styles.center, { color: colors.textMuted }]}>
                  {view === 'saved'
                    ? 'Plan or find a float, then tap Save.'
                    : 'Finish a float in River Mode to see its recap here.'}
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
                    <Text style={[t.base, { color: colors.onAccent }]}>Plan a float</Text>
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
            <FloatHistoryCard
              trip={item.value}
              elevation={elevation(1)}
              onOpen={() =>
                navigate(() =>
                  router.push({
                    pathname: '/float-history-recap',
                    params: { id: item.value.id },
                  }),
                )
              }
            />
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
});
