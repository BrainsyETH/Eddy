// eddy-ios/src/float/PlaceThumb.tsx
// A small square picture of a place on the float: the access point's own photo
// (or its Eddy place mark, via PlanAccessPhoto) when there is one, otherwise
// the Eddy mark for what it is, in the same well. Decorative: the row beside
// it names the place, so VoiceOver skips it.

import { StyleSheet, View } from 'react-native';
import type { MapAccessPoint } from '@eddy/types';
import { EddySymbol, type EddySymbolName } from '@/components/EddySymbol';
import { PlanAccessPhoto } from '@/components/PlanAccessPhoto';
import { useTheme } from '@/theme/ThemeProvider';

export function PlaceThumb({ point, symbol = 'accessPoint', size = 56 }: {
  /** An access point with photos and types; null shows `symbol`. */
  point?: MapAccessPoint | null;
  symbol?: EddySymbolName;
  size?: number;
}) {
  const { colors } = useTheme();
  const frame = { width: size, height: size, borderRadius: Math.round(size / 5) };
  return (
    <View style={[styles.frame, frame]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {point ? <PlanAccessPhoto point={point} style={[styles.fill, frame]} /> : (
        <View style={[styles.fill, frame, styles.well, { backgroundColor: colors.cardRaised, borderColor: colors.border }]}>
          <EddySymbol name={symbol} size={Math.round(size * 0.6)} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { overflow: 'hidden', flexShrink: 0 },
  fill: { width: '100%', height: '100%' },
  well: { alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth },
});
