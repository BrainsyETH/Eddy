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
//   2. How large is that for THIS project?      the rack and the percentage
//   3. How much water is through the turbines?  the cfs figure
//   4. When does generation change?             the next-change panel
//
// ── Why the percentage is the headline, and why the bar and release left ───
// This block used to say the same magnitude three ways — "About 6 of 8
// generators' worth", then a capacity bar labelled "72% of full generation",
// then "Total release at dam", which on a hydropower project is the turbine
// figure again plus or minus a spillway that is almost always shut. Three
// statements of one fact stacked the top of the screen tall enough to push the
// schedule below the fold. The rack still draws the unit picture; the one
// sentence beneath it is now the percentage, which is the number a reader can
// check against SWPA's published table. Release stays on the flood-control
// projects, where DamStateCard is the only surface that carries it.
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
import { relativeAge, SCHEDULE_CHANGE_SENTENCE } from '@eddy/conditions/dam-schedule-copy';
import {
  FULL_GENERATION_SHORT_LABEL,
  generationReferenceCitation,
  generationNow,
  generationPercentLabel,
  generationStatusLabel,
  generationVoiceOver,
  generatorRack,
  nowNextClauses,
  scheduledClauseProvenance,
  speaksForNow,
  generationReferenceLine,
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

export function DamGenerationHero({
  dam,
  embedded = false,
  showNextChange = true,
}: {
  dam: DamSnapshot;
  /**
   * Drawn INSIDE somebody else's card — no background, no elevation, no padding.
   *
   * The dam screen composes this and the schedule into one Generation card
   * (GenerationCard), because the two were saying the same thing twice: a NEXT
   * CHANGE panel here and a schedule beneath it describing the same plan, each
   * with its own copy of the "schedules change without notice" warning.
   */
  embedded?: boolean;
  /**
   * Whether the next-change panel belongs to this half.
   *
   * False inside the merged card, where it moves down into the scheduled
   * section it describes. It is the one block here sourced from a PLAN rather
   * than from a measurement, and everything around it is observed — which is
   * why it was the piece that read as a duplicate.
   */
  showNextChange?: boolean;
}) {
  const { colors, elevation } = useTheme();

  const state = generationNow(dam);
  const status = generationStatusLabel(state);

  // A flood-control project has no powerhouse to report on, and a hero that
  // said anything at all here would invent one. The screen's own no-powerhouse
  // copy covers it instead.
  if (!status) return null;

  const ref = dam.generationReference;
  const rack = state.kind === 'generating' ? generatorRack(state.turbineCfs, ref) : null;
  const percent = state.kind === 'generating' ? generationPercentLabel(state.fraction) : null;
  const clauses = nowNextClauses(state, dam.schedule, ref);
  const voiceOver = generationVoiceOver(state, ref);
  const provenance = scheduledClauseProvenance(dam.schedule, ref);

  const observedAt = state.kind === 'unavailable' ? null : relativeAge(state.observedAt);
  // The same rule the phrasing uses, so a reading that stopped saying "now"
  // also stops looking current.
  const dim = state.kind !== 'unavailable' && !speaksForNow(state.age);
  const fraction = state.kind === 'generating' ? state.fraction : null;

  return (
    <View style={embedded ? undefined : [styles.card, { backgroundColor: colors.card }, elevation(2)]}>
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

        {/* The headline is the percentage. The label names what it is a
            percentage OF — "72% of full generation", never "72% power", which
            describes something the number is not. */}
        {percent && ref && fraction !== null ? (
          <Text style={[styles.headline, { color: colors.text }]}>
            {percent}
            <Text style={[styles.headlineAside, { color: colors.textMuted }]}>
              {` ${FULL_GENERATION_SHORT_LABEL}`}
              {/* Above the reference is real information — spill, a different
                  measurement basis, or a reference that has drifted since the
                  rehabilitation project. Say so rather than clamp. */}
              {fraction > 1 ? ' — above the published reference' : ''}
            </Text>
          </Text>
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

        {/* The citation, demoted but never dropped: the percentage is only
            checkable because the denominator is published. The estimate hedge
            rides on the end of it whenever the rack is drawn — see
            generationReferenceLine for why it lost its own line. */}
        {percent && ref ? (
          <Text style={[styles.note, { color: colors.textSubtle }]}>
            {rack ? generationReferenceLine(ref) : generationReferenceCitation(ref)}
          </Text>
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

      {/* NEXT CHANGE — the panel, not a footnote. Tinted, bordered and set at
          reading size, because this is the answer somebody came for and it was
          previously the smallest text on the card.
          The observed clause is deliberately absent: the rack and headline
          above already say "About 6 of 8 generators' worth", and repeating it
          here made one observation read as two. The combined sentence still
          earns its space on the compact row, where there is no rack to have
          said it first. */}
      {showNextChange && clauses.scheduled ? (
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
  headline: { ...t.lg, fontFamily: fonts.display, marginTop: 8, fontVariant: ['tabular-nums'] },
  // The "of full generation" qualifier, at reading weight beside the figure so
  // the number leads and what it is a share of follows.
  headlineAside: { fontSize: 15, lineHeight: 20, fontFamily: fonts.medium },
  flow: { fontSize: 17, lineHeight: 22, fontFamily: fonts.heading, fontVariant: ['tabular-nums'] },
  flowAside: { fontSize: 13, lineHeight: 18, fontFamily: fonts.medium },
  age: { fontSize: 11, lineHeight: 15 },
  note: { fontSize: 11, lineHeight: 15 },
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
