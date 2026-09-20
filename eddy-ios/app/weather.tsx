import { rainChanceColor, weatherAtmosphere } from '@/theme/weather';
import { useTheme } from '@/theme/ThemeProvider';
import { EddySymbol } from '@/components/EddySymbol';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { LocationWeatherForecast } from '@eddy/types';
import { fetchLocationWeather } from '@/api/client';
import Svg, { Defs, LinearGradient, Stop, Rect } from 'react-native-svg';
import { peekLocationForecast, seedLocationForecast } from '@/lib/locationForecast';
import { goBack } from '@/lib/nav';
import { fonts, type as t } from '@/theme/typography';

export default function WeatherScreen() {
  const { colors, elevation, isDark } = useTheme();
  const { fontScale } = useWindowDimensions();
  const styles = { ...layout,
    navTitle: { ...layout.navTitle, color: colors.text },
    city: { ...layout.city, color: colors.text },
    temperature: { ...layout.temperature, color: colors.text },
    condition: { ...layout.condition, color: colors.text },
    highLow: { ...layout.highLow, color: colors.text },
    muted: { ...layout.muted, color: colors.textMuted },
    bodyText: { ...layout.bodyText, color: colors.text },
    panel: { ...layout.panel, backgroundColor: colors.card, ...elevation(1) },
    sectionLabel: { ...layout.sectionLabel, color: colors.textMuted },
    hourTemp: { ...layout.hourTemp, color: colors.text },
    rain: layout.rain,
    dayRow: { ...layout.dayRow, borderTopColor: colors.border },
    day: { ...layout.day, width: 52 * fontScale, color: colors.text },
    dayIcon: { ...layout.dayIcon, width: 40 * fontScale },
    hour: { ...layout.hour, minWidth: 46 * fontScale },
    low: { ...layout.low, color: colors.textMuted },
    high: { ...layout.high, color: colors.text },
    track: { ...layout.track, backgroundColor: colors.border },
    range: { ...layout.range, backgroundColor: colors.interactive },
    metricValue: { ...layout.metricValue, color: colors.text },
    message: { ...layout.message, color: colors.text },
    source: { ...layout.source, color: colors.textMuted },
  };
  const { lat: latParam, lng: lngParam } = useLocalSearchParams<{ lat: string; lng: string }>();
  const lat = Number(latParam);
  const lng = Number(lngParam);
  const valid = Boolean(latParam && lngParam) && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
  const key = JSON.stringify([lat, lng]);
  const router = useRouter();
  const [snapshot, setSnapshot] = useState(() => ({ key, data: peekLocationForecast(key) }));
  const [failed, setFailed] = useState<string | null>(null);
  const [loadingKey, setLoadingKey] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const data: LocationWeatherForecast | null = snapshot.key === key ? snapshot.data : null;
  useFocusEffect(useCallback(() => {
    if (!valid) return;
    const controller = new AbortController();
    setLoadingKey(key + ':' + retry);
    void fetchLocationWeather({ lat, lng }, controller.signal).then((forecast) => {
      if (controller.signal.aborted) return;
      seedLocationForecast(key, forecast);
      setSnapshot({ key, data: forecast });
      setFailed(null);
    }).catch(() => { if (!controller.signal.aborted) setFailed(key); })
      .finally(() => { if (!controller.signal.aborted) setLoadingKey(null); });
    return () => controller.abort();
  }, [valid, lat, lng, key, retry]));
  const loading = loadingKey === key + ':' + retry;
  const today = data?.days.find(day => day.date === data.localDate);
  const current = data?.current;
  const icon = current?.conditionIcon ?? today?.conditionIcon ?? '01d';
  const atmosphere = weatherAtmosphere(isDark, icon);
  const low = Math.min(...(data?.days.map(day => day.tempLow) ?? [0]));
  const high = Math.max(...(data?.days.map(day => day.tempHigh) ?? [1]));
  return <View style={{ flex: 1, backgroundColor: colors.bg }}>
    <SafeAreaView style={{ flex: 1 }}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <Pressable onPress={() => goBack(router)} accessibilityRole="button" accessibilityLabel="Back" style={styles.back}>
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </Pressable>
        <Text style={styles.navTitle}>Weather</Text>
        <View style={styles.back} />
      </View>
      <ScrollView contentContainerStyle={styles.body} refreshControl={<RefreshControl refreshing={loading && Boolean(data)} onRefresh={() => setRetry(n => n + 1)} tintColor={colors.text} />}>
        <View style={styles.hero}>
          {/* Resolve SVG percentages against an unpadded, edge-to-edge layer. */}
          <View style={StyleSheet.absoluteFill} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <Svg width="100%" height="100%">
              <Defs>
                <LinearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0" stopColor={atmosphere[0]} />
                  <Stop offset="0.55" stopColor={atmosphere[1]} />
                  <Stop offset="1" stopColor={colors.bg} />
                </LinearGradient>
              </Defs>
              <Rect width="100%" height="100%" fill="url(#sky)" />
            </Svg>
          </View>
          <Text style={styles.city}>{data?.city ?? 'Local weather'}</Text>
          <View style={styles.currentReading}>
            <EddySymbol name="weather" size={52} />
            {current ? <Text style={styles.temperature}>{Math.round(current.temp)}°</Text> : null}
          </View>
          <Text style={styles.condition}>{current?.condition ?? today?.condition ?? ''}</Text>
          {today ? <Text style={styles.highLow}>H:{Math.round(today.tempHigh)}°  L:{Math.round(today.tempLow)}°</Text> : null}
          {!current && today ? <Text style={styles.muted}>Today’s forecast</Text> : null}
        </View>
        {!valid ? <Text style={styles.message}>Open weather from Today to choose your area.</Text> : null}
        {loading && !data ? <ActivityIndicator color={colors.text} accessibilityLabel="Loading forecast" /> : null}
        {failed === key ? <Pressable onPress={() => setRetry(n => n + 1)} style={styles.message} accessibilityRole="button"><Text style={styles.bodyText}>{data ? 'Couldn’t refresh · Tap to retry' : 'Couldn’t load weather · Tap to retry'}</Text></Pressable> : null}
        {data?.periods?.length ? <View style={styles.panel}>
          <Text style={styles.sectionLabel}>NEXT 24 HOURS · 3-HOUR FORECAST</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hours}>
            {data.periods.map(period => <View key={period.timestamp} style={styles.hour}>
              <Text style={styles.bodyText}>{period.localHour % 12 || 12}{period.localHour < 12 ? 'AM' : 'PM'}</Text>
              <Ionicons name={weatherIcon(period.conditionIcon)} size={27} color={colors.interactive} />
              <Text style={styles.hourTemp}>{period.temp}°</Text>
              <Text numberOfLines={1} style={[styles.rain, { color: rainChanceColor(period.precipitation, colors) }]}>{period.precipitation}%</Text>
            </View>)}
          </ScrollView>
        </View> : null}
        {data?.days.length ? <View style={styles.panel}>
          <Text style={styles.sectionLabel}>{data.days.length}-DAY FORECAST</Text>
          {data.days.map((day) => <View key={day.date} style={styles.dayRow} accessibilityLabel={`${day.date === data.localDate ? 'Today' : day.dayOfWeek}, ${day.condition}, high ${day.tempHigh}, low ${day.tempLow}, rain chance ${day.precipitation} percent`}>
            <View style={styles.daySummary}>
              <Text style={styles.day}>{day.date === data.localDate ? 'Today' : day.dayOfWeek}</Text>
              <View style={styles.dayIcon}><Ionicons name={weatherIcon(day.conditionIcon)} size={24} color={colors.interactive} /><Text numberOfLines={1} style={[styles.rain, { color: rainChanceColor(day.precipitation, colors) }]}>{day.precipitation}%</Text></View>
            </View>
            <View style={styles.dayTemperatures}>
              <Text style={styles.low}>{Math.round(day.tempLow)}°</Text>
              <View style={styles.track}><View style={[styles.range, { left: `${(day.tempLow - low) / Math.max(1, high - low) * 100}%`, width: `${Math.max(3, (day.tempHigh - day.tempLow) / Math.max(1, high - low) * 100)}%` }]} /></View>
              <Text style={styles.high}>{Math.round(day.tempHigh)}°</Text>
            </View>
          </View>)}
        </View> : null}
        {current ? <View style={styles.details}>
          <View style={[styles.panel, styles.metric]}><Ionicons name="flag-outline" color={colors.text} size={21} /><Text style={styles.sectionLabel}>WIND</Text><Text style={styles.metricValue}>{Math.round(current.windSpeed)} <Text style={styles.unit}>mph</Text></Text></View>
          <View style={[styles.panel, styles.metric]}><Ionicons name="water-outline" color={colors.text} size={21} /><Text style={styles.sectionLabel}>HUMIDITY</Text><Text style={styles.metricValue}>{Math.round(current.humidity)}<Text style={styles.unit}>%</Text></Text></View>
        </View> : null}
        {data ? <Text style={styles.source}>OpenWeather · °F{current ? ` · Updated ${new Date(current.fetchedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : ''}
Today’s range covers the remaining forecast.</Text> : null}
      </ScrollView>
    </SafeAreaView>
  </View>;
}
function weatherIcon(code: string): React.ComponentProps<typeof Ionicons>['name'] {
  if (code.startsWith('01')) return code.endsWith('n') ? 'moon' : 'sunny';
  if (code.startsWith('02')) return code.endsWith('n') ? 'cloudy-night' : 'partly-sunny';
  if (/^(09|10)/.test(code)) return 'rainy';
  if (code.startsWith('11')) return 'thunderstorm';
  if (code.startsWith('13')) return 'snow';
  return 'cloudy';
}
const layout = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 12 },
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  navTitle: { ...t.base, fontFamily: fonts.heading },
  body: { padding: 20, gap: 14, paddingBottom: 36 },
  hero: { alignItems: 'center', paddingTop: 20, paddingBottom: 24, paddingHorizontal: 12, borderRadius: 16, overflow: 'hidden' },
  currentReading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', gap: 12, marginVertical: 8 },
  city: { ...t['3xl'], fontFamily: fonts.display, textAlign: 'center' },
  temperature: { fontFamily: fonts.monoMedium, fontSize: 72, lineHeight: 88, letterSpacing: -3 },
  condition: { ...t.lg, fontFamily: fonts.medium, textAlign: 'center' },
  highLow: { ...t.base, fontFamily: fonts.mono, marginTop: 4 },
  muted: { ...t.sm, fontFamily: fonts.body, marginTop: 8 },
  bodyText: { ...t.sm, fontFamily: fonts.body },
  panel: { borderRadius: 16, padding: 16 },
  sectionLabel: { ...t.xs, fontFamily: fonts.semibold, letterSpacing: 0.4, marginBottom: 10 },
  hours: { gap: 24, paddingTop: 6 },
  hour: { alignItems: 'center', gap: 12, minWidth: 46 },
  hourTemp: { ...t.lg, fontFamily: fonts.monoMedium },
  rain: { ...t.xs, fontFamily: fonts.mono },
  dayRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, minHeight: 64, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth },
  day: { ...t.sm, fontFamily: fonts.semibold, width: 52 },
  dayIcon: { alignItems: 'center', gap: 2, flexShrink: 0 },
  daySummary: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dayTemperatures: { flexDirection: 'row', alignItems: 'center', gap: 8, flexGrow: 1, flexBasis: 120 },
  low: { ...t.sm, fontFamily: fonts.mono, minWidth: 34, textAlign: 'right' },
  high: { ...t.sm, fontFamily: fonts.monoMedium, minWidth: 34, textAlign: 'right' },
  track: { flex: 1, height: 5, borderRadius: 4, overflow: 'hidden' },
  range: { position: 'absolute', height: 5, borderRadius: 4 },
  details: { flexDirection: 'row', gap: 14 },
  metric: { flex: 1, gap: 5 },
  metricValue: { ...t['3xl'], fontFamily: fonts.monoMedium },
  unit: { ...t.base, fontFamily: fonts.body },
  message: { ...t.sm, fontFamily: fonts.body, paddingVertical: 16, textAlign: 'center' },
  source: { ...t.xs, fontFamily: fonts.body, padding: 12, borderRadius: 12, textAlign: 'center', lineHeight: 20 },
});
