import { useState } from 'react';
import {
  Linking,
  Modal,
  Pressable,
  ScrollView,
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
  currentNight,
  dateLabel,
  nightLine,
  checkedLabel,
  safeExternalUrl,
} from '@/lib/campingHeatmap';
import { CampingCalendar } from './CampingCalendar';
import { CampingSites } from './CampingSites';

export function CampingDetailSheet({
  row,
  overview,
  now,
  onClose,
}: {
  row: TrackedCampground;
  overview: CampingOverview;
  now: number;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const router = useRouter();
  const [selected, setSelected] = useState(() => initialCampingNight(overview));
  const [failed, setFailed] = useState(false);
  const date = overview.horizon.nights.includes(selected)
    ? selected
    : initialCampingNight(overview);
  const night = currentNight(row, date, overview.maxObservationAgeSeconds, now);
  const booking = safeExternalUrl(row.booking?.url);
  const website = safeExternalUrl(row.website);
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
        <ScrollView contentContainerStyle={styles.content}>
          {row.displayGroup.key !== 'other' ? (
            <Text style={[textStyles.caption, { color: colors.textMuted }]}>
              {row.displayGroup.label}
            </Text>
          ) : null}
          <CampingCalendar
            row={row}
            overview={overview}
            now={now}
            selected={date}
            onSelect={setSelected}
          />
          <Text style={[textStyles.cardTitle, { color: colors.text }]}>
            {dateLabel(date)}
          </Text>
          <Text style={[textStyles.body, { color: colors.text }]}>
            {nightLine(night)}
          </Text>
          <Text style={[textStyles.caption, { color: colors.textMuted }]}>
            {checkedLabel(night?.checkedAt ?? null, now)}
          </Text>
          {row.firstCome === 'present' ? (
            <Text style={[textStyles.caption, { color: colors.textMuted }]}>
              First-come sites offered; check availability at the campground.
            </Text>
          ) : null}
          {booking ? (
            <Pressable
              accessibilityRole="link"
              onPress={() => open(booking)}
              style={[styles.book, { backgroundColor: colors.interactive }]}
            >
              <Text
                style={{
                  color: colors.onInteractive,
                  fontFamily: fonts.semibold,
                  fontSize: 16,
                }}
              >
                Book campsite ↗
              </Text>
            </Pressable>
          ) : null}
          {row.loopName && booking ? (
            <Text style={[textStyles.caption, { color: colors.textMuted }]}>
              Booking through the district permit.
            </Text>
          ) : null}
          {failed ? (
            <Text style={{ color: colors.error }}>
              Couldn’t open the link. Try again.
            </Text>
          ) : null}
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
                <Text style={{ color: colors.interactive }}>View on map</Text>
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
          <CampingSites
            facilityId={row.facilityId}
            date={date}
            bookingUrl={booking ?? undefined}
            autoOpen
          />
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}
const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', padding: 20, gap: 12 },
  content: { paddingHorizontal: 20, paddingBottom: 24, gap: 10 },
  action: { minHeight: 44, minWidth: 44, justifyContent: 'center' },
  book: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    marginTop: 6,
  },
  links: { flexDirection: 'row', gap: 24 },
});
