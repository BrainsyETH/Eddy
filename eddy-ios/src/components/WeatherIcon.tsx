import { View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, G, Line, Path } from 'react-native-svg';
import { useTheme } from '@/theme/ThemeProvider';
import { weatherIconPalette, weatherSymbol } from '@/theme/weather';

/** Shared, multicolour weather artwork for Today, the forecast, and Will it hold. */
export function WeatherIcon({ code, size = 28, style }: { code: string; size?: number; style?: StyleProp<ViewStyle> }) {
  const { isDark } = useTheme();
  const ink = weatherIconPalette(isDark);
  const sky = weatherSymbol(code);
  return <View style={[{ width: size, height: size }, style]} accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    <Svg width={size} height={size} viewBox="0 0 64 64">
      {sky.sun ? <G transform={sky.cloud ? 'translate(1 -1) scale(.72)' : undefined}>
        <Circle cx={32} cy={32} r={12} fill={ink.sun} />
        {[0, 45, 90, 135, 180, 225, 270, 315].map(angle => <Line key={angle} x1={32} y1={7} x2={32} y2={13}
          stroke={ink.sun} strokeWidth={3.5} strokeLinecap="round" transform={`rotate(${angle} 32 32)`} />)}
      </G> : null}
      {sky.moon ? <Path transform={sky.cloud ? 'translate(1 -2) scale(.75)' : undefined}
        d="M39 8C24 7 13 18 13 32C13 46 24 57 38 56C46 55 52 51 56 44C40 48 26 34 30 20C32 15 35 11 39 8Z" fill={ink.moon} /> : null}
      {sky.cloud ? <Path d="M18 45C7 45 5 32 14 27C13 14 32 10 38 23C50 17 60 28 55 37C59 43 50 46 46 45Z"
        fill={ink.cloud} stroke={ink.edge} strokeWidth={2} strokeLinejoin="round" /> : null}
      {sky.rain ? <G stroke={ink.rain} strokeWidth={4} strokeLinecap="round">
        <Line x1={20} y1={50} x2={17} y2={56} /><Line x1={33} y1={50} x2={30} y2={58} /><Line x1={46} y1={50} x2={43} y2={56} />
      </G> : null}
      {sky.storm ? <Path d="M33 34L23 49H32L28 61L44 43H34L40 34Z" fill={ink.lightning} /> : null}
      {sky.snow ? [20, 33, 46].map(x => <G key={x} stroke={ink.snow} strokeWidth={2} strokeLinecap="round">
        <Line x1={x} y1={49} x2={x} y2={59} /><Line x1={x - 4} y1={51} x2={x + 4} y2={57} /><Line x1={x - 4} y1={57} x2={x + 4} y2={51} />
      </G>) : null}
      {sky.mist ? <G stroke={ink.edge} strokeWidth={3} strokeLinecap="round">
        <Line x1={10} y1={51} x2={47} y2={51} /><Line x1={19} y1={58} x2={55} y2={58} />
      </G> : null}
    </Svg>
  </View>;
}
