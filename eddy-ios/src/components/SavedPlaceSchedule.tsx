import { useState } from 'react';
import { Text, View } from 'react-native';
import { DayBars } from '@/components/dam/DayBars';
import { PlaceAction } from '@/components/PlaceAction';
import { Section } from '@/components/map-sheet/sections';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';
import { savedScheduleState, type SavedPlace } from '@/lib/savedPlaces';
import { savedScheduleDayLabel, scheduleGroups } from '@/lib/savedPlaceDisplay';

// At the dam, not the device: the day headers below are Central time too.
const stamp = (value: string | null) => value && Number.isFinite(Date.parse(value))
  ? new Date(value).toLocaleString('en-US', {
    timeZone: 'America/Chicago', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
  })
  : null;

/** Retain an existing linked schedule without offering unrelated dams. */
export function SavedPlaceSchedule({ place, now }: { place: SavedPlace; now: number }) {
  const { colors } = useTheme();
  const [earlierOpen, setEarlierOpen] = useState(false);
  const dam = place.dam?.snapshot;
  if (place.damChoice === 'none' || !dam) return null;
  const days = scheduleGroups(place, now);
  const body = [t.sm, { fontFamily: fonts.body, color: colors.text }];
  const note = [t.xs, { fontFamily: fonts.body, color: colors.textMuted }];
  const renderDay = (day: typeof dam.schedule[number]) => {
    const state = savedScheduleState(day, new Date(now));
    const checked = stamp(day.retrievedAt);
    return <View key={day.scheduleDate} style={{ gap: 8 }}>
      <Text accessibilityRole="header" style={body}>{savedScheduleDayLabel(day.scheduleDate, now)} · CT</Text>
      <Text style={note}>{[state === 'Downloaded schedule' ? null : state, checked ? `Checked ${checked}` : null].filter(Boolean).join(' · ')}</Text>
      <DayBars day={day} reference={dam.generationReference} />
    </View>;
  };
  return <Section title={dam.name}>
    <View style={{ gap: 12 }}>
      {dam.metrics.release ? <View style={{ gap: 4 }}>
        <Text style={body}>{Math.round(dam.metrics.release.value).toLocaleString()} {dam.metrics.release.unit}{dam.metrics.release.dailyMean ? ' · daily average' : ''}</Text>
        {stamp(dam.metrics.release.at) ? <Text style={note}>Observed {stamp(dam.metrics.release.at)}</Text> : null}
      </View> : null}
      {days.upcoming.map(renderDay)}
      {days.earlier.length ? <>
        {!days.upcoming.length ? <Text style={note}>No current schedule</Text> : null}
        <PlaceAction label={`Earlier schedules (${days.earlier.length})`} variant="link" expanded={earlierOpen} onPress={() => setEarlierOpen(value => !value)} />
        {earlierOpen ? days.earlier.map(renderDay) : null}
      </> : null}
      {!dam.schedule.length ? <Text style={note}>Schedule unavailable</Text> : null}
    </View>
  </Section>;
}
