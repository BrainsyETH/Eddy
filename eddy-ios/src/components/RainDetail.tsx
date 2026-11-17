import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { chartShortStamp } from '@eddy/conditions/chart-calendar';
import { rainAmount, rainCoverageIncomplete, rainMapState, usableRain } from '@eddy/conditions/rainfall';
import { RAIN_MAP_BANDS } from '@eddy/conditions/rainfall-map';
import { useRainDetail } from '@/hooks/useRainfall';
import { RainMap } from '@/components/RainMap';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';

const rainStamp = (time: string, timeZone: string) => chartShortStamp(time, timeZone).replace(' · ', ' at ');

/** Rendered inside the chart's existing sheet/full-screen modal. */
export function RainDetail({ siteId, timeZone }: { siteId: string; timeZone: string }) {
  const { colors } = useTheme();
  const { data, failed, retry } = useRainDetail(siteId);
  const [hoursOpen, setHoursOpen] = useState(false);
  const [visibleHours, setVisibleHours] = useState(24);
  const [aboutOpen, setAboutOpen] = useState(false);
  if (failed) return <View style={styles.empty}>
    <Text style={[styles.heading, { color: colors.text }]}>Rain data unavailable</Text>
    <Pressable accessibilityRole="button" onPress={retry} style={styles.action}>
      <Text style={[styles.link, { color: colors.interactive }]}>Try again</Text>
    </Pressable>
  </View>;
  if (!data) return <View style={styles.loading}><ActivityIndicator color={colors.interactive} />
    <Text style={[styles.body, { color: colors.textMuted }]}>Loading rain estimates</Text>
  </View>;
  const state = rainMapState(data);
  const status = state === 'dry' ? 'No rain estimated' : state === 'partial' ? 'Some rain data is missing'
    : state === 'unavailable' ? 'Rain map unavailable' : 'Rain across this area';
  const totalEnds = [...new Set(data.totals.map(row => row.end))];
  // Keep a single timestamp only when both totals actually share an ending.
  const commonEnd = totalEnds.length === 1 ? totalEnds[0] : null;
  const latest = data.hourly[data.hourly.length - 1];
  return <>
    <View style={styles.intro}>
      <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>{data.basin.name}</Text>
      <Text style={[styles.caption, { color: colors.textMuted }]}>{Math.round(data.basin.areaSqMi).toLocaleString()} square miles upstream</Text>
    </View>
    <View style={[styles.totals, { backgroundColor: colors.cardRaised, borderColor: colors.border }]}>
      {[24, 72].map((hours, index) => {
        const total = data.totals.find(row => row.hours === hours);
        const amount = rainAmount(total?.inches);
        const available = amount !== 'Unavailable';
        return <View key={hours} style={[styles.total, index === 1 && styles.secondTotal, { borderColor: colors.border }]}>
          <Text style={[styles.caption, { color: colors.textMuted }]}>Past {hours} hours</Text>
          <Text accessibilityLabel={`${amount} in the past ${hours} hours`} style={[available ? styles.amount : styles.unavailable, { color: colors.text }]}>
            {available ? <>{amount.replace(' in', '')}<Text style={styles.unit}> in</Text></> : 'Unavailable'}
          </Text>
          {total && rainCoverageIncomplete(total.coverage) ? <Text style={[styles.caption, { color: colors.textMuted }]}>Some data missing</Text> : null}
          {total && !commonEnd ? <Text style={[styles.caption, { color: colors.textMuted }]}>Through {rainStamp(total.end, timeZone)}</Text> : null}
        </View>;
      })}
    </View>
    {commonEnd ? <Text style={[styles.caption, { color: colors.textMuted }]}>Rain through {rainStamp(commonEnd, timeZone)}</Text> : null}
    <View style={styles.mapSection}>
      <View style={styles.mapHeading}>
        <Text accessibilityRole="header" style={[styles.heading, { color: colors.text }]}>{status}</Text>
        <Text style={[styles.caption, { color: colors.textMuted }]}>Past 24 hours</Text>
      </View>
      <RainMap key={siteId} data={data} />
      {data.shading && data.shading.end !== commonEnd ? <Text style={[styles.caption, { color: colors.textMuted }]}>Map through {rainStamp(data.shading.end, timeZone)}</Text> : null}
      {data.shading ? <View style={styles.legend} accessible accessibilityLabel="Rain in inches. No rain, less than 0.1, 0.1 to 0.5, 0.5 to 1, 1 to 2, and 2 or more. Striped areas have no estimate.">
        <Text style={[styles.caption, { color: colors.textMuted }]}>Rain in inches</Text>
        <View style={styles.legendScale}>{RAIN_MAP_BANDS.map((label, i) => <View key={label} style={styles.legendBand}>
          <View style={[styles.swatch, { backgroundColor: colors.cardRaised, borderColor: colors.border }]}>
            {i > 0 ? <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.rainHeavy, opacity: 0.15 + i * 0.16 }]} /> : null}
          </View>
          <Text style={[styles.legendLabel, { color: colors.textMuted }]}>{label}</Text>
        </View>)}</View>
        {state === 'partial' ? <Text style={[styles.caption, { color: colors.textMuted }]}>Striped areas have no estimate</Text> : null}
      </View> : null}
    </View>
    <View style={[styles.disclosures, { borderColor: colors.border }]}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: hoursOpen }} onPress={() => setHoursOpen(value => !value)}
        style={({ pressed }) => [styles.disclosure, { opacity: pressed ? 0.65 : 1 }]}>
        <Text style={[styles.link, styles.rowLabel, { color: colors.interactive }]}>Rain by hour</Text>
        <Ionicons name={hoursOpen ? 'chevron-up' : 'chevron-down'} size={18} color={colors.interactive} />
      </Pressable>
      {hoursOpen ? <View style={styles.hourly}>
        {latest ? <Text style={[styles.caption, { color: colors.textMuted }]}>Each amount covers the hour ending at that time.</Text> : <Text style={[styles.body, { color: colors.textMuted }]}>Hourly rain is unavailable.</Text>}
        {data.hourly.slice().reverse().slice(0, visibleHours).map(row => <View key={row.start} style={[styles.hour, { borderColor: colors.border }]}>
          <Text style={[styles.caption, styles.hourTime, { color: colors.textMuted }]}>{rainStamp(row.end, timeZone)}</Text>
          <Text style={[styles.hourAmount, { color: colors.text }]}>{rainAmount(usableRain(row) ? row.inches : null)}</Text>
        </View>)}
        {data.hourly.length > visibleHours ? <Pressable accessibilityRole="button" onPress={() => setVisibleHours(value => value + 24)} style={styles.action}>
          <Text style={[styles.link, { color: colors.interactive }]}>Show earlier hours</Text>
        </Pressable> : null}
      </View> : null}
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: aboutOpen }} onPress={() => setAboutOpen(value => !value)}
        style={({ pressed }) => [styles.disclosure, styles.aboutRow, { borderColor: colors.border, opacity: pressed ? 0.65 : 1 }]}>
        <Text style={[styles.link, styles.rowLabel, { color: colors.interactive }]}>About these estimates</Text>
        <Ionicons name={aboutOpen ? 'chevron-up' : 'chevron-down'} size={18} color={colors.interactive} />
      </Pressable>
      {aboutOpen ? <View style={styles.about}>
        <Text style={[styles.body, { color: colors.textBody }]}>The outline shows the land that drains to this gauge. Totals are the average rain across that area.</Text>
        <Text style={[styles.body, { color: colors.textBody }]}>NOAA estimates rain using radar and rain gauges. Rain at any one spot can differ. Striped areas have no estimate.</Text>
        <Text style={[styles.caption, { color: colors.textMuted }]}>Rain estimates from NOAA MRMS. Watershed boundary from USGS.</Text>
      </View> : null}
    </View>
  </>;
}

const styles = StyleSheet.create({
  intro: { gap: 3, marginBottom: 4 }, title: { ...t.xl, fontFamily: fonts.heading },
  heading: { ...t.base, fontFamily: fonts.semibold }, body: { ...t.sm }, caption: { ...t.xs },
  totals: { flexDirection: 'row', borderWidth: 1, borderRadius: 14, paddingVertical: 14 },
  total: { flex: 1, minWidth: 0, paddingHorizontal: 14, gap: 5 }, secondTotal: { borderLeftWidth: StyleSheet.hairlineWidth },
  amount: { ...t['2xl'], fontFamily: fonts.monoMedium }, unit: { ...t.sm, fontFamily: fonts.body },
  unavailable: { ...t.base, fontFamily: fonts.medium },
  mapSection: { gap: 10, marginTop: 8 }, mapHeading: { gap: 2 },
  legend: { gap: 6 }, legendScale: { flexDirection: 'row', gap: 3 }, legendBand: { flex: 1, gap: 4 },
  swatch: { height: 9, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  legendLabel: { ...t.xs, textAlign: 'center', fontSize: 11 },
  disclosures: { borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, marginTop: 8 },
  disclosure: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  aboutRow: { borderTopWidth: StyleSheet.hairlineWidth }, rowLabel: { flex: 1 },
  link: { ...t.sm, fontFamily: fonts.semibold }, action: { minHeight: 44, justifyContent: 'center' },
  hourly: { gap: 8, paddingBottom: 12 }, hour: { borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: 10, flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  hourTime: { flexGrow: 1, flexShrink: 1 }, hourAmount: { ...t.sm, fontFamily: fonts.monoMedium },
  about: { gap: 10, paddingBottom: 16 }, empty: { gap: 8, paddingVertical: 12 },
  loading: { minHeight: 100, justifyContent: 'center', alignItems: 'center', gap: 12 },
});
