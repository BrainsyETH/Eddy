import { useState } from 'react';
import { Image, View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { safeExternalUrl } from '@/lib/campingHeatmap';
import { EddySymbol } from './EddySymbol';

/** Decorative: the adjacent name already identifies the campground. */
export function CampgroundThumbnail({ url }: { url?: string | null }) {
  const { colors } = useTheme();
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const source = safeExternalUrl(url);
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width: 44,
        height: 44,
        borderRadius: 10,
        overflow: 'hidden',
        flexShrink: 0,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.selectionBg,
      }}
    >
      {source && source !== failedUrl ? (
        <Image
          source={{ uri: source, cache: 'force-cache' }}
          resizeMode="cover"
          style={{ width: 44, height: 44 }}
          onError={() => setFailedUrl(source)}
          accessible={false}
        />
      ) : (
        <EddySymbol name="campground" size={28} />
      )}
    </View>
  );
}
