import { useState } from 'react';
import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';

export const DAM_PHOTOS: Record<string, { source: number; credit: string; url: string; license: string }> = {
  'swl-table-rock-dam': {
    source: require('../../assets/onboarding/table-rock.jpg'),
    credit: 'KTrimble · CC BY-SA 3.0',
    url: 'https://commons.wikimedia.org/wiki/File:Aerial_photo_of_Table_Rock_Dam,_lake,_and_White_River,_October_2009.jpg',
    license: 'https://creativecommons.org/licenses/by-sa/3.0/',
  },
  'swl-bull-shoals-dam': {
    source: require('../../assets/onboarding/bull-shoals.jpg'),
    credit: 'KTrimble · CC BY-SA 3.0',
    url: 'https://commons.wikimedia.org/wiki/File:Bull_Shoals_Dam_aerial_photo.jpg',
    license: 'https://creativecommons.org/licenses/by-sa/3.0/',
  },
  'ameren-bagnell-dam': {
    source: require('../../assets/onboarding/bagnell.jpg'),
    credit: 'KTrimble / Bogomolov.PL · CC0',
    url: 'https://commons.wikimedia.org/wiki/File:UserKTrimble-AP_of_Bagnell_Dam_MO_2011-03-01.jpg',
    license: 'https://creativecommons.org/publicdomain/zero/1.0/',
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
