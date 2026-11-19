// Total release leads; turbine flow is a separate, independently timed reading.
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ControlIcon } from '@/components/ControlIcon';
import { EddySymbol } from '@/components/EddySymbol';
import type { DamSnapshot } from '@eddy/types';
import { relativeAge, readingStaleness } from '@eddy/conditions/dam-schedule-copy';
import {
  ABOVE_FULL_GENERATION_LABEL,
  FULL_GENERATION_SHORT_LABEL,
  generationNow,
  generationPercentLabel,
  generationStatusLabel,
  generationVoiceOver,
  generatorRack,
  releaseComparison,
  releaseRepeatsTurbineFlow,
  scheduleCheckedPhrase,
  speaksForNow,
  spillwayRelease,
  spillwayReleaseLabel,
} from '@eddy/conditions/dam-generation';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';

function ReadingTime({ at, now }: { at: string; now: number }) {
  const { colors } = useTheme();
  const age = relativeAge(at, now);
  // The shared clock formatter includes a date for earlier Central days.
  const time = scheduleCheckedPhrase(at, now);
  return <Text style={[styles.age, { color: colors.textMuted }]}
    accessibilityLabel={time ? `Last reading ${time}, ${age}` : 'Reading time unavailable'}>
    {time ? `Read ${time}` : 'Reading time unavailable'}
  </Text>;
}

function GeneratorCell({
  fill,
  on,
  off,
  channel,
}: {
  fill: number;
  on: string;
  off: string;
  channel: string;
}) {
  return (
    <View style={[styles.cell, { borderColor: on, backgroundColor: off }]}>
      <View style={[styles.cellFill, { height: `${Math.round(fill * 100)}%`, backgroundColor: on }]} />
      {/* The rotor channel. Decorative, and the only thing separating this from
          a plain bar chart of eight identical columns. */}
      <View style={[styles.cellChannel, { backgroundColor: channel }]} />
    </View>
  );
}

export function DamGenerationHero({ dam, now, headerAction, readingsSource }: {
  dam: DamSnapshot;
  now: number;
  headerAction?: ReactNode;
  readingsSource?: ReactNode;
}) {
  const { colors } = useTheme();
  const release = dam.metrics.release;
  const state = generationNow(dam, now);
  const status = generationStatusLabel(state);
  const ref = dam.generationReference;
  const rack = state.kind === 'generating' ? generatorRack(state.turbineCfs, ref) : null;
  const percent = state.kind === 'generating' ? generationPercentLabel(state.fraction) : null;
  const voiceOver = generationVoiceOver(state, ref);
  const comparison = releaseComparison(dam.metrics.generationFlow, release, ref, {
    declared: dam.releaseExcludesGeneration, now,
  });
  const spill = spillwayRelease(dam, now);
  const repeatsRelease = releaseRepeatsTurbineFlow(dam.metrics.generationFlow, release);
  // Matching numbers do not erase a different observation time or daily average.
  const sameTime = state.kind !== 'unavailable' && release && !release.dailyMean && !dam.metrics.generationFlow?.dailyMean &&
    Date.parse(state.observedAt) === Date.parse(release.at);
  const dimRelease = release && readingStaleness(release.at, now) !== 'fresh';
  const dimTurbine = state.kind !== 'unavailable' && !speaksForNow(state.age);

  return <View>
    <View style={styles.headingRow}>
      <EddySymbol name="release" size={28} />
      <Text accessibilityRole="header" style={[styles.heading, { color: colors.text }]}>Total release</Text>
      {headerAction}
    </View>
    {release ? <>
      <Text style={[styles.release, { color: dimRelease ? colors.textMuted : colors.text }]}
        accessibilityLabel={`Total water release, ${Math.round(release.value).toLocaleString()} cubic feet per second${release.dailyMean ? ', daily average' : ''}`}>
        {Math.round(release.value).toLocaleString()} <Text style={[styles.unit, { color: colors.textMuted }]}>cfs</Text>
      </Text>
      {release.dailyMean ? <Text style={[styles.caption, { color: colors.textMuted }]}>Daily average</Text> : null}
    </> : <Text style={[styles.caption, { color: colors.textMuted }]}>Total release unavailable.</Text>}
    {dimRelease && !release?.dailyMean ? <Text style={[styles.note, { color: colors.textMuted }]}>Outdated release reading</Text> : null}
    <View style={[styles.readingRow, styles.releaseSourceRow]}>
      {readingsSource}
      {release ? <ReadingTime at={release.at} now={now} /> : null}
    </View>

    {status ? <View style={[styles.turbine, { borderTopColor: colors.border }]}>
      <View style={styles.turbineSummary}>
        <View style={styles.statusRow}>
          <ControlIcon name="flash" size={13} color={colors.interactive} />
          <Text accessibilityRole="header" style={[styles.status, { color: colors.text }]}>{status}</Text>
        </View>
        {rack ? <View style={styles.rackBlock} accessible accessibilityLabel={`${voiceOver} Estimated from turbine flow.`}>
          <View style={styles.rack}>
            {rack.cells.map((cell, i) => <GeneratorCell key={i} fill={cell.fill}
              on={colors.interactive} off={colors.cardRaised} channel={colors.card} />)}
          </View>
          {percent ? <Text style={[styles.estimate, { color: colors.text }]}>
            ~{percent} <Text style={{ color: colors.textMuted }}>{FULL_GENERATION_SHORT_LABEL}</Text>
          </Text> : null}
        </View> : null}
      </View>
      {state.kind !== 'unavailable' ? <>
        {!repeatsRelease || !sameTime ? <Text style={[styles.caption, { color: dimTurbine ? colors.textMuted : colors.text }]}>
          Through the turbines <Text style={styles.flow}>{Math.round(state.turbineCfs).toLocaleString()} cfs</Text>
        </Text> : null}
        {!sameTime ? <View style={styles.readingRow}><ReadingTime at={state.observedAt} now={now} /></View> : null}
        {dimTurbine ? <Text style={[styles.note, { color: colors.textMuted }]}>Outdated turbine reading</Text> : null}
        {rack && state.kind === 'generating' && state.fraction !== null && state.fraction > 1 ?
          <Text style={[styles.note, { color: colors.textMuted }]}>{ABOVE_FULL_GENERATION_LABEL}</Text> : null}
      </> : null}
    </View> : null}

    {spill ? <Text style={[styles.spill, { color: colors.accent, borderColor: colors.border }]}>
      {[spillwayReleaseLabel(spill), relativeAge(spill.observedAt, now)].filter(Boolean).join(' · ')}
    </Text> : null}
    {comparison.kind === 'other-release' ? <Text style={[styles.note, { color: colors.textMuted }]}>
      Not through turbines <Text style={styles.flow}>{Math.round(comparison.otherCfs).toLocaleString()} cfs</Text>
    </Text> : null}
  </View>;
}

const styles = StyleSheet.create({
  headingRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  heading: { ...t.base, fontFamily: fonts.semibold, flex: 1 },
  release: { ...t['3xl'], fontFamily: fonts.monoMedium, marginTop: 10, fontVariant: ['tabular-nums'] },
  unit: { ...t.base, fontFamily: fonts.body },
  caption: { ...t.sm, fontFamily: fonts.body, marginTop: 4 },
  readingRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 12, marginTop: 2 },
  releaseSourceRow: { justifyContent: 'space-between' },
  age: { ...t.xs, fontFamily: fonts.body, flexShrink: 1, paddingVertical: 4 },
  note: { ...t.xs, fontFamily: fonts.body, marginTop: 6 },
  turbine: { borderTopWidth: StyleSheet.hairlineWidth, marginTop: 2, paddingTop: 12 },
  turbineSummary: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
  status: { ...t.sm, fontFamily: fonts.semibold, flexShrink: 1 },
  flow: { fontFamily: fonts.monoMedium, fontVariant: ['tabular-nums'] },
  rackBlock: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, flexShrink: 1 },
  estimate: { ...t.xs, fontFamily: fonts.body, flexShrink: 1 },
  rack: { flexDirection: 'row', flexWrap: 'wrap', gap: 3 },
  cell: { width: 12, height: 18, borderRadius: 3, borderWidth: 1.5, overflow: 'hidden', justifyContent: 'flex-end' },
  cellChannel: { position: 'absolute', top: 4, bottom: 4, left: '50%', width: 1, opacity: 0.7 },
  cellFill: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  spill: { ...t.sm, fontFamily: fonts.medium, marginTop: 12, padding: 10, borderWidth: 1, borderRadius: 10 },
});
