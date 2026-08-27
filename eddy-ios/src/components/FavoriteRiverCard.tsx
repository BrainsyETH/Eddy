// eddy-ios/src/components/FavoriteRiverCard.tsx
// A starred river, as a condition card rather than a row of numbers.
//
// ── Why Favorites does not use RiverRow ─────────────────────────────────────
// RiverRow is a LIST row, and it is the right shape for a list: twenty-four
// rivers you are scanning to pick one, each reduced to a name, a word and a
// number so the comparison is fast. Favorites is not that list. It holds three
// or four rivers somebody explicitly chose, it is the screen they open to check
// on them, and giving each one the same compressed row asked them to do the
// interpretation themselves — "944 cfs, Good" is a measurement, not an answer.
//
// So a favourite gets the card: the same verdict, the same reading, and then
// Eddy's live call on it. That last line is the whole point of the change. It
// is the one thing here that says what to DO, and it is written against today's
// water rather than being a label on a number.
//
// ── The line under the reading is now the BAND TRACK, not prose ─────────────
// It was the bottom line from /outlook — the CALL, one sentence, derived from
// the current condition. That was a real improvement on "944 cfs, Good", and it
// cost one HTTP request per starred river on every open of this screen, on the
// connection this screen exists to work on.
//
// The track is the better answer at a fraction of the price. "Where does this
// number sit between too low and flood" is the question a favourite is being
// checked for, it is answered in a glance rather than in a sentence, and every
// input is ALREADY IN MEMORY: /api/gauges is fetched by this screen anyway, and
// each gauge carries the ladder per river it grades. So the card gained the
// more useful line and the screen lost its whole request fan-out — from N+2
// requests to open Favorites down to 2.
//
// The prose is not gone from the product. Eddy's read and the bottom line both
// live on the river screen, one tap away, where there is room for them and
// where the 72-hour strip is beside them to give the forward-looking half
// something to stand on.
//
// ── It degrades to the row it replaced ──────────────────────────────────────
// The ladder is an enrichment: /api/rivers gives the condition and the reading,
// /api/gauges gives the bands. A river whose gauge has no ladder — or whose
// ladder is in a unit the reading is not in — renders the condition and the
// reading and stops, which is exactly what the old row showed. The failure mode
// is the previous design rather than a hole.

import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { MapGauge, RiverListItem } from '@eddy/types';
import {
  conditionBg,
  conditionChipBorder,
  conditionColor,
  conditionInk,
  conditionLongLabel,
  conditionText,
} from '@/theme/conditions';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';
import { KindMark } from '@/components/KindMark';
import { Otter, otterForCondition } from '@/components/Otter';
import { ReadingScale } from '@/components/ReadingScale';
import { damControlledLabel, formatReading, primaryReading, readingAge } from '@/lib/readingCopy';
import type { EddySays } from '@/lib/eddySays';
import { TREND_ICON } from '@/components/TrendPill';

/**
 * One river's row out of a gauge's `thresholds` array.
 *
 * Derived from MapGauge rather than restated, so this cannot drift from what
 * /api/gauges actually sends — and so ReadingScale, which takes the same shape,
 * keeps type-checking against it.
 */
export type GaugeThresholds = NonNullable<MapGauge['thresholds']>[number];

interface Props {
  river: RiverListItem;
  /**
   * The ladder this river's reading is graded on, from its primary gauge.
   *
   * Null is ORDINARY, not a failure: a river with no gauge has none, and
   * /api/gauges may simply not have landed yet. The card renders without it.
   */
  thresholds: GaugeThresholds | null;
  /**
   * The station the reading and the track above it actually came from.
   *
   * ── Why the card says this out loud ─────────────────────────────────────
   *
   * A river is a line and a reading is a point on it. The Meramec is gauged
   * four times over 108 miles, and this card prints ONE number under the
   * river's name as though the river had a level — which is the same elision
   * RiverGaugeAlerts exists to correct on the alerts side. Somebody who floats
   * the upper river was reading a verdict measured 70 miles downstream and the
   * card never said so.
   *
   * Null is ordinary — no gauge, or /api/gauges has not landed — and the line
   * is simply absent rather than guessed at.
   */
  gaugeName?: string | null;
  /**
   * Eddy's FREE line about this river, or null when there is none.
   *
   * ── The prose is back, and it costs ONE request now ──────────────────────
   *
   * This screen used to fan out /api/rivers/[slug]/outlook per starred river to
   * put Eddy's bottom line on each card, with batching and an epoch counter to
   * stop twenty sockets opening on one bar of LTE. That is why the prose was
   * removed. /api/eddy-updates is a SINGLE call carrying an entry for every
   * river, already made for the Today tab and shared through useEddyUpdates —
   * so the reason no longer applies.
   *
   * It is an EddySays, not an update: the type has no field the paid quote
   * could arrive in. See src/lib/eddySays.ts.
   */
  says?: EddySays | null;
  onPress: () => void;
  onToggleStar: () => void;
}

function FavoriteRiverCardComponent({
  river,
  thresholds,
  gaugeName = null,
  says = null,
  onPress,
  onToggleStar,
}: Props) {
  const { colors, elevation, isDark } = useTheme();

  const condition = river.currentCondition;
  const code = condition?.code ?? 'unknown';
  // Returns null when there is no gauge AND when the rated unit's reading is
  // missing — both are ordinary, and neither may be papered over with the other
  // unit's number. See primaryReading.
  const reading = condition ? primaryReading(condition) : null;
  const trend = condition?.trend ?? null;
  const age = readingAge(condition?.readingAgeHours);

  return (
    <View style={[styles.card, { backgroundColor: colors.card }, elevation(1)]}>
      {/* The same 4pt condition stripe every other list in the app uses, so a
          favourite and a search result are obviously the same kind of object. */}
      <View style={[styles.stripe, { backgroundColor: conditionColor(code) }]} />

      <View style={styles.body}>
        <View style={styles.head}>
          <Pressable
            onPress={onPress}
            style={({ pressed }) => [styles.headMain, { opacity: pressed ? 0.6 : 1 }]}
            accessibilityRole="button"
            accessibilityLabel={[
              river.name,
              damControlledLabel(river.riverType, code) ?? condition?.label ?? conditionLongLabel(code),
              reading ? formatReading(reading.value, reading.unit) : 'no gauge reading',
              trend?.label,
              gaugeName && reading ? `via ${gaugeName}` : null,
            ]
              .filter(Boolean)
              .join(', ')}
          >
            {/* THE KIND, drawn. GaugeRow and DamRow have carried a KindMark
                since they shipped; this card had none, so in a Favorites list
                holding all three the river was the one row you had to read to
                identify. The mark is the same one the Today tab and the search
                results use, so a river looks like a river everywhere. */}
            <View style={styles.nameRow}>
              <KindMark kind="river" color={colors.textMuted} />
              <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
                {river.name}
              </Text>
            </View>
            <View
              style={[
                styles.chip,
                { backgroundColor: conditionBg(code), borderColor: conditionChipBorder(code) },
              ]}
            >
              <Text style={[styles.chipText, { color: conditionInk(code) }]}>
                {damControlledLabel(river.riverType, code) ?? condition?.label ?? conditionLongLabel(code)}
              </Text>
            </View>
          </Pressable>

          {/* A SIBLING of the navigation target, never a child — the same
              arrangement RiverRow settled on so the two touch areas cannot
              overlap and a tap near the star cannot be ambiguous. */}
          <Pressable
            onPress={onToggleStar}
            style={({ pressed }) => [styles.starColumn, { opacity: pressed ? 0.5 : 1 }]}
            accessibilityRole="button"
            accessibilityLabel={`Unstar ${river.name}`}
          >
            <Ionicons name="star" size={21} color={colors.warm} />
          </Pressable>
        </View>

        <Pressable
          onPress={onPress}
          style={({ pressed }) => [styles.reading, { opacity: pressed ? 0.6 : 1 }]}
          accessible={false}
        >
          <Otter mood={otterForCondition(code)} size={44} />
          <View style={styles.readingText}>
            <Text
              style={[
                styles.readingValue,
                // "No gauge reading" is not a condition, so it stays neutral:
                // painting it in the unknown grey would imply the grey was
                // measured.
                { color: reading ? conditionText(code, isDark) : colors.textSubtle },
              ]}
              numberOfLines={1}
            >
              {reading ? formatReading(reading.value, reading.unit) : 'No gauge reading'}
            </Text>
            <View style={styles.meta}>
              {trend ? (
                <>
                  {/* Muted ink, never green-for-rising: on a river approaching
                      flood, "rising fast" is the opposite of good news. The
                      chip above carries the verdict. */}
                  <Ionicons
                    name={TREND_ICON[trend.direction]}
                    size={12}
                    color={colors.textMuted}
                  />
                  <Text style={[styles.metaText, { color: colors.textMuted }]} numberOfLines={1}>
                    {trend.label}
                  </Text>
                </>
              ) : null}
              {age ? (
                <Text style={[styles.metaText, { color: colors.textSubtle }]} numberOfLines={1}>
                  {trend ? '· ' : ''}
                  {age}
                </Text>
              ) : null}
            </View>
            {/* Under the number it qualifies, in the subtle role — this is
                attribution, not a second reading. Only when the reading it
                would attribute actually exists: "via Meramec at Eureka" over
                "No gauge reading" would be attributing nothing to somewhere. */}
            {gaugeName && reading ? (
              <Text style={[styles.metaText, { color: colors.textSubtle }]} numberOfLines={1}>
                via {gaugeName}
              </Text>
            ) : null}
          </View>
        </Pressable>

        {/* ── Where that number sits ─────────────────────────────────
            The reason this screen stopped being a list of readings. "944 cfs"
            is a measurement; the marker's position between too-low and flood is
            the answer, and it is read in the time it takes to look at it.

            Rendered only when the ladder is in the SAME unit as the reading
            above it. ReadingScale places its marker by comparing the value
            against the raw band bounds — arithmetic that cannot tell feet from
            cfs — so a stage reading against a cfs ladder would put a river in
            flood at 2.85. The component guards this itself, and the guard is
            repeated here so the card does not reserve space for a track that is
            about to decline to draw. */}
        {thresholds && reading && thresholds.thresholdUnit === reading.unit ? (
          <View style={styles.scale}>
            <ReadingScale thresholds={thresholds} value={reading.value} unit={reading.unit} />
          </View>
        ) : null}

        {/* ── What Eddy makes of it ──────────────────────────────────
            LAST, under the track. The card's argument runs number, then where
            that number sits, then the sentence about it — so the prose is read
            as a comment on the answer above rather than as the answer. The
            track is still what this screen is for.

            One line only. A curated list of three or four rivers checked at a
            glance is not the place for a paragraph; the full report is on the
            river screen, which is one tap away and where there is room. */}
        {says ? (
          <Text style={[styles.says, { color: colors.textMuted }]} numberOfLines={2}>
            {says.text}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

export const FavoriteRiverCard = memo(FavoriteRiverCardComponent);

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'stretch',
    marginHorizontal: 16,
    marginBottom: 10,
    borderRadius: 14,
    overflow: 'hidden',
  },
  stripe: { width: 4 },
  // Sits under the track with the same left margin as the reading block above
  // it, so the three read as one column rather than as a caption bolted on.
  says: { ...t.sm, fontFamily: fonts.body, lineHeight: 19, marginTop: 10, paddingRight: 9 },
  body: { flex: 1, minWidth: 0, paddingVertical: 12, paddingLeft: 13, paddingRight: 4 },
  head: { flexDirection: 'row', alignItems: 'flex-start' },
  headMain: { flex: 1, minWidth: 0, gap: 6 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  name: { ...t.base, fontFamily: fonts.semibold, flexShrink: 1 },
  chip: {
    alignSelf: 'flex-start',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
  },
  chipText: { ...t.xs, fontFamily: fonts.semibold },
  // 52pt wide and full height on the star, comfortably past the 44pt minimum
  // without borrowing space from its neighbour via hitSlop.
  starColumn: { width: 52, alignItems: 'center', justifyContent: 'center', alignSelf: 'stretch' },
  reading: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10, paddingRight: 8 },
  readingText: { flex: 1, minWidth: 0 },
  // Mono is functional, not decorative: proportional digits change width as the
  // number ticks, which would shift this card on every refresh.
  readingValue: { ...t.xl, fontFamily: fonts.mono },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  metaText: { ...t.xs, fontFamily: fonts.body },
  // Right padding matches the reading row above so the track's flood end lines
  // up with the number rather than running under the star column.
  scale: { marginTop: 12, paddingRight: 8 },
});
