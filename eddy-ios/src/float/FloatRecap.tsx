import { useState } from 'react';
import { ControlIcon } from '@/components/ControlIcon';
import { FloatMoodOtter } from '@/components/Otter';
import { EddySymbol } from '@/components/EddySymbol';
import { WeatherIcon } from '@/components/WeatherIcon';
import { FloatRecapMap } from './FloatRecapMap';
import { recapRouteModel } from '@/lib/floatRecapRoute';
import { FloatInfoTip } from './FloatInfoTip';
import { FloatShareButton } from './FloatShareButton';
import { recapBackupStatus } from '@/lib/floatDisplay';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { CompletedFloat } from '@eddy/conditions/float-archive';
import { useFloatArchive } from '@/hooks/useFloatArchive';
import { floatArchive } from '@/lib/floatArchive';
import { deleteFloatTrack } from '@/float/floatTracks';
import { arrivalLine, floatDate, historyCardModel, recapConditionModel, recapMeasurements, recapWeatherModel, recordedDuration, TIME_BREAKDOWN_TIP } from '@/lib/floatHistoryDisplay';
import { conditionBg, conditionChipBorder, conditionInk } from '@/theme/conditions';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, textStyles, type as t } from '@/theme/typography';

/** Shared presentation; each route owns its Back/Close destination. */
export function FloatRecap({ id, showHistory }: { id: string; showHistory: () => void }) {
  const archive = useFloatArchive();
  const [retrying, setRetrying] = useState(false);
  const { colors, isDark } = useTheme();
  const largeText = useWindowDimensions().fontScale >= 1.4;
  const row = archive.rows.find((r) => r.id === id && r.kind === 'completed' && !r.deleted);
  const trip = row?.payload as CompletedFloat | undefined;
  const duration = recordedDuration;
  const card = trip ? historyCardModel(trip) : null;
  const measurements = trip ? recapMeasurements(trip) : null;
  const condition = trip ? recapConditionModel(trip) : null;
  const weather = trip ? recapWeatherModel(trip) : null;
  const route = trip ? recapRouteModel(trip) : null;
  // The hero takes the condition's tint only from a reading current enough to rate.
  const heroTint = condition?.badge ? conditionBg(condition.badge.code, isDark) : colors.cardRaised;
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
  // Aggregate durations over the time Eddy tracked, not an invented
  // chronological trace. Untracked time is named, when it matters, in a line
  // of its own rather than as a third slice of the paddler's day.
  const breakdown = measurements?.breakdown;
  const partColor = { Moving: colors.interactive, Breaks: colors.warm } as const;
  const trackedTime = measurements?.trackedTime ?? 0;
  const distance = measurements?.distance;
  const missing = measurements?.note;
  const conditionsTip = [condition?.tip, weather?.tip].filter(Boolean).join('\n\n');
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['left', 'right']}>
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
        {trip ? <>
          <View style={[styles.hero, { backgroundColor: heroTint }]}>
            <View style={[styles.row, styles.heroTop]}>
              <View style={[styles.grow, styles.heroCopy]}>
                {card?.moodLine ? <Text style={[t.sm, { fontFamily: fonts.semibold, color: condition?.badge ? conditionInk(condition.badge.code, isDark) : colors.text }]}>{card.moodLine}</Text> : null}
                {!largeText ? <>
                  <Text accessibilityRole="header" style={[styles.heroTitle, { color: colors.text }]}>{trip.riverName}</Text>
                  <Text style={[t.sm, { color: colors.textMuted }]}>
                    {floatDate(trip.startedAt)}
                    {trip.boatType ? ` · ${trip.boatType.charAt(0).toUpperCase()}${trip.boatType.slice(1)}` : ''}
                  </Text>
                </> : null}
              </View>
              <FloatMoodOtter mood={card?.mood ?? null} size={largeText ? 56 : 72} />
            </View>
            {largeText ? <>
              <Text accessibilityRole="header" style={[styles.heroTitle, { color: colors.text }]}>{trip.riverName}</Text>
              <Text style={[t.sm, { color: colors.textMuted }]}>
                {floatDate(trip.startedAt)}
                {trip.boatType ? ` · ${trip.boatType.charAt(0).toUpperCase()}${trip.boatType.slice(1)}` : ''}
              </Text>
            </> : null}
            <View style={[styles.row, styles.arrival]}>
              {trip.reachedTakeOut ? <ControlIcon name="checkmark-circle" size={20} color={colors.success} /> : null}
              <Text style={[t.sm, styles.grow, { color: colors.text }]}>
                {trip.reachedTakeOut ? arrivalLine(trip) : 'Take-out wasn’t confirmed'}
              </Text>
              {!trip.reachedTakeOut ? <FloatInfoTip title="Take-out" message={`Eddy didn’t confirm your arrival at ${trip.takeOutName}. Ending a float doesn’t confirm that you reached the take-out.`} /> : null}
            </View>
          </View>
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.row, styles.wrap, styles.cardHeading]}>
              <Text accessibilityRole="header" style={[textStyles.cardTitle, styles.routeTitle, { color: colors.text }]}>Your route</Text>
              {route ? <View style={[styles.row, styles.routeStatus, largeText && styles.fullWidth]}>
                {route.percent != null ? <Text style={[t.sm, styles.progress, { color: colors.interactive }]}>{route.percent}% complete</Text> : null}
                <FloatInfoTip title="Your route" message={[
                  'Progress toward your take-out from the start of this stretch. Only a confirmed arrival shows 100%. Orange shows river sections covered, including distance estimated across GPS gaps. Dashed sections have no recorded coverage. The map follows the river, not your exact GPS track. The last recorded point may be before you finished the float.',
                  trip.startNote,
                ].filter(Boolean).join('\n\n')} />
              </View> : null}
            </View>
            {route ? <>
              <FloatRecapMap trip={trip} />
              <View style={[styles.endpoints, styles.wrap]}>
                <View style={[styles.endpoint, largeText && styles.fullWidth]}>
                  <View style={[styles.dot, { backgroundColor: colors.interactive }]} />
                  <Text style={[t.sm, styles.grow, { color: colors.textMuted }]}>{route.startName}</Text>
                </View>
                <View style={[styles.endpoint, largeText && styles.fullWidth]}>
                  <View style={[styles.dot, { backgroundColor: colors.accent }]} />
                  <Text style={[t.sm, styles.grow, { color: colors.textMuted }]}>{trip.takeOutName}</Text>
                </View>
              </View>
            </> : <View style={styles.row}>
              <Text style={[t.sm, styles.grow, { color: colors.text }]}>{card?.route}</Text>
              {trip.startNote ? <FloatInfoTip title="Recorded start" message={trip.startNote} /> : null}
            </View>}
            <View style={[styles.stats, { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth }]}>
              {distance ? <View style={[styles.stat, largeText && styles.fullWidth]} accessible accessibilityLabel={distance.spoken}>
                <Text style={[styles.bigNumber, { color: colors.text }]}>{distance.value}<Text style={t.base}> {distance.unit}</Text></Text>
                <Text style={[t.sm, { color: colors.textMuted }]}>{distance.label}</Text>
              </View> : null}
              <View style={[styles.stat, largeText && styles.fullWidth]}>
                <Text style={[styles.bigNumber, { color: colors.text }]}>{duration(trip.elapsedMs)}</Text>
                <Text style={[t.sm, { color: colors.textMuted }]}>Total time</Text>
              </View>
            </View>
            {missing || card?.tracking === 'partial' ? <View style={[styles.trackingNote, { backgroundColor: colors.cardRaised }]}>
              {missing ? <Text style={[t.sm, { color: colors.textMuted }]}>{missing}</Text> : null}
              {card?.tracking === 'partial' ? <Text style={[t.sm, { color: colors.textMuted }]}>Limited tracking</Text> : null}
            </View> : null}
            {breakdown && trackedTime > 0 ? <View style={[styles.timeSection, { borderTopColor: colors.border }]}>
              <View style={styles.statColumns}>
                {breakdown.parts.map(part => <View key={part.label} style={[styles.stat, largeText && styles.fullWidth]}>
                  <Text style={[styles.duration, { color: colors.text }]}>{part.text}</Text>
                  <View style={styles.timeLabel}>
                    <View style={[styles.dot, { backgroundColor: partColor[part.label] }]} />
                    <Text style={[t.sm, { color: colors.textMuted }]}>{part.label}</Text>
                  </View>
                </View>)}
              </View>
              <View style={styles.timeBar} accessible accessibilityRole="image" accessibilityLabel={breakdown.accessibilityLabel}>
                {breakdown.parts.filter(part => part.ms > 0).map(part => <View key={part.label}
                  style={{ flex: part.ms / trackedTime, backgroundColor: partColor[part.label] }} />)}
              </View>
              <View style={[styles.row, styles.wrap, styles.timeDetail]}>
                {breakdown.speed !== '—' ? <>
                  <Text style={[t.sm, styles.grow, { color: colors.textMuted }]}>Moving speed</Text>
                  <Text style={[t.sm, { fontFamily: fonts.semibold, color: colors.text }]}>{breakdown.speed}</Text>
                </> : <Text style={[t.sm, styles.grow, { color: colors.textMuted }]}>Time on the river</Text>}
                <FloatInfoTip title="Time on the river" message={TIME_BREAKDOWN_TIP} />
              </View>
              {breakdown.untracked ? <Text style={[t.sm, { color: colors.textMuted }]}>{duration(trip.unknownMs)} untracked</Text> : null}
            </View> : null}
          </View>
          <FloatShareButton trip={trip} />
          {condition || weather ? <View style={[styles.card, { backgroundColor: colors.card, borderColor: condition?.badge?.code === 'dangerous' ? conditionChipBorder('dangerous', isDark) : colors.border }]}>
            <View style={[styles.row, styles.cardHeading]}>
              <Text accessibilityRole="header" style={[textStyles.cardTitle, styles.grow, { color: colors.text }]}>Conditions at start</Text>
              <FloatInfoTip title="Conditions at start" message={conditionsTip} />
            </View>
            {condition ? <View style={styles.conditionRow}>
              <View style={styles.conditionIcon}><EddySymbol name="gauge" size={28} /></View>
              <View style={[styles.row, styles.wrap, styles.grow]}>
                {condition.badge ? <View style={[styles.badge, {
                  backgroundColor: conditionBg(condition.badge.code, isDark),
                  borderColor: conditionChipBorder(condition.badge.code, isDark),
                }]}>
                  <Text style={[t.sm, { fontFamily: fonts.semibold, color: conditionInk(condition.badge.code, isDark) }]}>{condition.badge.label}</Text>
                </View> : null}
                <View style={[styles.row, styles.wrap, styles.conditionReadings]}>
                  {condition.reading.split(' · ').filter(Boolean).map((reading, i) => <Text key={reading}
                    style={[styles.reading, { color: i === 0 ? colors.text : colors.textMuted }]}>{reading}</Text>)}
                </View>
              </View>
            </View> : null}
            {weather ? <View style={styles.conditionRow}>
              <View style={styles.conditionIcon}>{weather.icon ? <WeatherIcon code={weather.icon} size={28} /> : <EddySymbol name="weather" size={28} />}</View>
              <View style={[styles.row, styles.wrap, styles.grow]}>
                <Text style={[styles.reading, { color: colors.text }]}>{weather.temperature}</Text>
                {weather.description ? <Text style={[t.sm, styles.weatherDescription, { color: colors.textMuted }]}>{weather.description}</Text> : null}
              </View>
            </View> : null}
            {condition ? <View style={[styles.conditionSource, { borderTopColor: colors.border }]}>
              <Text style={[t.xs, { color: colors.textMuted }]}>{condition.gaugeName}</Text>
              <Text style={[t.xs, { color: colors.textSubtle }]}>{condition.age}</Text>
            </View> : null}
          </View> : null}
          <View style={styles.footer}>
            <Pressable accessibilityRole="button" onPress={showHistory}
              style={[styles.history, { borderBottomColor: colors.border }]}>
              <Text style={[t.base, styles.grow, { color: colors.text }]}>Float history</Text>
              <ControlIcon name="chevron-forward" size={18} color={colors.textMuted} />
            </Pressable>
            {backup ? <View style={[styles.row, styles.backup]}>
              <ControlIcon name={archive.owner === 'guest' || archive.owner == null ? 'phone-portrait-outline' : row?.dirty || row?.backupError ? 'cloud-upload-outline' : 'cloud-done-outline'} size={18} color={colors.textMuted} />
              <Text accessibilityLiveRegion="polite" style={[t.sm, styles.grow, { color: colors.textMuted }]}>{backup.label}</Text>
              {backup.retry ? <Pressable onPress={() => void retry()} disabled={retrying || archive.syncing}
                accessibilityRole="button" accessibilityState={{ busy: retrying, disabled: retrying || archive.syncing }} style={styles.button}>
                <Text style={[t.sm, { color: colors.interactive }]}>{retrying ? 'Retrying…' : 'Retry'}</Text>
              </Pressable> : null}
              {row?.backupError || (row?.dirty && archive.error) ? <FloatInfoTip title="Account backup" message={row.backupError ?? archive.error!} /> : null}
            </View> : null}
            <Pressable accessibilityRole="button" onPress={remove} style={styles.delete}>
              <ControlIcon name="trash-outline" size={18} color={colors.error} />
              <Text style={[t.sm, { color: colors.error }]}>Delete float</Text>
            </Pressable>
          </View>
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
  content: { padding: 16, paddingTop: 12, gap: 12, paddingBottom: 48 },
  card: { padding: 14, gap: 10, borderWidth: StyleSheet.hairlineWidth, borderRadius: 20 },
  cardHeading: { marginTop: -6, marginBottom: -4 },
  row: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  wrap: { flexWrap: 'wrap' },
  hero: { paddingHorizontal: 16, paddingVertical: 12, gap: 8, borderRadius: 20 },
  heroTop: { alignItems: 'flex-start' },
  heroCopy: { gap: 2 },
  arrival: { gap: 6 },
  heroTitle: { ...t['2xl'], fontFamily: fonts.displayBold },
  badge: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  grow: { flex: 1, minWidth: 0 },
  routeTitle: { flexGrow: 1, flexShrink: 1, flexBasis: 100 },
  routeStatus: { flexShrink: 1, gap: 0 },
  progress: { fontFamily: fonts.semibold, flexShrink: 1 },
  fullWidth: { flexBasis: '100%' },
  endpoints: { flexDirection: 'row', gap: 16, alignItems: 'flex-start' },
  endpoint: { flexDirection: 'row', gap: 6, alignItems: 'baseline', flex: 1, minWidth: 120 },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, paddingTop: 10 },
  statColumns: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  stat: { flex: 1, minWidth: 125, gap: 2 },
  bigNumber: { ...t['2xl'], fontFamily: fonts.display },
  trackingNote: { borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7, gap: 3 },
  timeSection: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 10, gap: 8 },
  timeLabel: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  timeDetail: { marginTop: -4, marginBottom: -6 },
  timeBar: { flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden' },
  dot: { width: 8, height: 8, borderRadius: 4 },
  duration: { ...t.base, fontFamily: fonts.semibold },
  conditionRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  conditionIcon: { width: 30, alignItems: 'center', flexShrink: 0 },
  conditionReadings: { flexShrink: 1, maxWidth: '100%' },
  reading: { ...t.base, fontFamily: fonts.monoMedium, flexShrink: 1 },
  weatherDescription: { flexShrink: 1 },
  conditionSource: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 9, gap: 2 },
  button: { paddingHorizontal: 8, paddingVertical: 12, minHeight: 44, justifyContent: 'center' },
  footer: { gap: 4 },
  backup: { paddingHorizontal: 12, minHeight: 44 },
  history: { minHeight: 48, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12 },
  delete: { minHeight: 44, marginTop: 8, alignSelf: 'flex-end', flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
});
