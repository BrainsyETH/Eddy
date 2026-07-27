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
//   Bottom line  the call, derived from the CURRENT condition alone. Leads with
//                the decision ("Stay off the river today"), never the label —
//                the condition chip above already shows the band in full colour,
//                so restating it would spend the loudest line on a repeat.
//   Eddy's read  the river as it stands now. Replaced by model-written prose
//                when a fresh one exists, otherwise deterministic.
//   Watch for    everything forward-looking. Keeping this separate is what stops
//                the two panels printing the same NWS sentence twice.
//
// On the web these are three columns; on a phone they stack, with Bottom line
// leading, which is the same order the web falls back to at mobile widths.

import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import type { RiverOutlookResponse } from '@eddy/types';
import { conditionBg, conditionInk, conditionLabel } from '@/theme/conditions';
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

export function EddyTake({ outlook }: { outlook: RiverOutlookResponse }) {
  const { colors, elevation } = useTheme();
  const { sections, days } = outlook;

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
            <View style={styles.source}>
              <Ionicons
                name={outlook.sourceKind === 'official' ? 'water-outline' : 'cloud-outline'}
                size={12}
                color={colors.textMuted}
              />
              <Text style={[styles.sourceText, { color: colors.textMuted }]} numberOfLines={2}>
                {outlook.sourceLabel}
              </Text>
            </View>
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
                    {/* Rain reads as a fact, weighted only when the chance is
                        high enough to move a float plan. The server decides
                        which bucket it lands in. */}
                    <Text
                      style={[
                        styles.rain,
                        {
                          color:
                            day.rainKind === 'significant'
                              ? colors.accent
                              : day.rainKind === 'possible'
                                ? colors.text
                                : colors.textSubtle,
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
                    a river prediction we do not have.

                    "stage" is not decoration. The NWS publishes stage ONLY, so
                    this is always feet even on a cfs-rated river — and now that
                    the reading card above it correctly prints cfs, these two
                    numbers sit on one screen in different units. The type
                    comment on RiverOutlookDay is blunt about it: "Never render
                    valueFt beside a cfs reading without saying which is which." */}
                {outlook.hasOfficialForecast ? (
                  <View style={[styles.forecast, { borderTopColor: colors.border }]}>
                    {day.river.valueFt != null ? (
                      <>
                        <Text style={[styles.forecastValue, { color: colors.text }]}>
                          {day.river.valueFt.toFixed(2)} ft stage
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
        </View>
      ) : null}

      {/* ── Eddy's take ─────────────────────────────────────── */}
      {sections ? (
        <View style={[styles.card, { backgroundColor: colors.card }, elevation(1)]}>
          <Text style={[styles.takeHeading, { color: colors.textMuted }]}>EDDY&apos;S TAKE</Text>

          <View style={[styles.bottomLine, { borderLeftColor: colors.accent }]}>
            <Text style={[styles.sectionLabel, { color: colors.accent }]}>BOTTOM LINE</Text>
            <Text style={[styles.bottomLineText, { color: colors.text }]}>
              {sections.bottomLine}
            </Text>
          </View>

          <View style={[styles.section, { borderTopColor: colors.border }]}>
            <View style={styles.sectionHead}>
              <Ionicons name="sparkles-outline" size={13} color={colors.textMuted} />
              <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>EDDY&apos;S READ</Text>
            </View>
            <Text style={[styles.sectionText, { color: colors.textMuted }]}>
              {sections.eddyRead}
            </Text>
          </View>

          <View style={[styles.section, { borderTopColor: colors.border }]}>
            <View style={styles.sectionHead}>
              <Ionicons name="eye-outline" size={13} color={colors.textMuted} />
              <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>WATCH FOR</Text>
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
  forecastValue: { ...t.xs, fontFamily: fonts.monoMedium },
  forecastCode: { ...t.xs, fontFamily: fonts.semibold, marginTop: 1 },
  takeHeading: { ...t.xs, fontFamily: fonts.heading, letterSpacing: 0.8, marginBottom: 12 },
  // The one section with a coloured edge. It is the answer; the other two explain it.
  bottomLine: { borderLeftWidth: 3, paddingLeft: 12, paddingVertical: 2 },
  bottomLineText: { ...t.base, fontFamily: fonts.semibold, marginTop: 4 },
  section: { marginTop: 14, paddingTop: 12, borderTopWidth: 1 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  sectionLabel: { ...t.xs, fontFamily: fonts.heading, letterSpacing: 0.6 },
  sectionText: { ...t.sm, fontFamily: fonts.body, marginTop: 5 },
  caveat: { ...t.xs, fontFamily: fonts.body, marginTop: 6 },
  attribution: { ...t.xs, fontFamily: fonts.body, marginTop: 12, textAlign: 'right' },
});
