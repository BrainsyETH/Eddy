// eddy-ios/src/components/map-sheet/RiverCampingWeek.tsx
// A river's tracked campgrounds over the next week, inside the map sheet.
//
// ── Why this is not the camping screen's grid ─────────────────────────────
// It was, briefly, and it broke the sheet. CampingGrid's date ruler is a
// gesture-driven horizontal scroller whose render window and month label
// update from UI-thread reactions after layout. MapSheet stays transparent
// until every mounted page reports a settled height (see SheetPager's
// pageMeasurementReady), and the Camping tab is mounted beside Conditions from
// the first frame. With the grid inside it, a reopened sheet never became
// visible, and returning from the camping screen left it invisible too.
//
// So this draws the same cells (CampingMark, the same marks and counts, the
// same Friday/Saturday highlight) in a FIXED week: no scroller, no gestures,
// no layout-driven state. Its height is decided by its rows on the first
// layout. The full horizon is one tap away on the camping screen.

import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { CampingOverview, TrackedCampground } from '@eddy/types';
import { CampingMark } from '@/components/CampingGrid';
import { CampgroundThumbnail } from '@/components/CampgroundThumbnail';
import {
  campingDate,
  campingOpenCount,
  campingRowSummary,
  cellMark,
  currentNight,
} from '@/lib/campingHeatmap';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts } from '@/theme/typography';

/** A week fits a phone without scrolling; anything longer is the camping screen's job. */
const NIGHTS = 7;
const COLUMN = 34;

const isWeekend = (date: string) => [5, 6].includes(new Date(date + 'T12:00:00Z').getUTCDay());

export function RiverCampingWeek({
  rows,
  overview,
  now,
  onOpen,
}: {
  rows: TrackedCampground[];
  overview: CampingOverview;
  now: number;
  onOpen: (facilityId: string) => void;
}) {
  const { colors } = useTheme();
  const nights = overview.horizon.nights.slice(0, NIGHTS);
  const today = campingDate(now);

  const columns = (render: (date: string) => React.ReactNode) =>
    nights.map((date) => (
      <View
        key={date}
        style={[
          styles.column,
          isWeekend(date)
            ? { backgroundColor: colors.selectionBg, borderColor: colors.interactive }
            : { borderColor: 'transparent' },
        ]}
      >
        {render(date)}
      </View>
    ));

  return (
    <View>
      <View
        style={[styles.row, styles.header, { borderColor: colors.border }]}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <View style={styles.name} />
        {columns((date) => (
          <>
            <Text numberOfLines={1} style={[styles.weekday, { color: colors.textMuted }]}>
              {date === today
                ? 'Today'
                : new Date(date + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' })}
            </Text>
            <Text
              style={[
                styles.day,
                {
                  color: date === today ? colors.interactive : colors.text,
                  fontFamily: date === today ? fonts.heading : fonts.medium,
                },
              ]}
            >
              {Number(date.slice(8))}
            </Text>
          </>
        ))}
      </View>

      {rows.map((row) => (
        <Pressable
          key={row.facilityId}
          onPress={() => onOpen(row.facilityId)}
          style={({ pressed }) => [styles.row, styles.item, { borderColor: colors.border, opacity: pressed ? 0.6 : 1 }]}
          accessibilityRole="button"
          accessibilityLabel={`${row.name}. ${campingRowSummary(row, overview, now)} Open campground and individual sites.`}
        >
          <View style={[styles.name, styles.nameRow]}>
            <CampgroundThumbnail url={row.imageUrl} />
            <Text numberOfLines={2} style={[styles.nameText, { color: colors.text }]}>
              {row.name.replace(/ Campground$/, '')}
            </Text>
          </View>
          {columns((date) => {
            const night = currentNight(row, date, overview.maxObservationAgeSeconds, now);
            return <CampingMark mark={cellMark(night)} openCount={campingOpenCount(night)} />;
          })}
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  header: { minHeight: 40, borderBottomWidth: StyleSheet.hairlineWidth },
  item: { minHeight: 48, paddingVertical: 4, borderBottomWidth: StyleSheet.hairlineWidth },
  name: { flex: 1, minWidth: 0, paddingRight: 6 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  nameText: { flex: 1, fontFamily: fonts.medium, fontSize: 12 },
  column: {
    width: COLUMN,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 2,
    paddingVertical: 3,
    borderBottomWidth: 2,
    alignSelf: 'stretch',
  },
  weekday: { fontSize: 11 },
  day: { fontSize: 13 },
});
