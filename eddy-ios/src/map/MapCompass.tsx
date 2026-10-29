import { Pressable, StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import Svg, { Polygon, Text as SvgText } from 'react-native-svg';
import { FloatingControlSurface } from '@/components/FloatingControlSurface';
import { useTheme } from '@/theme/ThemeProvider';

/**
 * The map's compass: a north/south needle that points at true north while the
 * map is turned, and turns it back to north-up when tapped.
 *
 * ── Why the map needs one ───────────────────────────────────────────────────
 * Two-finger rotation is on (Mapbox's default), and nothing else on the screen
 * says which way is up once it has been used — a river running "up" the screen
 * may be running south. Mapbox's own compass ornament exists, but it is a
 * fixed bitmap in a corner the attribution already uses; this one sits in the
 * control row beside Locate, in the same glass.
 *
 * ── Shown only while the map is turned ──────────────────────────────────────
 * The platform convention (Apple Maps, the native Mapbox ornament): north-up
 * is the resting state, and a compass that is always there is a control that
 * usually does nothing. The caller decides visibility with compassVisible().
 *
 * The needle rotates from a shared value written per camera frame, so turning
 * the map never renders React — only the compass's arrival and departure do.
 */
export function MapCompass({ heading, onPress }: { heading: SharedValue<number>; onPress: () => void }) {
  const { colors } = useTheme();
  // The map turned clockwise by `heading`, so north on screen is the same
  // angle the other way.
  const needle = useAnimatedStyle(() => ({ transform: [{ rotate: `${-heading.get()}deg` }] }));
  return (
    <FloatingControlSurface style={styles.button}>
      {glass => (
        <Pressable
          onPress={onPress}
          style={({ pressed }) => [styles.button, { opacity: pressed && !glass ? 0.7 : 1 }]}
          accessibilityRole="button"
          accessibilityLabel="Compass"
          accessibilityHint="Turns the map so north is at the top"
        >
          <Animated.View style={[StyleSheet.absoluteFill, needle]} pointerEvents="none">
            <Svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
              {/* The N rides the needle, so the north end is named and not
                  only coloured — colour alone fails in Increase Contrast and
                  for anyone who does not know the convention. */}
              <SvgText x={C} y={11} fontSize={9} fontWeight="700" fill={colors.accent} textAnchor="middle">
                N
              </SvgText>
              <Polygon points={`${C},13 ${C + 4},${C} ${C - 4},${C}`} fill={colors.accent} />
              <Polygon points={`${C},${SIZE - 13} ${C + 4},${C} ${C - 4},${C}`} fill={colors.textSubtle} />
            </Svg>
          </Animated.View>
        </Pressable>
      )}
    </FloatingControlSurface>
  );
}

/** The map controls' 44pt circle; see locateButton on the map screen. */
const SIZE = 44;
const C = SIZE / 2;

const styles = StyleSheet.create({
  button: { width: SIZE, height: SIZE, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
});
