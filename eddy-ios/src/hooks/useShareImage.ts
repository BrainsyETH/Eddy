// eddy-ios/src/hooks/useShareImage.ts
// Share a server-rendered image: fetch the PNG, keep it in the cache folder
// for the share sheet, then hand the sheet the file AND the link text, so a
// recipient gets the picture and a way back. Used by the chart's Share Image
// (ChartShareControl) and a float's Share (FloatShareButton).
//
// Preparing the image needs the network. A failure to PREPARE is reported,
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
    const timeout = setTimeout(() => controller.abort(), 30_000);
    let file: File | null = null;
    try {
      const response = await fetch(webUrl(options.imagePath), { signal: controller.signal });
      if (!response.ok || !response.headers.get('content-type')?.includes('image/png')) {
        throw new ShareImageError(response.status);
      }
      const link = options.linkPath(response);
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (!mounted.current || controller.signal.aborted) return;
      file = new File(Paths.cache, `${options.fileName}-${Math.random().toString(36).slice(2, 8)}.png`);
      file.write(bytes);
      clearTimeout(timeout);
      if (mounted.current) setBusy(false);
      try {
        await Share.share({
          title: options.title,
          url: file.uri,
          message: link ? `${options.title}\n${webUrl(link)}` : options.title,
        });
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
