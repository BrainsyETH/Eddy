// eddy-ios/src/components/dam/GenerationForecast.tsx
// A district's forward generation forecast — the Nashville shape, where the
// Corps publishes its operating forecast straight into CWMS as hourly cfs.
// Renders only when the payload carries one; most dams never will.
//
// ── Forecast, never schedule ───────────────────────────────────────────────
// SWPA posts a SCHEDULE; this is the district's OPERATING FORECAST, their own
// word for it. The two render as sibling cards on this screen, so vocabulary
// is what keeps the modalities distinct — every string here says "forecast",
// and all of them come from @eddy/conditions/dam-forecast-copy so this screen
// and the website cannot drift. There are no bars: DayBars draws against
// SWPA's megawatt scale, which this source does not have, and inventing a
// scale to keep the visual would dress a plan in machinery it never wore.

import { StyleSheet, Text, View } from 'react-native';
import type { DamGenerationForecast } from '@eddy/types';
import {
  forecastDays,
  forecastHorizonSentence,
  forecastPlanStale,
  nextForecastChangeSentence,
} from '@eddy/conditions/dam-forecast-copy';
import {
  retrievalSentence,
  scheduleIsStale,
} from '@eddy/conditions/dam-schedule-copy';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';

export function GenerationForecast({ forecast }: { forecast: DamGenerationForecast }) {
  const { colors, elevation } = useTheme();

  const days = forecastDays(forecast.windows, forecast.timeZone);
  if (days.length === 0) return null;

  const nextChange = nextForecastChangeSentence(forecast.windows, forecast.timeZone);
  const retrieval = retrievalSentence(forecast.retrievedAt);
  // How far the PLAN reaches — a different question from when Eddy fetched it,
  // and the only one that can notice a district's writer having died, since
  // CWMS publishes no write time. See forecastPlanStale.
  const horizon = forecastHorizonSentence(forecast.windows, forecast.timeZone);
  // No explicit clock, matching scheduleIsStale below: this screen re-renders
  // on its own minute tick, and reading Date.now() during render is both
  // impure and unnecessary when the helper defaults to it.
  const planStale = forecastPlanStale(forecast.windows);

  return (
    <View style={[styles.card, { backgroundColor: colors.card }, elevation(2)]}>
      <Text style={[styles.title, { color: colors.text }]}>Generation forecast</Text>
      <Text style={[styles.intro, { color: colors.textMuted }]}>
        The operating forecast published by {forecast.source} — a plan, refreshed
        daily, not a commitment.
      </Text>

      {/* The one sentence a reader came for, when the forecast can support it.
          Null renders nothing: a gap at the present hour means the forecast
          cannot say what the dam is doing now, and this line anchors on that
          claim. */}
      {nextChange ? (
        <Text style={[styles.nextChange, { color: colors.text }]}>{nextChange}</Text>
      ) : null}

      <View style={styles.days}>
        {days.map((day) => (
          <View
            key={day.dayKey}
            style={[styles.day, { borderTopColor: colors.border }]}
          >
            <Text style={[styles.dayLabel, { color: colors.text }]}>{day.dayLabel}</Text>
            {day.spans.map((span, i) => (
              <Text key={i} style={[styles.span, { color: colors.textMuted }]}>
                <Text
                  style={{
                    color: span.generating ? colors.interactive : colors.textSubtle,
                    fontFamily: fonts.semibold,
                  }}
                >
                  {span.generating ? 'Generation forecast' : 'No generation forecast'}
                </Text>
                {` ${span.label}`}
                {span.peakLabel ? (
                  <Text style={{ color: colors.textSubtle }}>{`  ${span.peakLabel}`}</Text>
                ) : null}
              </Text>
            ))}
          </View>
        ))}
      </View>

      {/* The disclaimer travels with the data wherever it appears — same block
          shape, same warning, as the schedule card's footer. */}
      <View style={[styles.footer, { borderTopColor: colors.border }]}>
        <Text style={[styles.footerText, { color: colors.textSubtle }]}>
          Forecasts change without notice — power demand, transmission
          constraints, generator outages and inflow all move them. Never wade or
          anchor below a dam without checking the horn and posted warnings.
        </Text>
      </View>

      {/* Freshness on its own line, in its own weight — see the schedule card
          for why it must not live inside the disclaimer paragraph. The subject
          stays "Eddy last checked": CWMS says nothing about when the district
          produced the forecast, only Eddy knows when it looked. */}
      {retrieval ? (
        <Text
          style={[
            styles.retrieval,
            {
              color: scheduleIsStale(forecast.retrievedAt) ? colors.error : colors.interactive,
            },
          ]}
        >
          {retrieval}
        </Text>
      ) : null}
      {horizon ? (
        <Text
          style={[
            styles.retrieval,
            { color: planStale ? colors.error : colors.textMuted },
          ]}
        >
          {horizon}
          {planStale
            ? ' — shorter than this district usually publishes, so it may not have been updated'
            : ''}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 14, padding: 16 },
  title: { ...t.lg, fontFamily: fonts.display },
  intro: { ...t.sm, marginTop: 2 },
  nextChange: { fontSize: 14, lineHeight: 19, fontFamily: fonts.heading, marginTop: 10 },
  days: { marginTop: 8 },
  day: { borderTopWidth: 1, marginTop: 10, paddingTop: 10 },
  dayLabel: { ...t.sm, fontFamily: fonts.semibold },
  span: { ...t.sm, marginTop: 4 },
  footer: { borderTopWidth: 1, marginTop: 12, paddingTop: 10 },
  footerText: { ...t.xs },
  retrieval: { ...t.xs, fontFamily: fonts.semibold, textAlign: 'center', marginTop: 12 },
});
