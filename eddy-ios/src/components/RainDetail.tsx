import { useId, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, ClipPath, Defs, G, Path, Text as SvgText } from 'react-native-svg';
import { chartStamp } from '@eddy/conditions/chart-calendar';
import { rainAmount, usableRain } from '@eddy/conditions/rainfall';
import { rainfallMap, RAIN_MAP_BANDS } from '@eddy/conditions/rainfall-map';
import { useRainDetail } from '@/hooks/useRainfall';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';

/** Rendered inside the chart's existing sheet/full-screen modal. */
export function RainDetail({ siteId, timeZone }: { siteId: string; timeZone: string }) {
  const { colors } = useTheme();
  const { data, failed, retry } = useRainDetail(siteId);
  const [hoursOpen, setHoursOpen] = useState(false);
  const map = useMemo(() => data ? rainfallMap(data) : null, [data]);
  const id = `rain-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  if (failed) return <View><Text style={[styles.body, { color: colors.textMuted }]}>Rain data unavailable.</Text>
    <Pressable accessibilityRole="button" onPress={retry} style={styles.action}><Text style={[styles.link, { color: colors.interactive }]}>Try again</Text></Pressable></View>;
  if (!data || !map) return <ActivityIndicator accessibilityLabel="Loading rain upstream" color={colors.interactive} />;
  return <>
    <Text style={[styles.body, { color: colors.textBody }]}>Rain across the land that drains to this gauge.</Text>
    <View><Text style={[styles.heading, { color: colors.text }]}>{data.basin.name}</Text>
      <Text style={[styles.caption, { color: colors.textMuted }]}>{Math.round(data.basin.areaSqMi).toLocaleString()} sq mi · Radar estimate</Text></View>
    <View style={[styles.map, { backgroundColor: colors.card, borderColor: colors.border }]} accessible accessibilityLabel={`Watershed upstream of ${data.basin.name}${data.shading ? ', shaded by estimated rain in the past 24 hours' : ', rainfall shading unavailable'}`}>
      <Svg viewBox="0 0 320 270" width="100%" height={270} accessible={false}>
        <Defs><ClipPath id={id}><Path d={map.path} fillRule="evenodd" clipRule="evenodd" /></ClipPath></Defs>
        <Path d={map.path} fill={colors.border} fillRule="evenodd" />
        <G clipPath={`url(#${id})`}>{map.shading.map((d, i) => <Path key={i} d={d} fill={colors.rainHeavy} fillOpacity={i === 0 ? 0.08 : 0.15 + i * 0.16} />)}</G>
        <Path d={map.path} fill="none" stroke={colors.interactive} strokeWidth={1.5} />
        <Circle cx={map.gauge.x} cy={map.gauge.y} r={4} fill={colors.accent} stroke={colors.card} strokeWidth={2} />
        <SvgText x={300} y={22} textAnchor="middle" fill={colors.textMuted} fontSize={12}>N ↑</SvgText>
      </Svg>
    </View>
    <Text style={[styles.caption, { color: colors.textMuted }]}>{data.shading ? `24-hour rain · through ${chartStamp(data.shading.end, timeZone)}` : 'Rainfall shading unavailable'} · Dot: gauge</Text>
    {data.shading ? <View style={styles.legend}>{RAIN_MAP_BANDS.map((label, i) => <View key={label} style={styles.legendItem}>
      <View style={[styles.swatch, { backgroundColor: colors.rainHeavy, opacity: i === 0 ? 0.08 : 0.15 + i * 0.16 }]} />
      <Text style={[styles.caption, { color: colors.textMuted }]}>{label} in</Text></View>)}
      <View style={styles.legendItem}><View style={[styles.swatch, { backgroundColor: colors.border }]} /><Text style={[styles.caption, { color: colors.textMuted }]}>No estimate</Text></View>
    </View> : null}
    <View style={styles.totals}>{[24, 72].map(hours => { const total = data.totals.find(row => row.hours === hours); return <View key={hours} style={[styles.total, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={[styles.caption, { color: colors.textMuted }]}>Past {hours} hours</Text>
      <Text style={[styles.amount, { color: colors.text }]}>{rainAmount(total?.inches)}</Text>
      {total ? <Text style={[styles.caption, { color: colors.textMuted }]}>Through {chartStamp(total.end, timeZone)}{total.coverage < 1 ? ` · ${Math.round(total.coverage * 100)}% coverage` : ''}</Text> : null}
    </View>; })}</View>
    <Text style={[styles.caption, { color: colors.textMuted }]}>Radar estimates can differ from rain measured on the ground. Gaps mean missing data.</Text>
    <Pressable accessibilityRole="button" accessibilityState={{ expanded: hoursOpen }} onPress={() => setHoursOpen(value => !value)} style={styles.action}>
      <Text style={[styles.link, { color: colors.interactive }]}>{hoursOpen ? 'Hide hourly rain' : 'Hourly rain'}</Text>
    </Pressable>
    {hoursOpen ? data.hourly.slice().reverse().map(row => <View key={row.start} style={[styles.hour, { borderColor: colors.border }]}>
      <Text style={[styles.caption, { color: colors.textMuted }]}>Hour ending {chartStamp(row.end, timeZone)}</Text>
      <Text style={[styles.body, { color: colors.text }]}>{rainAmount(usableRain(row) ? row.inches : null)}</Text>
    </View>) : null}
    <Text style={[styles.caption, { color: colors.textSubtle }]}>Rain: NOAA MRMS · Watershed: USGS</Text>
  </>;
}
const styles = StyleSheet.create({
  heading: { ...t.base, fontFamily: fonts.semibold }, body: { ...t.sm }, caption: { ...t.xs },
  amount: { ...t.lg, fontFamily: fonts.monoMedium, marginVertical: 4 },
  map: { borderRadius: 12, borderWidth: 1, overflow: 'hidden' },
  totals: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 }, total: { flex: 1, minWidth: 130, padding: 12, borderWidth: 1, borderRadius: 12 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 }, legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 }, swatch: { width: 12, height: 12 },
  action: { minHeight: 44, justifyContent: 'center' }, link: { ...t.sm, fontFamily: fonts.semibold },
  hour: { borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: 8, gap: 4 },
});
