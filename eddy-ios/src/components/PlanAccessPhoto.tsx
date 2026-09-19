import { useState } from 'react';
import { Image, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import type { MapAccessPoint } from '@eddy/types';
import { EddySymbol } from '@/components/EddySymbol';
import { placeSymbol } from '@/components/map-sheet/placeSymbol';
import { useTheme } from '@/theme/ThemeProvider';

/** Real photos keep their frame; photo-free picker cards use a compact branded fallback. */
export function PlanAccessPhoto({ point, style, compactFallback = false }: {
  point: MapAccessPoint;
  style: StyleProp<ViewStyle>;
  compactFallback?: boolean;
}) {
  const { colors } = useTheme();
  const uri = point.imageUrls?.[0];
  const [failedUri, setFailedUri] = useState<string>();

  const showPhoto = !!uri && failedUri !== uri;

  return (
    <View style={[styles.frame, { backgroundColor: colors.cardRaised }, style, compactFallback && !showPhoto && styles.compactFallback]}>
      <EddySymbol name={placeSymbol({ layer: 'access' }, point)} size={28} />
      {showPhoto ? (
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
  compactFallback: { height: 56, aspectRatio: undefined, alignItems: 'flex-start', paddingHorizontal: 14 },
  frame: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
});
