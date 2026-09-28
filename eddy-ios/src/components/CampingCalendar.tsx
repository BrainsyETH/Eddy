import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { CampingOverview, TrackedCampground } from '@eddy/types';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts } from '@/theme/typography';
import {
  calendarDays,
  campingMonths,
  monthSelection,
} from '@/lib/campingCalendar';
import {
  cellMark,
  currentNight,
  dateLabel,
  nightLine,
} from '@/lib/campingHeatmap';
import { CampingMark } from './CampingGrid';

/** A campground calendar. A selected night drives the site's list below it. */
export function CampingCalendar({
  row,
  overview,
  now,
  selected,
  onSelect,
}: {
  row: TrackedCampground;
  overview: CampingOverview;
  now: number;
  selected: string;
  onSelect: (date: string) => void;
}) {
  const { colors } = useTheme();
  const months = campingMonths(overview.horizon.nights);
  const month = selected.slice(0, 7);
  const index = months.indexOf(month);
  const days = calendarDays(month);
  const title = new Date(`${month}-01T12:00:00Z`).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
  function move(delta: number) {
    const next = months[index + delta];
    const date = next && monthSelection(next, overview.horizon.nights);
    if (date) onSelect(date);
  }
  return (
    <View
      style={[
        styles.calendar,
        { borderColor: colors.border, backgroundColor: colors.card },
      ]}
    >
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Previous month"
          disabled={index <= 0}
          accessibilityState={{ disabled: index <= 0 }}
          onPress={() => move(-1)}
          style={styles.arrow}
        >
          <Text
            style={{
              color: index <= 0 ? colors.textSubtle : colors.interactive,
              fontSize: 22,
            }}
          >
            ‹
          </Text>
        </Pressable>
        <Text
          accessibilityRole="header"
          style={{
            color: colors.text,
            fontFamily: fonts.semibold,
            fontSize: 16,
          }}
        >
          {title}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Next month"
          disabled={index >= months.length - 1}
          accessibilityState={{ disabled: index >= months.length - 1 }}
          onPress={() => move(1)}
          style={styles.arrow}
        >
          <Text
            style={{
              color:
                index >= months.length - 1
                  ? colors.textSubtle
                  : colors.interactive,
              fontSize: 22,
            }}
          >
            ›
          </Text>
        </Pressable>
      </View>
      <View style={styles.week} accessible={false} accessibilityElementsHidden>
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, i) => (
          <Text key={i} style={[styles.weekday, { color: colors.textMuted }]}>
            {day}
          </Text>
        ))}
      </View>
      {Array.from({ length: days.length / 7 }, (_, week) => (
        <View key={week} style={styles.week}>
          {days.slice(week * 7, week * 7 + 7).map((date, day) => {
            const available =
              date !== null && overview.horizon.nights.includes(date);
            const night = date
              ? currentNight(row, date, overview.maxObservationAgeSeconds, now)
              : undefined;
            return date ? (
              <Pressable
                key={date}
                disabled={!available}
                accessibilityRole="button"
                accessibilityLabel={`${dateLabel(date)}. ${available ? nightLine(night) : 'Outside available date range'}`}
                accessibilityState={{
                  selected: date === selected,
                  disabled: !available,
                }}
                onPress={() => onSelect(date)}
                style={[
                  styles.day,
                  {
                    borderColor:
                      date === selected ? colors.interactive : 'transparent',
                    backgroundColor:
                      date === selected ? colors.selectionBg : 'transparent',
                  },
                ]}
              >
                <Text
                  style={{
                    fontFamily: date === selected ? fonts.semibold : fonts.body,
                    color: !available
                      ? colors.textSubtle
                      : night
                        ? colors.text
                        : colors.textMuted,
                  }}
                >
                  {Number(date.slice(8))}
                </Text>
                {available && night ? (
                  <View style={styles.mark}>
                    <CampingMark mark={cellMark(night)} />
                  </View>
                ) : (
                  <View style={styles.mark} />
                )}
              </Pressable>
            ) : (
              <View
                key={`blank-${day}`}
                style={[styles.day, { borderWidth: 0 }]}
              />
            );
          })}
        </View>
      ))}
    </View>
  );
}
const styles = StyleSheet.create({
  calendar: { padding: 8, borderWidth: 1, borderRadius: 16 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  arrow: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  week: { flexDirection: 'row' },
  weekday: {
    flex: 1,
    textAlign: 'center',
    fontSize: 12,
    fontFamily: fonts.medium,
    paddingVertical: 8,
  },
  day: {
    flex: 1,
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderWidth: 1.5,
    borderRadius: 10,
    paddingVertical: 4,
  },
  mark: { width: 22, height: 16 },
});
