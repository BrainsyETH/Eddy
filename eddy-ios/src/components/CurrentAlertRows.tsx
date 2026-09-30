import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import type { HighWaterEntry, RiverAlert } from '@eddy/types';
import { conditionBg, conditionColor, conditionInk } from '@/theme/conditions';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';
import { readingAge } from '@/lib/readingCopy';
import { asHref } from '@/lib/href';

function readingLine(entry: HighWaterEntry): string | null {
  const parts: string[] = [];
  if (entry.readingValue !== null && entry.readingUnit) {
    const value = entry.readingUnit === 'ft' ? entry.readingValue.toFixed(2) : Math.round(entry.readingValue).toLocaleString();
    parts.push(`${value} ${entry.readingUnit}`);
  }
  const age = readingAge(entry.readingAgeHours);
  if (age) parts.push(age);
  return parts.length ? parts.join(' · ') : null;
}

/** These rows also render in Alerts, so source attribution and destinations stay consistent. */
export function HighWaterAlertRow({ entry }: { entry: HighWaterEntry }) {
  const { colors, elevation } = useTheme();
  const router = useRouter();
  const detail = [entry.subtitle, readingLine(entry)].filter(Boolean).join(' · ');
  const target = entry.damId ? `/dam/${entry.damId}` : entry.riverSlug ? `/river/${entry.riverSlug}`
    : entry.siteId ? `/gauge/${entry.siteId}` : null;
  return (
    <Pressable
      onPress={target ? () => router.push(asHref(target)) : undefined}
      disabled={!target}
      style={({ pressed }) => [styles.row, { backgroundColor: colors.card, opacity: pressed && target ? 0.7 : 1 }, elevation(1)]}
      accessible
      accessibilityRole={target ? 'button' : 'text'}
      accessibilityLabel={`${entry.name}, ${entry.conditionLabel}. ${detail}`}
    >
      <View style={[styles.stripe, { backgroundColor: conditionColor(entry.conditionCode) }]} />
      <View style={styles.rowBody}>
        <Text style={[styles.riverName, { color: colors.text }]}>{entry.name}</Text>
        <Text style={[styles.headline, { color: conditionInk(entry.conditionCode) }]}>{entry.conditionLabel}</Text>
        <Text style={[styles.detail, { color: colors.textMuted }]}>{detail}</Text>
      </View>
      <View style={[styles.chip, { backgroundColor: conditionBg(entry.conditionCode) }]}>
        <Ionicons name={entry.conditionCode === 'dangerous' ? 'warning-outline' : 'water-outline'} size={16} color={conditionInk(entry.conditionCode)} />
      </View>
    </Pressable>
  );
}

export function PublicNoticeRow({ alert, showBody = false }: { alert: RiverAlert; showBody?: boolean }) {
  const { colors, elevation } = useTheme();
  const stripe = alert.severity === 'warning' ? conditionColor('dangerous') : alert.severity === 'watch' ? colors.warm : colors.textSubtle;
  const source = alert.source === 'nps' ? 'National Park Service' : 'National Weather Service';
  const severity = { warning: 'Warning', watch: 'Caution', notice: 'Notice' }[alert.severity];
  return (
    <Pressable
      onPress={alert.url ? () => void Linking.openURL(alert.url as string) : undefined}
      disabled={!alert.url}
      style={({ pressed }) => [styles.row, { backgroundColor: colors.card, opacity: pressed && alert.url ? 0.7 : 1 }, elevation(1)]}
      accessible
      accessibilityRole={alert.url ? 'link' : 'text'}
      accessibilityLabel={`${severity}. ${alert.category}, ${alert.riverName}, ${alert.title}. ${source}${showBody && alert.body ? `. ${alert.body}` : ''}`}
    >
      <View style={[styles.stripe, { backgroundColor: stripe }]} />
      <View style={styles.rowBody}>
        <Text style={[styles.riverName, { color: colors.text }]}>{alert.riverName}</Text>
        <Text style={[styles.headline, { color: colors.text }]}>{alert.title}</Text>
        <Text style={[styles.detail, { color: colors.textMuted }]}>{severity} · {alert.category} · {source}</Text>
        {showBody && alert.body ? <Text style={[styles.body, { color: colors.text }]}>{alert.body}</Text> : null}
      </View>
      {alert.url ? <Ionicons name="open-outline" size={16} color={colors.textSubtle} style={styles.externalIcon} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginBottom: 10, minHeight: 44, borderRadius: 14, overflow: 'hidden' },
  stripe: { width: 4, alignSelf: 'stretch' },
  rowBody: { flex: 1, padding: 14 },
  riverName: { ...t.base, fontFamily: fonts.semibold },
  headline: { ...t.sm, fontFamily: fonts.semibold, marginTop: 3 },
  detail: { ...t.xs, fontFamily: fonts.body, marginTop: 3 },
  body: { ...t.sm, fontFamily: fonts.body, marginTop: 10 },
  chip: { padding: 8, borderRadius: 999, marginRight: 14 },
  externalIcon: { marginRight: 14 },
});
