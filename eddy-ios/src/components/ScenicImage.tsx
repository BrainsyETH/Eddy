import { Image, type ImageProps } from 'expo-image';
import Constants from 'expo-constants';
import { imageUrl } from '@/lib/imageUrl';

const origin = (Constants.expoConfig?.extra?.apiBaseUrl as string | undefined) ?? 'https://eddy.guide';

/** Sized remote scenery with persistent caching and no fade on navigation. */
export function ScenicImage({ source, imageWidth = 750, ...props }: Omit<ImageProps, 'source'> & {
  source: { uri: string };
  imageWidth?: number;
}) {
  const uri = imageUrl(source.uri, imageWidth, origin);
  return <Image {...props} source={{ uri }} cachePolicy="memory-disk"
    recyclingKey={uri} contentFit="cover" transition={0} />;
}
