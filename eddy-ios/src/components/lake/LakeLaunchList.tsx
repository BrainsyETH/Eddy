// eddy-ios/src/components/lake/LakeLaunchList.tsx
// Reviewed launch locations on a lake, with directions.
//
// "Reviewed" is a claim about the place, not about today: a row here is not a
// report that the ramp is open (ADR 0019). An elevation caution appears only
// when the server sent one, which it does only for a lake whose thresholds a
// person has verified, and only while the level it was computed from is still
// current on THIS device's clock.
//
// Order and distance wording are shared with the web list (lake-launch-order):
// by name until the reader asks for nearest, then straight-line miles that say
// they are straight-line. The location is asked for on the tap, never on
// arrival.

import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ControlIcon } from '@/components/ControlIcon';
import { useDirectionsMenu } from '@/components/DirectionsMenu';
import { EddySymbol } from '@/components/EddySymbol';
import { launchDistanceLabel, launchMethodFilterUseful, orderLaunches } from '@eddy/conditions/lake-launch-order';
import { lakeReadingIsStale } from '@eddy/conditions/lake-reading';
import { RAMP_CAUTION_COPY } from '@eddy/conditions/lake-status';
import type { LakeLaunch, LakeSection, LaunchMethod } from '@eddy/conditions/lake-types';
import { useLocation } from '@/hooks/useLocation';
import { useTheme } from '@/theme/ThemeProvider';
import { radii } from '@/theme/layout';
import { fonts, type as t } from '@/theme/typography';

type Filter = 'all' | LaunchMethod;

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'trailer', label: 'Trailer' },
  { key: 'hand', label: 'Hand launch' },
];
const METHOD_LABEL: Record<LaunchMethod, string> = { trailer: 'Trailer ramp', hand: 'Hand launch' };
/** A long lake has dozens of ramps; the first screenful is the nearest or the first by name. */
const COLLAPSED_COUNT = 6;

function launchFacts(launch: LakeLaunch): string {
  return [
    ...launch.launchMethods.map((method) => METHOD_LABEL[method]),
    ...launch.amenities.map((amenity) => amenity.replace(/_/g, ' ')),
    launch.feeRequired === true ? 'fee required' : launch.feeRequired === false ? 'no launch fee' : null,
  ].filter(Boolean).join(' · ');
}

export function LakeLaunchList({ lake, now }: { lake: LakeSection; now: number }) {
  const { colors, elevation } = useTheme();
  const { showDirections, directionsMenu } = useDirectionsMenu();
  const location = useLocation();
  const [filter, setFilter] = useState<Filter>('all');
  const [nearest, setNearest] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [locationNote, setLocationNote] = useState<string | null>(null);

  const showFilter = launchMethodFilterUseful(lake.launches);
  const cautionsCurrent = lake.cautionsVerified && Boolean(lake.pool && !lakeReadingIsStale(lake.pool, now));
  const from = nearest && location.coords ? { lat: location.coords.lat, lon: location.coords.lng } : null;
  const ordered = useMemo(
    () => orderLaunches(lake.launches.filter((launch) => filter === 'all' || launch.launchMethods.includes(filter)), from),
    // `from` is rebuilt each render; its two numbers are what matter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lake.launches, filter, from?.lat, from?.lon],
  );
  const shown = expanded ? ordered : ordered.slice(0, COLLAPSED_COUNT);

  const sortNearest = async () => {
    setLocationNote(null);
    const coords = await location.request();
    if (coords) setNearest(true);
    else setLocationNote('Location is unavailable, so launches stay in name order.');
  };

  const count = lake.launches.length;
  return (
    <View style={[styles.card, { backgroundColor: colors.card }, elevation(2)]}>
      <View style={styles.header}>
        <EddySymbol name="boatRamp" size={28} />
        <Text style={[styles.title, { color: colors.text }]} accessibilityRole="header">Boat launches</Text>
      </View>
      <Text style={[styles.note, { color: colors.textMuted }]}>
        {count > 0
          ? `${count} reviewed ${count === 1 ? 'launch' : 'launches'} · More are being reviewed.`
          : 'Reviewed launch locations are currently unavailable.'}
      </Text>

      {count > 0 ? (
        <View style={styles.controls}>
          {showFilter ? FILTERS.map((option) => {
            const selected = filter === option.key;
            return (
              <Pressable
                key={option.key}
                onPress={() => setFilter(option.key)}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                style={[styles.chip, { borderColor: selected ? colors.interactive : colors.border, backgroundColor: selected ? colors.interactive : 'transparent' }]}
              >
                <Text style={[styles.chipText, { color: selected ? colors.onInteractive : colors.text }]}>{option.label}</Text>
              </Pressable>
            );
          }) : null}
          {!nearest ? (
            <Pressable
              onPress={() => void sortNearest()}
              disabled={location.status === 'locating'}
              accessibilityRole="button"
              accessibilityHint="Uses your location to sort launches by straight-line distance"
              style={({ pressed }) => [styles.chip, { borderColor: colors.border, opacity: pressed ? 0.6 : 1 }]}
            >
              <ControlIcon name="locate-outline" size={14} color={colors.text} />
              <Text style={[styles.chipText, { color: colors.text }]}>{location.status === 'locating' ? 'Finding you…' : 'Nearest first'}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      {nearest ? <Text style={[styles.note, { color: colors.textMuted }]}>Nearest first. Distances are straight-line, not the drive.</Text> : null}
      {locationNote ? <Text style={[styles.note, { color: colors.textMuted }]} accessibilityLiveRegion="polite">{locationNote}</Text> : null}

      {count > 0 && ordered.length === 0 ? (
        <Text style={[styles.note, { color: colors.textMuted }]}>
          No reviewed {filter === 'hand' ? 'hand launches' : 'trailer ramps'} in this list. Try All.
        </Text>
      ) : null}

      {shown.map(({ launch, miles }) => {
        const caution = cautionsCurrent && launch.caution ? RAMP_CAUTION_COPY[launch.caution] : null;
        const facts = launchFacts(launch);
        return (
          <View key={launch.id} style={[styles.row, { borderTopColor: colors.border }]}>
            <View style={styles.rowText}>
              <Text style={[styles.name, { color: colors.text }]}>{launch.name}</Text>
              {miles !== undefined ? <Text style={[styles.distance, { color: colors.textMuted }]}>{launchDistanceLabel(miles)}</Text> : null}
              {facts ? <Text style={[styles.note, { color: colors.textMuted }]}>{facts}</Text> : null}
              {launch.managingAgency ? <Text style={[styles.note, { color: colors.textSubtle }]}>{launch.managingAgency}</Text> : null}
              {caution ? (
                <View style={[styles.caution, { borderColor: colors.accent }]} accessibilityRole="text">
                  <Text style={[styles.cautionTitle, { color: colors.text }]}>{caution.title}</Text>
                  <Text style={[styles.note, { color: colors.text }]}>{caution.body}</Text>
                  <Text style={[styles.note, { color: colors.textMuted }]}>{caution.basis}</Text>
                </View>
              ) : null}
            </View>
            <Pressable
              onPress={() => showDirections({ name: launch.name, coordinates: { lng: launch.lon, lat: launch.lat } })}
              accessibilityRole="button"
              accessibilityLabel={`Directions to ${launch.name}`}
              style={({ pressed }) => [styles.directions, { borderColor: colors.border, opacity: pressed ? 0.6 : 1 }]}
            >
              <ControlIcon name="navigate-outline" size={16} color={colors.text} />
              <Text style={[styles.chipText, { color: colors.text }]}>Directions</Text>
            </Pressable>
          </View>
        );
      })}

      {ordered.length > COLLAPSED_COUNT ? (
        <Pressable
          onPress={() => setExpanded((value) => !value)}
          accessibilityRole="button"
          style={({ pressed }) => [styles.more, { borderColor: colors.border, opacity: pressed ? 0.6 : 1 }]}
        >
          <Text style={[styles.chipText, { color: colors.text }]}>{expanded ? 'Show fewer' : `Show all ${ordered.length} launches`}</Text>
        </Pressable>
      ) : null}

      {count > 0 ? (
        <Text style={[styles.note, { color: colors.textSubtle }]}>
          Reviewed locations are not a report of current opening or closure. {lake.cautionsVerified ? 'Elevation cautions use published thresholds, not an official closure report. ' : ''}Follow the managing agency’s notices.
        </Text>
      ) : null}
      {directionsMenu}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radii.card, padding: 16, gap: 10 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { ...t.lg, fontFamily: fonts.heading, flexShrink: 1 },
  note: { ...t.xs },
  controls: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1 },
  chipText: { ...t.sm, fontFamily: fonts.medium },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth },
  // A floor, so the name keeps the row and the button drops under it at large text sizes.
  rowText: { flexGrow: 1, flexShrink: 1, flexBasis: 180, gap: 2 },
  name: { ...t.base, fontFamily: fonts.heading },
  distance: { ...t.xs, fontFamily: fonts.medium },
  caution: { borderWidth: 1, borderRadius: radii.inset, padding: 10, gap: 2, marginTop: 6 },
  cautionTitle: { ...t.sm, fontFamily: fonts.semibold },
  directions: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, paddingHorizontal: 12, borderRadius: radii.inset, borderWidth: 1 },
  more: { minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: radii.inset, borderWidth: 1, paddingHorizontal: 12 },
});
