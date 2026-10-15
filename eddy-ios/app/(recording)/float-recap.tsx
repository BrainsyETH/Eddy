import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import type { CompletedFloat } from '@eddy/conditions/float-archive';
import { useFloatArchive } from '@/hooks/useFloatArchive';
import { floatArchive } from '@/lib/floatArchive';
import { deleteFloatTrack } from '@/float/floatTracks';
import { formatDuration } from '@/lib/floatSession';
import { useTheme } from '@/theme/ThemeProvider';
import { textStyles, type as t } from '@/theme/typography';

export default function FloatRecapScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const archive = useFloatArchive();
  const router = useRouter();
  const root = useNavigation('/');
  const showHistory = () => {
    if (root.canGoBack()) root.goBack();
    router.navigate('/(tabs)/(floats)/float-history');
  };
  const { colors } = useTheme();
  const row = archive.rows.find((r) => r.id === id && r.kind === 'completed' && !r.deleted);
  const trip = row?.payload as CompletedFloat | undefined;
  const duration = (ms: number) => (ms > 0 && ms < 60000 ? 'Less than 1 min' : formatDuration(Math.round(ms / 60000)));
  const remove = () =>
    Alert.alert(
      'Delete this float?',
      'This removes the recap from your history and account backup when connected, and its GPS track from this phone. It also removes it from future estimate analysis.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            if (!archive.owner) return;
            // The track first: its deletion is recorded before the recap, the
            // only place to ask again, disappears (floatTrackDeletion.ts).
            void (async () => {
              let track: Awaited<ReturnType<typeof deleteFloatTrack>>;
              try {
                track = await deleteFloatTrack(id);
                await floatArchive.remove(id, archive.scopeToken);
              } catch {
                Alert.alert('Could not delete', 'Please try again.');
                return;
              }
              showHistory();
              if (track === 'queued') {
                Alert.alert(
                  'Recap deleted',
                  'Its GPS track couldn’t be removed from this phone yet. Eddy will keep trying each time it opens.',
                );
              }
            })();
          },
        },
      ],
    );
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['left', 'right']}>
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
        <Text style={[textStyles.pageTitle, { color: colors.text }]}>
          {trip ? 'Your float recap' : archive.ready ? 'Recap unavailable' : 'Loading recap…'}
        </Text>
        {trip ? (
          <>
            <Text style={[textStyles.sectionTitle, { color: colors.text }]}>{trip.riverName}</Text>
            <Text style={[t.base, { color: colors.textMuted }]}>{new Date(trip.startedAt).toLocaleString()}</Text>
            <Text style={[t.base, { color: colors.text }]}>
              {trip.putInName ?? 'On-river start'} → {trip.takeOutName}
            </Text>
            <Text style={[t.sm, { color: colors.textMuted }]}>
              {trip.reachedTakeOut ? 'Reached the take-out' : 'Tracking ended; arrival was not confirmed'}
              {trip.boatType ? ` · ${trip.boatType}` : null}
            </Text>
            <View style={[styles.card, { borderColor: colors.border }]}>
              {[
                ['Tracked distance', `${trip.distanceMiles.toFixed(1)} mi`],
                ['Total time', duration(trip.elapsedMs)],
                ['Moving', duration(trip.movingMs)],
                ['Stopped', duration(trip.stoppedMs)],
                ['Not observed', duration(trip.unknownMs)],
                [
                  'Average moving pace',
                  trip.movingMph == null ? 'Not enough data' : `${trip.movingMph.toFixed(1)} mph`,
                ],
              ].map(([label, value]) => (
                <View key={label} style={styles.row}>
                  <Text style={[t.base, styles.grow, { color: colors.textMuted }]}>{label}</Text>
                  <Text style={[textStyles.data, { color: colors.text }]}>{value}</Text>
                </View>
              ))}
            </View>
            <Text style={[t.sm, { color: colors.textMuted }]}>
              Times and distance are estimates from confirmed river positions. GPS gaps and brief movements Eddy
              couldn’t classify are shown as not observed. Missing distance is not filled in.
            </Text>
            <Text style={[textStyles.cardTitle, { color: colors.text }]}>Water near the start</Text>
            {trip.water ? (
              <Text style={[t.base, { color: colors.textMuted }]}>
                {trip.water.gaugeName}: {trip.water.heightFt == null ? '' : `${trip.water.heightFt.toFixed(2)} ft`}
                {trip.water.dischargeCfs == null ? '' : ` · ${Math.round(trip.water.dischargeCfs)} cfs`}
                {'\n'}Observed {new Date(trip.water.observedAt).toLocaleString()}. An upstream gauge reading, not a
                measurement along your whole route.
              </Text>
            ) : (
              <Text style={[t.base, { color: colors.textMuted }]}>
                {row?.dirty || row?.backupError
                  ? 'A historical gauge reading can be added after account backup.'
                  : 'No suitable historical reading was available near your start time.'}
              </Text>
            )}
            <Text style={[t.sm, { color: colors.textMuted }]}>
              {archive.owner === 'guest'
                ? 'Saved on this phone.'
                : row?.backupError
                  ? `Not backed up. ${row.backupError}`
                : row?.dirty
                  ? 'Saved on this phone. Account backup pending.'
                  : 'Backed up to your account.'}
            </Text>
            <Pressable accessibilityRole="button" onPress={remove} style={styles.button}>
              <Text style={[t.base, { color: colors.error }]}>Delete float</Text>
            </Pressable>
          </>
        ) : (
          <Text style={[t.base, { color: colors.textMuted }]}>
            If saving was interrupted, Eddy will retry. Check your history again in a moment.
          </Text>
        )}
        <Pressable accessibilityRole="button" onPress={showHistory} style={styles.button}>
          <Text style={[t.base, { color: colors.interactive }]}>View history and backup</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  content: { padding: 20, gap: 16, paddingBottom: 40 },
  card: { padding: 16, gap: 16, borderWidth: 1, borderRadius: 16 },
  row: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  grow: { flex: 1 },
  button: { paddingVertical: 12, minHeight: 44 },
});
