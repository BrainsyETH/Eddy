import { useState } from 'react';
import { ControlIcon } from '@/components/ControlIcon';
import { FloatMoodOtter } from '@/components/Otter';
import { FloatInfoTip } from './FloatInfoTip';
import { FloatShareButton } from './FloatShareButton';
import { recapBackupStatus } from '@/lib/floatDisplay';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { CompletedFloat } from '@eddy/conditions/float-archive';
import { useFloatArchive } from '@/hooks/useFloatArchive';
import { floatArchive } from '@/lib/floatArchive';
import { deleteFloatTrack } from '@/float/floatTracks';
import { arrivalLine, historyCardModel, recapConditionModel, recapExploredModel, recordedDuration } from '@/lib/floatHistoryDisplay';
import { conditionBg, conditionChipBorder, conditionInk } from '@/theme/conditions';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, textStyles, type as t } from '@/theme/typography';

/** Shared presentation; each route owns its Back/Close destination. */
export function FloatRecap({ id, showHistory }: { id: string; showHistory: () => void }) {
  const archive = useFloatArchive();
  const [retrying, setRetrying] = useState(false);
  const { colors, isDark } = useTheme();
  const row = archive.rows.find((r) => r.id === id && r.kind === 'completed' && !r.deleted);
  const trip = row?.payload as CompletedFloat | undefined;
  const duration = recordedDuration;
  const history = archive.rows
    .filter((r) => r.kind === 'completed' && !r.deleted && r.payload)
    .map((r) => r.payload as CompletedFloat);
  const card = trip ? historyCardModel(trip) : null;
  const condition = trip ? recapConditionModel(trip) : null;
  const explored = trip ? recapExploredModel(trip, history) : null;
  // The hero takes the condition's tint only from a reading current enough to rate.
  const heroTint = condition?.badge ? conditionBg(condition.badge.code, isDark) : colors.selectionBg;
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
          <View style={[styles.hero, { backgroundColor: heroTint }]}>
            <View style={styles.row}>
              <View style={styles.grow}>
                <Text style={[t.sm, { fontFamily: fonts.semibold, color: colors.textMuted }]}>YOUR FLOAT</Text>
                {card?.moodLine ? (
                  <Text style={[styles.mood, { color: colors.text }]}>{card.moodLine}</Text>
                ) : null}
              </View>
              <FloatMoodOtter mood={card?.mood ?? null} size={110} />
            </View>
            <Text style={[textStyles.pageTitle, { color: colors.text }]}>{trip.riverName}</Text>
            <View style={styles.routeStop}>
              <Text style={[t.base, styles.grow, { color: colors.text }]}>{card?.route}</Text>
              {trip.startNote ? <FloatInfoTip title="Recorded start" message={trip.startNote} /> : null}
            </View>
            <Text style={[t.sm, { color: colors.textMuted }]}>
              {new Date(trip.startedAt).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
              {trip.boatType ? ` · ${trip.boatType.charAt(0).toUpperCase()}${trip.boatType.slice(1)}` : ''}
            </Text>
            <Text style={[t.sm, { fontFamily: fonts.semibold, color: colors.text }]}>{arrivalLine(trip)}</Text>
          </View>
          {condition ? <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.row}>
              <Text style={[textStyles.cardTitle, styles.grow, { color: colors.text }]}>{condition.title}</Text>
              <FloatInfoTip title={condition.title} message={condition.tip} />
            </View>
            <View style={[styles.row, styles.wrap]}>
              {condition.badge ? <View style={[styles.badge, {
                backgroundColor: conditionBg(condition.badge.code, isDark),
                borderColor: conditionChipBorder(condition.badge.code, isDark),
              }]}>
                <Text style={[t.sm, { fontFamily: fonts.semibold, color: conditionInk(condition.badge.code, isDark) }]}>{condition.badge.label}</Text>
              </View> : null}
              {condition.reading ? <Text style={[textStyles.data, { color: colors.text }]}>{condition.reading}</Text> : null}
            </View>
            <Text style={[t.sm, { color: colors.text }]}>{condition.gaugeName}</Text>
            <Text style={[t.sm, { color: colors.textMuted }]}>{condition.age}</Text>
          </View> : null}
          {explored ? <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.row}>
              <Text style={[textStyles.cardTitle, styles.grow, { color: colors.text }]}>River explored</Text>
              <Text style={[t.sm, { fontFamily: fonts.mono, color: colors.textMuted }]}>{explored.range}</Text>
            </View>
            <Text style={[styles.explored, { color: colors.text }]}>{explored.miles}</Text>
            <Text style={[t.sm, { color: colors.textMuted }]}>{explored.share}</Text>
            <View style={[styles.strip, { backgroundColor: colors.cardRaised }]} accessible accessibilityRole="image"
              accessibilityLabel={`${explored.miles} between ${explored.explored.span.firstName} and ${explored.explored.span.lastName}${explored.earlier ? ', with earlier floats on this river shaded' : ''}.`}>
              {explored.earlier?.segments.map((segment, i) => <View key={`e${i}`} style={[styles.segment, {
                left: `${segment.start * 100}%`, width: `${(segment.end - segment.start) * 100}%`, backgroundColor: colors.border,
              }]} />)}
              {explored.explored.segments.map((segment, i) => <View key={`s${i}`} style={[styles.segment, {
                left: `${segment.start * 100}%`, width: `${(segment.end - segment.start) * 100}%`, backgroundColor: colors.interactive,
              }]} />)}
            </View>
            <View style={styles.row}>
              <Text style={[t.xs, styles.grow, { color: colors.textMuted }]}>{explored.explored.span.firstName}</Text>
              <Text style={[t.xs, { color: colors.textMuted, textAlign: 'right' }]}>{explored.explored.span.lastName}</Text>
            </View>
            {explored.lifetime ? <Text style={[t.sm, { color: colors.text }]}>{explored.lifetime}</Text> : null}
          </View> : null}
          <View style={styles.stats}>
            <View style={[styles.stat, { backgroundColor: colors.selectionBg }]}>
              {card?.tracking === 'none'
                ? <Text style={[t.base, { color: colors.text }]}>GPS distance unavailable</Text>
                : <Text style={[styles.bigNumber, { color: colors.text }]}>{trip.distanceMiles.toFixed(1)}<Text style={t.base}> mi</Text></Text>}
              <Text style={[t.sm, { color: colors.textMuted }]}>{card?.tracking === 'partial' ? 'Distance · limited GPS tracking' : 'Distance paddled'}</Text>
            </View>
            <View style={[styles.stat, { backgroundColor: colors.card }]}>
              <Text style={[styles.timeNumber, { color: colors.text }]}>{duration(trip.elapsedMs)}</Text>
              <Text style={[t.sm, { color: colors.textMuted }]}>Total time</Text>
            </View>
          </View>
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.row}>
              <Text style={[textStyles.cardTitle, styles.grow, { color: colors.text }]}>How you spent your time</Text>
              <FloatInfoTip title="Time and distance" message="Time and distance are estimated from confirmed river positions. Moving time leaves out breaks of 6 minutes or more. GPS gaps include missing fixes and movement Eddy couldn’t classify. When Eddy finds you on the river again after a gap, the river you covered in it counts toward distance; its time stays under GPS gaps. The bar compares total durations; it doesn’t show when each break happened." />
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
          {backup ? <View style={styles.row}>
            <ControlIcon name={archive.owner === 'guest' || archive.owner == null ? 'phone-portrait-outline' : row?.dirty || row?.backupError ? 'cloud-upload-outline' : 'cloud-done-outline'} size={18} color={colors.textMuted} />
            <Text accessibilityLiveRegion="polite" style={[t.sm, styles.grow, { color: colors.textMuted }]}>{backup.label}</Text>
            {backup.retry ? <Pressable onPress={() => void retry()} disabled={retrying || archive.syncing}
              accessibilityRole="button" accessibilityState={{ busy: retrying, disabled: retrying || archive.syncing }} style={styles.button}>
              <Text style={[t.sm, { color: colors.interactive }]}>{retrying ? 'Retrying…' : 'Retry'}</Text>
            </Pressable> : null}
            {row?.backupError || (row?.dirty && archive.error) ? <FloatInfoTip title="Account backup" message={row.backupError ?? archive.error!} /> : null}
          </View> : null}
          <FloatShareButton trip={trip} />
          <Pressable accessibilityRole="button" onPress={showHistory} style={[styles.history, { borderColor: colors.interactive }]}>
            <Text style={[t.base, { fontFamily: fonts.semibold, color: colors.interactive }]}>Your float history</Text>
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
  wrap: { flexWrap: 'wrap' },
  hero: { padding: 18, gap: 6, borderRadius: 24 },
  mood: { ...t['2xl'], fontFamily: fonts.displayBold },
  badge: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  explored: { ...t['2xl'], fontFamily: fonts.display },
  strip: { height: 8, borderRadius: 4, overflow: 'hidden' },
  // Each stretch stays visible however short: 8pt is the narrowest mark the
  // strip draws, so a quarter-mile float is not a missing one.
  segment: { position: 'absolute', top: 0, bottom: 0, minWidth: 8, borderRadius: 4 },
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
  history: { minHeight: 50, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center', padding: 12 },
  delete: { minHeight: 44, alignSelf: 'center', justifyContent: 'center' },
});
