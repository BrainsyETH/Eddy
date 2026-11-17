// Measured total release and turbine flow, followed by the posted schedule.
import { radii } from '@/theme/layout';
import { StyleSheet, Text, View } from 'react-native';
import type { DamSnapshot } from '@eddy/types';
import {
  generationReferenceCitation,
  RACK_ESTIMATE_NOTE,
  scheduleCheckLine,
  scheduleOutlook,
  scheduledChangeSummary,
} from '@eddy/conditions/dam-generation';
import {
  SCHEDULE_POSTING_NOTE,
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
  // Shorten only a known idle remainder. Minimum flow, continuing generation
  // and an unknown current hour retain the shared schedule semantics.
  const outlook = scheduleOutlook(dam.schedule, ref, now);
  const scheduled = outlook && !outlook.move && !outlook.generating && !outlook.minimumFlowOnly
    ? 'No further generation posted'
    : scheduledChangeSummary(dam.schedule, ref, now, true);
  const nextChange = scheduled
    ? { sentence: scheduled, hasMove: Boolean(outlook?.move) }
    : null;

  // Eddy's fetch, never SWPA's post — they publish no timestamp of any kind, so
  // the label says "Schedule checked". As old as the OLDEST day, because a
  // section is only as fresh as its weakest part.
  const check = scheduleCheckLine(dam.schedule.map(day => day.retrievedAt), now);
  const details = [
    'Total release includes water leaving the dam through turbines and other outlets. Turbine flow is only the water passing through the generators.',
    ref ? `${generationReferenceCitation(ref)}. ${RACK_ESTIMATE_NOTE}` : null,
    dam.nameplate
      ? `${dam.nameplate.units} generating ${dam.nameplate.units === 1 ? 'unit' : 'units'} · ${dam.nameplate.megawatts} MW nameplate capacity.`
      : null,
    hasSchedule ? SCHEDULE_POSTING_NOTE : null,
    DOWNSTREAM_AND_CHANGE,
  ].filter(Boolean).join('\n\n');

  // The operator's page shares the observation's time row. A card with no
  // observed half (a dam with neither turbines nor a release reading)
  // carries it beside the schedule's source instead.
  const readingsSource = damSourceLink(dam, 'readings');
  const scheduleSource = damSourceLink(dam, 'schedule');
  const observedSources = hasObserved && readingsSource ? [readingsSource] : [];
  const scheduleSources = [hasObserved ? null : readingsSource, scheduleSource].filter(
    (link) => link !== null,
  );

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.card },
        elevation(2),
      ]}
    >
      {hasObserved ? <DamGenerationHero
        dam={dam}
        now={now}
        readingsSource={<DamSourceLinks links={observedSources} compact />}
        headerAction={
          <DamInfoTip
            title="Water release and generation"
            message={details}
          />
        }
      /> : null}

      {hasSchedule || scheduleSources.length > 0 ? (
        <View style={hasObserved ? [styles.schedule, { borderTopColor: colors.border }] : undefined}>
          {/* One check time beside the plan it qualifies, including its next
              change. Unknown times stay unknown; stale checks have a text cue. */}
          {check || scheduleSources.length > 0 ? <View style={styles.sourceRow}>
            <DamSourceLinks links={scheduleSources} compact />
            {check ? <Text style={[styles.retrieval, { color: colors.textMuted }]}>{check.text}</Text> : null}
          </View> : null}
          {check?.stale ? <Text style={[styles.stale, { color: colors.error }]}>
            Outdated schedule · may have changed
          </Text> : null}
          <GenerationSchedule
            schedule={dam.schedule}
            reference={dam.generationReference}
            embedded
            nextChange={nextChange}
            now={now}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radii.card, padding: 16 },
  schedule: { borderTopWidth: StyleSheet.hairlineWidth, marginTop: 14, paddingTop: 4 },
  // Source on the left, check time on the right when both fit. When they do
  // not (a narrow phone, large text) the row wraps and both keep the left
  // edge, the time directly under the link.
  sourceRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    columnGap: 12,
    paddingBottom: 6,
  },
  retrieval: { ...t.xs, fontFamily: fonts.body, flexShrink: 1 },
  stale: { ...t.xs, fontFamily: fonts.medium, marginBottom: 8 },
});
