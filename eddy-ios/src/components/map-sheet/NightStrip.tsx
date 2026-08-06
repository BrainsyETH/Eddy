// eddy-ios/src/components/map-sheet/NightStrip.tsx
// A fortnight of nights, as fourteen columns.
//
// ── Why there is no colour in this ────────────────────────────────────────
//
// Availability appears on the same surfaces as ConditionBadge, which owns a
// learnable colour language: orange is high water, red is dangerous. A red
// "fully booked" column beside a condition badge reads as a dangerous river.
// So the strip borrows the interaction teal for FILL and encodes everything
// else in shape — see NightMark in availability.ts. The web's AvailabilityChip
// makes the same argument at greater length and reaches the same answer.
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
      accessible
      accessibilityRole="image"
      accessibilityLabel={label ?? undefined}
    >
      <View style={[styles.row, { height }]}>
        {bars.map((bar) => (
          <View key={bar.date} style={styles.column}>
            {bar.mark === 'none' ? null : bar.mark === 'dash' ? (
              // Nothing here to fill. A rule on the baseline, not an empty box:
              // the campground is not offering this night at all.
              <View style={[styles.dash, { backgroundColor: colors.textSubtle }]} />
            ) : (
              <View
                style={[
                  styles.track,
                  {
                    backgroundColor: colors.cardRaised,
                    // A drawn border is what separates "every site booked" from
                    // "nothing here" without using a second colour: the empty
                    // track is a container with nothing in it.
                    borderColor: bar.mark === 'empty' ? colors.border : 'transparent',
                  },
                ]}
              >
                {bar.mark === 'bar' ? (
                  <View
                    style={[
                      styles.fill,
                      {
                        height: `${Math.round(bar.fill * 100)}%`,
                        backgroundColor: colors.interactive,
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
    borderWidth: 1,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  fill: { width: '100%', borderRadius: 2 },
  dash: { width: 8, height: 2, borderRadius: 1 },
  weekday: { ...t.xs, fontSize: 10, lineHeight: 14, marginTop: 3 },
});
