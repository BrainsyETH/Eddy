// eddy-ios/src/components/dam/GenerationCard.tsx
// One card for the powerhouse: what it IS doing, then what it is SCHEDULED to.
//
// ── What was wrong ────────────────────────────────────────────────────────
//
// The screen carried two cards that answered the same question twice. The hero
// reported the observed turbine flow and then, in a panel of its own, "NEXT
// CHANGE — Generation scheduled to stop at 8 PM" with a three-sentence
// explanation of whose clock that is and how much to trust it. Three inches
// below, the schedule card said the same thing again: the same publisher named
// in its opening line, the same plan drawn as bars, and the same
// schedules-change-without-notice warning in its footer.
//
// A reader meeting two statements of one fact has to decide whether they
// disagree. They never did — but the screen made that their problem, and spent
// the space twice to do it.
//
// ── The split that survives, because it is real ───────────────────────────
//
// Observed and scheduled remain separate SECTIONS with a rule between them, and
// nowNextClauses still hands the two out as separate strings so a UI cannot
// accidentally present a plan as a measurement. They can legitimately disagree
// — SWPA posts the afternoon before and the Corps runs the plant — and when
// they do, the reader should see both and know which is which.
//
// What is shared is everything that qualifies BOTH: who publishes the schedule,
// when Eddy last checked, that the times are at the dam, that the water arrives
// downstream later, and that any of it can change without notice. Those are
// stated once, at the foot, under everything they apply to.
//
// ── Why the lake and the week stay outside ────────────────────────────────
//
// DamStateCard and DamPatternStrip are still their own cards. This one is about
// the powerhouse right now and next; pool elevation and a fortnight's rhythm
// are different subjects, and folding them in would rebuild the wall of card
// this change exists to take down.

import { StyleSheet, Text, View } from 'react-native';
import type { DamSnapshot } from '@eddy/types';
import {
  nowNextClauses,
  generationNow,
  scheduledClauseProvenance,
} from '@eddy/conditions/dam-generation';
import {
  oldestRetrievedAt,
  retrievalSentence,
  scheduleIsStale,
} from '@eddy/conditions/dam-schedule-copy';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';
import { DamGenerationHero } from '@/components/dam/DamGenerationHero';
import { GenerationSchedule } from '@/components/dam/GenerationSchedule';

/**
 * The standing qualification, said once for both halves.
 *
 * Three sentences and each is a different subject: whose clock the times are
 * on, what that means where the reader is standing, and how much to trust the
 * plan at all. It used to sit inside the next-change panel, where it explained
 * one sentence and was read as part of it; here it sits under the observation,
 * the plan and the chart alike, which is the scope it always had.
 */
const DOWNSTREAM_AND_CHANGE = [
  'Times are at the dam — water reaches a place downstream later, and how much later depends on how far.',
  'Schedules can change without notice: power demand, transmission constraints, generator outages and inflow all move them.',
  'Never wade or anchor below a dam without checking the horn and posted warnings.',
].join(' ');

export function GenerationCard({ dam }: { dam: DamSnapshot }) {
  const { colors, elevation } = useTheme();

  const state = generationNow(dam);
  const ref = dam.generationReference;
  // The scheduled half of the pair the hero used to draw itself. Read here so
  // the panel can move down into the section it describes while the observed
  // half stays where it is measured.
  const clauses = nowNextClauses(state, dam.schedule, ref);
  const nextChange = clauses.scheduled
    ? { sentence: clauses.scheduled, provenance: scheduledClauseProvenance(dam.schedule, ref) }
    : null;

  const hasSchedule = dam.schedule.length > 0;
  // Eddy's fetch, never SWPA's post — they publish no timestamp of any kind, so
  // the subject stays "Eddy last checked". As old as the OLDEST day, because a
  // section is only as fresh as its weakest part.
  const oldestRetrieval = hasSchedule ? oldestRetrievedAt(dam.schedule) : null;
  const retrieval = retrievalSentence(oldestRetrieval);

  return (
    <View style={[styles.card, { backgroundColor: colors.card }, elevation(2)]}>
      <DamGenerationHero dam={dam} embedded showNextChange={false} />

      {hasSchedule ? (
        <>
          {/* The rule is the whole grammar of this card: above it is measured,
              below it is planned. Without it the two halves read as one claim,
              which is the thing the separate cards were protecting against and
              the reason they cannot simply be concatenated. */}
          <View style={[styles.rule, { borderTopColor: colors.border }]} />
          <GenerationSchedule
            schedule={dam.schedule}
            reference={dam.generationReference}
            embedded
            nextChange={nextChange}
          />
        </>
      ) : null}

      <View style={[styles.footer, { borderTopColor: colors.border }]}>
        <Text style={[styles.footerText, { color: colors.textSubtle }]}>
          {hasSchedule
            ? `Schedule posted each afternoon by Southwestern Power Administration. ${DOWNSTREAM_AND_CHANGE}`
            : DOWNSTREAM_AND_CHANGE}
        </Text>
        {/* Freshness is the one line here that changes, so it keeps its own
            weight and the brand's teal rather than being buried in the standing
            text above — and flips to the error colour when the schedule has
            stopped arriving, because somebody may wade against it. */}
        {retrieval ? (
          <Text
            style={[
              styles.retrieval,
              {
                color:
                  oldestRetrieval && scheduleIsStale(oldestRetrieval)
                    ? colors.error
                    : colors.interactive,
              },
            ]}
          >
            {retrieval}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 14, padding: 16 },
  rule: { borderTopWidth: StyleSheet.hairlineWidth, marginTop: 14, marginBottom: 14 },
  footer: { borderTopWidth: StyleSheet.hairlineWidth, marginTop: 14, paddingTop: 10 },
  footerText: { ...t.xs, lineHeight: 16 },
  retrieval: { ...t.xs, fontFamily: fonts.medium, marginTop: 6, textAlign: 'center' },
});
