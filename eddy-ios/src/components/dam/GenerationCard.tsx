// Measured total release and turbine flow, followed by the posted schedule.
import { radii } from '@/theme/layout';
import { StyleSheet, Text, View } from 'react-native';
import type { DamSnapshot } from '@eddy/types';
import {
  generationReferenceCitation,
  RACK_ESTIMATE_NOTE,
  scheduledChangeSummary,
  scheduledClauseProvenance,
} from '@eddy/conditions/dam-generation';
import {
  oldestRetrievedAt,
  retrievalSentence,
  SCHEDULE_POSTING_NOTE,
  scheduleIsStale,
} from '@eddy/conditions/dam-schedule-copy';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';
import { DamGenerationHero } from '@/components/dam/DamGenerationHero';
import { GenerationSchedule } from '@/components/dam/GenerationSchedule';
import { DamInfoTip } from '@/components/dam/DamInfoTip';
import { DamSourceLinks } from '@/components/dam/DamSourceLinks';
import { damSourceLink } from '@/lib/damSourceLinks';

/**
 * The standing qualification, said once for both halves.
 *
 * Three sentences and each is a different subject: whose clock the times are
 * on, what that means where the reader is standing, and how much to trust the
 * plan at all. It used to sit inside the next-change panel, where it explained
 * one sentence and was read as part of it; the card's info tip applies to the
 * observation, the plan and the chart alike.
 */
const DOWNSTREAM_AND_CHANGE = [
  'Times are at the dam — water reaches a place downstream later, and how much later depends on how far.',
  'Schedules can change without notice: power demand, transmission constraints, generator outages and inflow all move them.',
  'Never wade or anchor below a dam without checking the horn and posted warnings.',
].join(' ');

export function GenerationCard({ dam, now }: { dam: DamSnapshot; now: number }) {
  const { colors, elevation } = useTheme();
  const hasSchedule = dam.schedule.length > 0;
  const hasObserved = dam.hasTurbines || Boolean(dam.metrics.release);
  if (!hasObserved && !hasSchedule) return null;

  const ref = dam.generationReference;
  // The scheduled half of the pair the hero used to draw itself. Read here so
  // the panel can move down into the section it describes while the observed
  // half stays where it is measured.
  const scheduled = scheduledChangeSummary(dam.schedule, ref);
  const nextChange = scheduled
    ? { sentence: scheduled, provenance: scheduledClauseProvenance(dam.schedule, ref) }
    : null;

  // Eddy's fetch, never SWPA's post — they publish no timestamp of any kind, so
  // the label says "Schedule checked". As old as the OLDEST day, because a
  // section is only as fresh as its weakest part.
  const oldestRetrieval = hasSchedule ? oldestRetrievedAt(dam.schedule) : null;
  const retrieval = retrievalSentence(oldestRetrieval, undefined, 'Schedule');
  const details = [
    'Total release includes water leaving the dam through turbines and other outlets. Turbine flow is only the water passing through the generators.',
    ref ? `${generationReferenceCitation(ref)}. ${RACK_ESTIMATE_NOTE}` : null,
    dam.nameplate
      ? `${dam.nameplate.units} generating ${dam.nameplate.units === 1 ? 'unit' : 'units'} · ${dam.nameplate.megawatts} MW nameplate capacity.`
      : null,
    hasSchedule ? SCHEDULE_POSTING_NOTE : null,
    DOWNSTREAM_AND_CHANGE,
  ].filter(Boolean).join('\n\n');

  // The operator's page sits under the observation it sources. A card with no
  // observed half (a dam with neither turbines nor a release reading)
  // carries it in the footer instead, ahead of the schedule's.
  const readingsSource = damSourceLink(dam, 'readings');
  const scheduleSource = damSourceLink(dam, 'schedule');
  const observedSources = hasObserved && readingsSource ? [readingsSource] : [];
  const footerSources = [hasObserved ? null : readingsSource, scheduleSource].filter(
    (link) => link !== null,
  );
  // A link is a 44pt target around a line of small text, so it brings its own
  // space above and below. Whatever divider follows one gives its margin back
  // rather than the link being pulled around with negative margins.
  const afterObservedLink = observedSources.length > 0 ? styles.afterLink : null;

  return (
    <View
      style={[
        styles.card,
        footerSources.length > 0 ? styles.cardWithFooterLink : null,
        { backgroundColor: colors.card },
        elevation(2),
      ]}
    >
      {hasObserved ? <DamGenerationHero
        dam={dam}
        now={now}
        headerAction={
          <DamInfoTip
            title="Water release and generation"
            message={details}
          />
        }
      /> : null}
      <DamSourceLinks links={observedSources} style={styles.observedSources} />

      {hasSchedule ? (
        <>
          {/* The rule is the whole grammar of this card: above it is measured,
              below it is planned. Without it the two halves read as one claim,
              which is the thing the separate cards were protecting against and
              the reason they cannot simply be concatenated. */}
          {hasObserved ? (
            <View style={[styles.rule, afterObservedLink, { borderTopColor: colors.border }]} />
          ) : null}
          <GenerationSchedule
            schedule={dam.schedule}
            reference={dam.generationReference}
            embedded
            nextChange={nextChange}
          />
        </>
      ) : null}

      {/* Keep changing freshness information visible, including stale checks.
          The schedule's source shares the row: where the plan came from, and
          when Eddy last read it. Alone, the check time stays centred. */}
      {retrieval || footerSources.length > 0 ? (
        <View
          style={[
            styles.footer,
            // With no schedule there is no rule, and the footer is what
            // follows the observed link.
            hasSchedule ? null : afterObservedLink,
            footerSources.length > 0 ? styles.footerWithSources : null,
            { borderTopColor: colors.border },
          ]}
        >
          <DamSourceLinks links={footerSources} />
          {retrieval ? (
            <Text
              style={[
                styles.retrieval,
                footerSources.length > 0 ? styles.retrievalBesideLink : null,
                {
                  // Muted while fresh: this is a statement, and in the brand
                  // teal beside a teal link it looked like a second thing to
                  // tap. Stale keeps the error colour — that one is a warning.
                  color:
                    oldestRetrieval && scheduleIsStale(oldestRetrieval)
                      ? colors.error
                      : colors.textMuted,
                },
              ]}
            >
              {retrieval}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radii.card, padding: 16 },
  rule: { borderTopWidth: StyleSheet.hairlineWidth, marginTop: 14, marginBottom: 14 },
  // The link's own 44pt height supplies the room either side of it; these only
  // trim what the neighbouring blocks would otherwise add on top.
  observedSources: { marginTop: 2 },
  afterLink: { marginTop: 2 },
  footer: { borderTopWidth: StyleSheet.hairlineWidth, marginTop: 14, paddingTop: 10 },
  // Source on the left, check time on the right when both fit. When they do
  // not (a narrow phone, large text) the row wraps and both keep the left
  // edge, the time directly under the link.
  footerWithSources: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    columnGap: 16,
    paddingTop: 0,
  },
  // The footer link reaches 13pt below its text, so the card needs less of its
  // own padding beneath it.
  cardWithFooterLink: { paddingBottom: 12 },
  retrieval: { ...t.xs, fontFamily: fonts.medium, textAlign: 'center' },
  // In the shared row: left-aligned so a wrapped line sits under the link,
  // and allowed to shrink so long text wraps inside the card.
  retrievalBesideLink: { textAlign: 'left', flexShrink: 1 },
});
