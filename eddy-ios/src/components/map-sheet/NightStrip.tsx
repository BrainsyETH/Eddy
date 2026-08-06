// eddy-ios/src/components/map-sheet/NightStrip.tsx
// A fortnight of nights, as fourteen columns.
//
// ── Colour, ON TOP OF the shapes rather than instead of them ──────────────
//
// This was deliberately hueless, and the argument was good: availability shares
// its surfaces with ConditionBadge, which owns a learnable colour language where
// orange is high water and red is dangerous, so a red "fully booked" column
// beside a condition badge reads as a dangerous river.
//
// WHAT CHANGED IS THE ADJACENCY, not the principle. The peek now reserves ONE
// decision slot per pin (peekSlot.ts): tap a tent and you get this card and no
// water reading, tap a put-in and you get the reading and no card. The two can
// no longer appear together in the glance, which is where the collision was.
// Where they still can share a screen — the access-point detail screen — the
// condition is a bordered chip with a label on it and this is a row of small
// bars, which is a much weaker confusion than two things sitting inches apart in
// a peek.
//
// So green means open and red means booked out, which is what everyone reading a
// booking calendar already expects.
//
// ── The shapes stay, and that is not belt-and-braces ──────────────────────
//
// Red and green are the single worst pair for the commonest colour blindness, so
// colour is ADDED to the four marks rather than replacing them: an open night is
// a partly filled track, a booked one is a full track, a night not offered is a
// rule on the baseline, and an unmeasured one is blank. Read with no colour at
// all, the strip still says everything it said before. Do not "simplify" the
// marks away now that they are tinted.
//
// A closed night stays NEUTRAL. "This campground is not offering the night" and
// "every site is taken" are different facts, and painting both red would throw
// away a distinction the shapes are careful to keep.
//
// ── Why it is not tappable ────────────────────────────────────────────────
//
// Fourteen columns across a sheet is about twenty points each. The audit that
// produced PlaceHead caught two 44pt controls whose hit regions overlapped and
// found the cost was a WRONG ACTION rather than a near miss, so nothing this
// small gets to be a control. Night selection is chips, in the Camping tab.

import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type as t } from '@/theme/typography';
import type { NightBar } from './availability';

/**
 * Track height.
 *
 * ── There used to be two, and the reason there is now one ─────────────────
 *
 * A SHORT variant existed so the callout could spend less of the peek than the
 * tabbed header did — the peek is negotiating with the map for the screen, and
 * `resolveDetents` drops any detent within 56pt of another, so height here is
 * genuinely contested.
 *
 * It went with CampgroundAvailability, which draws this at a FIXED height on
 * every surface. That is not a simplification for its own sake: the card sits
 * inside a reserved slot whose whole purpose is that the sheet's top edge does
 * not move (peekSlot.ts), and a strip that were 26pt on one campground and 16pt
 * on the next would move it from pin to pin. One height is what makes the
 * reservation a number anybody can write down.
 */
export const STRIP_HEIGHT_TALL = 26;

export function NightStrip({
  bars,
  height = STRIP_HEIGHT_TALL,
  label,
}: {
  bars: NightBar[];
  height?: number;
  /** The whole strip's VoiceOver utterance. One stop, never fourteen. */
  label?: string | null;
}) {
  const { colors } = useTheme();
  if (bars.length === 0) return null;

  return (
    <View
      style={styles.strip}
      // Only an element when it has something to say. With no label — an
      // unmeasured fortnight, or the placeholder the card draws while its
      // request is out — this is a bare date ruler, and an accessible node with
      // no announcement is a stop on the VoiceOver path that says nothing.
      accessible={label ? true : undefined}
      accessibilityRole={label ? 'image' : undefined}
      accessibilityLabel={label ?? undefined}
    >
      <View style={[styles.row, { height }]}>
        {bars.map((bar) => (
          <View key={bar.date} style={styles.column}>
            {bar.mark === 'none' ? null : bar.mark === 'dash' ? (
              // Nothing here to fill. A rule on the baseline, not an empty box:
              // the campground is not offering this night at all. NEUTRAL on
              // purpose — see the header for why this is not the red one.
              <View style={[styles.dash, { backgroundColor: colors.textSubtle }]} />
            ) : (
              <View
                style={[
                  styles.track,
                  {
                    backgroundColor: colors.cardRaised,
                    // ── AN OUTLINE, NOT A RED BLOCK ────────────────────────
                    // Filling this solid was the obvious way to say "booked"
                    // and it would have quietly broken the promise in the
                    // header: a night with every site OPEN fills to 100%, so a
                    // solid red column and a solid green one are the same
                    // shape, and the strip would carry that distinction in hue
                    // alone — the red/green pair, for the commonest colour
                    // blindness. The empty outline is the shape that already
                    // meant "the inventory exists and none of it is left";
                    // colour only tells you faster.
                    borderColor: bar.mark === 'empty' ? colors.error : 'transparent',
                  },
                ]}
              >
                {bar.mark === 'bar' ? (
                  // Open, and HOW open — the fill is still proportional, so a
                  // night with two sites left does not read like one with forty.
                  <View
                    style={[
                      styles.fill,
                      {
                        height: `${Math.round(bar.fill * 100)}%`,
                        backgroundColor: colors.success,
                      },
                    ]}
                  />
                ) : null}
              </View>
            )}
          </View>
        ))}
      </View>

      <View style={styles.row}>
        {bars.map((bar) => (
          <View key={bar.date} style={styles.column}>
            <Text
              style={[
                styles.weekday,
                {
                  color: bar.isToday
                    ? colors.interactive
                    : bar.isWeekend
                      ? colors.text
                      : colors.textSubtle,
                  fontFamily: bar.isToday || bar.isWeekend ? fonts.semibold : fonts.medium,
                },
              ]}
            >
              {bar.weekday}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  strip: { marginTop: 8 },
  row: { flexDirection: 'row', alignItems: 'flex-end' },
  // Flexed rather than fixed: fourteen columns have to fit a 320pt phone and a
  // Pro Max without the caller doing arithmetic.
  column: { flex: 1, alignItems: 'center', justifyContent: 'flex-end' },
  track: {
    width: 8,
    height: '100%',
    borderRadius: 3,
    // 1.5 rather than 1: this outline stopped being a hairline separator when it
    // started carrying "booked out", and at eight points wide it is the whole of
    // what that column says.
    borderWidth: 1.5,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  fill: { width: '100%', borderRadius: 2 },
  dash: { width: 8, height: 2, borderRadius: 1 },
  weekday: { ...t.xs, fontSize: 10, lineHeight: 14, marginTop: 3 },
});
