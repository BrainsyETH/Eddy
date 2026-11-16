// The Read interprets the chart immediately above it; the free three-day
// forecast follows. Premium controls only the interpretation, never weather
// facts. Only longer prose expands; Weather and Bottom line remain visible.
// The server remains the authority for paid text and selected-gauge freshness.

import { useState, type ReactNode } from 'react';
import { readPreview, distinctReadContext } from '@eddy/conditions/read-presentation';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { WeatherIcon } from '@/components/WeatherIcon';
import { weatherDestination } from '@/lib/weatherDestination';
import { Ionicons } from '@expo/vector-icons';
import type { RiverOutlookResponse } from '@eddy/types';
import { conditionBg, conditionInk } from '@/theme/conditions';
import { EddySymbol } from '@/components/EddySymbol';
import { ReadHeading } from '@/components/ReadHeading';
import { Otter } from '@/components/Otter';
import { BlurredProse, PremiumLockRow, ReadSkeleton } from '@/components/PremiumLock';
import { LOCKED_DAM_READ_SHAPE } from '@/components/dam/DamEddyRead';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';

/**
 * One line of `sectionText`, and the gap above it, from the type scale.
 *
 * Both are read by the overlay offset below and by the style itself, so the
 * sharp opener cannot drift out of alignment with the line it is meant to
 * uncover. Only `sectionText` is ever given a sharp opener — see the read
 * section, and note that `bottomLineText` is set in a different size.
 */
const SECTION_LINE_HEIGHT = t.sm.lineHeight;
const SECTION_TEXT_MARGIN_TOP = 5;

/**
 * What to smear when the server sent no text at all for a section.
 *
 * Only reachable on the locked card, and only when the payload is short of a
 * section — `fullRead` is withheld server-side whenever the live river has
 * moved far enough that the prose would contradict the condition chip. Blurring
 * nothing would collapse the section to a heading and a gap, which reads as a
 * rendering fault rather than as a locked report.
 *
 * These are LENGTH, not content. Nobody can read them, and nothing else on the
 * card is derived from them — they exist so the three areas keep their
 * proportions when a section happens to be missing.
 */
const LOCKED_READ_SHAPE =
  'The gauge is reading in the middle of its band this morning, and the last two days of rain have not moved it much. The upper stretch is the one worth watching for the rest of the week.';
const LOCKED_WEATHER_SHAPE =
  'Scattered storms are possible in the afternoon, with the heavier cells staying north of the valley.';
const LOCKED_BOTTOM_LINE_SHAPE = 'Good day to be on this river.';

function dayLabel(date: string, index: number): string {
  if (index === 0) return 'Today';
  // Noon UTC keeps the weekday stable regardless of the device's zone.
  return new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short' });
}

interface EddyTakeProps {
  outlook: RiverOutlookResponse;
  /**
   * The unit the river's CURRENT reading is in, so the forecast can say when it
   * differs from its own. Null when there is no reading to differ from.
   */
  ratedUnit?: 'ft' | 'cfs' | null;
  /**
   * Whether this person is subscribed — `null` meaning UNKNOWN, not "no".
   *
   * Only `false` locks anything. An unreachable /api/me/profile must not lock a
   * paying customer out on one bar of signal, so unknown fails open. This is
   * now the app's ONLY entitlement gate — the offline download was the other,
   * and it is gone.
   *
   * `'pending'` is a THIRD state and is not the same as null. Null means the
   * answer failed and we chose to be generous; 'pending' means the answer is
   * still in flight. Collapsing them made every cold open of a river screen
   * paint the full paid report for as long as /api/me/profile took, and then
   * yank it away — the report leaked to non-subscribers by default, and the
   * flash looked like a bug to everyone else. Loading renders a skeleton.
   * `'error'` is a fourth, explicit state: the Premium request failed without
   * an entitlement decision, so the card offers a retry instead of pretending
   * the deterministic short read is the paid response.
   */
  entitled?: boolean | null | 'pending' | 'error';
  /** Opens the paywall. Only ever called from the locked take. */
  onUpgrade?: () => void;
  /** Retries a Premium read that failed without an entitlement decision. */
  onRetry?: () => void;
  /**
   * On a dam's own unrated release (shared/dam-release-tab.ts): the dam's Read,
   * drawn in the EDDY'S READ section in place of the river Read, with BOTTOM
   * LINE dropped. There the river Read can only say no assessment is available
   * and the bottom line only that there is not enough data. Rendered only when
   * unlocked; locked, the section frosts LOCKED_DAM_READ_SHAPE under the card's
   * one lock row. The screen derives `entitled` from the dam Read's own access
   * rules on that tab, so 'error' (a failed RIVER Premium read) does not apply.
   * `content` is null whenever there is no verified member to fetch it for.
   */
  damRead?: { content: ReactNode | null } | null;
}

export function EddyTake({
  outlook,
  entitled = null,
  onUpgrade,
  onRetry,
  damRead,
}: EddyTakeProps) {
  const { colors, elevation, isDark } = useTheme();
  const { sections, days } = outlook;
  const router = useRouter();
  const forecastDestination = weatherDestination(outlook.weatherCoordinates);

  // The long report when the server sent one, the single deterministic line
  // otherwise. `fullRead` is withheld server-side when the live river has moved
  // far enough that the prose would contradict the condition chip above — so a
  // null here is an ANSWER, and must not be worked around.
  const read = outlook.fullRead || sections?.eddyRead || '';
  const [expandedRead, setExpandedRead] = useState<string | null>(null);
  const readKey = `${outlook.gaugeName ?? ''}:${read}`;
  const expanded = expandedRead === readKey;
  const preview = readPreview(read, 640, 5);
  const weatherContext = distinctReadContext(read, sections?.watchFor);
  const bottomLine = distinctReadContext(`${read} ${weatherContext ?? ''}`, sections?.bottomLine);
  const locked = entitled === false;
  const resolving = entitled === 'pending';
  const failed = entitled === 'error' && !damRead;

  return (
    <View style={styles.wrapper}>
      {/* Interpretation follows the chart, ahead of the free forecast. */}
      {sections ? (
        <View style={[styles.card, { backgroundColor: colors.card }, elevation(1)]}>
          {/* Wait for entitlement before rendering paid prose or an upgrade offer. */}
          {resolving ? (
            <ReadSkeleton label="Loading Eddy's Read" />
          ) : failed ? (
            <View style={[styles.loadError, { backgroundColor: colors.cardRaised }]}>
              <Ionicons name="cloud-offline-outline" size={18} color={colors.textMuted} />
              <View style={styles.loadErrorCopy}>
                <Text style={[styles.loadErrorTitle, { color: colors.text }]}>Full read couldn&apos;t load</Text>
                <Text style={[styles.loadErrorBody, { color: colors.textSubtle }]}>The river facts above are still current.</Text>
              </View>
              {onRetry ? (
                <Pressable
                  onPress={onRetry}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Try loading Eddy's Read again"
                >
                  <Text style={[styles.loadErrorAction, { color: colors.interactive }]}>Try again</Text>
                </Pressable>
              ) : null}
            </View>
          ) : (
            <>
              {/* The Read opens the card; subsequent sections add their own divider. */}
              <View>
                <ReadHeading />
                {damRead ? (
                  locked ? (
                    <BlurredProse
                      text={LOCKED_DAM_READ_SHAPE}
                      color={colors.textMuted}
                      style={styles.sectionText}
                      lines={2}
                    />
                  ) : damRead.content ?? <ReadSkeleton label="Loading Eddy's Read for this dam" />
                ) : locked ? (
                  // Two lines keep the teaser compact; only its public opener is sharp. The full
                  // read runs to several paragraphs on a good day, and a locked
                  // card the height of an unlocked one is a wall again — two
                  // lines is enough to show this is prose rather than a
                  // sentence, and the sharp opener is what makes it an
                  // interrupted one rather than a closed door. With no read
                  // text the prose is LOCKED_READ_SHAPE, and a readable first
                  // line of it would pass a made-up sentence off as Eddy's.
                  <BlurredProse
                    text={read || LOCKED_READ_SHAPE}
                    color={colors.textMuted}
                    style={styles.sectionText}
                    lines={2}
                    blurTop={read ? SECTION_TEXT_MARGIN_TOP + SECTION_LINE_HEIGHT : 0}
                  />
                ) : read ? (
                  <Text style={[styles.sectionText, { color: colors.textBody }]}>{expanded ? read : preview}</Text>
                ) : null}
              </View>

              {!locked && !damRead && preview !== read ? (
                <Pressable accessibilityRole="button" accessibilityState={{ expanded }}
                  onPress={() => setExpandedRead(expanded ? null : readKey)} style={{ minHeight: 44, justifyContent: 'center' }}>
                  <Text style={[styles.loadErrorAction, { color: colors.interactive }]}>{expanded ? 'Read less' : 'Read more'}</Text>
                </Pressable>
              ) : null}
              {weatherContext ? <View style={[styles.section, { borderTopColor: colors.border }]}>
                <View style={styles.sectionHead}>
                  <EddySymbol name="weather" size={17} />
                  <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>WEATHER</Text>
                </View>
                {/* No sharp opener here, nor on the bottom line below. Both are
                    one or two sentences, so a legible first line would be most
                    of the section — the read is the only one long enough for an
                    opener to be a taste rather than the thing itself. */}
                {locked ? (
                  <BlurredProse
                    text={sections.watchFor || LOCKED_WEATHER_SHAPE}
                    color={colors.textMuted}
                    style={styles.sectionText}
                    lines={2}
                  />
                ) : (
                  <Text style={[styles.sectionText, { color: colors.textBody }]}>
                    {weatherContext}
                  </Text>
                )}
              </View>

              : null}
              {damRead || !bottomLine ? null : (
              <View style={[styles.section, { borderTopColor: colors.border }]}>
                {/* No coloured edge, and no indent. The rule and the 12pt inset
                    that came with it pushed BOTTOM LINE a centimetre to the
                    right of EDDY'S READ and WEATHER, so the one section meant
                    to read as the conclusion of the two above it was the one
                    that did not line up with them. Three headings on one
                    margin is what makes them a set.

                    The emphasis it was carrying has not gone anywhere: the
                    label is still in the accent colour, it still gets the otter
                    where the others get a glyph, and its text is still the only
                    body on the card set in the larger face. */}
                <View>
                  <View style={styles.sectionHead}>
                    <Otter mood="favicon" size={18} style={styles.bottomLineOtter} />
                    <Text style={[styles.sectionLabel, { color: colors.accent }]}>
                      BOTTOM LINE
                    </Text>
                  </View>
                  {locked ? (
                    <BlurredProse
                      text={sections.bottomLine || LOCKED_BOTTOM_LINE_SHAPE}
                      color={colors.text}
                      style={styles.bottomLineText}
                      lines={2}
                    />
                  ) : (
                    <Text style={[styles.bottomLineText, { color: colors.text }]}>
                      {bottomLine}
                    </Text>
                  )}
                </View>
              </View>
              )}

              {/* One shared Premium offer, using the same copy as dam Reads. */}
              {locked ? <PremiumLockRow onPress={onUpgrade} /> : null}

              {/* Attribution is a fact about which station this describes, and
                  facts about the water are free — so it survives the lock. */}
              {outlook.gaugeName ? (
                <Text style={[styles.attribution, { color: colors.textSubtle }]}>
                  via {outlook.gaugeName}
                </Text>
              ) : null}
            </>
          )}
        </View>
      ) : null}
      {/* The three-day weather strip and separate NWS river forecast. */}
      {days.length > 0 ? (
        <Pressable onPress={forecastDestination ? () => router.push(forecastDestination) : undefined}
          disabled={!forecastDestination} accessible={false}
          style={[styles.card, { backgroundColor: colors.card }, elevation(1)]}>
          <Pressable onPress={forecastDestination ? () => router.push(forecastDestination) : undefined}
            disabled={!forecastDestination} accessibilityRole={forecastDestination ? 'button' : undefined}
            accessibilityLabel={`Will it hold? Next 3 days${outlook.weatherLocation ? ` near ${outlook.weatherLocation}` : ''}`}
            accessibilityHint={forecastDestination ? 'Opens the full weather forecast for this location' : undefined}
            style={styles.stripHead}>
            <View style={styles.stripHeadText}>
              <Text style={[styles.stripTitle, { color: colors.text }]}>Will it hold?</Text>
              <Text style={[styles.stripSub, { color: colors.textSubtle }]}>Next 3 days</Text>
            </View>
            {/* The location names the weather sample. NWS attribution belongs
                to the separate river forecast row below. */}
            {outlook.weatherLocation ? (
              <View style={styles.source}>
                <Ionicons name="location-outline" size={12} color={colors.textMuted} />
                <Text style={[styles.sourceText, { color: colors.textMuted }]} numberOfLines={2}>
                  {outlook.weatherLocation}
                </Text>
              </View>
            ) : null}
            {forecastDestination ? <Ionicons name="chevron-forward" size={16} color={colors.interactive} /> : null}
          </Pressable>

          <View style={[styles.dayRow, { borderTopColor: colors.border }]}>
            {days.map((day, index) => (
              <View
                key={day.date}
                style={[
                  styles.day,
                  index > 0 ? { borderLeftWidth: 1, borderLeftColor: colors.border } : null,
                ]}
                accessibilityLabel={
                  day.weather
                    ? `${dayLabel(day.date, index)}, high ${day.weather.tempHigh}, low ${day.weather.tempLow}, ${day.rainLabel}${day.weather.windSpeed != null ? `, wind ${Math.round(day.weather.windSpeed)} miles per hour` : ''}${day.heatAdvisory ? ', heat advisory range' : ''}`
                    : `${dayLabel(day.date, index)}, weather unavailable`
                }
              >
                <Text style={[styles.dayName, { color: colors.textSubtle }]}>
                  {dayLabel(day.date, index)}
                </Text>

                {day.weather ? (
                  <>
                    <WeatherIcon code={day.weather.conditionIcon} size={30} style={styles.dayGlyph} />
                    <Text style={[styles.temp, { color: colors.text }]}>
                      {day.weather.tempHigh}°{' '}
                      <Text style={{ color: colors.textSubtle }}>{day.weather.tempLow}°</Text>
                    </Text>
                    {/* Rain ramps grey → blue → deep blue with the chance, so
                        the strip can be read at a glance without parsing seven
                        percentages. The server picks the bucket; see the rain
                        roles in palette.ts for why the ramp is per scheme and
                        why it stopped being coral. */}
                    <Text
                      style={[
                        styles.rain,
                        {
                          color:
                            day.rainKind === 'significant'
                              ? colors.rainHeavy
                              : day.rainKind === 'possible'
                                ? colors.rainLikely
                                : colors.rainQuiet,
                          fontFamily:
                            day.rainKind === 'significant' ? fonts.heading : fonts.body,
                        },
                      ]}
                      numberOfLines={1}
                    >
                      {day.rainLabel}
                    </Text>
                    {/* Wind, when the server sent it. OMITTED, never zeroed,
                        for a payload predating the field — absent means "the
                        source did not say", not calm. Part of the outdoor-
                        conditions answer the phone could not give before the
                        outlook carried wind. */}
                    {day.weather.windSpeed != null ? (
                      <Text style={[styles.rain, { color: colors.textSubtle }]} numberOfLines={1}>
                        {Math.round(day.weather.windSpeed)} mph wind
                      </Text>
                    ) : null}
                    {day.heatAdvisory ? (
                      <View style={[styles.heat, { backgroundColor: conditionBg('high', isDark) }]}>
                        <Text style={[styles.heatText, { color: conditionInk('high', isDark) }]}>HEAT</Text>
                      </View>
                    ) : null}
                  </>
                ) : (
                  <Text style={[styles.unavailable, { color: colors.textSubtle }]}>
                    No weather
                  </Text>
                )}
              </View>
            ))}
          </View>

          {/* Official daily highs keep their own label and units. A river-level
              condition badge here could read as a verdict on the whole day. */}
          {outlook.hasOfficialForecast ? (
            <View style={[styles.forecast, { borderTopColor: colors.border }]}>
              <Text style={[styles.forecastLabel, { color: colors.textMuted }]}>NWS forecast · daily high</Text>
              <View style={styles.forecastRow}>
                {days.map((day, index) => (
                  <View key={day.date} style={[
                    styles.day,
                    index > 0 ? { borderLeftWidth: 1, borderLeftColor: colors.border } : null,
                  ]}>
                    {day.river.valueFt != null ? (
                      <Text style={[styles.forecastValue, { color: colors.text }]}
                        accessibilityLabel={`${dayLabel(day.date, index)}, NWS forecast daily high ${day.river.valueFt.toFixed(2)} feet`}>
                        {day.river.valueFt.toFixed(2)} ft
                      </Text>
                    ) : (
                      <Text style={[styles.unavailable, { color: colors.textSubtle }]}
                        accessibilityLabel={`${dayLabel(day.date, index)}, no river forecast`}>
                        No forecast
                      </Text>
                    )}
                  </View>
                ))}
              </View>
            </View>
          ) : null}
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { marginBottom: 12 },
  card: { padding: 16, borderRadius: 16, marginBottom: 10 },
  stripHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  stripHeadText: { flex: 1 },
  stripTitle: { ...t.base, fontFamily: fonts.heading },
  stripSub: { ...t.xs, fontFamily: fonts.body, marginTop: 1 },
  source: { flexDirection: 'row', alignItems: 'flex-start', gap: 4, maxWidth: 140 },
  sourceText: { ...t.xs, fontFamily: fonts.body, flexShrink: 1, textAlign: 'right' },
  dayRow: { flexDirection: 'row', marginTop: 12, paddingTop: 12, borderTopWidth: 1 },
  day: { flex: 1, alignItems: 'center', paddingHorizontal: 4, gap: 2 },
  dayName: { ...t.xs, fontFamily: fonts.semibold },
  dayGlyph: { marginTop: 2 },
  temp: { ...t.sm, fontFamily: fonts.monoMedium },
  rain: { ...t.xs },
  heat: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, marginTop: 2 },
  heatText: { fontSize: 12, lineHeight: 17, fontFamily: fonts.heading },
  unavailable: { ...t.xs, fontFamily: fonts.body },
  forecast: { marginTop: 12, paddingTop: 12, borderTopWidth: 1 },
  forecastLabel: { ...t.xs, fontFamily: fonts.semibold },
  forecastRow: { flexDirection: 'row', marginTop: 8 },
  forecastValue: { ...t.xs, fontFamily: fonts.monoMedium },
  // Nudged up so the mark sits on the label's cap height rather than its box —
  // the artwork carries its own margin, which a 13pt glyph does not.
  bottomLineOtter: { marginLeft: -2 },
  bottomLineText: { ...t.base, fontFamily: fonts.semibold, marginTop: 4 },
  section: { marginTop: 14, paddingTop: 12, borderTopWidth: 1 },
  loadError: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12 },
  loadErrorCopy: { flex: 1, minWidth: 0 },
  loadErrorTitle: { ...t.sm, fontFamily: fonts.semibold },
  loadErrorBody: { ...t.xs, fontFamily: fonts.body, marginTop: 2 },
  loadErrorAction: { ...t.sm, fontFamily: fonts.semibold },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  sectionLabel: { ...t.xs, fontFamily: fonts.heading, letterSpacing: 0.6 },
  sectionText: { ...t.sm, fontFamily: fonts.body, marginTop: SECTION_TEXT_MARGIN_TOP },
  attribution: { ...t.xs, fontFamily: fonts.body, marginTop: 12, textAlign: 'right' },
});
