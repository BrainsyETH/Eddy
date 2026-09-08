// eddy-ios/src/components/TodaySummary.tsx
// The answer, at the top of the screen named for it.
//
// Two things that are one statement: how many rivers are floatable, and what
// Eddy makes of the water generally. The count is computed here from the live
// list; the prose is written once a day by the same generator that has fed the
// website for a while (src/lib/eddy/generate-global-update.ts) and arrives
// through /api/eddy-updates under the key "global".
//
// ── The count outranks the prose ────────────────────────────────────────────
//
// The card is built so the prose is the part that can go missing. The count
// comes off the list already on screen and is true whenever the list is; the
// prose is a day old by construction and the server withholds it the moment it
// cannot stand behind it. So the card renders on the count, adds the prose
// when there is prose, and never renders on prose alone.
//
// That ordering is also why the count is not in the paragraph. A number nested
// inside two sentences of narration is a number somebody has to read for, on
// the screen they opened to avoid exactly that.
//
// It is also why the FOLD works the way it does. Collapsing this card hides the
// paragraph and keeps the count — the headline stays at full size in both
// states, because a control that could hide the answer would be a control
// nobody would remember setting. See src/lib/todayPreferences.ts.
//
// ── Saying when it was written ──────────────────────────────────────────────
//
// Non-negotiable, and the reason `generatedAt` is on the wire at all. Every
// other number on this screen is minutes old; this paragraph is hours old, and
// it is the only thing here that reads as observation rather than measurement.
// The stamp is what keeps it from being mistaken for the former.
//
// ── Weather belongs beside the statewide answer ────────────────────────────
//
// Today used to make somebody scroll through every personalized module before
// saying what the Ozarks look like generally, while the only weather lived on a
// river detail page. This compact card now answers both planning questions near
// the top: how much water is usable, and what the day is likely to bring at the
// selected river. It uses the outlook endpoint's named forecast point—never an
// inferred river-wide forecast—and omits weather cleanly when that payload is
// unavailable. The longer written statewide update remains foldable beneath it.

import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { OutlookWeatherDay } from '@eddy/types';
import { EddySymbol } from '@/components/EddySymbol';
import { useTheme } from '@/theme/ThemeProvider';
// Shared with every per-river surface, so the statewide card and the river
// screen cannot end up describing the same daily generator in different words.
// It was this file's private function first; see src/lib/eddySays.ts.
import { writtenAge } from '@/lib/eddySays';
import {
  collapsedAfterToggle,
  isUpdateOpen,
  readUpdateCollapsed,
  writeUpdateCollapsed,
} from '@/lib/todayPreferences';
import { fonts, type as t } from '@/theme/typography';

interface Props {
  /** "9 of 24 rivers are floatable right now", or null when unknowable. */
  headline: string | null;
  /** Eddy's written summary, or null when there is none to show. */
  prose: string | null;
  /** When the prose was generated. Ignored when there is no prose. */
  generatedAt: string | null;
  /** Today's weather at Eddy's selected river forecast point. */
  weather?: OutlookWeatherDay | null;
  /** The town the weather provider actually forecast. */
  weatherLocation?: string | null;
}

function weatherGlyph(code: string): React.ComponentProps<typeof Ionicons>['name'] {
  if (code.startsWith('01')) return 'sunny-outline';
  if (code.startsWith('02') || code.startsWith('03') || code.startsWith('04')) return 'cloud-outline';
  if (code.startsWith('09') || code.startsWith('10')) return 'rainy-outline';
  if (code.startsWith('11')) return 'thunderstorm-outline';
  if (code.startsWith('13')) return 'snow-outline';
  if (code.startsWith('50')) return 'cloudy-outline';
  return 'partly-sunny-outline';
}

export function TodaySummary({ headline, prose, generatedAt, weather, weatherLocation }: Props) {
  const { colors, elevation } = useTheme();
  /**
   * Undefined until the stored answer lands, and that third state matters.
   *
   * Defaulting to open and correcting a moment later makes the tab open with a
   * paragraph that then vanishes under the reader's thumb — worse than the
   * scroll the fold exists to save. Defaulting to shut does the same thing in
   * the other direction to everyone who has never touched it. So the card holds
   * the headline alone until the preference is known, which is one frame on any
   * device and is the state it shares with "collapsed" anyway.
   */
  const [collapsed, setCollapsed] = useState<boolean | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    void readUpdateCollapsed().then((stored) => {
      if (!cancelled) setCollapsed(stored);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // No count, no card. See the header: the prose never carries this alone.
  if (!headline) return null;

  const written = prose && generatedAt ? writtenAge(generatedAt) : null;
  // Nothing to fold on a day the server withheld the prose, so the control is
  // absent rather than disabled — a chevron that opens an empty card is a
  // chevron that teaches people the card is broken.
  const foldable = Boolean(prose);
  const open = isUpdateOpen(foldable, collapsed);

  // Both halves come from todayPreferences, and neither is written out here.
  // This used to be `const next = !open`, which is the state the card is ALREADY
  // in — so the chevron flipped its own glyph and nothing else, forever. See the
  // two functions' comments.
  const toggle = () => {
    const next = collapsedAfterToggle(open);
    setCollapsed(next);
    void writeUpdateCollapsed(next);
  };

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }, elevation(1)]}>
      {/* The whole head is the control, not just the chevron: this is a card
          somebody folds while holding a phone one-handed, and a 24pt glyph in
          the corner is the smallest target on the screen. */}
      <Pressable
        onPress={foldable ? toggle : undefined}
        disabled={!foldable}
        style={({ pressed }) => [styles.top, { opacity: pressed && foldable ? 0.75 : 1 }]}
        accessibilityRole={foldable ? 'button' : undefined}
        accessibilityState={foldable ? { expanded: open } : undefined}
        accessibilityLabel={
          foldable
            ? `${headline}. ${open ? "Hide Eddy's update" : "Show Eddy's update"}`
            : undefined
        }
      >
        <View style={[styles.iconWell, { backgroundColor: colors.selectionBg }]}>
          <EddySymbol name="water" size={30} />
        </View>
        <View style={styles.copy}>
          <Text style={[styles.kicker, { color: colors.accent }]}>STATEWIDE PULSE</Text>
          <Text style={[styles.headline, { color: colors.text }]}>{headline}</Text>
        </View>
        {foldable ? (
          <Ionicons
            name={open ? 'chevron-up' : 'chevron-down'}
            size={20}
            color={colors.interactive}
          />
        ) : null}
      </Pressable>

      {weather ? (
        <View style={[styles.weather, { borderTopColor: colors.border }]}>
          <View style={[styles.weatherIcon, { backgroundColor: colors.selectionBg }]}>
            <Ionicons name={weatherGlyph(weather.conditionIcon)} size={22} color={colors.interactive} />
          </View>
          <View style={styles.copy}>
            <Text style={[styles.weatherPlace, { color: colors.textSubtle }]} numberOfLines={1}>
              TODAY{weatherLocation ? ` NEAR ${weatherLocation.toUpperCase()}` : ''}
            </Text>
            <Text style={[styles.weatherMain, { color: colors.text }]} numberOfLines={1}>
              {weather.tempHigh}° / {weather.tempLow}° · {weather.condition}
            </Text>
            <Text style={[styles.weatherMeta, { color: colors.textMuted }]} numberOfLines={2}>
              {weather.precipitation}% rain{weather.windSpeed != null ? ` · ${Math.round(weather.windSpeed)} mph wind` : ''}
            </Text>
          </View>
        </View>
      ) : null}

      {open && prose ? (
        <>
          <Text style={[styles.prose, { color: colors.textMuted }]}>{prose}</Text>
          {written ? (
            <Text style={[styles.footnote, { color: colors.textSubtle }]}>{written}</Text>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 16, padding: 14, gap: 10 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconWell: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  copy: { flex: 1, minWidth: 0 },
  kicker: { ...t.xs, fontFamily: fonts.heading, letterSpacing: 0.8, marginBottom: 2 },
  headline: { ...t.lg, fontFamily: fonts.display },
  weather: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 10, flexDirection: 'row', alignItems: 'center', gap: 10 },
  weatherIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  weatherPlace: { ...t.xs, fontFamily: fonts.heading, letterSpacing: 0.6 },
  weatherMain: { ...t.sm, fontFamily: fonts.semibold, marginTop: 1 },
  weatherMeta: { ...t.xs, fontFamily: fonts.body, marginTop: 1 },
  prose: { ...t.sm, fontFamily: fonts.body, lineHeight: 21, paddingLeft: 60 },
  footnote: { ...t.xs, fontFamily: fonts.body, paddingLeft: 60 },
});
