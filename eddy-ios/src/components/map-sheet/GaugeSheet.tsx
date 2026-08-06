// eddy-ios/src/components/map-sheet/GaugeSheet.tsx
// What a gauge says, split by tab — and the tier decides the VOCABULARY, never
// the layout.
//
// ── The one rule this file exists to keep ─────────────────────────────────
// A curated station has a ladder somebody decided on, so it can say "Good —
// Floatable": a verdict about whether you can float. A national-tier station
// has only a flow percentile, which says how today compares to that station's
// own history — "running much higher than usual". Those are different kinds of
// claim, and shared/flow-band.ts and src/theme/flow.ts exist precisely to keep
// them from mixing. A percentile dressed as a verdict tells somebody a creek is
// good when nobody ever said so.
//
// So the tab SETS differ: Levels exists only where a ladder does, Context only
// where a percentile does. Everything else is common, because a reading is a
// reading.
//
// ── The filename is load-bearing ──────────────────────────────────────────
// This was GaugeTabs.tsx, one letter from gaugeTabs.ts beside it. On a
// case-INSENSITIVE filesystem — which is every Mac by default, and this is an
// iOS app — TypeScript resolves the two as one module and reports TS1149,
// while Linux CI on a case-sensitive volume compiles it perfectly. Named to
// match RiverSheet.tsx/riverTabs.ts so the pairing is obvious and cannot
// collide again.
import { Linking, StyleSheet, Text, View } from 'react-native';
import type { GaugeDetail } from '@eddy/types';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';
import {
  conditionBg,
  conditionChipBorder,
  conditionInk,
  conditionLongLabel,
  conditionText,
} from '@/theme/conditions';
// flowBandLabel is NOT imported any more: the band's words reach the sheet on
// the pin as `codeLabel`, put there by the map screen's referencePins builder,
// so re-deriving them here would be a second computation of the same string
// from a source that arrives later. flowBandSentence still needs the detail.
import { flowBandSentence } from '@/theme/flow';
// The percentile -> band function itself, not the MapGaugeLite wrapper in
// src/lib/gaugeFlow: a GaugeDetail carries the percentile directly.
import { flowBand } from '@eddy/conditions/flow-band';
import { GaugeChart } from '@/components/GaugeChart';
import { Absent, Fact, LinkRow, Prose, Section } from './sections';
import type { GaugePinFacts } from './gaugeTabs';

export interface GaugeTabProps {
  facts: GaugePinFacts;
  detail: GaugeDetail | null;
  onOpenGauge: (siteId: string) => void;
  onOpenRiver: (slug: string) => void;
}

/* ── The reading, which is the glance ───────────────────────────────────── */

/**
 * A station's number and what it means, from data the PIN already carries.
 *
 * ── Why this takes `facts` and never `detail` ─────────────────────────────
 *
 * This is the gauge's decision fact, and it is drawn in the collapsed sheet
 * where anything arriving late would move the top edge (see peekSlot.ts for the
 * general rule). It does not have to: `GaugePinFacts` is built in PinSheet from
 * the MapPin, and the map screen has already put BOTH tiers' words on that pin
 * before the sheet opens — a curated station carries `code` + `codeLabel` from
 * its ladder, and a reference station carries `codeLabel` holding the flow
 * band's words with NO `code`, which is what keeps a comparison from being
 * tinted like a verdict (see the referencePins builder on the map screen).
 *
 * So there is no request behind this row and no reservation needed for it. The
 * things that genuinely are late — the percentile sentence, the ladder — live in
 * About and Levels.
 *
 * ── Exactly one chip ──────────────────────────────────────────────────────
 * A station with a ladder shows the verdict; one without shows the band. Never
 * both: two chips side by side invite the reader to average them, and a
 * percentile and a condition are not the same kind of claim at all.
 */
export function GaugeReadingRow({
  facts,
  compact = false,
}: {
  facts: GaugePinFacts;
  /** One line for the peek. The tabs use the taller default. */
  compact?: boolean;
}) {
  const { colors, isDark } = useTheme();

  return (
    <View style={[styles.readingRow, compact ? styles.readingRowCompact : null]}>
      {facts.reading ? (
        <Text
          style={[
            compact ? styles.readingSmall : styles.reading,
            { color: facts.code ? conditionText(facts.code, isDark) : colors.text },
          ]}
        >
          {facts.reading}
        </Text>
      ) : null}
      {facts.code && facts.codeLabel ? (
        <View
          style={[
            styles.chip,
            {
              backgroundColor: conditionBg(facts.code),
              borderColor: conditionChipBorder(facts.code),
            },
          ]}
        >
          <Text style={[styles.chipText, { color: conditionInk(facts.code) }]}>
            {conditionLongLabel(facts.code)}
          </Text>
        </View>
      ) : facts.codeLabel ? (
        <View style={[styles.chip, { backgroundColor: colors.cardRaised, borderColor: colors.border }]}>
          <Text style={[styles.chipText, { color: colors.textMuted }]}>{facts.codeLabel}</Text>
        </View>
      ) : null}
    </View>
  );
}

/* ── Levels — curated only ──────────────────────────────────────────────── */

export function GaugeLevelsTab({ facts, detail, onOpenRiver }: GaugeTabProps) {
  const { colors } = useTheme();
  const links = detail?.thresholds ?? [];
  // A river with no slug has no screen to open, so it is named by its ladder
  // above without being offered as a row that does nothing.
  const openable = links.filter((link) => link.riverSlug);

  if (!links.length) {
    return <Absent>Eddy has not rated this station against a river yet.</Absent>;
  }

  return (
    <View>
      {links.map((link) => (
        <Section key={`${link.riverSlug}-${link.thresholdUnit}`} title={link.riverName}>
          <Fact label="Too low" value={levelText(link.levelTooLow, link.thresholdUnit)} />
          <Fact label="Low" value={levelText(link.levelLow, link.thresholdUnit)} />
          <Fact
            label="Good"
            value={rangeText(link.levelOptimalMin, link.levelOptimalMax, link.thresholdUnit)}
          />
          <Fact label="High" value={levelText(link.levelHigh, link.thresholdUnit)} />
          <Fact label="Dangerous" value={levelText(link.levelDangerous, link.thresholdUnit)} />
        </Section>
      ))}

      {detail?.floodStages ? (
        <Section title="Flood stages">
          {/* FEET ONLY — the Weather Service publishes nothing else, so a
              station charted in cfs still reports these in ft and must say so
              rather than silently borrowing the ladder's unit. */}
          <Fact label="Action" value={stageText(detail.floodStages.actionFt)} />
          <Fact label="Flood" value={stageText(detail.floodStages.floodFt)} />
          <Fact label="Moderate" value={stageText(detail.floodStages.moderateFt)} />
          <Fact label="Major" value={stageText(detail.floodStages.majorFt)} />
          <Text style={[styles.source, { color: colors.textMuted }]}>
            Source: {detail.floodStages.source === 'nwps' ? 'National Water Prediction Service' : 'Eddy'}
          </Text>
        </Section>
      ) : null}

      {/* ── WHAT THE RIVERS TAB USED TO BE ────────────────────────────────
          A list of the rivers this station grades, which only appeared when
          there was more than one of them — because with one, as its own comment
          said, "a tab holding a single row the reader can see above is a wasted
          swipe". The same argument finishes the thought: the ladders directly
          above already name every one of these rivers, so the list is not a
          separate subject at all. It is the way OUT of this subject, and it
          belongs at the bottom of it whether there are two rivers or one. */}
      {openable.length ? (
        <Section title={openable.length > 1 ? 'Rivers this gauge grades' : undefined}>
          {openable.map((link) => (
            <LinkRow
              key={link.riverSlug as string}
              label={link.riverName}
              symbol="river"
              detail={link.isPrimary && openable.length > 1 ? 'Primary river for this gauge' : null}
              onPress={() => onOpenRiver(link.riverSlug as string)}
            />
          ))}
        </Section>
      ) : null}
    </View>
  );
}

/* ── History ───────────────────────────────────────────────────────────── */

export function GaugeHistoryTab({ facts, detail }: GaugeTabProps) {
  if (!facts.siteId) {
    return <Absent>This station publishes no history Eddy can read.</Absent>;
  }

  const primary = detail?.thresholds?.[0] ?? null;

  return (
    <GaugeChart
      siteId={facts.siteId}
      unit={primary?.thresholdUnit === 'ft' ? 'ft' : 'cfs'}
      thresholds={primary ? { ...primary, thresholdUnit: primary.thresholdUnit } : null}
      floodStages={detail?.floodStages ?? null}
      // See the prop's own note: the scrub is a PanResponder and this chart
      // sits inside two RNGH pans, so it cannot win a horizontal drag here.
      scrubbable={false}
    />
  );
}

/* ── About ─────────────────────────────────────────────────────────────── */

/**
 * The instrument, rather than the water.
 *
 * ── This absorbed what the Now tab had that the glance does not ───────────
 * The reading and its chip are in the glance and always were available there —
 * they ride on the pin. What Now genuinely owned was everything qualifying the
 * number rather than stating it: the percentile in words for a reference
 * station, when the reading was taken, which station it is, and the station's
 * own caveat on today's value. All four are about the source, which is the
 * question this tab answers.
 */
export function GaugeAboutTab({ facts, detail }: GaugeTabProps) {
  const publicUrl = detail?.publicUrl ?? null;
  const band = detail?.curated === false ? flowBand(detail.flowPercentile) : null;

  return (
    <View>
      {/* A percentile explained in words, and never beside a verdict — the
          reason src/theme/flow.ts and shared/flow-band.ts exist. In the glance
          this station shows its band as a NEUTRAL chip; here is where the
          comparison gets its sentence. */}
      {band ? <Prose>{flowBandSentence(band)}</Prose> : null}

      {detail?.stationNote ? <Prose>{detail.stationNote}</Prose> : null}

      <Section>
        <Fact label="Updated" value={facts.updatedAt} />
        <Fact label="Station" value={facts.siteId ? `USGS ${facts.siteId}` : null} />
        <Fact
          label="Tier"
          value={
            detail == null
              ? null
              : detail.curated
                ? 'Rated by Eddy against a river'
                : 'Reference station — no float rating'
          }
        />
      </Section>

      {/* The station's own caveat on today's number, when it published one. */}
      {facts.qualifierNote ? <Prose>{facts.qualifierNote}</Prose> : null}

      {publicUrl ? (
        <Section>
          <LinkRow
            label="Open on the provider's site"
            external
            onPress={() => void Linking.openURL(publicUrl)}
          />
        </Section>
      ) : null}
    </View>
  );
}

/* ── Formatting ────────────────────────────────────────────────────────── */

function levelText(value: number | null | undefined, unit: string | null | undefined): string | null {
  if (value == null) return null;
  return `${value.toLocaleString()} ${unit ?? ''}`.trim();
}

function rangeText(
  min: number | null | undefined,
  max: number | null | undefined,
  unit: string | null | undefined,
): string | null {
  if (min == null && max == null) return null;
  if (min != null && max != null) {
    return `${min.toLocaleString()}–${max.toLocaleString()} ${unit ?? ''}`.trim();
  }
  return levelText(min ?? max, unit);
}

/** Always feet. See the call site. */
function stageText(value: number | null | undefined): string | null {
  return value == null ? null : `${value} ft`;
}

const styles = StyleSheet.create({
  readingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  // The peek's own spacing comes from the header around it, and the row holds a
  // floor so a station with no current reading still occupies a line rather than
  // collapsing to nothing and then growing when one arrives.
  readingRowCompact: { marginTop: 10, minHeight: 27 },
  reading: { ...t.lg, fontFamily: fonts.mono },
  readingSmall: { ...t.sm, fontFamily: fonts.mono },
  chip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, borderWidth: 1 },
  chipText: { ...t.sm, fontFamily: fonts.semibold },
  source: { ...t.sm, fontFamily: fonts.body, marginTop: 8 },
});
