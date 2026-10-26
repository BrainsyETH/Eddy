import { DEFAULT_TIMING, intermediateRouteStops, journeyDuration } from '../../../shared/social-route-journey';
import { resolveRoutePhotos, type PhotoSize } from '../../../shared/social-route-photos';
import type { RouteDrawProps } from './social-props';

/** calculateMetadata runs in the render browser; no CORS canvas or server fetch. */
function decodedPhotoSize(src: string): Promise<PhotoSize> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const timeout = window.setTimeout(() => finish(new Error('Photo timed out')), 5000);
    let settled = false;
    function finish(error?: Error) {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      image.onload = null;
      image.onerror = null;
      if (error) {
        image.src = '';
        reject(error);
      } else resolve({ width: image.naturalWidth, height: image.naturalHeight });
    }
    image.onload = () => { image.decode().then(() => finish(), () => finish(new Error('Photo decode failed'))); };
    image.onerror = () => finish(new Error('Photo load failed'));
    image.src = src;
  });
}

export async function routeMetadata({ props }: { props: RouteDrawProps }) {
  const routePoints = await resolveRoutePhotos(props.routePoints ?? [], props.photoUrl, decodedPhotoSize);
  return {
    props: { ...props, routePoints },
    durationInFrames: journeyDuration(intermediateRouteStops(routePoints), DEFAULT_TIMING, !!props.unanchoredPoints?.length),
  };
}
