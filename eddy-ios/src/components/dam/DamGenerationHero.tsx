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
//   4. When does generation change?             the next-change panel
//
// ── Why the next-change panel sits above total release ─────────────────────
// It was last, in the same 11px subtle grey as the caveats, under a block of
// secondary measurements — and it is the single most load-bearing sentence
// here. "How much water is moving" is answered by every other surface Eddy
// has; "when does that change" is answered by nothing else, and it is the one
// a person uses to decide whether to go now or wait.
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
import {
  relativeAge,
  readingStaleness,
  SCHEDULE_CHANGE_SENTENCE,
} from '@eddy/conditions/dam-schedule-copy';
import {
  FULL_GENERATION_SHORT_LABEL,
  generationReferenceCitation,
  generationNow,
  generationPercentLabel,
  generationStatusLabel,
  generationVoiceOver,
  generatorEquivalentPhrase,
  generatorRack,
  nowNextClauses,
  releaseComparison,
  scheduledClauseProvenance,
  speaksForNow,
  OTHER_RELEASE_NOTE,
  RACK_ESTIMATE_NOTE,
} from '@eddy/conditions/dam-generation';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';

function formatCfs(value: number): string {
  return `${Math.round(value).toLocaleString()} cfs`;
}

/**
 * One generating bay, filled to `fill`.
 *
 * ── Why a bay and not a circle ─────────────────────────────────────────────
 * Eight circles in a row read as status LEDs — a panel of indicator lamps,
 * which says "on or off" and nothing about magnitude. A rounded upright with a
 * rotor channel reads as machinery, which is what this is.
 *
 * Fills from the BOTTOM UP, never by width: a narrower bay reads as a smaller
 * generator, where a part-full one reads as a generator at part load — and the
 * capacity bar directly beneath already teaches that horizontal extent means
 * something else.
 *
 * An absolutely positioned inner View rather than a gradient: RN has no CSS
 * gradient without a native dependency, and a clipped fill is the same picture.
 */
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
  const comparison = releaseComparison(dam.metrics.generationFlow, dam.metrics.release, ref, {
    declared: dam.releaseExcludesGeneration,
  });
  const voiceOver = generationVoiceOver(state, ref);
  const provenance = scheduledClauseProvenance(dam.schedule, ref);

  const observedAt = state.kind === 'unavailable' ? null : relativeAge(state.observedAt);
  // The same rule the phrasing uses, so a reading that stopped saying "now"
  // also stops looking current.
  const dim = state.kind !== 'unavailable' && !speaksForNow(state.age);
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
                channel={colors.card}
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
              {FULL_GENERATION_SHORT_LABEL}
              {/* Above the reference is real information — spill, a different
                  measurement basis, or a reference that has drifted since the
                  rehabilitation project. The bar caps; the sentence does not. */}
              {fraction > 1 ? ' — above the published reference' : ''}
            </Text>
            {/* The citation, demoted but never dropped: the percentage is only
                checkable because the denominator is published. */}
            <Text style={[styles.note, { color: colors.textSubtle }]}>
              {generationReferenceCitation(ref)}
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

      {/* NEXT CHANGE — the panel, not a footnote. Tinted, bordered and set at
          reading size, because this is the answer somebody came for and it was
          previously the smallest text on the card.
          The observed clause is deliberately absent: the rack and headline
          above already say "About 6 of 8 generators' worth", and repeating it
          here made one observation read as two. The combined sentence still
          earns its space on the compact row, where there is no rack to have
          said it first. */}
      {clauses.scheduled ? (
        <View
          style={[
            styles.nextPanel,
            { backgroundColor: colors.cardRaised, borderColor: colors.interactive },
          ]}
        >
          <View style={styles.scheduledRow}>
            <Ionicons name="time-outline" size={13} color={colors.interactive} />
            <Text style={[styles.blockLabel, { color: colors.interactive }]}>NEXT CHANGE</Text>
          </View>
          <Text style={[styles.nextSentence, { color: colors.text }]}>{clauses.scheduled}</Text>
          {/* Plain language, and the reason it is three sentences: whose clock
              this is, what it means where the reader is standing, and how much
              to trust it. See SCHEDULE_CHANGE_SENTENCE. */}
          <Text style={[styles.note, { color: colors.textMuted }]}>
            {SCHEDULE_CHANGE_SENTENCE}
          </Text>
          {/* Labelled rather than suppressed — see scheduledClauseProvenance. */}
          {provenance ? (
            <Text style={[styles.stale, { color: colors.accent }]}>{provenance}</Text>
          ) : null}
        </View>
      ) : null}

      {/* Turbine flow and total release as two labelled facts. The difference is
          only ever named when releaseComparison says every rule passed — see
          that function for why a bare subtraction is a claim someone acts on. */}
      {dam.metrics.release ? (
        <View style={[styles.divided, { borderTopColor: colors.border }]}>
          {/* The age is not optional. Turbine flow above carries one, and two
              adjacent measurements with different ages look synchronised when
              only one is dated. */}
          <Text
            style={[
              styles.rowLabel,
              { color: colors.textMuted },
              readingStaleness(dam.metrics.release.at) !== 'fresh' && { opacity: 0.6 },
            ]}
          >
            {dam.metrics.release.dailyMean ? 'Total release at dam (daily avg)' : 'Total release at dam'}
            <Text style={[styles.rowValue, { color: colors.text }]}>
              {'  '}
              {formatCfs(dam.metrics.release.value)}
            </Text>
            <Text style={[styles.note, { color: colors.textSubtle }]}>
              {'  '}
              {relativeAge(dam.metrics.release.at)}
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
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 14, padding: 16, gap: 10 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  status: { fontSize: 11, lineHeight: 15, fontFamily: fonts.heading, letterSpacing: 0.6 },
  rack: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 2 },
  cell: {
    width: 20,
    height: 32,
    borderRadius: 4,
    borderWidth: 2,
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  cellChannel: { position: 'absolute', top: 4, bottom: 4, left: '50%', width: 1, opacity: 0.7 },
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
  blockLabel: { fontSize: 10, lineHeight: 14, fontFamily: fonts.heading, letterSpacing: 0.6 },
  stale: { fontSize: 11, lineHeight: 15, fontFamily: fonts.medium },
  scheduledRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  // The next-change panel: bordered and tinted so it reads as the answer
  // rather than as another caveat in the stack.
  nextPanel: { borderRadius: 10, borderWidth: 1, padding: 12, gap: 4 },
  nextSentence: { fontSize: 15, lineHeight: 20, fontFamily: fonts.heading },
  // The VoiceOver equivalent of the figure. Zero-height rather than
  // display:none, which RN has no equivalent of and which would take the node
  // out of the accessibility tree along with the layout.
  srOnly: { height: 0, opacity: 0 },
  cellFill: { position: 'absolute', left: 0, right: 0, bottom: 0 },
});
