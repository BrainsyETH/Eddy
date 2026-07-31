// eddy-ios/src/components/EddyTake.tsx
// "Eddy's take" — the decision hierarchy, and the 72-hour strip it reasons over.
//
// This is the piece the app was missing. Everything else on the river screen
// reports a fact: the reading, its age, the hazards. None of it says what to do,
// and a paddler holding a phone at a gravel bar is asking a question, not
// browsing data.
//
// The three-way split is not a layout choice, it is the content model, and it
// comes from the same server-side functions the website uses:
//
//   Eddy's read  the river as it stands now. The long model-written report when
//                a fresh one exists, otherwise one deterministic line.
//   Weather      everything forward-looking. Keeping this separate is what stops
//                the two panels printing the same NWS sentence twice.
//   Bottom line  the call, derived from the CURRENT condition alone. Leads with
//                the decision ("Stay off the river today"), never the label —
//                the condition chip above already shows the band in full colour,
//                so restating it would spend the loudest line on a repeat.
//
// BOTTOM LINE CLOSES rather than opens. It used to lead, on the reasoning that
// the answer should come first — but the reading card directly above this
// already gives the answer in colour, and leading with it here meant the card
// opened by repeating the thing you had just read. Reading it last, after the
// river and the sky have been described, is reading it as a conclusion. It gets
// the favicon otter for the same reason: it is Eddy's line, and the two sections
// above it are now marked with Eddy's own symbols too.
//
// On the web these are three columns; on a phone they stack.

import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { RiverOutlookResponse } from '@eddy/types';
import { conditionBg, conditionInk, conditionLabel } from '@/theme/conditions';
import { EddySymbol } from '@/components/EddySymbol';
import { Otter } from '@/components/Otter';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';

/** OpenWeather icon code → Ionicons glyph. Same buckets the website maps. */
function weatherGlyph(code: string): keyof typeof Ionicons.glyphMap {
  if (code.startsWith('01')) return 'sunny-outline';
  if (code.startsWith('02')) return 'partly-sunny-outline';
  if (code.startsWith('03') || code.startsWith('04')) return 'cloud-outline';
  if (code.startsWith('09') || code.startsWith('10')) return 'rainy-outline';
  if (code.startsWith('11')) return 'thunderstorm-outline';
  if (code.startsWith('13')) return 'snow-outline';
  if (code.startsWith('50')) return 'reorder-four-outline';
  return 'partly-sunny-outline';
}

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
   * paying customer out on one bar of signal, so unknown fails open. Same
   * contract as OfflineMapRow; see the note where it is computed on the map.
   *
   * `'pending'` is a THIRD state and is not the same as null. Null means the
   * answer failed and we chose to be generous; 'pending' means the answer is
   * still in flight. Collapsing them made every cold open of a river screen
   * paint the full paid report for as long as /api/me/profile took, and then
   * yank it away — the report leaked to non-subscribers by default, and the
   * flash looked like a bug to everyone else. Loading renders a skeleton.
   */
  entitled?: boolean | null | 'pending';
  /** Opens the paywall. Only ever called from the locked read. */
  onUpgrade?: () => void;
}

export function EddyTake({
  outlook,
  ratedUnit = null,
  entitled = null,
  onUpgrade,
}: EddyTakeProps) {
  const { colors, elevation } = useTheme();
  const { sections, days } = outlook;

  // The long report when the server sent one, the single deterministic line
  // otherwise. `fullRead` is withheld server-side when the live river has moved
  // far enough that the prose would contradict the condition chip above — so a
  // null here is an ANSWER, and must not be worked around.
  const read = outlook.fullRead || sections?.eddyRead || '';
  const locked = entitled === false;
  const resolving = entitled === 'pending';

  return (
    <View style={styles.wrapper}>
      {/* ── The 72-hour strip ───────────────────────────────── */}
      {days.length > 0 ? (
        <View style={[styles.card, { backgroundColor: colors.card }, elevation(1)]}>
          <View style={styles.stripHead}>
            <View style={styles.stripHeadText}>
              <Text style={[styles.stripTitle, { color: colors.text }]}>Will it hold?</Text>
              <Text style={[styles.stripSub, { color: colors.textSubtle }]}>Next 72 hours</Text>
            </View>
            {/* WHERE, not what. This slot used to print sourceLabel — one of
                three fixed strings, most often "Current river trend + weather
                outlook", which restated in six words what the strip's own
                contents already show and told you nothing you could act on.

                A forecast is a point sample, and a Missouri river runs ninety
                miles; "72 hours" is only useful once you know 72 hours WHERE.
                The server names the town it actually queried, so this cannot
                drift from the data beside it.

                The official-vs-guidance distinction that icon used to carry is
                not lost: hasOfficialForecast gates the stage row below, and
                isGuidance prints it in words under Weather. */}
            {outlook.weatherLocation ? (
              <View style={styles.source}>
                <Ionicons name="location-outline" size={12} color={colors.textMuted} />
                <Text style={[styles.sourceText, { color: colors.textMuted }]} numberOfLines={2}>
                  {outlook.weatherLocation}
                </Text>
              </View>
            ) : null}
          </View>

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
                    ? `${dayLabel(day.date, index)}, high ${day.weather.tempHigh}, low ${day.weather.tempLow}, ${day.rainLabel}${day.heatAdvisory ? ', heat advisory range' : ''}`
                    : `${dayLabel(day.date, index)}, weather unavailable`
                }
              >
                <Text style={[styles.dayName, { color: colors.textSubtle }]}>
                  {dayLabel(day.date, index)}
                </Text>

                {day.weather ? (
                  <>
                    <Ionicons
                      name={weatherGlyph(day.weather.conditionIcon)}
                      size={22}
                      color={colors.textMuted}
                      style={styles.dayGlyph}
                    />
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
                    {day.heatAdvisory ? (
                      <View style={[styles.heat, { backgroundColor: conditionBg('high') }]}>
                        <Text style={[styles.heatText, { color: conditionInk('high') }]}>HEAT</Text>
                      </View>
                    ) : null}
                  </>
                ) : (
                  <Text style={[styles.unavailable, { color: colors.textSubtle }]}>
                    No weather
                  </Text>
                )}

                {/* Forecast stage. Only shown when the NWS actually publishes a
                    hydrograph for this gauge — otherwise the column would imply
                    a river prediction we do not have. The unit is disclosed once
                    below the strip rather than seven times inside it. */}
                {outlook.hasOfficialForecast ? (
                  <View style={[styles.forecast, { borderTopColor: colors.border }]}>
                    {day.river.valueFt != null ? (
                      <>
                        <Text style={[styles.forecastValue, { color: colors.text }]}>
                          {day.river.valueFt.toFixed(2)} ft
                        </Text>
                        {day.river.conditionCode ? (
                          <Text
                            style={[
                              styles.forecastCode,
                              { color: conditionInk(day.river.conditionCode) },
                            ]}
                            numberOfLines={1}
                          >
                            {conditionLabel(day.river.conditionCode)}
                          </Text>
                        ) : null}
                      </>
                    ) : (
                      <Text style={[styles.unavailable, { color: colors.textSubtle }]}>—</Text>
                    )}
                  </View>
                ) : null}
              </View>
            ))}
          </View>

          {/* SAY WHICH IS WHICH. The NWS publishes stage only, so the forecast
              row above is always feet — including on the 18 of 24 rivers rated
              in cfs, whose reading card a few hundred pixels up now correctly
              prints cfs. RiverOutlookDay's own type comment demands this:
              "Never render valueFt beside a cfs reading without saying which is
              which." Once, under the strip, rather than seven times inside it. */}
          {outlook.hasOfficialForecast ? (
            <Text style={[styles.forecastNote, { color: colors.textSubtle }]}>
              {ratedUnit === 'cfs'
                ? 'Forecast is river stage in feet — this river is rated in cfs.'
                : 'Forecast is river stage in feet.'}
            </Text>
          ) : null}
        </View>
      ) : null}

      {/* ── Eddy's take ─────────────────────────────────────── */}
      {sections ? (
        <View style={[styles.card, { backgroundColor: colors.card }, elevation(1)]}>
          <Text style={[styles.takeHeading, { color: colors.textMuted }]}>EDDY&apos;S TAKE</Text>

          {/* No top rule: this is the first section in the card, and the two
              below separate themselves from what precedes them. */}
          <View>
            <View style={styles.sectionHead}>
              <EddySymbol name="aiAssistant" size={17} />
              <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>EDDY&apos;S READ</Text>
            </View>

            {/* THE ONE PAID THING ON THIS SCREEN, and deliberately the only one.
                PaywallSheet's own header lists what must never sit behind it —
                condition colours and readings, hazards, safety alerts — and
                Bottom line and Weather below are safety calls, so they stay
                free no matter what this returns. What is sold here is the long
                written report: several paragraphs a model wrote about this
                river this morning. Nobody is stranded for want of it.

                `locked` is entitled === false, never a falsy check: unknown
                entitlement shows the read. See the prop's comment.

                The skeleton comes FIRST because it is the only branch that is
                safe while the answer is unknown-but-coming. Showing the read
                and retracting it leaks the paid thing; showing the lock and
                retracting it accuses a subscriber of not paying. */}
            {resolving ? (
              <View accessibilityLabel="Loading Eddy's read">
                {[0.92, 1, 0.84].map((width, i) => (
                  <View
                    key={i}
                    style={[
                      styles.skeletonLine,
                      { backgroundColor: colors.cardRaised, width: `${width * 100}%` },
                    ]}
                  />
                ))}
              </View>
            ) : locked ? (
              <Pressable
                onPress={onUpgrade}
                disabled={!onUpgrade}
                style={({ pressed }) => [
                  styles.lock,
                  { backgroundColor: colors.cardRaised, opacity: pressed ? 0.7 : 1 },
                ]}
                accessibilityRole="button"
                accessibilityLabel="Unlock Eddy's read"
              >
                <Ionicons name="lock-closed" size={15} color={colors.accent} />
                <View style={styles.lockText}>
                  <Text style={[styles.lockTitle, { color: colors.text }]}>
                    Unlock Eddy&apos;s read
                  </Text>
                  <Text style={[styles.lockBody, { color: colors.textMuted }]}>
                    The full written report on this river, updated daily.
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={15} color={colors.textSubtle} />
              </Pressable>
            ) : read ? (
              <Text style={[styles.sectionText, { color: colors.textMuted }]}>{read}</Text>
            ) : null}
          </View>

          <View style={[styles.section, { borderTopColor: colors.border }]}>
            <View style={styles.sectionHead}>
              <EddySymbol name="weather" size={17} />
              <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>WEATHER</Text>
            </View>
            <Text style={[styles.sectionText, { color: colors.textMuted }]}>
              {sections.watchFor}
            </Text>
            {outlook.isGuidance ? (
              <Text style={[styles.caveat, { color: colors.textSubtle }]}>
                Weather outlook; future river levels are not predicted.
              </Text>
            ) : null}
          </View>

          <View style={[styles.section, { borderTopColor: colors.border }]}>
            <View style={[styles.bottomLine, { borderLeftColor: colors.accent }]}>
              <View style={styles.sectionHead}>
                <Otter mood="favicon" size={18} style={styles.bottomLineOtter} />
                <Text style={[styles.sectionLabel, { color: colors.accent }]}>BOTTOM LINE</Text>
              </View>
              <Text style={[styles.bottomLineText, { color: colors.text }]}>
                {sections.bottomLine}
              </Text>
            </View>
          </View>

          {outlook.gaugeName ? (
            <Text style={[styles.attribution, { color: colors.textSubtle }]}>
              via {outlook.gaugeName}
            </Text>
          ) : null}
        </View>
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
  heatText: { fontSize: 9, lineHeight: 13, fontFamily: fonts.heading },
  unavailable: { ...t.xs, fontFamily: fonts.body },
  forecast: { alignItems: 'center', marginTop: 8, paddingTop: 8, borderTopWidth: 1, width: '100%' },
  forecastNote: { ...t.xs, fontFamily: fonts.body, paddingHorizontal: 14, paddingBottom: 12 },
  forecastValue: { ...t.xs, fontFamily: fonts.monoMedium },
  forecastCode: { ...t.xs, fontFamily: fonts.semibold, marginTop: 1 },
  takeHeading: { ...t.xs, fontFamily: fonts.heading, letterSpacing: 0.8, marginBottom: 12 },
  // The one section with a coloured edge. It is the answer; the two above explain it.
  bottomLine: { borderLeftWidth: 3, paddingLeft: 12, paddingVertical: 2 },
  // Nudged up so the mark sits on the label's cap height rather than its box —
  // the artwork carries its own margin, which a 13pt glyph does not.
  bottomLineOtter: { marginLeft: -2 },
  bottomLineText: { ...t.base, fontFamily: fonts.semibold, marginTop: 4 },
  section: { marginTop: 14, paddingTop: 12, borderTopWidth: 1 },
  // Sized to the read it stands in for, so the card does not resize when the
  // real answer lands — a skeleton that changes the layout is just a slower
  // version of the flash it was added to prevent.
  skeletonLine: { height: 11, borderRadius: 5, marginTop: 9 },
  lock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 11,
    borderRadius: 12,
    marginTop: 8,
  },
  lockText: { flex: 1, minWidth: 0 },
  lockTitle: { ...t.sm, fontFamily: fonts.semibold },
  lockBody: { ...t.xs, fontFamily: fonts.body, marginTop: 2 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  sectionLabel: { ...t.xs, fontFamily: fonts.heading, letterSpacing: 0.6 },
  sectionText: { ...t.sm, fontFamily: fonts.body, marginTop: 5 },
  caveat: { ...t.xs, fontFamily: fonts.body, marginTop: 6 },
  attribution: { ...t.xs, fontFamily: fonts.body, marginTop: 12, textAlign: 'right' },
});
