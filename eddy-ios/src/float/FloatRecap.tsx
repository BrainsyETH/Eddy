import { useState } from 'react';
import { ControlIcon } from '@/components/ControlIcon';
import { Otter } from '@/components/Otter';
import { FloatInfoTip } from './FloatInfoTip';
import { recapBackupStatus } from '@/lib/floatDisplay';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { CompletedFloat } from '@eddy/conditions/float-archive';
import { useFloatArchive } from '@/hooks/useFloatArchive';
import { floatArchive } from '@/lib/floatArchive';
import { deleteFloatTrack } from '@/float/floatTracks';
import { formatDuration } from '@/lib/floatSession';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, textStyles, type as t } from '@/theme/typography';

/** Shared presentation; each route owns its Back/Close destination. */
export function FloatRecap({ id, showHistory }: { id: string; showHistory: () => void }) {
  const archive = useFloatArchive();
  const [retrying, setRetrying] = useState(false);
  const { colors } = useTheme();
  const row = archive.rows.find((r) => r.id === id && r.kind === 'completed' && !r.deleted);
  const trip = row?.payload as CompletedFloat | undefined;
  const duration = (ms: number) => (ms > 0 && ms < 60000 ? '<1 min' : formatDuration(Math.round(ms / 60000)));
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
            // A scope switch in progress (sign-in or sign-out mid-tap): this
            // recap is not the selected account's to delete right now, and
            // its track must not go before its recap can.
            if (!archive.owner || floatArchive.scope() !== archive.scopeToken) {
              Alert.alert('Could not delete', 'Your float history is changing accounts. Try again in a moment.');
              return;
            }
            // The track first: its deletion is recorded before the recap, the
            // only place to ask again, disappears (floatTrackDeletion.ts).
            void (async () => {
              let track: Awaited<ReturnType<typeof deleteFloatTrack>>;
              let removed = false;
              try {
                track = await deleteFloatTrack(id);
                removed = await floatArchive.remove(id, archive.scopeToken);
              } catch {
                Alert.alert('Could not delete', 'Please try again.');
                return;
              }
              if (!removed) {
                Alert.alert('Could not delete', 'This recap is no longer in the selected account’s history. Its GPS track was removed from this phone.');
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
  const backup = row ? recapBackupStatus(archive.owner, row, archive.syncing, archive.error) : null;
  const retry = async () => {
    if (retrying || archive.syncing) return;
    setRetrying(true);
    try {
      if (row?.backupError) await archive.retryRejected();
      else await archive.refresh();
    } catch { Alert.alert('Couldn’t sync', 'Your float is saved on this phone. Try again when you have a connection.'); }
    finally { setRetrying(false); }
  };
  // These are aggregate durations, not an invented chronological GPS trace.
  const parts = trip ? [
    { label: 'Moving', ms: trip.movingMs, color: colors.interactive },
    { label: 'Breaks', ms: trip.stoppedMs, color: colors.warm },
    { label: 'GPS gaps', ms: trip.unknownMs, color: colors.textSubtle },
  ] : [];
  const measuredTime = parts.reduce((sum, part) => sum + part.ms, 0);
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['left', 'right']}>
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
        {trip ? <>
          <View style={styles.row}>
            <View style={styles.grow}>
              <Text style={[t.sm, { color: colors.textMuted }]}>YOUR FLOAT</Text>
              <Text style={[textStyles.pageTitle, { color: colors.text }]}>{trip.riverName}</Text>
              <Text style={[t.sm, { color: colors.textMuted }]}>
                {new Date(trip.startedAt).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
                {trip.boatType ? ` · ${trip.boatType.charAt(0).toUpperCase()}${trip.boatType.slice(1)}` : ''}
              </Text>
            </View>
            <Otter size={72} />
          </View>
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.routeStop}>
              <ControlIcon name="radio-button-on-outline" size={18} color={colors.interactive} />
              <Text style={[t.base, styles.grow, { color: colors.text }]}>{trip.putInName ?? 'On-river start'}</Text>
              {trip.startNote ? <FloatInfoTip title="Recorded start" message={trip.startNote} /> : null}
            </View>
            <View style={styles.routeStop}>
              <ControlIcon name="flag-outline" size={18} color={colors.warm} />
              <Text style={[t.base, styles.grow, { color: colors.text }]}>{trip.takeOutName}</Text>
            </View>
            <Text style={[t.sm, { color: colors.textMuted }]}>
              {trip.reachedTakeOut ? 'Reached the take-out' : 'Ended before arrival was confirmed'}
            </Text>
          </View>
          <View style={styles.stats}>
            <View style={[styles.stat, { backgroundColor: colors.selectionBg }]}>
              <Text style={[styles.bigNumber, { color: colors.text }]}>{trip.distanceMiles.toFixed(1)}<Text style={t.base}> mi</Text></Text>
              <Text style={[t.sm, { color: colors.textMuted }]}>Tracked distance</Text>
            </View>
            <View style={[styles.stat, { backgroundColor: colors.card }]}>
              <Text style={[styles.timeNumber, { color: colors.text }]}>{duration(trip.elapsedMs)}</Text>
              <Text style={[t.sm, { color: colors.textMuted }]}>Total time</Text>
            </View>
          </View>
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.row}>
              <Text style={[textStyles.cardTitle, styles.grow, { color: colors.text }]}>How you spent your time</Text>
              <FloatInfoTip title="Time and distance" message="Time and distance are estimated from confirmed river positions. GPS gaps include missing fixes and movement Eddy couldn’t classify. Missing distance isn’t filled in. The bar compares total durations; it doesn’t show when each break happened." />
            </View>
            {measuredTime > 0 ? <View style={styles.timeBar} accessible accessibilityRole="image"
              accessibilityLabel={parts.map(part => `${part.label}: ${duration(part.ms)}`).join(', ')}>
              {parts.filter(part => part.ms > 0).map(part => <View key={part.label}
                style={{ flex: part.ms / measuredTime, backgroundColor: part.color }} />)}
            </View> : <Text style={[t.sm, { color: colors.textMuted }]}>No tracked time yet</Text>}
            <View style={styles.legend}>
              {parts.map(part => <View key={part.label} style={styles.legendItem}>
                <View style={styles.routeStop}>
                  <View style={[styles.dot, { backgroundColor: part.color }]} />
                  <Text style={[t.sm, { color: colors.textMuted }]}>{part.label}</Text>
                </View>
                <Text style={[styles.duration, { color: colors.text }]}>{duration(part.ms)}</Text>
              </View>)}
            </View>
            <View style={[styles.speed, { borderColor: colors.border }]}>
              <Text style={[t.sm, styles.grow, { color: colors.textMuted }]}>Average moving speed</Text>
              <Text style={[textStyles.data, { color: colors.text }]}>{trip.movingMph == null ? '—' : `${trip.movingMph.toFixed(1)} mph`}</Text>
            </View>
          </View>
          {trip.water ? <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.row}>
              <Text style={[textStyles.cardTitle, styles.grow, { color: colors.text }]}>Water at the start</Text>
              <FloatInfoTip title="Water reading" message={`An upstream gauge reading near your start time, not a measurement along the whole route. Observed ${new Date(trip.water.observedAt).toLocaleString()}.`} />
            </View>
            <Text style={[textStyles.data, { color: colors.text }]}>{[
              trip.water.heightFt == null ? null : `${trip.water.heightFt.toFixed(2)} ft`,
              trip.water.dischargeCfs == null ? null : `${Math.round(trip.water.dischargeCfs).toLocaleString()} cfs`,
            ].filter(Boolean).join(' · ')}</Text>
            <Text style={[t.sm, { color: colors.textMuted }]}>{trip.water.gaugeName}</Text>
          </View> : null}
          {backup ? <View style={styles.row}>
            <ControlIcon name={archive.owner === 'guest' || archive.owner == null ? 'phone-portrait-outline' : row?.dirty || row?.backupError ? 'cloud-upload-outline' : 'cloud-done-outline'} size={18} color={colors.textMuted} />
            <Text accessibilityLiveRegion="polite" style={[t.sm, styles.grow, { color: colors.textMuted }]}>{backup.label}</Text>
            {backup.retry ? <Pressable onPress={() => void retry()} disabled={retrying || archive.syncing}
              accessibilityRole="button" accessibilityState={{ busy: retrying, disabled: retrying || archive.syncing }} style={styles.button}>
              <Text style={[t.sm, { color: colors.interactive }]}>{retrying ? 'Retrying…' : 'Retry'}</Text>
            </Pressable> : null}
            {row?.backupError || (row?.dirty && archive.error) ? <FloatInfoTip title="Account backup" message={row.backupError ?? archive.error!} /> : null}
          </View> : null}
          <Pressable accessibilityRole="button" onPress={showHistory} style={[styles.history, { backgroundColor: colors.accentFill }]}>
            <Text style={[t.base, { fontFamily: fonts.semibold, color: colors.onAccent }]}>Your float history</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={remove} style={styles.delete}>
            <Text style={[t.sm, { color: colors.error }]}>Delete float</Text>
          </Pressable>
        </> : <>
          <Text style={[textStyles.pageTitle, { color: colors.text }]}>{archive.ready ? 'Recap unavailable' : 'Loading recap…'}</Text>
          <Text style={[t.base, { color: colors.textMuted }]}>
            {archive.ready && floatArchive.locate(id) === 'elsewhere'
              ? archive.owner === 'guest'
                ? 'This recap was saved to the account you were signed in to when the float ended. Sign in to that account to see it.'
                : 'This recap was saved under the account or guest history in use when the float ended, not this one. Switch back to see it.'
              : 'Eddy is finishing your recap. Check your history in a moment.'}
          </Text>
          <Pressable accessibilityRole="button" onPress={showHistory} style={styles.button}>
            <Text style={[t.base, { color: colors.interactive }]}>Your float history</Text>
          </Pressable>
        </>}
      </ScrollView>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  content: { padding: 20, gap: 18, paddingBottom: 40 },
  card: { padding: 16, gap: 12, borderWidth: StyleSheet.hairlineWidth, borderRadius: 20 },
  row: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  routeStop: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  grow: { flex: 1 },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  stat: { flex: 1, minWidth: 130, padding: 18, borderRadius: 20, justifyContent: 'center', gap: 6 },
  bigNumber: { ...t['3xl'], fontFamily: fonts.display },
  timeNumber: { ...t['2xl'], fontFamily: fonts.display },
  timeBar: { flexDirection: 'row', gap: 3, height: 18, borderRadius: 9, overflow: 'hidden' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  legendItem: { flexGrow: 1, gap: 4 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  duration: { ...t.base, fontFamily: fonts.monoMedium },
  speed: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
  button: { paddingHorizontal: 8, paddingVertical: 12, minHeight: 44, justifyContent: 'center' },
  history: { minHeight: 50, borderRadius: 16, alignItems: 'center', justifyContent: 'center', padding: 12 },
  delete: { minHeight: 44, alignSelf: 'center', justifyContent: 'center' },
});
