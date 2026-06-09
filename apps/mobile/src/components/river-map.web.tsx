// MapLibre RN doesn't run in the web bundler — render a placeholder for the
// expo-export pass. The native build uses river-map.tsx.

import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';

export interface RiverMapProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  route: any;
  bounds?: [number, number, number, number];
}

export function RiverMap(_props: RiverMapProps) {
  return (
    <View style={styles.container}>
      <ThemedText type="small">Map preview is iOS-only.</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    minHeight: 240,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: '#1f2937',
  },
});
