import { useState } from 'react';
import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';
import credits from '../../assets/onboarding/credits.json';
import { useTheme } from '@/theme/ThemeProvider';

export const DAM_PHOTOS: Record<string, { source: number; credit: string; url: string; license: string }> = {
  'swl-table-rock-dam': {
    ...credits['swl-table-rock-dam'],
    source: require('../../assets/onboarding/table-rock.jpg'),
  },
  'swl-bull-shoals-dam': {
    ...credits['swl-bull-shoals-dam'],
    source: require('../../assets/onboarding/bull-shoals.jpg'),
  },
  'ameren-bagnell-dam': {
    ...credits['ameren-bagnell-dam'],
    source: require('../../assets/onboarding/bagnell.jpg'),
  },
  'lrn-center-hill-dam': {
    ...credits['lrn-center-hill-dam'],
    source: require('../../assets/onboarding/lrn-center-hill-dam.jpg'),
  },
  'lrn-dale-hollow-dam': {
    ...credits['lrn-dale-hollow-dam'],
    source: require('../../assets/onboarding/lrn-dale-hollow-dam.jpg'),
  },
  'lrn-wolf-creek-dam': {
    ...credits['lrn-wolf-creek-dam'],
    source: require('../../assets/onboarding/lrn-wolf-creek-dam.jpg'),
  },
  'mvs-mark-twain': {
    ...credits['mvs-mark-twain'],
    source: require('../../assets/onboarding/mvs-mark-twain.jpg'),
  },
  'mvs-wappapello': {
    ...credits['mvs-wappapello'],
    source: require('../../assets/onboarding/mvs-wappapello.jpg'),
  },
  'nwk-stockton-dam': {
    ...credits['nwk-stockton-dam'],
    source: require('../../assets/onboarding/nwk-stockton-dam.jpg'),
  },
  'nwk-truman-dam': {
    ...credits['nwk-truman-dam'],
    source: require('../../assets/onboarding/nwk-truman-dam.jpg'),
  },
  'swl-beaver-dam': {
    ...credits['swl-beaver-dam'],
    source: require('../../assets/onboarding/swl-beaver-dam.jpg'),
  },
  'swl-dardanelle-dam': {
    ...credits['swl-dardanelle-dam'],
    source: require('../../assets/onboarding/swl-dardanelle-dam.jpg'),
  },
  'swl-greers-ferry-dam': {
    ...credits['swl-greers-ferry-dam'],
    source: require('../../assets/onboarding/swl-greers-ferry-dam.jpg'),
  },
  'swl-norfork-dam': {
    ...credits['swl-norfork-dam'],
    source: require('../../assets/onboarding/swl-norfork-dam.jpg'),
  },
  'swl-ozark-dam': {
    ...credits['swl-ozark-dam'],
    source: require('../../assets/onboarding/swl-ozark-dam.jpg'),
  },
  'swt-denison-dam': {
    ...credits['swt-denison-dam'],
    source: require('../../assets/onboarding/swt-denison-dam.jpg'),
  },
  'swt-eufaula-dam': {
    ...credits['swt-eufaula-dam'],
    source: require('../../assets/onboarding/swt-eufaula-dam.jpg'),
  },
  'swt-fort-gibson-dam': {
    ...credits['swt-fort-gibson-dam'],
    source: require('../../assets/onboarding/swt-fort-gibson-dam.jpg'),
  },
  'swt-keystone-dam': {
    ...credits['swt-keystone-dam'],
    source: require('../../assets/onboarding/swt-keystone-dam.jpg'),
  },
  'swt-robert-s-kerr-dam': {
    ...credits['swt-robert-s-kerr-dam'],
    source: require('../../assets/onboarding/swt-robert-s-kerr-dam.jpg'),
  },
  'swt-tenkiller-dam': {
    ...credits['swt-tenkiller-dam'],
    source: require('../../assets/onboarding/swt-tenkiller-dam.jpg'),
  },
  'swt-webbers-falls-dam': {
    ...credits['swt-webbers-falls-dam'],
    source: require('../../assets/onboarding/swt-webbers-falls-dam.jpg'),
  },
};

/** Editorial scenery only; missing photos use Eddy's own place illustration. */
export function OnboardingPhoto({ uri, damId }: { uri?: string | null; damId?: string }) {
  const { colors } = useTheme();
  const [failedUri, setFailedUri] = useState<string | null>(null);
  const photo = damId ? DAM_PHOTOS[damId]?.source : uri && failedUri !== uri ? { uri } : null;
  return (
    <View style={[styles.frame, { backgroundColor: colors.selectionBg }]} accessibilityElementsHidden>
      <Image
        source={photo ?? (damId ? require('../../assets/eddy/eddy-dam.png') : require('../../assets/eddy/eddy-route-planning.png'))}
        style={photo ? styles.photo : styles.illustration}
        contentFit={photo ? 'cover' : 'contain'}
        cachePolicy="memory-disk"
        transition={0}
        onError={() => { if (uri) setFailedUri(uri); }}
      />
    </View>
  );
}
const styles = StyleSheet.create({
  frame: { height: 112, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  photo: { width: '100%', height: '100%' },
  illustration: { width: 100, height: 100 },
});
