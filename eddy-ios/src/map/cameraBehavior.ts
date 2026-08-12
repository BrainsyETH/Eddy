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

export type MapCameraAction =
  | { type: 'riverSelected'; bounds: MapBounds }
  | { type: 'poiSelected'; lng: number; lat: number }
  | { type: 'searchResultSelected'; lng: number; lat: number; zoom?: number }
  | { type: 'locationRequested'; lng: number; lat: number; zoom: number }
  | { type: 'clusterSelected'; lng: number; lat: number }
  | { type: 'sheetChanged' }
  | { type: 'selectionClosed' }
  | { type: 'userGesture' };

/**
 * The map's navigation contract in one pure function.
 *
 * Selection and explicit navigation actions may issue one camera command.
 * Layout changes, dismissal, and gestures never do: after a command has run,
 * the native camera owns its position until the reader asks to move again.
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
    case 'sheetChanged':
    case 'selectionClosed':
    case 'userGesture':
      return null;
  }
}
