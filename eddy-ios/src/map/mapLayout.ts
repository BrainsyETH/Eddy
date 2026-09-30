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

/** The canvas extends under native tabs; overlays reserve their measured inset. */
export function mapLayout({
  width,
  height,
  safeTop,
  safeLeft,
  safeRight,
  safeBottom = 0,
  chromeHeight,
  sheetHeight,
}: {
  width: number;
  height: number;
  safeTop: number;
  safeLeft: number;
  safeRight: number;
  /** Tab screen's bottom safe area, including native tabs. Zero for JS tabs. */
  safeBottom?: number;
  chromeHeight: number;
  sheetHeight: number;
}) {
  const sheetTop = safeTop + MAP_EDGE_GAP;
  const bottomInset = Math.min(Math.max(0, safeBottom), Math.max(0, height - sheetTop));
  const sheetAvailable = Math.max(0, height - sheetTop - bottomInset);
  // A prior layout's settled sheet may briefly be taller than the new canvas.
  // Attribution must stay on screen even before the sheet reports its new size.
  const sheetLift = Math.min(Math.max(0, sheetHeight), Math.max(0, sheetAvailable - ORNAMENT_BAND));
  const ornamentBottom = bottomInset + sheetLift;
  const room = sheetAvailable - sheetLift;
  const chromeHidden = sheetHeight > 0 && room <= ORNAMENT_BAND + chromeHeight;
  const controlsHidden = sheetHeight > 0 && room - chromeHeight <= MAP_CONTROLS_ROOM_MIN;
  const top = Math.min(height, sheetTop + (chromeHidden ? 0 : chromeHeight) + CAMERA_GAP);
  const bottom = Math.min(
    ornamentBottom + ORNAMENT_BAND + CAMERA_GAP,
    Math.max(0, height - top - MIN_CAMERA_HEIGHT),
  );

  return {
    sheetTop,
    bottomInset,
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
