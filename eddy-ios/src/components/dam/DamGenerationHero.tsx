// eddy-ios/src/components/dam/DamGenerationHero.tsx
// The dominant block on the dam screen: what the powerhouse is doing right now.
//
// Ported from the web hero, and it has to stay a port. Every number and every
// sentence here comes from shared/dam-generation.ts, so the two platforms
// cannot produce different percentages or different transition language for the
// same dam — which is the failure a fisherman would notice first, holding a
// phone next to a laptop.
//
// ── The four questions, in order ───────────────────────────────────────────
//   1. Is the powerhouse generating now?       the status line
//   2. How much water is through the turbines?  the cfs figure
//   3. How large is that for THIS project?      the rack and the bar
//   4. When does generation change?             the now → next sentence
//
// ── Why a generator rack and not just a percentage ─────────────────────────
// "Six generators" is the unit anglers already think in, and it makes a
// powerhouse feel like a powerhouse rather than another gauge. The honesty
// problem it creates is handled by drawing the last active cell PARTIALLY
// filled: 19,130 cfs is 5.8 units' worth of full-load discharge, and six
// identical lit icons would claim a unit count the Corps does not publish.
//
// ── Colour ─────────────────────────────────────────────────────────────────
// One hue, the generation ramp, with magnitude carried by fill as well. Never
// conditionColor(): CONDITION_SYSTEM's palette means "should you float this
// river", and how hard the units are running is not that verdict.

import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { DamSnapshot } from '@eddy/types';
import { relativeAge, SCHEDULE_CHANGE_NOTE } from '@eddy/conditions/dam-schedule-copy';
import {
  fullGenerationReferenceLabel,
  generationNow,
  generationPercentLabel,
  generationStatusLabel,
  generationVoiceOver,
  generatorEquivalentPhrase,
  generatorRack,
  nowNextClauses,
  releaseComparison,
  OTHER_RELEASE_NOTE,
  RACK_ESTIMATE_NOTE,
} from '@eddy/conditions/dam-generation';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';

function formatCfs(value: number): string {
  return `${Math.round(value).toLocaleString()} cfs`;
}

/**
 * One generator, filled to `fill`.
 *
 * An absolutely positioned inner View rather than a gradient: RN has no CSS
 * gradient without a native dependency, and a clipped fill is the same picture.
 * The ring stays at full strength so an empty cell is still visibly a
 * generator rather than a hole in the row.
 */
function GeneratorCell({ fill, on, off }: { fill: number; on: string; off: string }) {
  return (
    <View style={[styles.cell, { borderColor: on, backgroundColor: off }]}>
      <View style={[styles.cellFill, { height: `${Math.round(fill * 100)}%`, backgroundColor: on }]} />
    </View>
  );
}

export function DamGenerationHero({ dam }: { dam: DamSnapshot }) {
  const { colors, elevation } = useTheme();

  const state = generationNow(dam);
  const status = generationStatusLabel(state);

  // A flood-control project has no powerhouse to report on, and a hero that
  // said anything at all here would invent one. The screen's own no-powerhouse
  // copy covers it instead.
  if (!status) return null;

  const ref = dam.generationReference;
  const rack = state.kind === 'generating' ? generatorRack(state.turbineCfs, ref) : null;
  const equivalentPhrase =
    state.kind === 'generating' ? generatorEquivalentPhrase(state.equivalents, ref) : null;
  const percent = state.kind === 'generating' ? generationPercentLabel(state.fraction) : null;
  const clauses = nowNextClauses(state, dam.schedule, ref);
  const comparison = releaseComparison(dam.metrics.generationFlow, dam.metrics.release, ref);
  const voiceOver = generationVoiceOver(state, ref);

  const observedAt = state.kind === 'unavailable' ? null : relativeAge(state.observedAt);
  const dim = state.kind !== 'unavailable' && state.age === 'stale';
  const fraction = state.kind === 'generating' ? state.fraction : null;

  return (
    <View style={[styles.card, { backgroundColor: colors.card }, elevation(2)]}>
      <View style={styles.statusRow}>
        <Ionicons name="flash" size={13} color={colors.interactive} />
        <Text style={[styles.status, { color: colors.interactive }]}>{status.toUpperCase()}</Text>
      </View>

      {/* The rack, the number and the bar are one figure. It is hidden from
          VoiceOver and the sentence below carries the same facts — a drawing
          that exists only for people who can see it is half a feature. */}
      <View
        style={{ opacity: dim ? 0.6 : 1 }}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {rack ? (
          <View style={styles.rack}>
            {rack.cells.map((cell, i) => (
              <GeneratorCell
                key={i}
                fill={cell.fill}
                on={colors.generationHigh}
                off={colors.cardRaised}
              />
            ))}
          </View>
        ) : null}

        {equivalentPhrase ? (
          <Text style={[styles.headline, { color: colors.text }]}>{equivalentPhrase}</Text>
        ) : null}

        {state.kind !== 'unavailable' ? (
          <Text style={[styles.flow, { color: colors.text }]}>
            {formatCfs(state.turbineCfs)}
            <Text style={[styles.flowAside, { color: colors.textSubtle }]}>
              {'  through the turbines'}
            </Text>
          </Text>
        ) : null}
        {observedAt ? (
          <Text style={[styles.age, { color: colors.textSubtle }]}>Updated {observedAt}</Text>
        ) : null}

        {/* The capacity bar. The label names the exact reference — "31% of
            published full-generation discharge", never "31% power", which
            describes something the number is not. */}
        {percent && ref && fraction !== null ? (
          <View style={styles.barBlock}>
            <View style={[styles.track, { backgroundColor: colors.cardRaised }]}>
              <View
                style={[
                  styles.fill,
                  {
                    width: `${Math.min(100, Math.round(fraction * 100))}%`,
                    backgroundColor: colors.generationHigh,
                  },
                ]}
              />
            </View>
            <Text style={[styles.barLabel, { color: colors.textMuted }]}>
              <Text style={[styles.percent, { color: colors.text }]}>{percent}</Text>{' '}
              {fullGenerationReferenceLabel(ref)}
              {/* Above the reference is real information — spill, a different
                  measurement basis, or a reference that has drifted since the
                  rehabilitation project. The bar caps; the sentence does not. */}
              {fraction > 1 ? ' — above the published reference' : ''}
            </Text>
          </View>
        ) : null}
      </View>

      {voiceOver ? (
        <Text
          accessible
          accessibilityRole="text"
          accessibilityLabel={voiceOver}
          style={styles.srOnly}
        >
          {voiceOver}
        </Text>
      ) : null}

      {rack ? (
        <Text style={[styles.note, { color: colors.textSubtle }]}>{RACK_ESTIMATE_NOTE}</Text>
      ) : null}

      {/* Turbine flow and total release as two labelled facts. The difference is
          only ever named when releaseComparison says every rule passed — see
          that function for why a bare subtraction is a claim someone acts on. */}
      {dam.metrics.release ? (
        <View style={[styles.divided, { borderTopColor: colors.border }]}>
          <Text style={[styles.rowLabel, { color: colors.textMuted }]}>
            {dam.metrics.release.dailyMean ? 'Total release at dam (daily avg)' : 'Total release at dam'}
            <Text style={[styles.rowValue, { color: colors.text }]}>
              {'  '}
              {formatCfs(dam.metrics.release.value)}
            </Text>
          </Text>
          {comparison.kind === 'other-release' ? (
            <>
              <Text style={[styles.rowLabel, { color: colors.textMuted }]}>
                Other release
                <Text style={[styles.rowValue, { color: colors.text }]}>
                  {'  '}
                  {formatCfs(comparison.otherCfs)}
                </Text>
              </Text>
              <Text style={[styles.note, { color: colors.textSubtle }]}>{OTHER_RELEASE_NOTE}</Text>
            </>
          ) : null}
        </View>
      ) : null}

      {/* Now and next. Two clauses, two weights: the first is a measurement, the
          second is SWPA's plan, and they can honestly disagree. The note carries
          location and downstream lag and is not decoration. */}
      <View style={[styles.divided, { borderTopColor: colors.border }]}>
        <Text style={[styles.observed, { color: colors.text }]}>{clauses.observed}</Text>
        {clauses.scheduled ? (
          <>
            <View style={styles.scheduledRow}>
              <Ionicons name="time-outline" size={13} color={colors.interactive} />
              <Text style={[styles.scheduled, { color: colors.interactive }]}>
                {clauses.scheduled}
              </Text>
            </View>
            <Text style={[styles.note, { color: colors.textSubtle }]}>{SCHEDULE_CHANGE_NOTE}</Text>
          </>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 14, padding: 16, gap: 10 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  status: { fontSize: 11, lineHeight: 15, fontFamily: fonts.heading, letterSpacing: 0.6 },
  rack: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 2 },
  cell: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  headline: { ...t.lg, fontFamily: fonts.display, marginTop: 8 },
  flow: { fontSize: 17, lineHeight: 22, fontFamily: fonts.heading, fontVariant: ['tabular-nums'] },
  flowAside: { fontSize: 13, lineHeight: 18, fontFamily: fonts.medium },
  age: { fontSize: 11, lineHeight: 15 },
  barBlock: { marginTop: 12, gap: 4 },
  track: { height: 10, borderRadius: 999, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 999 },
  barLabel: { fontSize: 12, lineHeight: 16 },
  percent: { fontFamily: fonts.heading, fontVariant: ['tabular-nums'] },
  note: { fontSize: 11, lineHeight: 15 },
  divided: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 10, gap: 3 },
  rowLabel: { fontSize: 13, lineHeight: 18, fontFamily: fonts.medium },
  rowValue: { fontSize: 14, lineHeight: 18, fontFamily: fonts.heading, fontVariant: ['tabular-nums'] },
  observed: { fontSize: 14, lineHeight: 19, fontFamily: fonts.heading },
  scheduledRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  scheduled: { fontSize: 13, lineHeight: 18, fontFamily: fonts.medium, flexShrink: 1 },
  // The VoiceOver equivalent of the figure. Zero-height rather than
  // display:none, which RN has no equivalent of and which would take the node
  // out of the accessibility tree along with the layout.
  srOnly: { height: 0, opacity: 0 },
  cellFill: { position: 'absolute', left: 0, right: 0, bottom: 0 },
});
