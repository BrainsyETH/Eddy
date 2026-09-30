import { ORNAMENT_BAND } from '../components/map-sheet/sheetGeometry';

export const MAP_EDGE_GAP = 8;
export const MAP_CONTROLS_ROOM_MIN = ORNAMENT_BAND + 44 + 12;
const CAMERA_GAP = 16;
const MIN_CAMERA_HEIGHT = 120;

export interface MapCameraPadding {
  paddingTop: number;
  paddingBottom: number;
  paddingLeft: number;
  paddingRight: number;
}

/** All dimensions are local to the map canvas, which ends above the tab bar. */
export function mapLayout({
  width,
  height,
  safeTop,
  safeLeft,
  safeRight,
  chromeHeight,
  sheetHeight,
}: {
  width: number;
  height: number;
  safeTop: number;
  safeLeft: number;
  safeRight: number;
  chromeHeight: number;
  sheetHeight: number;
}) {
  const sheetTop = safeTop + MAP_EDGE_GAP;
  const sheetAvailable = Math.max(0, height - sheetTop);
  // A prior layout's settled sheet may briefly be taller than the new canvas.
  // Attribution must stay on screen even before the sheet reports its new size.
  const ornamentBottom = Math.min(Math.max(0, sheetHeight), Math.max(0, sheetAvailable - ORNAMENT_BAND));
  const room = sheetAvailable - ornamentBottom;
  const chromeHidden = sheetHeight > 0 && room <= ORNAMENT_BAND + chromeHeight;
  const controlsHidden = sheetHeight > 0 && room - chromeHeight <= MAP_CONTROLS_ROOM_MIN;
  const top = Math.min(height, sheetTop + (chromeHidden ? 0 : chromeHeight) + CAMERA_GAP);
  const bottom = Math.min(
    ornamentBottom + ORNAMENT_BAND + CAMERA_GAP,
    Math.max(0, height - top - MIN_CAMERA_HEIGHT),
  );

  return {
    sheetTop,
    sheetWidth: Math.max(0, width - safeLeft - safeRight),
    ornamentBottom,
    chromeHidden,
    controlsHidden,
    cameraPadding: {
      paddingTop: top,
      paddingBottom: bottom,
      paddingLeft: safeLeft + 32,
      paddingRight: safeRight + 32,
    } satisfies MapCameraPadding,
  };
}
