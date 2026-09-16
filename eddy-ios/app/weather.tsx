import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { LocationWeatherForecast } from '@eddy/types';
import { fetchLocationWeather } from '@/api/client';
import { EddySymbol } from '@/components/EddySymbol';
import { peekLocationForecast, seedLocationForecast } from '@/lib/locationForecast';
import { goBack } from '@/lib/nav';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';

export default function WeatherScreen() {
  const { lat: latParam, lng: lngParam } = useLocalSearchParams<{ lat: string; lng: string }>();
  const lat = Number(latParam);
  const lng = Number(lngParam);
  const valid = Boolean(latParam && lngParam) && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
  const key = JSON.stringify([lat, lng]);
  const router = useRouter();
  const { colors } = useTheme();
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
  return <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
    <Stack.Screen options={{ headerShown: false }} />
    <View style={styles.header}>
      <Pressable onPress={() => goBack(router)} accessibilityRole="button" accessibilityLabel="Back" style={styles.back}>
        <Ionicons name="chevron-back" size={24} color={colors.interactive} />
      </Pressable>
      <Text style={[styles.title, { color: colors.text }]}>Local forecast</Text>
    </View>
    <ScrollView contentContainerStyle={styles.body}
      refreshControl={<RefreshControl refreshing={loading && Boolean(data)} onRefresh={() => setRetry((n) => n + 1)} tintColor={colors.interactive} />}>
      <View style={styles.place}>
        <EddySymbol name="weather" size={56} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.city, { color: colors.text }]}>{data?.city ? 'Near ' + data.city : 'Your current area'}</Text>
          <Text style={{ ...t.sm, color: colors.textMuted }}>Temperatures in °F · Wind in mph</Text>
        </View>
      </View>
      {!valid ? <Text style={{ color: colors.textMuted }}>Open local weather from Today to choose your area.</Text> : null}
      {loading && !data ? <ActivityIndicator color={colors.interactive} accessibilityLabel="Loading forecast" /> : null}
      {failed === key ? <View style={[styles.card, { backgroundColor: colors.card }]}>
        <Text style={{ color: colors.textMuted }}>{data ? 'Couldn’t refresh. Showing the previously loaded forecast.' : 'Couldn’t load the local forecast.'}</Text>
        <Pressable onPress={() => setRetry((n) => n + 1)} accessibilityRole="button" style={styles.retry}><Text style={{ color: colors.interactive }}>Retry forecast</Text></Pressable>
      </View> : null}
      {data?.days.map((day) => <View key={day.date} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.day, { color: colors.text }]}>{day.dayOfWeek} · {day.date}</Text>
        <Text style={[styles.temperature, { color: colors.text }]}>H {Math.round(day.tempHigh)}° / L {Math.round(day.tempLow)}°</Text>
        <Text style={{ ...t.base, color: colors.text }}>{day.condition}</Text>
        <View style={styles.facts}>
          <Text style={{ ...t.sm, color: colors.textMuted }}>Rain chance: {day.precipitation}%</Text>
          {day.windSpeed != null ? <Text style={{ ...t.sm, color: colors.textMuted }}>Average wind: {Math.round(day.windSpeed)} mph</Text> : null}
          {day.humidity != null ? <Text style={{ ...t.sm, color: colors.textMuted }}>Humidity: {Math.round(day.humidity)}%</Text> : null}
        </View>
      </View>)}
      {data && !data.days.length ? <Text style={{ color: colors.textMuted }}>No forecast days are available. Pull down to retry.</Text> : null}
      {data ? <Text style={{ ...t.xs, color: colors.textSubtle }}>Forecast: OpenWeather. Today’s high and low cover the remaining forecast periods.</Text> : null}
    </ScrollView>
  </SafeAreaView>;
}
const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, gap: 8 },
  back: { minWidth: 44, minHeight: 44, justifyContent: 'center', alignItems: 'center' },
  title: { ...t.lg, fontFamily: fonts.heading },
  body: { padding: 16, paddingBottom: 40, gap: 14 },
  place: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 6 },
  city: { ...t['2xl'], fontFamily: fonts.display },
  card: { padding: 18, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, gap: 8 },
  day: { ...t.base, fontFamily: fonts.semibold },
  temperature: { ...t['2xl'], fontFamily: fonts.heading },
  facts: { gap: 8, marginTop: 8 },
  retry: { minHeight: 44, justifyContent: 'center' },
});

