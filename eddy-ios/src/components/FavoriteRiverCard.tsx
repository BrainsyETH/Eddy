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
// ── The line is the BOTTOM LINE, deliberately ───────────────────────────────
// /outlook returns three pieces of prose, and only one of them belongs on a
// card like this. Eddy's read is the long written report and is the single paid
// thing in the app — see the header of PaywallSheet, and the lock in EddyTake.
// The weather section is forward-looking and needs the 72-hour strip beside it
// to mean anything. The bottom line is the CALL, derived from the current
// condition alone, and it is free everywhere in the product precisely because
// it is a safety judgement. Nothing on this card is gated, and nothing on it
// needs to be.
//
// ── It degrades to the row it replaced ──────────────────────────────────────
// The report is an enrichment on an enrichment: /api/rivers gives the condition,
// /outlook gives the call, and this screen's whole promise is that it works with
// no signal at a put-in. A river with no report renders the condition and the
// reading and stops — which is exactly what the old row showed, so the failure
// mode is the previous design rather than a hole.

import { memo } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { RiverListItem, RiverOutlookResponse } from '@eddy/types';
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
import { Otter, otterForCondition } from '@/components/Otter';
import { formatReading, primaryReading, readingAge } from '@/lib/readingCopy';

const TREND_ICON = {
  rising: 'arrow-up' as const,
  falling: 'arrow-down' as const,
  steady: 'remove' as const,
};

interface Props {
  river: RiverListItem;
  /** Today's call for this river. Null when it has none or the fetch failed. */
  report: RiverOutlookResponse | null;
  /** True while the report is still on its way — the card renders regardless. */
  reportLoading?: boolean;
  onPress: () => void;
  onToggleStar: () => void;
}

function FavoriteRiverCardComponent({
  river,
  report,
  reportLoading = false,
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

  const bottomLine = report?.sections?.bottomLine ?? null;

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
              condition?.label ?? conditionLongLabel(code),
              reading ? formatReading(reading.value, reading.unit) : 'no gauge reading',
              trend?.label,
              bottomLine,
            ]
              .filter(Boolean)
              .join(', ')}
          >
            <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
              {river.name}
            </Text>
            <View
              style={[
                styles.chip,
                { backgroundColor: conditionBg(code), borderColor: conditionChipBorder(code) },
              ]}
            >
              <Text style={[styles.chipText, { color: conditionInk(code) }]}>
                {condition?.label ?? conditionLongLabel(code)}
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
          </View>
        </Pressable>

        {/* ── Today's call ───────────────────────────────────────────
            The reason this screen stopped being a list of readings. Given the
            accent edge Eddy's bottom line wears everywhere else in the app, so
            the same sentence is recognisably the same thing here and on the
            river screen. */}
        {bottomLine ? (
          <View style={[styles.call, { borderLeftColor: colors.accent }]}>
            <Text style={[styles.callText, { color: colors.text }]} numberOfLines={4}>
              {bottomLine}
            </Text>
            {report?.gaugeName ? (
              <Text style={[styles.callSource, { color: colors.textSubtle }]} numberOfLines={1}>
                via {report.gaugeName}
              </Text>
            ) : null}
          </View>
        ) : reportLoading ? (
          <View style={styles.callLoading}>
            <ActivityIndicator size="small" color={colors.accent} />
            <Text style={[styles.metaText, { color: colors.textSubtle }]}>
              Reading the river…
            </Text>
          </View>
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
  body: { flex: 1, minWidth: 0, paddingVertical: 12, paddingLeft: 13, paddingRight: 4 },
  head: { flexDirection: 'row', alignItems: 'flex-start' },
  headMain: { flex: 1, minWidth: 0, gap: 6 },
  name: { ...t.base, fontFamily: fonts.semibold },
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
  call: { borderLeftWidth: 3, paddingLeft: 10, marginTop: 12, marginRight: 8 },
  callText: { ...t.sm, fontFamily: fonts.semibold },
  callSource: { ...t.xs, fontFamily: fonts.body, marginTop: 4 },
  callLoading: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
});
