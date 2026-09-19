import { REEL_SAFE } from './social-brand';
import type { JourneyStage } from './social-route-journey';

// The portrait route uses disjoint map, annotation and dock areas. Share the
// exact camera viewport with the frame-by-frame geometry regression tests.
export const ROUTE_STAGE_TOP = 510;
export const ROUTE_STAGE_HEIGHT = 640;
export const ROUTE_MAP_HEIGHT = 410;
export const ROUTE_ANNOTATION_TOP = ROUTE_STAGE_TOP + ROUTE_MAP_HEIGHT + 20;
export const ROUTE_CONTENT_WIDTH = 1080 - REEL_SAFE.left - REEL_SAFE.right;
export const ROUTE_MAP_STAGE: JourneyStage = {
  width: ROUTE_CONTENT_WIDTH,
  height: ROUTE_MAP_HEIGHT,
  boatX: ROUTE_CONTENT_WIDTH / 2,
  boatY: ROUTE_MAP_HEIGHT / 2,
  padding: 80,
  paddingX: 130, // Eddy extends 120px left of the route marker.
};
