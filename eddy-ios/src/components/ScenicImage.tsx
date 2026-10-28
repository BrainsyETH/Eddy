import { Image, type ImageProps } from 'expo-image';
import Constants from 'expo-constants';
import { imageUrl } from '@/lib/imageUrl';

const origin = (Constants.expoConfig?.extra?.apiBaseUrl as string | undefined) ?? 'https://eddy.guide';

/**
 * The exact URL ScenicImage requests for `uri` at `imageWidth`, so a prefetch
 * fills the same disk-cache entry the image later reads (see floatPhotos.ts).
 */
export function scenicUri(uri: string, imageWidth = 750): string {
  return imageUrl(uri, imageWidth, origin);
}

/** Sized remote scenery with persistent caching and no fade on navigation. */
export function ScenicImage({ source, imageWidth = 750, contentFit = 'cover', ...props }: Omit<ImageProps, 'source'> & {
  source: { uri: string };
  imageWidth?: number;
}) {
  const uri = imageUrl(source.uri, imageWidth, origin);
  return <Image {...props} source={{ uri }} cachePolicy="memory-disk"
    recyclingKey={uri} contentFit={contentFit} transition={0} />;
}
