// eddy-ios/src/components/map-sheet/AvailabilityGlance.tsx
// The one fact that decides whether you care, at the size that says so.
//
// This replaces a 14pt sentence that sat between the identity row and the
// action row and was styled like a caption. The facts were right; the rank was
// wrong. Nothing here computes availability — availability.ts does, and the
// web's chip says the same things in the same words from the same fields.
//
// ── The one place Fredoka appears in the sheet ────────────────────────────
//
// The count is set in `fonts.display`, which is used nowhere else in the map
// sheet. That is deliberate and it is the whole branding move: the number a
// person came for is drawn in Eddy's own voice, and everything around it stays
// in Geist so the sheet does not turn into a poster.
//
// It is NOT coral. ADR 0007 gives coral to identity and illustration and keeps
// fills teal on native, because coral collides with the condition ladder — and
// a big coral number directly above a condition badge is exactly that
// collision. Brand here is the typeface, not the hue.

import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';
import type { CampsiteAvailabilitySummary } from '@eddy/types';
import { availabilityHero, availabilityVoiceOver, nightBars } from './availability';
import { NightStrip, STRIP_HEIGHT_TALL } from './NightStrip';

export function AvailabilityGlance({
  availability,
  name,
  today,
  stripHeight = STRIP_HEIGHT_TALL,
  showStrip = true,
}: {
  availability: CampsiteAvailabilitySummary | null | undefined;
  name?: string;
  /** `YYYY-MM-DD` in the reader's own day. Passed in so this stays testable. */
  today: string;
  stripHeight?: number;
  showStrip?: boolean;
}) {
  const { colors } = useTheme();

  // Absent, never "unknown". Most campgrounds are not linked to a booking
  // system Eddy can read and every private outfitter has none at all, so a
  // blank slot has to read as "not applicable" rather than as a broken app.
  const hero = availabilityHero(availability, today, name);
  if (!hero) return null;

  const bars = showStrip ? nightBars(availability, today) : [];
  // Nothing measured means nothing to draw. A row of fourteen empty columns
  // would say "we looked and found nothing", which is a different claim.
  const hasStrip = bars.some((bar) => bar.mark !== 'none');

  return (
    <View style={styles.glance}>
      <View style={styles.headline}>
        {hero.count !== null ? (
          <Text style={[styles.count, { color: colors.text }]} allowFontScaling={false}>
            {hero.count}
          </Text>
        ) : null}
        <View style={styles.words}>
          <Text
            style={[
              hero.count !== null ? styles.label : styles.phrase,
              { color: colors.text },
            ]}
            numberOfLines={1}
          >
            {hero.headline}
          </Text>
          {hero.detail || hero.caption ? (
            <Text style={[styles.caption, { color: colors.textMuted }]} numberOfLines={1}>
              {[hero.detail, hero.caption].filter(Boolean).join(' · ')}
            </Text>
          ) : null}
        </View>
      </View>

      {hasStrip ? (
        <NightStrip
          bars={bars}
          height={stripHeight}
          label={availabilityVoiceOver(availability, today, name)}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  glance: { marginTop: 10 },
  headline: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  // allowFontScaling is off on the count alone: at the largest accessibility
  // size a 30pt numeral becomes tall enough to push the action row off the
  // peek, and the words beside it — which DO scale — already carry the meaning.
  count: { ...t['3xl'], fontFamily: fonts.display },
  words: { flex: 1, minWidth: 0 },
  label: { ...t.sm, fontFamily: fonts.semibold },
  // No count means the headline IS the sentence, so it takes the larger size.
  phrase: { ...t.base, fontFamily: fonts.heading },
  caption: { ...t.sm, fontFamily: fonts.body, marginTop: 1 },
});
