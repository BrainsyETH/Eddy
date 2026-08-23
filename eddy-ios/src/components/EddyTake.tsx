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
// ── ALL THREE ARE PAID NOW, and it is one gate rather than three ────────────
//
// Weather and Bottom line used to be free, on the reasoning that they are
// safety calls. That carve-out is withdrawn: the whole card is Eddy's
// commentary, and selling a third of it while giving away the two thirds that
// summarise the same water made the offer incoherent — the paywall was
// advertising a report whose conclusion the reader already had.
//
// WHAT KEEPS THIS HONEST is what is NOT in this card. Every fact a decision
// actually needs is above it and stays free forever: the condition band in full
// colour, the reading and its age, the trend, the hazard list, the NWS and NPS
// notices on the Alerts tab, and every alert. The 72-hour strip below — rain,
// temperature and the official forecast stage — is also free, deliberately, and
// is rendered before the gate for that reason. Nobody is short of information
// about the water; what is sold is Eddy's writing about it.
//
// One lock, not three. Three lock rows over three consecutive sections is the
// same wall drawn three times, and it reads as nagging rather than as an offer.
//
// ── The locked card SHOWS ITS SHAPE ─────────────────────────────────────────
//
// It used to replace all three sections with a single lock row, so what was for
// sale was described only in the sales copy — a reader had no way to see that
// there were three separate pieces of writing behind it, how long they were, or
// that one of them was a one-line call. A blank wall sells nothing.
//
// So the locked state draws the real card: all three headings, sharp, with
// their bodies obscured and the CTA underneath. The shape is the honest part of
// the offer, and a fabricated placeholder would advertise a report of a length
// Eddy did not write.
//
// ── Why the smear had to go ─────────────────────────────────────────────────
//
// The first version obscured the text with a SHADOW: `color: 'transparent'`
// plus a shadow of the ink colour at an 8pt radius, which smears each glyph
// into a band. It was cheap, needed no native module, and it looked like a
// bug. Reported from the field in exactly those words — that the card "looks
// like it isn't loading". And it should have been predictable: a low-contrast
// grey band where text belongs is the universal appearance of a SKELETON, so
// the card was drawing the one thing every app on the phone uses to mean
// "still loading", directly below a paragraph that really is a skeleton while
// entitlement resolves. Two states, one appearance, and the one that meant
// "pay to read this" was the one nobody recognised.
//
// A real blur does not have that problem. expo-blur's BlurView is a
// UIVisualEffectView — the frosted material iOS uses for its own sheets and
// nav bars — and nothing on the phone loads that way. It reads as deliberately
// obscured because on this platform it only ever IS deliberately obscured.
//
// ── The first line stays sharp ──────────────────────────────────────────────
//
// Blurring all of it is still a wall, just a nicer-looking one. The read now
// opens with one legible line and blurs from there, which is the pattern every
// paywalled article on the web settled on for a reason: it turns the card from
// a locked door into an interrupted sentence. What is given away is one line of
// a report that runs to paragraphs, and it is the line most likely to make
// somebody want the rest.
//
// It is NOT a security boundary and never was — the text is in the payload
// either way, and both the smear and the blur render the real words. The gate
// is unchanged. What changed is that the reader can tell it is a gate.
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
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import type { RiverOutlookResponse } from '@eddy/types';
import { conditionBg, conditionInk, conditionLabel } from '@/theme/conditions';
import { EddySymbol } from '@/components/EddySymbol';
import { Otter } from '@/components/Otter';
import { PREMIUM_LOCK_TITLE } from '@/lib/premiumCopy';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';

/**
 * How hard to frost the paid text.
 *
 * Chosen to leave nothing readable at 14pt, which is the size every blurred
 * line here is set in. Erring HIGH is the safe direction — under-blurring hands
 * over the thing being sold, and over-blurring costs nothing but a slightly
 * heavier looking card.
 */
const BLUR_INTENSITY = 34;

/**
 * The text under the blur is also dimmed.
 *
 * Belt and braces. `intensity` is a hint to a native effect, not a guaranteed
 * radius, and it composites differently against a light card than a dark one.
 * Dropping the ink's contrast first means the blur has less to fail at.
 */
const BLURRED_TEXT_OPACITY = 0.5;

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
 * How soft the corners of a frosted block are.
 *
 * Small on purpose. The wrap clips the PROSE to this shape as well as the frost
 * — see the styles below for why it has to — so the radius is also how much of
 * the paragraph's corners get cut. At 8 against a 20pt line the arc clears the
 * glyph ink: the first line's ink starts a few points down from the box on its
 * leading, and the last line of a locked section is short enough that the
 * bottom corners are whitespace. Going much past this starts shaving letters.
 */
const BLUR_RADIUS = 8;

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

/**
 * Eddy's writing, behind frosted glass.
 *
 * The real text renders and a BlurView covers it. That is the only way to get
 * a genuine gaussian blur in React Native — a UIVisualEffectView blurs what is
 * BEHIND it, so the paragraph has to be there for the effect to have anything
 * to work on. It puts no more of the text on the device than the old text
 * shadow did, which also rendered the real string; see the header on why this
 * has never been a security boundary.
 *
 * `sharpLines` leaves the first N lines legible and starts the blur beneath
 * them, by offsetting the overlay rather than by splitting the string. Splitting
 * on a sentence boundary would give away a variable amount — Eddy's first
 * sentence is sometimes the whole answer — where an offset gives away exactly
 * one line of a report that runs to several.
 *
 * Hidden from assistive technology outright. A screen reader that read this
 * aloud would be handing over the paid text in the one presentation where it is
 * deliberately unreadable, and a blurred paragraph is not information to anyone
 * navigating by voice — the CTA below carries the whole offer in its own label.
 */
function BlurredProse({
  text,
  color,
  style,
  lines,
  sharpLines = 0,
  scheme,
}: {
  text: string;
  color: string;
  style: object;
  lines: number;
  sharpLines?: number;
  scheme: 'light' | 'dark';
}) {
  return (
    <View
      style={styles.blurWrap}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Text
        style={[style, { color, opacity: BLURRED_TEXT_OPACITY }]}
        numberOfLines={lines}
        selectable={false}
      >
        {text}
      </Text>
      {/* Tinted to the scheme rather than left on 'default'. The system tint
          adapts to the ambient appearance, not to the card it is sitting on,
          and this card is `colors.card` in both — so 'default' frosts LIGHT
          over a dark card and the blurred block glows brighter than the sharp
          text above it. */}
      <BlurView
        intensity={BLUR_INTENSITY}
        tint={scheme === 'dark' ? 'dark' : 'light'}
        style={[
          styles.blurOverlay,
          {
            // The text's own top margin has to be cleared before counting
            // lines, or the blur starts a few points high and clips the
            // descenders off the one line that is supposed to be readable.
            top:
              sharpLines > 0
                ? SECTION_TEXT_MARGIN_TOP + sharpLines * SECTION_LINE_HEIGHT
                : 0,
          },
        ]}
        pointerEvents="none"
      />
    </View>
  );
}

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
   */
  entitled?: boolean | null | 'pending';
  /** Opens the paywall. Only ever called from the locked take. */
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
                    ? `${dayLabel(day.date, index)}, high ${day.weather.tempHigh}, low ${day.weather.tempLow}, ${day.rainLabel}${day.weather.windSpeed != null ? `, wind ${Math.round(day.weather.windSpeed)} miles per hour` : ''}${day.heatAdvisory ? ', heat advisory range' : ''}`
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
                      // The glyph is the whole cell here — nothing beside it says
                      // what it means, so a screen reader that announces "dash"
                      // (or skips it) gets no forecast state at all.
                      <Text
                        style={[styles.unavailable, { color: colors.textSubtle }]}
                        accessibilityLabel="No forecast"
                      >
                        —
                      </Text>
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

          {/* THE WHOLE CARD IS THE GATE — see the header for what stays free
              and why that is enough to make this defensible.

              `locked` is entitled === false, never a falsy check: unknown
              entitlement shows the take. See the prop's comment.

              The skeleton comes FIRST because it is the only branch that is
              safe while the answer is unknown-but-coming. Showing the take and
              retracting it leaks the paid thing; showing the lock and
              retracting it accuses a subscriber of not paying. */}
          {resolving ? (
            <View accessibilityLabel="Loading Eddy's take">
              {[0.92, 1, 0.84, 0.66].map((width, i) => (
                <View
                  key={i}
                  style={[
                    styles.skeletonLine,
                    { backgroundColor: colors.cardRaised, width: `${width * 100}%` },
                  ]}
                />
              ))}
            </View>
          ) : (
            <>
              {/* No top rule: this is the first section in the card, and the two
                  below separate themselves from what precedes them. */}
              <View>
                <View style={styles.sectionHead}>
                  <EddySymbol name="aiAssistant" size={17} />
                  <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>
                    EDDY&apos;S READ
                  </Text>
                </View>
                {locked ? (
                  // Clamped to four lines, the first of them readable. The full
                  // read runs to several paragraphs on a good day, and a locked
                  // card the height of an unlocked one is a wall again — four
                  // lines is enough to show this is prose rather than a
                  // sentence, and the sharp opener is what makes it an
                  // interrupted one rather than a closed door.
                  <BlurredProse
                    text={read || LOCKED_READ_SHAPE}
                    color={colors.textMuted}
                    style={styles.sectionText}
                    lines={4}
                    sharpLines={1}
                    scheme={colors.scheme}
                  />
                ) : read ? (
                  <Text style={[styles.sectionText, { color: colors.textMuted }]}>{read}</Text>
                ) : null}
              </View>

              <View style={[styles.section, { borderTopColor: colors.border }]}>
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
                    scheme={colors.scheme}
                  />
                ) : (
                  <Text style={[styles.sectionText, { color: colors.textMuted }]}>
                    {sections.watchFor}
                  </Text>
                )}
                {/* Kept sharp even when locked: it is a disclaimer about what
                    the forecast strip above — which is free — does and does not
                    predict, not part of the writing being sold.

                    `isGuidance` means this river has no official hydrograph, so
                    the strip is weather and nothing else. Without this line a
                    reader can take it for a level forecast, which is the one
                    claim Eddy must not make by omission — river-guide-style.md
                    puts it as "a planning input, not the safety authority".
                    Says the same thing as the sentence it replaced, in the
                    `[state] — [what it means]` idiom the app already speaks. */}
                {outlook.isGuidance ? (
                  <Text style={[styles.caveat, { color: colors.textSubtle }]}>
                    Weather only — no river-level forecast.
                  </Text>
                ) : null}
              </View>

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
                      scheme={colors.scheme}
                    />
                  ) : (
                    <Text style={[styles.bottomLineText, { color: colors.text }]}>
                      {sections.bottomLine}
                    </Text>
                  )}
                </View>
              </View>

              {/* ── The offer, under the thing being offered ────────────
                  Last rather than first. Read top to bottom the card now says
                  "here are the three things, here is what they are, here is how
                  to read them" — where a lock above them would have been asking
                  for money before showing what for. Still ONE lock for three
                  sections, which is the rule this card has always kept. */}
              {/* ── The offer ──────────────────────────────────────────
                  Every word comes from premiumCopy, which is where the app's
                  three subscription surfaces are kept from disagreeing. This
                  row wrote its own for months and was the reason that module
                  had to exist; see its header.

                  It reads as a CARD now rather than a grey strip: an accent
                  hairline, the otter that closes the bottom line above it
                  repeated as a small lock mark, and the title in the display
                  face the rest of Eddy's voice is set in. The strip version was
                  the same neutral fill as every disabled row in the app, which
                  is a strange thing for the one control on the screen that is
                  asking for money. */}
              {locked ? (
                <Pressable
                  onPress={onUpgrade}
                  disabled={!onUpgrade}
                  style={({ pressed }) => [
                    styles.lock,
                    {
                      backgroundColor: colors.cardRaised,
                      borderColor: colors.accent,
                      opacity: pressed ? 0.75 : 1,
                    },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={PREMIUM_LOCK_TITLE}
                >
                  <View style={styles.lockHead}>
                    <View style={[styles.lockMark, { backgroundColor: colors.accentFill }]}>
                      <Ionicons name="lock-closed" size={13} color={colors.onAccent} />
                    </View>
                    <Text style={[styles.lockTitle, { color: colors.text }]}>
                      {PREMIUM_LOCK_TITLE}
                    </Text>
                    <Ionicons name="chevron-forward" size={16} color={colors.accent} />
                  </View>
                </Pressable>
              ) : null}

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
    padding: 13,
    borderRadius: 14,
    // A hairline in the accent rather than a fill in it: the row sits inside a
    // card that is already a panel, and a solid accent block here would outweigh
    // the bottom line directly above it — which is the thing being sold.
    borderWidth: StyleSheet.hairlineWidth,
    // Wider than it was: it now follows a blurred section rather than opening
    // the card, and needs to read as a separate thing from the frost above it.
    marginTop: 16,
  },
  lockHead: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  // A filled circle, so the lock is a mark rather than a loose glyph leaning on
  // the text beside it.
  lockMark: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Fredoka, matching the headline on Today and the river's own name. This is
  // Eddy making an offer, and the display face is where the brand lives.
  lockTitle: { ...t.base, fontFamily: fonts.display, flex: 1, minWidth: 0 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  sectionLabel: { ...t.xs, fontFamily: fonts.heading, letterSpacing: 0.6 },
  sectionText: { ...t.sm, fontFamily: fonts.body, marginTop: SECTION_TEXT_MARGIN_TOP },
  // The blur is absolutely positioned over the prose, so the wrapper is what
  // gives it a box to fill. Overflow hidden keeps the frost inside the section
  // rather than bleeding over the rule below it.
  //
  // ── THE RADIUS IS ON BOTH, and that is not belt-and-braces ────────────────
  // Rounding the overlay ALONE would carve four corners out of the frost and
  // leave the prose under them sharp — dimmed to BLURRED_TEXT_OPACITY, but
  // legible, which is the one thing this component exists to prevent. The wrap's
  // `overflow: 'hidden'` is what clips the text to the same shape, so the
  // corners lose the paragraph rather than uncovering it. Change one, change
  // both.
  blurWrap: { position: 'relative', overflow: 'hidden', borderRadius: BLUR_RADIUS },
  blurOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: BLUR_RADIUS,
  },
  caveat: { ...t.xs, fontFamily: fonts.body, marginTop: 6 },
  attribution: { ...t.xs, fontFamily: fonts.body, marginTop: 12, textAlign: 'right' },
});
