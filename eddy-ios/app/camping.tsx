import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, textStyles } from '@/theme/typography';
import { useAppConfig } from '@/hooks/useAppConfig';
import { useCampingOverview } from '@/hooks/useCampingOverview';
import { useLocation } from '@/hooks/useLocation';
import { CampingTableHeader, CampingTableRow } from '@/components/CampingGrid';
import { CampingDetailSheet } from '@/components/CampingDetailSheet';
import {
  campingRiverOptions,
  campingFreshness,
  filterCamping,
  safeExternalUrl,
  sortCamping,
} from '@/lib/campingHeatmap';

export default function CampingScreen() {
  const { features, loading } = useAppConfig();
  const { colors } = useTheme();
  const router = useRouter();
  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: colors.bg }}
      edges={['top', 'bottom']}
    >
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          style={styles.action}
        >
          <Text style={{ color: colors.interactive }}>← Back</Text>
        </Pressable>
        <Text style={[textStyles.pageTitle, { color: colors.text }]}>
          Camping
        </Text>
      </View>
      {features.campingHeatmap ? (
        <CampingContent />
      ) : loading ? (
        <ActivityIndicator color={colors.interactive} />
      ) : (
        <Text style={[styles.message, { color: colors.textMuted }]}>
          Camping availability is unavailable.
        </Text>
      )}
    </SafeAreaView>
  );
}
function CampingContent() {
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ facility?: string }>();
  const [selected, setSelected] = useState<string | null>(
    params.facility ?? null,
  );
  const [river, setRiver] = useState<string | null>(null);
  const [nearby, setNearby] = useState(false);
  const [directory, setDirectory] = useState(false);
  const [linkFailed, setLinkFailed] = useState(false);
  const { coords, status, request } = useLocation();
  const { data, loading, error, refresh, now } = useCampingOverview();
  const rivers = useMemo(
    () => campingRiverOptions(data?.tracked ?? [], data?.untracked ?? []),
    [data],
  );
  const rows = useMemo(
    () =>
      sortCamping(
        filterCamping(data?.tracked ?? [], river, nearby, coords),
        nearby ? coords : null,
      ),
    [data, river, nearby, coords],
  );
  const other = useMemo(
    () =>
      sortCamping(
        filterCamping(data?.untracked ?? [], river, nearby, coords),
        nearby ? coords : null,
      ),
    [data, river, nearby, coords],
  );
  const detail = data?.tracked.find((r) => r.facilityId === selected);
  if (!data)
    return loading ? (
      <ActivityIndicator color={colors.interactive} />
    ) : (
      <Pressable
        accessibilityRole="button"
        onPress={refresh}
        style={styles.message}
      >
        <Text style={{ color: colors.interactive }}>
          Couldn’t load camping. Retry
        </Text>
      </Pressable>
    );
  function chip(label: string, active: boolean, onPress: () => void) {
    return (
      <Pressable
        key={label}
        accessibilityRole="button"
        accessibilityState={{ selected: active }}
        onPress={onPress}
        style={[
          styles.chip,
          {
            backgroundColor: active ? colors.selectionBg : colors.card,
            borderColor: active ? colors.interactive : colors.border,
          },
        ]}
      >
        <Text
          style={{
            color: active ? colors.interactive : colors.text,
            fontFamily: fonts.medium,
          }}
        >
          {label}
        </Text>
      </Pressable>
    );
  }
  return (
    <>
      <ScrollView
        horizontal
        style={{ flexGrow: 0, flexShrink: 0, height: 56 }}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filters}
      >
        {chip('All rivers', river === null, () => setRiver(null))}
        {chip(status === 'locating' ? 'Locating…' : 'Nearby', nearby, () => {
          if (nearby) setNearby(false);
          else {
            setNearby(true);
            if (!coords) void request();
          }
        })}
        {rivers.map(({ slug, label }) =>
          chip(label, river === slug, () => setRiver(slug)),
        )}
      </ScrollView>
      {nearby && !coords && status !== 'locating' ? (
        <View style={styles.notice}>
          <Text style={{ color: colors.textMuted }}>
            {status === 'denied'
              ? 'Location access is off.'
              : 'Couldn’t find your location.'}
          </Text>
          <View style={{ flexDirection: 'row', gap: 20 }}>
            <Pressable
              accessibilityRole="button"
              style={styles.action}
              onPress={() => {
                if (status === 'denied')
                  void Linking.openSettings().catch(() => setLinkFailed(true));
                else void request();
              }}
            >
              <Text style={{ color: colors.interactive }}>
                {status === 'denied' ? 'Open Settings' : 'Retry'}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              style={styles.action}
              onPress={() => {
                setNearby(false);
                setRiver(null);
              }}
            >
              <Text style={{ color: colors.interactive }}>Show all</Text>
            </Pressable>
          </View>
          {linkFailed ? (
            <Text style={{ color: colors.error }}>
              Couldn’t open Settings. Enable location in your device settings.
            </Text>
          ) : null}
        </View>
      ) : nearby && coords ? (
        <Pressable
          onPress={() => {
            setNearby(false);
            setRiver(null);
          }}
          accessibilityRole="button"
          style={styles.notice}
        >
          <Text style={{ color: colors.interactive }}>
            Within 120 miles · Show all
          </Text>
        </Pressable>
      ) : null}
      {error ? (
        <Pressable
          onPress={refresh}
          accessibilityRole="button"
          style={styles.notice}
        >
          <Text style={{ color: colors.interactive }}>
            Couldn’t refresh. Retry
          </Text>
        </Pressable>
      ) : null}
      <FlatList
        data={rows}
        keyExtractor={(row) => row.facilityId}
        refreshing={loading}
        onRefresh={refresh}
        contentContainerStyle={styles.list}
        stickyHeaderIndices={[0]}
        ListHeaderComponent={
          <View style={{ backgroundColor: colors.bg, paddingBottom: 6 }}>
            <Text
              style={[
                textStyles.caption,
                { color: colors.textMuted, paddingVertical: 8 },
              ]}
            >
              Next 14 nights
            </Text>
            <CampingTableHeader overview={data} now={now} />
          </View>
        }
        renderItem={({ item }) => (
          <CampingTableRow
            row={item}
            overview={data}
            now={now}
            onPress={() => setSelected(item.facilityId)}
          />
        )}
        ListEmptyComponent={
          <Text style={[styles.message, { color: colors.textMuted }]}>
            No campgrounds match these filters.
          </Text>
        }
        ListFooterComponent={
          <View>
            {rows.length ? (
              <Text style={[textStyles.caption, { color: colors.textSubtle }]}>
                {campingFreshness(rows, data, now)} · Reservable sites only
              </Text>
            ) : null}
            {other.length ? (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded: directory }}
                onPress={() => setDirectory((v) => !v)}
                style={styles.directory}
              >
                <Text
                  style={{
                    fontFamily: fonts.semibold,
                    color: colors.interactive,
                  }}
                >
                  Other campgrounds ({other.length}) {directory ? '−' : '+'}
                </Text>
              </Pressable>
            ) : null}
            {directory ? (
              <>
                <Text style={[textStyles.caption, { color: colors.textMuted }]}>
                  Check availability with the campground.
                </Text>
                {other.map((row) => {
                  const url = safeExternalUrl(
                    row.reservationUrl ?? row.website,
                  );
                  return (
                    <View
                      key={row.id}
                      style={[
                        styles.directoryRow,
                        { borderColor: colors.border },
                      ]}
                    >
                      <Text
                        style={[
                          textStyles.body,
                          { color: colors.text, flex: 1 },
                        ]}
                      >
                        {row.name}
                      </Text>
                      {url ? (
                        <Pressable
                          accessibilityRole="link"
                          accessibilityLabel={`Check availability for ${row.name}`}
                          style={styles.action}
                          onPress={() => {
                            setLinkFailed(false);
                            void Linking.openURL(url).catch(() =>
                              setLinkFailed(true),
                            );
                          }}
                        >
                          <Text style={{ color: colors.interactive }}>
                            Check ↗
                          </Text>
                        </Pressable>
                      ) : null}
                    </View>
                  );
                })}
                {linkFailed ? (
                  <Text style={{ color: colors.error }}>
                    Couldn’t open the link. Try again.
                  </Text>
                ) : null}
              </>
            ) : null}
          </View>
        }
      />
      {detail ? (
        <CampingDetailSheet
          key={detail.facilityId}
          row={detail}
          overview={data}
          now={now}
          onClose={() => setSelected(null)}
        />
      ) : null}
    </>
  );
}
const styles = StyleSheet.create({
  header: { paddingHorizontal: 20, paddingBottom: 8 },
  action: { minHeight: 44, minWidth: 44, justifyContent: 'center' },
  filters: { paddingHorizontal: 20, paddingBottom: 12, gap: 8 },
  chip: {
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 14,
    minHeight: 44,
    justifyContent: 'center',
  },
  list: { paddingHorizontal: 20, paddingBottom: 24 },
  message: { padding: 20 },
  notice: { paddingHorizontal: 20, paddingVertical: 10, minHeight: 44 },
  directory: { minHeight: 48, justifyContent: 'center', marginTop: 16 },
  directoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
