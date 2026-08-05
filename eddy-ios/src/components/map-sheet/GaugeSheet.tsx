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
import { flowBandLabel, flowBandSentence } from '@/theme/flow';
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

/* ── Now ────────────────────────────────────────────────────────────────── */

export function GaugeNowTab({ facts, detail }: GaugeTabProps) {
  const { colors, isDark } = useTheme();
  const band = detail?.curated === false ? flowBand(detail.flowPercentile) : null;

  return (
    <View>
      <View style={styles.readingRow}>
        {facts.reading ? (
          <Text
            style={[
              styles.reading,
              { color: facts.code ? conditionText(facts.code, isDark) : colors.text },
            ]}
          >
            {facts.reading}
          </Text>
        ) : null}
        {/* Exactly one chip, and which one depends on the tier. A station that
            has both a ladder and a percentile still shows the verdict only:
            two chips side by side invite the reader to average them. */}
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
        ) : band ? (
          <View style={[styles.chip, { backgroundColor: colors.cardRaised, borderColor: colors.border }]}>
            <Text style={[styles.chipText, { color: colors.textMuted }]}>
              {flowBandLabel(band)}
            </Text>
          </View>
        ) : null}
      </View>

      {/* A percentile explained in words, and never beside a verdict. */}
      {band ? <Prose>{flowBandSentence(band)}</Prose> : null}

      <Section>
        <Fact label="Updated" value={facts.updatedAt} />
        <Fact label="Station" value={facts.siteId ? `USGS ${facts.siteId}` : null} />
      </Section>

      {/* The station's own caveat on today's number, when it published one. */}
      {facts.qualifierNote ? <Prose>{facts.qualifierNote}</Prose> : null}
    </View>
  );
}

/* ── Levels — curated only ──────────────────────────────────────────────── */

export function GaugeLevelsTab({ facts, detail }: GaugeTabProps) {
  const { colors } = useTheme();
  const links = detail?.thresholds ?? [];

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

/* ── Rivers — curated, and only when it grades more than one ────────────── */

export function GaugeRiversTab({ detail, onOpenRiver }: GaugeTabProps) {
  // A river with no slug has no screen to open, so it is named without being
  // offered as a link rather than given a row that does nothing.
  const links = (detail?.thresholds ?? []).filter((link) => link.riverSlug);
  if (!links.length) return <Absent>This station is not rated against a river.</Absent>;

  return (
    <Section>
      {links.map((link) => (
        <LinkRow
          key={link.riverSlug as string}
          label={link.riverName}
          detail={link.isPrimary ? 'Primary river for this gauge' : null}
          onPress={() => onOpenRiver(link.riverSlug as string)}
        />
      ))}
    </Section>
  );
}

/* ── About ─────────────────────────────────────────────────────────────── */

export function GaugeAboutTab({ facts, detail }: GaugeTabProps) {
  const publicUrl = detail?.publicUrl ?? null;

  return (
    <View>
      {detail?.stationNote ? <Prose>{detail.stationNote}</Prose> : null}

      <Section>
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
  reading: { ...t.lg, fontFamily: fonts.mono },
  chip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, borderWidth: 1 },
  chipText: { ...t.sm, fontFamily: fonts.semibold },
  source: { ...t.sm, fontFamily: fonts.body, marginTop: 8 },
});
