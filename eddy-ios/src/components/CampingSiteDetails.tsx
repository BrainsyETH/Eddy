import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import type { CampsiteDetailFact } from '@eddy/conditions/campsite-details';
import { useCampsiteDetails } from '@/hooks/useCampsiteDetails';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';
import { EddySymbol } from './EddySymbol';
import { ControlIcon } from './ControlIcon';
import { FoldedProse } from './map-sheet/sections';

function FactIcon({ fact }: { fact: CampsiteDetailFact }) {
  const { colors } = useTheme();
  switch (fact.key) {
    case 'setting': return <EddySymbol name={/river/i.test(fact.value) ? 'river' : 'accessPoint'} size={24} />;
    case 'access': return <EddySymbol name={/drive/i.test(fact.value) ? 'road' : 'accessPoint'} size={24} />;
    case 'equipment': return <EddySymbol name="campground" size={24} />;
    case 'amenities': return <EddySymbol name="facilities" size={24} />;
    case 'hookups': return /electric/i.test(fact.value) ? <ControlIcon name="flash-outline" size={21} color={colors.interactive} /> : <EddySymbol name="water" size={24} />;
    case 'arrival': return <ControlIcon name="time-outline" size={21} color={colors.interactive} />;
    case 'pets': return <ControlIcon name="paw-outline" size={21} color={colors.interactive} />;
    case 'accessibility': return <ControlIcon name="accessibility-outline" size={21} color={colors.interactive} />;
  }
}

/** Mounted only inside an expanded card; availability and booking never wait. */
export function CampingSiteDetails({ facilityId, siteId, onOpenSource }: {
  facilityId?: string | null;
  siteId: string;
  onOpenSource: (url: string) => void;
}) {
  const { colors } = useTheme();
  const { width, fontScale } = useWindowDimensions();
  const stacked = fontScale >= 1.3 || width < 360;
  const { details, loading, failed, refresh } = useCampsiteDetails(facilityId ?? null, siteId);
  if (loading) return <Text accessibilityLiveRegion="polite" style={[styles.sourceText, { color: colors.textMuted }]}>Loading site details…</Text>;
  if (failed) return <Pressable accessibilityRole="button" accessibilityLabel="Retry site details" onPress={refresh} style={styles.source}>
    <ControlIcon name="refresh-outline" size={16} color={colors.interactive} />
    <Text style={[styles.sourceText, { color: colors.interactive }]}>Site details unavailable · Retry</Text>
  </Pressable>;
  if (!details || (!details.facts.length && !details.notes.length)) return null;
  return <View style={styles.section}>
    <View style={styles.heading}>
      <EddySymbol name="campground" size={26} />
      <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>About this site</Text>
    </View>
    <View>
      {details.facts.map(fact => <View key={fact.key} accessible accessibilityLabel={`${fact.label}: ${fact.value}`}
        style={[styles.fact, { borderBottomColor: colors.border }]}>
        <View style={[styles.icon, { backgroundColor: colors.cardRaised }]}><FactIcon fact={fact} /></View>
        <View style={[styles.factBody, stacked && styles.stacked]}>
          <Text style={[styles.label, stacked && styles.stackedLabel, { color: colors.textMuted }]}>{fact.label}</Text>
          <Text style={[styles.value, stacked && styles.stackedValue, { color: colors.textBody }]}>{fact.value}</Text>
        </View>
      </View>)}
    </View>
    {details.notes.length ? <View style={styles.notes}>
      <Text style={[styles.label, styles.stackedLabel, { color: colors.text }]}>Good to know</Text>
      <FoldedProse lines={3} subject="site notes">{details.notes.join('\n\n')}</FoldedProse>
    </View> : null}
    <Pressable accessibilityRole="link" accessibilityLabel={`View official site details on ${details.source}`}
      onPress={() => onOpenSource(details.sourceUrl)} style={styles.source}>
      <Text style={[styles.sourceText, { color: colors.interactive }]}>Details from {details.source}</Text>
      <ControlIcon name="open-outline" size={14} color={colors.interactive} />
    </Pressable>
  </View>;
}

const styles = StyleSheet.create({
  section: { gap: 6 },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 4, paddingBottom: 2 },
  title: { ...t.base, fontFamily: fonts.semibold, flexShrink: 1 },
  fact: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  icon: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  factBody: { flex: 1, flexDirection: 'row', alignItems: 'baseline', gap: 8, paddingVertical: 4 },
  stacked: { flexDirection: 'column', alignItems: 'stretch', gap: 2 },
  label: { ...t.xs, fontFamily: fonts.medium, width: 78 },
  stackedLabel: { width: 'auto' },
  value: { ...t.sm, fontFamily: fonts.body, flex: 1, flexShrink: 1 },
  stackedValue: { flex: 0 },
  notes: { paddingTop: 6, gap: 4 },
  source: { minHeight: 44, minWidth: 44, flexDirection: 'row', alignItems: 'center', gap: 6 },
  sourceText: { ...t.xs, fontFamily: fonts.body, flexShrink: 1 },
});
