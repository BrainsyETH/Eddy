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
import { readingSummaryScaleLabels } from '@/lib/readingSummary';

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
  /** Compact summary labels, without repeating the headline reading. */
  summary?: boolean;
  /** Historical or untrusted readings must not look like a current verdict. */
  muted?: boolean;
}

export function ReadingScale({ thresholds, value, unit, summary = false, muted = false }: ReadingScaleProps) {
  const { colors, elevation } = useTheme();

  // THE LADDER'S OWN UNIT WINS. Every label below is formatted with `unit`, but
  // the numbers being formatted are the THRESHOLDS — so if the caller's unit and
  // the ladder's disagree, this track prints cfs bounds with a stage's two
  // decimal places and no thousands separator ("3000.00+ flood" beside a
  // "2.85 now"). The field has been declared on the thresholds prop since this
  // component shipped and was never read; reading it makes the mismatch
  // impossible rather than merely unlikely.
  const scaleUnit = thresholds.thresholdUnit ?? unit;

  // A GENUINE DISAGREEMENT MEANS NO SCALE. Formatting the labels with the
  // ladder's unit fixes the words, but the marker is placed by comparing `value`
  // against the raw band bounds — arithmetic that cannot tell feet from cfs. So
  // if the caller's reading really is in the other unit, the marker lands
  // somewhere confident and wrong, which is worse than nothing. Same posture as
  // the two-band guard below: refuse rather than mislead.
  if (thresholds.thresholdUnit && unit !== thresholds.thresholdUnit) return null;

  const zones = buildZones(thresholds);
  // A partial ladder is common — plenty of gauges carry only some levels — but
  // below two bands there is no scale to speak of, and a one-band track would
  // imply a precision the data does not have.
  if (zones.length < 2) return null;

  const markerPercent = zoneMarkerPercent(zones, value);
  // Which band the marker sits in, derived from its position rather than
  // re-graded: bands are drawn at EQUAL width, so the percentage maps straight
  // onto an index and cannot disagree with where the marker is painted.
  const markerIndex =
    markerPercent == null
      ? null
      : Math.min(zones.length - 1, Math.floor((markerPercent / 100) * zones.length));
  const first = zones[0];
  const last = zones[zones.length - 1];
  const summaryLabels = summary ? readingSummaryScaleLabels(zones, scaleUnit) : null;

  return (
    <View
      style={[styles.wrapper, summary && styles.summaryWrapper]}
      accessibilityLabel={
        value != null
          ? `${formatZoneValue(value, scaleUnit)} ${scaleUnit}, between ${formatZoneValue(first.min, scaleUnit)} and ${formatZoneValue(last.min, scaleUnit)} ${scaleUnit}`
          : 'Condition scale, no current reading'
      }
    >
      {/* The marker is a SIBLING of the track, not a child of it. The track
          clips (overflow: hidden, for its rounded ends), and while the marker
          lived inside it the 16pt marker was cut back to the track's 8pt — a
          dark sliver that disappeared into the dark too-low band, which is the
          exact band a reader most needs to see it in. */}
      <View style={styles.trackFrame}>
        <View style={styles.track}>
          {/* The band the reading is IN stays at full strength and the rest
              recede. Six saturated bands compete with a marker for attention
              and win; dimming makes the answer readable before the marker is
              even found. Same treatment as the website's reading card. */}
          {zones.map((zone, index) => (
            <View
              key={zone.key}
              style={[
                styles.band,
                {
                  backgroundColor: muted ? colors.textSubtle : zone.color,
                  opacity: muted ? 0.35 : markerIndex == null || index === markerIndex ? 1 : 0.4,
                },
              ]}
            />
          ))}
        </View>
        {markerPercent != null ? (
          // Pulled back by half its width so the marker centres on its position
          // instead of starting there — at 100% it would otherwise hang off the
          // end of the track.
          <View
            style={[
              styles.marker,
              { left: `${markerPercent}%`, backgroundColor: colors.text, borderColor: colors.card },
              elevation(1),
            ]}
          />
        ) : null}
      </View>

      {summaryLabels ? (
        <View style={styles.summaryLabels}>
          <Text style={[styles.summaryLabel, { color: colors.textSubtle }]}>{summaryLabels.start}</Text>
          <Text style={[styles.summaryLabel, styles.summaryEnd, { color: colors.textSubtle }]}>{summaryLabels.end}</Text>
        </View>
      ) : <View style={styles.labels}>
        <Text style={[styles.label, { color: colors.textSubtle }]}>
          {formatZoneValue(first.max, scaleUnit)} low
        </Text>
        {value != null ? (
          <Text style={[styles.labelNow, { color: colors.text }]}>
            {formatZoneValue(value, scaleUnit)} now
          </Text>
        ) : null}
        {/* The flood band is open-ended, so its floor is the meaningful number —
            printing the synthetic max would invent a ceiling. */}
        <Text style={[styles.label, { color: colors.textSubtle }]}>
          {formatZoneValue(last.min, scaleUnit)}
          {last.openEnded ? '+' : ''} flood
        </Text>
      </View>}
    </View>
  );
}

/**
 * A post that stands proud of the track on both sides.
 *
 * The marker used to be 6pt wide and is still the reading's ink, but it now
 * overhangs the 8pt track by 6pt above and below, with a 2pt halo in the card
 * colour and the theme's level-1 shadow. The overhang is what makes it findable: inside the
 * track it competed with the band colours on their own terms and lost against
 * the dark ones; outside it, it is the only thing on that line.
 */
const MARKER_WIDTH = 8;
const MARKER_HEIGHT = 20;
const MARKER_HALO = 2;
const TRACK_HEIGHT = 8;

const styles = StyleSheet.create({
  // The frame is 12pt taller than the bare track it replaced; the margins
  // give that back, so every card holding a scale keeps its height.
  wrapper: { marginTop: 8 },
  summaryWrapper: { marginTop: 6 },
  summaryLabels: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, marginTop: 2 },
  summaryLabel: { ...t.xs, fontFamily: fonts.body, flexShrink: 1 },
  summaryEnd: { textAlign: 'right' },
  // Tall enough to hold the marker's overhang, so it never collides with the
  // labels underneath or the content above.
  trackFrame: { height: MARKER_HEIGHT, justifyContent: 'center', position: 'relative' },
  track: { flexDirection: 'row', height: TRACK_HEIGHT, borderRadius: 999, overflow: 'hidden' },
  band: { flex: 1, height: '100%' },
  marker: {
    position: 'absolute',
    top: 0,
    width: MARKER_WIDTH,
    height: MARKER_HEIGHT,
    marginLeft: -MARKER_WIDTH / 2,
    borderRadius: MARKER_WIDTH / 2,
    borderWidth: MARKER_HALO,
  },
  labels: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 2 },
  label: { ...t.xs, fontFamily: fonts.mono },
  labelNow: { ...t.xs, fontFamily: fonts.monoMedium },
});
