import { logisticsWarnings } from '@/lib/savedFloatLogistics';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { hazardTypeLabel, portageNote } from '@eddy/hazards';
import type { SavedFloat } from '@/hooks/useSavedFloats';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';
import { driveToUrl, driveBetweenUrl } from '@/lib/directions';

/** Useful without service; never renders a saved water verdict or time estimate. */
export function SavedFloatDetails({ saved, loading, error, onRetry }: {
  saved: SavedFloat; loading: boolean; error: string | null; onRetry: () => void;
}) {
  const { colors } = useTheme();
  const details = saved.logistics;
  const open = (url: string) => void Linking.openURL(url).catch(() => {
    Alert.alert('Could not open Maps', 'The access coordinates are shown here so you can still use your saved maps.');
  });
  const button = (label: string, action: () => void) => (
    <Pressable onPress={action} accessibilityRole="button" style={[styles.button, { borderColor: colors.border }]}>
      <Text style={[styles.action, { color: colors.interactive }]}>{label}</Text>
    </Pressable>
  );
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.heading, { color: colors.text }]}>Saved trip details</Text>
        <Text style={[styles.body, { color: colors.textMuted }]}>
          {loading ? 'Checking current conditions…' : error ?? 'Current conditions have not been checked.'}
          {' Water conditions, closures and float times are not verified here.'}
        </Text>
        <Text style={[styles.body, { color: colors.textMuted }]}>
          Saved {new Date(details?.savedAt ?? saved.savedAt).toLocaleString()} · {saved.distanceLabel}
        </Text>
        {!loading ? button('Check current conditions', onRetry) : null}
      </View>
      {details ? <>
        {([['Put-in', details.putIn], ['Take-out', details.takeOut]] as const).map(([role, point]) => (
          <View key={role} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.heading, { color: colors.text }]}>{role} · {point.name}</Text>
            <Text style={[styles.body, { color: colors.text }]}>
              {point.isPublic ? 'Public access' : 'Private access — permission may be required'}
              {point.feeRequired ? ' · Fee required' : ''}
            </Text>
            {point.description ? <Text style={[styles.body, { color: colors.text }]}>{point.description}</Text> : null}
            <Text selectable style={[styles.body, { color: colors.textMuted }]}>
              {point.coordinates.lat.toFixed(5)}, {point.coordinates.lng.toFixed(5)} · River mile {point.riverMile}
            </Text>
            {button(`Open ${role.toLowerCase()} in Maps`, () => open(driveToUrl(point)))}
          </View>
        ))}
        {button('Open shuttle in Maps', () => open(driveBetweenUrl(details.takeOut, details.putIn)))}
        <Text style={[styles.body, { color: colors.textMuted }]}>
          Maps may need a connection or maps downloaded in advance. Access details can change; confirm permission before entering private land.
        </Text>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.heading, { color: colors.text }]}>Cautions saved with this trip</Text>
          <Text style={[styles.body, { color: colors.textMuted }]}>
            Recorded {new Date(details.savedAt).toLocaleString()}. These may have changed and do not include new hazards or closures.
          </Text>
          {logisticsWarnings(details.warnings, details.putIn.name, details.takeOut.name).map((warning, i) => <Text key={i} style={[styles.body, { color: colors.text }]}>{warning}</Text>)}
          {details.hazards.map((hazard) => (
            <View key={hazard.id} style={styles.hazard}>
              <Text style={[styles.action, { color: colors.text }]}>{hazard.name} · {hazardTypeLabel(hazard.type)}</Text>
              <Text style={[styles.body, { color: colors.text }]}>
                River mile {hazard.riverMile}{portageNote(hazard) ? ` · ${portageNote(hazard)}` : ''}
              </Text>
              {hazard.description ? <Text style={[styles.body, { color: colors.text }]}>{hazard.description}</Text> : null}
            </View>
          ))}
          {!logisticsWarnings(details.warnings, details.putIn.name, details.takeOut.name).length && !details.hazards.length ? <Text style={[styles.body, { color: colors.textMuted }]}>No cautions were saved. This does not mean the stretch is clear.</Text> : null}
        </View>
      </> : <Text style={[styles.body, { color: colors.text }]}>
        {saved.putInName} → {saved.takeOutName}. Open this float with a connection once to save its access details for offline use.
      </Text>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, paddingBottom: 36, gap: 14 },
  card: { padding: 16, borderWidth: 1, borderRadius: 12, gap: 10 },
  heading: { ...t.lg, fontFamily: fonts.semibold },
  body: { ...t.sm, fontFamily: fonts.body },
  action: { ...t.sm, fontFamily: fonts.semibold },
  button: { minHeight: 44, padding: 12, borderWidth: 1, borderRadius: 10, justifyContent: 'center' },
  hazard: { gap: 6, marginTop: 6 },
});
