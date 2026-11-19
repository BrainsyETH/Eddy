// eddy-ios/src/components/lake/LakeWindCard.tsx
// Wind first: it is what decides a day on open water. One observation at one
// named point, in the web card's words (shared lake-system). A measurement,
// never advice: Eddy does not know the boat.

import { StyleSheet, Text, View } from 'react-native';
import { EddySymbol } from '@/components/EddySymbol';
import { WeatherIcon } from '@/components/WeatherIcon';
import { relativeAge } from '@eddy/conditions/dam-schedule-copy';
import { lakeWeatherIsStale, lakeWindLine } from '@eddy/conditions/lake-system';
import type { LakeWeather } from '@eddy/conditions/lake-types';
import { useTheme } from '@/theme/ThemeProvider';
import { radii } from '@/theme/layout';
import { fonts, type as t } from '@/theme/typography';

export function LakeWindCard({ weather, now }: { weather: LakeWeather; now: number }) {
  const { colors, elevation } = useTheme();
  const stale = lakeWeatherIsStale(weather, now);
  const age = relativeAge(weather.observedAt, now);
  const ink = stale ? colors.textMuted : colors.text;
  return (
    <View style={[styles.card, { backgroundColor: colors.card }, elevation(2)]}>
      <View style={styles.header}>
        <EddySymbol name="weather" size={28} />
        <Text style={[styles.title, { color: colors.text }]} accessibilityRole="header">Wind &amp; weather</Text>
      </View>
      <Text style={[styles.wind, { color: ink }]}>{lakeWindLine(weather)}</Text>
      <View style={styles.sky} accessible accessibilityLabel={`${Math.round(weather.tempF)} degrees Fahrenheit, ${weather.condition}`}>
        <WeatherIcon code={weather.conditionIcon} size={24} />
        <Text style={[styles.skyText, { color: ink }]}>{Math.round(weather.tempF)}°F · {weather.condition}</Text>
      </View>
      <Text style={[styles.note, { color: stale ? colors.agingText : colors.textSubtle }]}>
        {[age ? `Observed ${age}${stale ? ' · Outdated' : ''}` : null, `${weather.place}. Wind differs across the lake.`].filter(Boolean).join(' · ')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radii.card, padding: 16, gap: 8 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { ...t.lg, fontFamily: fonts.heading, flexShrink: 1 },
  wind: { ...t.xl, fontFamily: fonts.semibold },
  sky: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  skyText: { ...t.base, flexShrink: 1 },
  note: { ...t.xs },
});
