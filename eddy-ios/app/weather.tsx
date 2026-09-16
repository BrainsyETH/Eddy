import { skyColors } from '@/theme/weather';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
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
  const styles = { ...layout,
    navTitle: { ...layout.navTitle, color: skyColors.text },
    city: { ...layout.city, color: skyColors.text },
    temperature: { ...layout.temperature, color: skyColors.text },
    condition: { ...layout.condition, color: skyColors.text },
    highLow: { ...layout.highLow, color: skyColors.text },
    muted: { ...layout.muted, color: skyColors.muted },
    white: { ...layout.white, color: skyColors.text },
    panel: { ...layout.panel, backgroundColor: skyColors.panel },
    sectionLabel: { ...layout.sectionLabel, color: skyColors.muted },
    hourTemp: { ...layout.hourTemp, color: skyColors.text },
    rain: { ...layout.rain, color: skyColors.rain },
    dayRow: { ...layout.dayRow, borderTopColor: skyColors.separator },
    day: { ...layout.day, color: skyColors.text },
    low: { ...layout.low, color: skyColors.low },
    high: { ...layout.high, color: skyColors.text },
    track: { ...layout.track, backgroundColor: skyColors.panel },
    range: { ...layout.range, backgroundColor: skyColors.range },
    metricValue: { ...layout.metricValue, color: skyColors.text },
    message: { ...layout.message, color: skyColors.text },
    source: { ...layout.source, color: skyColors.muted },
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
  const wet = /^(09|10|11)/.test(icon);
  const night = icon.endsWith('n');
  const background = night ? skyColors.night : wet ? skyColors.rainSky : skyColors.day;
  const low = Math.min(...(data?.days.map(day => day.tempLow) ?? [0]));
  const high = Math.max(...(data?.days.map(day => day.tempHigh) ?? [1]));
  return <View style={{ flex: 1, backgroundColor: background[0] }}>
    <Svg width="100%" height="100%" style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs><LinearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor={background[0]} /><Stop offset="1" stopColor={background[1]} /></LinearGradient></Defs>
      <Rect width="100%" height="100%" fill="url(#sky)" />
    </Svg>
    <SafeAreaView style={{ flex: 1 }}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <Pressable onPress={() => goBack(router)} accessibilityRole="button" accessibilityLabel="Back" style={styles.back}>
          <Ionicons name="chevron-back" size={26} color={skyColors.text} />
        </Pressable>
        <Text style={styles.navTitle}>Weather</Text>
        <View style={styles.back} />
      </View>
      <ScrollView contentContainerStyle={styles.body} refreshControl={<RefreshControl refreshing={loading && Boolean(data)} onRefresh={() => setRetry(n => n + 1)} tintColor={skyColors.text} />}>
        <View style={styles.hero}>
          <Text style={styles.city}>{data?.city ?? 'Local weather'}</Text>
          {current ? <Text style={styles.temperature}>{Math.round(current.temp)}°</Text> : <Ionicons name={weatherIcon(icon)} size={76} color={skyColors.text} style={{ marginVertical: 18 }} />}
          <Text style={styles.condition}>{current?.condition ?? today?.condition ?? ''}</Text>
          {today ? <Text style={styles.highLow}>H:{Math.round(today.tempHigh)}°  L:{Math.round(today.tempLow)}°</Text> : null}
          {!current && today ? <Text style={styles.muted}>Today’s forecast</Text> : null}
        </View>
        {!valid ? <Text style={styles.message}>Open weather from Today to choose your area.</Text> : null}
        {loading && !data ? <ActivityIndicator color={skyColors.text} accessibilityLabel="Loading forecast" /> : null}
        {failed === key ? <Pressable onPress={() => setRetry(n => n + 1)} style={styles.message} accessibilityRole="button"><Text style={styles.white}>{data ? 'Couldn’t refresh · Tap to retry' : 'Couldn’t load weather · Tap to retry'}</Text></Pressable> : null}
        {data?.periods?.length ? <View style={styles.panel}>
          <Text style={styles.sectionLabel}>NEXT 24 HOURS · 3-HOUR FORECAST</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hours}>
            {data.periods.map(period => <View key={period.timestamp} style={styles.hour}>
              <Text style={styles.white}>{period.localHour % 12 || 12}{period.localHour < 12 ? 'AM' : 'PM'}</Text>
              <Ionicons name={weatherIcon(period.conditionIcon)} size={27} color={period.conditionIcon.startsWith('01') ? skyColors.sun : skyColors.text} />
              <Text style={styles.hourTemp}>{period.temp}°</Text>
              <Text style={styles.rain}>{period.precipitation}%</Text>
            </View>)}
          </ScrollView>
        </View> : null}
        {data?.days.length ? <View style={styles.panel}>
          <Text style={styles.sectionLabel}>{data.days.length}-DAY FORECAST</Text>
          {data.days.map((day) => <View key={day.date} style={styles.dayRow} accessibilityLabel={`${day.date === data.localDate ? 'Today' : day.dayOfWeek}, ${day.condition}, high ${day.tempHigh}, low ${day.tempLow}, rain chance ${day.precipitation} percent`}>
            <Text style={styles.day}>{day.date === data.localDate ? 'Today' : day.dayOfWeek}</Text>
            <View style={styles.dayIcon}><Ionicons name={weatherIcon(day.conditionIcon)} size={24} color={day.conditionIcon.startsWith('01') ? skyColors.sun : skyColors.text} /><Text style={styles.rain}>{day.precipitation}%</Text></View>
            <Text style={styles.low}>{Math.round(day.tempLow)}°</Text>
            <View style={styles.track}><View style={[styles.range, { left: `${(day.tempLow - low) / Math.max(1, high - low) * 100}%`, width: `${Math.max(3, (day.tempHigh - day.tempLow) / Math.max(1, high - low) * 100)}%` }]} /></View>
            <Text style={styles.high}>{Math.round(day.tempHigh)}°</Text>
          </View>)}
        </View> : null}
        {current ? <View style={styles.details}>
          <View style={[styles.panel, styles.metric]}><Ionicons name="flag-outline" color={skyColors.text} size={21} /><Text style={styles.sectionLabel}>WIND</Text><Text style={styles.metricValue}>{Math.round(current.windSpeed)} <Text style={styles.unit}>mph</Text></Text></View>
          <View style={[styles.panel, styles.metric]}><Ionicons name="water-outline" color={skyColors.text} size={21} /><Text style={styles.sectionLabel}>HUMIDITY</Text><Text style={styles.metricValue}>{Math.round(current.humidity)}<Text style={styles.unit}>%</Text></Text></View>
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
  navTitle: { ...t.base, fontFamily: fonts.medium },
  body: { padding: 20, gap: 14, paddingBottom: 36 },
  hero: { alignItems: 'center', paddingTop: 14, paddingBottom: 24 },
  city: { fontFamily: fonts.medium, fontSize: 30, textAlign: 'center' },
  temperature: { fontFamily: fonts.body, fontSize: 96, lineHeight: 112, letterSpacing: -5 },
  condition: { ...t.lg },
  highLow: { ...t.base, marginTop: 4 },
  muted: { ...t.sm, marginTop: 8 },
  white: { ...t.sm },
  panel: { borderRadius: 20, padding: 16 },
  sectionLabel: { ...t.xs, fontFamily: fonts.medium, letterSpacing: 0.6, marginBottom: 10 },
  hours: { gap: 24, paddingTop: 6 },
  hour: { alignItems: 'center', gap: 12, minWidth: 46 },
  hourTemp: { ...t.lg, fontFamily: fonts.medium },
  rain: { fontSize: 11, fontFamily: fonts.medium },
  dayRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 60, borderTopWidth: StyleSheet.hairlineWidth },
  day: { ...t.base, width: 52 },
  dayIcon: { alignItems: 'center', gap: 2, width: 28 },
  low: { ...t.base, width: 32, textAlign: 'right' },
  high: { ...t.base, width: 32, textAlign: 'right' },
  track: { flex: 1, height: 5, borderRadius: 4, overflow: 'hidden' },
  range: { position: 'absolute', height: 5, borderRadius: 4 },
  details: { flexDirection: 'row', gap: 14 },
  metric: { flex: 1, gap: 5 },
  metricValue: { fontSize: 32, fontFamily: fonts.body },
  unit: { ...t.base },
  message: { paddingVertical: 16, textAlign: 'center' },
  source: { ...t.xs, textAlign: 'center', lineHeight: 20 },
});
