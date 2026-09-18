import { useState } from 'react';
import { Image, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import type { MapAccessPoint } from '@eddy/types';
import { EddySymbol } from '@/components/EddySymbol';
import { placeSymbol } from '@/components/map-sheet/placeSymbol';
import { useTheme } from '@/theme/ThemeProvider';

/** A reserved photo frame prevents layout jumps while images load or fail. */
export function PlanAccessPhoto({ point, style }: {
  point: MapAccessPoint;
  style: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  const uri = point.imageUrls?.[0];
  const [failedUri, setFailedUri] = useState<string>();

  return (
    <View style={[styles.frame, { backgroundColor: colors.cardRaised }, style]}>
      <EddySymbol name={placeSymbol({ layer: 'access' }, point)} size={28} />
      {uri && failedUri !== uri ? (
        <Image
          key={uri}
          source={{ uri, cache: 'default' }}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
          onError={() => setFailedUri(uri)}
          accessible={false}
          accessibilityIgnoresInvertColors
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
});
