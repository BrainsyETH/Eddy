// eddy-ios/src/hooks/useShareImage.ts
// Share a server-rendered image: fetch the PNG, keep it in the cache folder
// for the share sheet, then hand the sheet the file AND the link text, so a
// recipient gets the picture and a way back. Used by the chart's Share Image
// (ChartShareControl) and a float's Share (FloatShareButton).
//
// Chart images need the network; floats may supply a local export and cache.
// A failure to PREPARE either image is reported,
// because the user is left with nothing to share; a failure or cancel inside
// the share sheet is not. Anything but a PNG is a failure: the image routes
// answer an error, never a stand-in picture, so a PNG is always the image
// that was asked for.

import { useEffect, useRef, useState } from 'react';
import { Alert, Share } from 'react-native';
import { File, Paths } from 'expo-file-system';
import { webUrl } from '@/lib/share';

class ShareImageError extends Error {
  constructor(readonly status: number) {
    super('Image unavailable');
  }
}

const PREPARE_FAILED = 'Could not prepare this image. Check your connection and try again.';

export interface ShareImageRequest {
  /** The image route's path on eddy.guide. */
  imagePath: string;
  /** Cache file prefix; a random suffix is added. Nothing about the user: the name travels with the file. */
  fileName: string;
  title: string;
  /** The link to send with it, which may depend on the response (a header). Null sends the title alone. */
  linkPath: (response: Response) => string | null;
  /** A specific message for an HTTP status, or null for the default. */
  failureMessage?: (status: number) => string | null;
  /** Replaces the default preparation-failure message. */
  defaultFailure?: string;
  /** Floats can export a basic local PNG when the network cannot prepare one. */
  fallbackImage?: () => Promise<string>;
  cache?: boolean;
  prepareTimeoutMs?: number;
  /** Keep the native activity sheet attached to its initiating control on iPad. */
  anchor?: number;
}

export function useShareImage() {
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const request = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      request.current?.abort();
    };
  }, []);

  async function shareImage(options: ShareImageRequest) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    const controller = new AbortController();
    request.current = controller;
    const timeout = setTimeout(() => controller.abort(), options.prepareTimeoutMs ?? 30_000);
    let file: File | null = null;
    try {
      const cache = options.cache ? await import('@/lib/shareImageCache') : null;
      const cacheRevision = cache?.shareImageRevision() ?? 0;
      const cached = cache?.readShareImage(options.imagePath, options.fileName);
      let link: string | null = cached?.link ?? null;
      // Copy cached bytes to the disposable share file: cleanup cannot delete the cache.
      let bytes: Uint8Array | string | null = null;
      try { bytes = cached ? await cached.file.bytes() : null; } catch { /* Rebuild a missing cache file. */ }
      if (!bytes) {
        try {
          const response = await fetch(webUrl(options.imagePath), { signal: controller.signal });
          if (!response.ok || !response.headers.get('content-type')?.includes('image/png')) throw new ShareImageError(response.status);
          link = options.linkPath(response);
          bytes = new Uint8Array(await response.arrayBuffer());
          if (!mounted.current) return;
          cache?.cacheShareImage(options.imagePath, options.fileName, bytes, link, cacheRevision);
        } catch (error) {
          // A rejected share/removed place retains the server's specific error.
          if (!mounted.current || !options.fallbackImage || (error instanceof ShareImageError && error.status < 500 && error.status !== 429)) throw error;
          clearTimeout(timeout);
          bytes = await options.fallbackImage();
          link = null;
        }
      }
      if (!mounted.current) return;
      file = new File(Paths.cache, `${options.fileName}-${Math.random().toString(36).slice(2, 8)}.png`);
      if (typeof bytes === 'string') file.write(bytes, { encoding: 'base64' });
      else file.write(bytes);
      clearTimeout(timeout);
      if (mounted.current) setBusy(false);
      try {
        await Share.share({
          title: options.title,
          url: file.uri,
          message: link ? `${options.title}\n${webUrl(link)}` : options.title,
        }, { anchor: options.anchor });
      } catch {
        // As in shareLink: a share-sheet failure costs nothing the user cannot retry.
      }
    } catch (error) {
      if (mounted.current) {
        const specific = error instanceof ShareImageError ? options.failureMessage?.(error.status) : null;
        Alert.alert('Image unavailable', specific ?? options.defaultFailure ?? PREPARE_FAILED);
      }
    } finally {
      clearTimeout(timeout);
      inFlight.current = false;
      request.current = null;
      if (mounted.current) setBusy(false);
      try {
        if (file?.exists) file.delete();
      } catch {
        /* cache cleanup is best effort */
      }
    }
  }

  return { busy, shareImage };
}
