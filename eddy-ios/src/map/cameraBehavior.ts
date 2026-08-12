export type MapBounds = [west: number, south: number, east: number, north: number];

export type MapCameraCommand =
  | { id: number; type: 'fitBounds'; bounds: MapBounds; duration?: number; waitForSheet?: boolean }
  | {
      id: number;
      type: 'showPoint';
      lng: number;
      lat: number;
      /** Omit to preserve the live native camera zoom at execution time. */
      zoom?: number;
      zoomDelta?: number;
      maxZoom?: number;
      waitForSheet?: boolean;
      duration?: number;
    };

/**
 * Every reason the camera is allowed to move.
 *
 * ── Why there is no `sheetChanged` / `selectionClosed` / `userGesture` ────────
 *
 * There were, and they returned null. That reads as an enforced rule and is not
 * one: nothing constructed them, so the test asserting they navigate nowhere
 * only proved that a switch returns the constant written next to it. What
 * actually guarantees a dismissal does not move the camera is that `onClose`
 * never calls issueCameraCommand — which no test of THIS file can see. The
 * variants are gone so the absence is honest; the guarantee lives in
 * `selectRiver`'s required intent, where a caller has to say `'hold'` out loud.
 */
export type MapCameraAction =
  | { type: 'riverSelected'; bounds: MapBounds }
  | { type: 'poiSelected'; lng: number; lat: number }
  | { type: 'searchResultSelected'; lng: number; lat: number; zoom?: number }
  | { type: 'locationRequested'; lng: number; lat: number; zoom: number }
  | { type: 'clusterSelected'; lng: number; lat: number }
  /**
   * A finished float plan, framed once when its route lands.
   *
   * Goes through the command system rather than straight to setCamera, which is
   * what it used to do. A route arrives asynchronously, so the direct call was
   * the one path that could still overrule a reader who had panned away while
   * it was in flight — the exact failure this module exists to prevent.
   */
  | { type: 'planRouteFramed'; bounds: MapBounds };

/**
 * The map's navigation contract in one pure function.
 *
 * Every action here MAY move the camera. Layout changes, dismissal, and
 * gestures are not actions at all: after a command has run, the native camera
 * owns its position until the reader asks to move again.
 */
export function cameraCommandFor(action: MapCameraAction, id: number): MapCameraCommand | null {
  switch (action.type) {
    case 'riverSelected':
      return {
        id,
        type: 'fitBounds',
        bounds: action.bounds,
        duration: 550,
        waitForSheet: true,
      };
    case 'poiSelected':
      return {
        id,
        type: 'showPoint',
        lng: action.lng,
        lat: action.lat,
        duration: 350,
        waitForSheet: true,
      };
    case 'searchResultSelected':
      return {
        id,
        type: 'showPoint',
        lng: action.lng,
        lat: action.lat,
        zoom: action.zoom ?? 13,
        duration: 650,
      };
    case 'locationRequested':
      return {
        id,
        type: 'showPoint',
        lng: action.lng,
        lat: action.lat,
        zoom: action.zoom,
        duration: 650,
      };
    case 'clusterSelected':
      return {
        id,
        type: 'showPoint',
        lng: action.lng,
        lat: action.lat,
        zoomDelta: 2,
        maxZoom: 16,
        duration: 450,
      };
    case 'planRouteFramed':
      return {
        id,
        type: 'fitBounds',
        bounds: action.bounds,
        duration: 550,
        // A finished plan always has the plan sheet over it, and a twelve-mile
        // float framed into the whole map is a float half-hidden by the sheet.
        waitForSheet: true,
      };
  }
}
