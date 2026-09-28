import { useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Linking,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import type { CampingOverview, TrackedCampground } from '@eddy/types';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, textStyles } from '@/theme/typography';
import {
  initialCampingNight,
  checkedLabel,
  safeExternalUrl,
} from '@/lib/campingHeatmap';
import {
  campsiteStays,
  nextCampingDate,
  type CampingStay,
} from '@/lib/campingStay';
import { useCampsiteStay } from '@/hooks/useCampsiteStay';
import { CampingStayPicker } from './CampingStayPicker';
import { CampingSiteCard } from './CampingSiteCard';

export function CampingDetailSheet({
  row,
  overview,
  now,
  initialStay,
  onClose,
}: {
  row: TrackedCampground;
  overview: CampingOverview;
  now: number;
  initialStay?: CampingStay;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const router = useRouter();
  const [stay, setStay] = useState<CampingStay>(
    () =>
      initialStay ?? {
        arrival: initialCampingNight(overview),
        departure: nextCampingDate(initialCampingNight(overview)),
      },
  );
  const [failed, setFailed] = useState(false);
  const [showUnavailable, setShowUnavailable] = useState(false);
  const {
    responses,
    loading,
    failed: loadFailed,
    refresh,
  } = useCampsiteStay(row.facilityId, stay);
  const entries = campsiteStays(
    responses,
    stay,
    overview.maxObservationAgeSeconds,
    now,
  );
  const available = entries.filter((e) => e.state === 'available');
  const unknown = entries.filter((e) => e.state === 'unknown');
  const unavailable = entries.filter((e) => e.state === 'unavailable');
  const visible = [
    ...available,
    ...unknown,
    ...(showUnavailable ? unavailable : []),
  ];
  const booking = safeExternalUrl(row.booking?.url);
  const website = safeExternalUrl(row.website);
  const timestamps = responses
    .map((r) => r.fetchedAt)
    .filter((d): d is string => !!d)
    .sort();
  function open(url: string) {
    setFailed(false);
    void Linking.openURL(url).catch(() => setFailed(true));
  }
  return (
    <Modal
      visible
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView
        style={{ flex: 1, backgroundColor: colors.bg }}
        edges={['bottom']}
        onAccessibilityEscape={onClose}
      >
        <View style={styles.header}>
          <Text
            style={[textStyles.sectionTitle, { color: colors.text, flex: 1 }]}
          >
            {row.name}
          </Text>
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close campground details"
            style={styles.action}
          >
            <Text
              style={{ color: colors.interactive, fontFamily: fonts.semibold }}
            >
              Done
            </Text>
          </Pressable>
        </View>
        <FlatList
          data={visible}
          keyExtractor={(e) => e.site.id}
          initialNumToRender={3}
          maxToRenderPerBatch={3}
          windowSize={5}
          contentContainerStyle={styles.content}
          ItemSeparatorComponent={() => <View style={{ height: 16 }} />}
          renderItem={({ item }) => (
            <CampingSiteCard
              entry={item}
              facilityId={row.facilityId}
              bookingUrl={booking}
            />
          )}
          ListHeaderComponent={
            <View style={{ gap: 12, paddingBottom: 16 }}>
              {row.displayGroup.key !== 'other' ? (
                <Text style={[textStyles.caption, { color: colors.textMuted }]}>
                  {row.displayGroup.label}
                </Text>
              ) : null}
              <CampingStayPicker
                stay={stay}
                nights={overview.horizon.nights}
                onChange={(s) => {
                  setStay(s);
                  setShowUnavailable(false);
                }}
              />
              <View style={styles.links}>
                {row.accessDestination ? (
                  <Pressable
                    accessibilityRole="button"
                    style={styles.action}
                    onPress={() => {
                      onClose();
                      router.push({
                        pathname: '/',
                        params: {
                          focusAccess: row.accessDestination!.accessId,
                          focusRiver: row.accessDestination!.riverSlug,
                        },
                      });
                    }}
                  >
                    <Text style={{ color: colors.interactive }}>
                      View on map
                    </Text>
                  </Pressable>
                ) : null}
                {website ? (
                  <Pressable
                    accessibilityRole="link"
                    onPress={() => open(website)}
                    style={styles.action}
                  >
                    <Text style={{ color: colors.interactive }}>Website ↗</Text>
                  </Pressable>
                ) : null}
              </View>
              {loading ? (
                <ActivityIndicator
                  accessibilityLabel="Loading campsites"
                  color={colors.interactive}
                />
              ) : loadFailed ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={refresh}
                  style={styles.action}
                >
                  <Text style={{ color: colors.interactive }}>
                    Couldn’t load sites. Retry
                  </Text>
                </Pressable>
              ) : (
                <>
                  <Text style={[textStyles.cardTitle, { color: colors.text }]}>
                    {available.length
                      ? `${available.length} ${available.length === 1 ? 'site available' : 'sites available'}`
                      : unknown.length
                        ? 'Availability needs an update'
                        : entries.length
                          ? 'No sites open for this stay'
                          : 'Individual site data unavailable'}
                  </Text>
                  {timestamps[0] ? (
                    <Text
                      style={[textStyles.caption, { color: colors.textMuted }]}
                    >
                      {checkedLabel(timestamps[0], now)} · Reservable sites only
                    </Text>
                  ) : null}
                </>
              )}
              {row.firstCome === 'present' ? (
                <Text style={[textStyles.caption, { color: colors.textMuted }]}>
                  First-come sites also offered.
                </Text>
              ) : null}
              {row.loopName && booking ? (
                <Text style={[textStyles.caption, { color: colors.textMuted }]}>
                  Reservations through the district permit.
                </Text>
              ) : null}
              {!available.length && booking ? (
                <Pressable
                  accessibilityRole="link"
                  style={styles.action}
                  onPress={() => open(booking)}
                >
                  <Text style={{ color: colors.interactive }}>
                    Check park reservations ↗
                  </Text>
                </Pressable>
              ) : null}
              {failed ? (
                <Text style={{ color: colors.error }}>
                  Couldn’t open the link. Try again.
                </Text>
              ) : null}
            </View>
          }
          ListFooterComponent={
            unavailable.length ? (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded: showUnavailable }}
                onPress={() => setShowUnavailable((v) => !v)}
                style={styles.action}
              >
                <Text style={{ color: colors.interactive }}>
                  {showUnavailable ? 'Hide' : 'Show'} unavailable sites (
                  {unavailable.length})
                </Text>
              </Pressable>
            ) : null
          }
        />
      </SafeAreaView>
    </Modal>
  );
}
const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', padding: 20, gap: 12 },
  content: { paddingHorizontal: 16, paddingBottom: 24 },
  action: { minHeight: 44, minWidth: 44, justifyContent: 'center' },
  links: { flexDirection: 'row', gap: 24 },
});
