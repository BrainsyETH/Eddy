import { REEL_SAFE, videoSafeInsets, type SocialVideoPlacement } from './social-brand';
import type { JourneyStage } from './social-route-journey';

// Initial viewport before the DOM is measured. RouteDraw's CSS grid owns the
// actual header/progress/map/footer bounds; both map layers use that viewport.
export const ROUTE_STAGE_TOP = 480;
export const ROUTE_MAP_HEIGHT = 510;
export const ROUTE_CONTENT_WIDTH = 1080 - REEL_SAFE.left - REEL_SAFE.right;
export const ROUTE_MAP_STAGE: JourneyStage = {
  width: ROUTE_CONTENT_WIDTH,
  height: ROUTE_MAP_HEIGHT,
  boatX: ROUTE_CONTENT_WIDTH / 2,
  boatY: ROUTE_MAP_HEIGHT / 2,
  padding: 90, // Full canoe plus the active endpoint label, including its border.
  paddingX: 130, // Eddy extends 120px left of the route marker.
};

export function routeVideoLayout(platform?: string, placement: SocialVideoPlacement = 'reel') {
  const safe = videoSafeInsets(platform, placement);
  const width = 1080 - safe.left - safe.right;
  return { safe, width, stage: { ...ROUTE_MAP_STAGE, width, boatX: width / 2 } };
}
