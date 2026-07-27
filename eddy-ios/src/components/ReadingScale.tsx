// eddy-ios/src/components/ReadingScale.tsx
// The band track: where this reading sits between "too low" and "flood".
//
// A bare number is not a decision. "944 cfs" tells you nothing unless you
// already know this river, and that is more true in cfs than in feet — most of
// the catalog is cfs-rated, and nobody has an intuition for whether 944 is close
// to the flood line. The track answers it in one glance.
//
// The band maths comes from @eddy/conditions, the SAME module the website's
// reading card and levels table use — reached through the `file:` dependency on
// missouri-float-planner/shared, which npm symlinks into node_modules. Not a
// port: the phone runs that file. So the app cannot decide "Flowing" starts
// somewhere the website doesn't.
//
// The subpath import works because @eddy/conditions declares no `exports` map,
// so `@eddy/conditions/threshold-zones` resolves straight to the file. Do NOT
// reach for a tsconfig path alias instead — this file originally used
// `@shared/threshold-zones`, written against the pre-SDK-57 layout, and that is
// exactly what broke: see metro.config.js for why aliases were abandoned.
//
// Bands render at EQUAL width regardless of numeric range — see the note in the
// shared module. The marker position means "how far through this band", not
// "how much water", which is what keeps a 20,000-cfs flood band from crushing
// the bands people actually float in down to a sliver.

import { StyleSheet, Text, View } from 'react-native';
import { buildZones, formatZoneValue, zoneMarkerPercent } from '@eddy/conditions/threshold-zones';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';

interface ReadingScaleProps {
  thresholds: {
    levelTooLow: number | null;
    levelLow: number | null;
    levelOptimalMin: number | null;
    levelOptimalMax: number | null;
    levelHigh: number | null;
    levelDangerous: number | null;
    thresholdUnit?: 'ft' | 'cfs';
  };
  /** The reading being placed. Must already be in `unit`. */
  value: number | null;
  unit: 'ft' | 'cfs';
}

export function ReadingScale({ thresholds, value, unit }: ReadingScaleProps) {
  const { colors } = useTheme();

  const zones = buildZones(thresholds);
  // A partial ladder is common — plenty of gauges carry only some levels — but
  // below two bands there is no scale to speak of, and a one-band track would
  // imply a precision the data does not have.
  if (zones.length < 2) return null;

  const markerPercent = zoneMarkerPercent(zones, value);
  const first = zones[0];
  const last = zones[zones.length - 1];

  return (
    <View
      style={styles.wrapper}
      accessibilityLabel={
        value != null
          ? `${formatZoneValue(value, unit)} ${unit}, between ${formatZoneValue(first.min, unit)} and ${formatZoneValue(last.min, unit)} ${unit}`
          : 'Condition scale, no current reading'
      }
    >
      <View style={styles.track}>
        {zones.map((zone) => (
          <View key={zone.key} style={[styles.band, { backgroundColor: zone.color }]} />
        ))}
        {markerPercent != null ? (
          // Pulled back by half its width so the marker centres on its position
          // instead of starting there — at 100% it would otherwise hang off the
          // end of the track.
          <View
            style={[
              styles.marker,
              { left: `${markerPercent}%`, backgroundColor: colors.text, borderColor: colors.card },
            ]}
          />
        ) : null}
      </View>

      <View style={styles.labels}>
        <Text style={[styles.label, { color: colors.textSubtle }]}>
          {formatZoneValue(first.max, unit)} low
        </Text>
        {value != null ? (
          <Text style={[styles.labelNow, { color: colors.text }]}>
            {formatZoneValue(value, unit)} now
          </Text>
        ) : null}
        {/* The flood band is open-ended, so its floor is the meaningful number —
            printing the synthetic max would invent a ceiling. */}
        <Text style={[styles.label, { color: colors.textSubtle }]}>
          {formatZoneValue(last.min, unit)}
          {last.openEnded ? '+' : ''} flood
        </Text>
      </View>
    </View>
  );
}

const MARKER_WIDTH = 3;

const styles = StyleSheet.create({
  wrapper: { marginTop: 14 },
  track: { flexDirection: 'row', height: 8, borderRadius: 999, overflow: 'hidden', position: 'relative' },
  band: { flex: 1, height: '100%' },
  marker: {
    position: 'absolute',
    top: -3,
    width: MARKER_WIDTH,
    height: 14,
    marginLeft: -MARKER_WIDTH / 2,
    borderRadius: 2,
    borderWidth: 1,
  },
  labels: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 6 },
  label: { ...t.xs, fontFamily: fonts.mono },
  labelNow: { ...t.xs, fontFamily: fonts.monoMedium },
});
