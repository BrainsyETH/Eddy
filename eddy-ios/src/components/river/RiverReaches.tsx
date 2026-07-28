// src/components/river/RiverReaches.tsx
//
// The two-hydrologies panel on the river screen — for a river that behaves like
// two different rivers along its length.
//
// The Black is the case this exists for: Clearwater Dam sits in the middle of
// one river. Above it is a spring-fed float out of Lesterville that responds to
// rain; below it is a flood-control tailwater set by the Corps' release
// schedule, which can rise fast and cold under a blue sky. One condition badge
// for the whole river would be wrong for one of those halves whichever way it
// read.
//
// This deliberately does NOT split the river into two entries. Someone driving
// to the Black is going to the Black — one screen, one slug, one search result.
// The difference belongs inside that screen, which is what this panel is.
//
// Mirrors missouri-float-planner/src/components/river/RiverReaches.tsx. Both
// gate on `differsFromRiver` rather than on reach count, because 18 rivers carry
// river_sections and most use them as a put-in/take-out catalogue — the Big
// Piney has eight — and those are not different water.

import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { RiverReach } from '@eddy/types';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';
import { conditionBg, conditionInk } from '@/theme/conditions';

/** Short human label for a hydrology type. Mirrors the web's riverTypeLabel(). */
function riverTypeLabel(type: string): string {
  switch (type) {
    case 'dam_tailwater':
      return 'Dam-controlled';
    case 'spring_fed_float':
      return 'Spring-fed';
    case 'rain_flashy':
      return 'Rain-driven';
    case 'snowmelt':
      return 'Snowmelt';
    case 'flatwater':
      return 'Flatwater';
    default:
      return type;
  }
}

export function RiverReaches({ reaches }: { reaches: RiverReach[] }) {
  const { colors, elevation } = useTheme();

  // Nothing to explain unless at least two reaches and a real difference. The
  // API already gates on this; re-checking keeps the component honest on its own.
  if (reaches.length < 2 || !reaches.some((r) => r.differsFromRiver)) return null;

  return (
    <View style={[styles.card, { backgroundColor: colors.card }, elevation(2)]}>
      <Text style={[styles.intro, { color: colors.textMuted }]}>
        This river reads differently along its length, so each reach is gauged on
        its own. Check the one you are actually floating.
      </Text>

      {reaches.map((reach, i) => (
        <View
          key={reach.sectionSlug}
          style={[
            styles.reach,
            i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
          ]}
        >
          <View style={styles.headRow}>
            <Text style={[styles.name, { color: colors.text }]}>{reach.name}</Text>
          </View>

          <View style={styles.chipRow}>
            <View style={[styles.chip, { backgroundColor: conditionBg(reach.conditionCode) }]}>
              <Text style={[styles.chipText, { color: conditionInk(reach.conditionCode) }]}>
                {reach.conditionLabel ?? reach.conditionCode}
              </Text>
            </View>
            {/* Only chip the hydrology where it differs from the river's — on an
                ordinary river it would be noise. */}
            {reach.differsFromRiver && (
              <View style={[styles.chip, { backgroundColor: colors.cardRaised }]}>
                <Ionicons name="water-outline" size={11} color={colors.interactive} />
                <Text style={[styles.chipText, { color: colors.textMuted }]}>
                  {' '}
                  {riverTypeLabel(reach.riverType)}
                </Text>
              </View>
            )}
          </View>

          {reach.report ? (
            <Text style={[styles.report, { color: colors.text }]}>
              &ldquo;{reach.report.summaryText || reach.report.quoteText}&rdquo;
            </Text>
          ) : reach.description ? (
            <Text style={[styles.report, { color: colors.textMuted }]}>{reach.description}</Text>
          ) : null}

          <Text style={[styles.meta, { color: colors.textMuted }]}>
            {[
              reach.gaugeName,
              reach.gaugeHeightFt != null ? `${reach.gaugeHeightFt.toFixed(1)} ft` : null,
              reach.dischargeCfs != null
                ? `${Math.round(reach.dischargeCfs).toLocaleString()} cfs`
                : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, gap: 4 },
  intro: { ...t.sm, fontFamily: fonts.body, marginBottom: 4 },
  reach: { paddingTop: 10, gap: 5 },
  headRow: { flexDirection: 'row', alignItems: 'center' },
  name: { ...t.base, fontFamily: fonts.semibold, flex: 1 },
  chipRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  chipText: { ...t.xs, fontFamily: fonts.semibold },
  report: { ...t.sm, fontFamily: fonts.body, lineHeight: 19 },
  meta: { ...t.xs, fontFamily: fonts.body },
});
