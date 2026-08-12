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
   * A float plan, framed while the reader is looking at it.
   *
   * Goes through the command system rather than straight to setCamera, which is
   * what it used to do — the direct call sat outside command ids, sheet waiting
   * and gesture cancellation. Issued on the decision below rather than on the
   * route's arrival, for the reason given there.
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
        // ── No waitForSheet, unlike every other fit ────────────────────────
        //
        // It said `true`, justified as "a finished plan always has the plan
        // sheet over it". Wrong sheet: the gate reads cameraPaddingBottom,
        // which the MAP sheet drives — the Plan sheet is a separate pageSheet
        // modal and contributes nothing to it. So with no map sheet open the
        // frame did not run, it QUEUED, and fired whenever a sheet next
        // happened to open, long after the reader had moved on.
        //
        // There is also nothing to wait for. The other fits wait because the
        // sheet they must clear is opening as a result of the same tap, and has
        // not been measured yet. Nothing opens here: the map sheet is already
        // whatever it was, so the current padding is the final padding.
      };
  }
}

/**
 * Whether a float plan should move the map right now.
 *
 * ── Why viewing, and not arrival ────────────────────────────────────────────
 *
 * Framing when the ROUTE LANDS makes an asynchronous result compete with
 * whatever the reader has done since they asked for it: start a plan, close the
 * sheet, pan somewhere, and the response arrives and frames over them. Command
 * ids do not help — they establish that a command is not a replay, not that it
 * is still wanted.
 *
 * Framing while the plan is BEING VIEWED removes the conflict instead of
 * adjudicating it. The Plan sheet is a pageSheet modal, so for exactly as long
 * as it is open the reader cannot touch the map: there is no competing intent
 * to be stale against. The alternative — an interaction epoch captured at
 * request time and compared on arrival — is bookkeeping over every unrelated
 * gesture and navigation in the app, to resolve a race that cannot occur.
 *
 * The four rules, in order of the branches below:
 *
 *   - closed: never frame, and end the viewing session
 *   - open, route arrives: frame — the reader is looking at it
 *   - open, already framed this route this session: leave the camera alone
 *   - REOPENED: frame again, because opening it is fresh intent
 *
 * `route` is compared by identity and never read, so this stays honest about
 * what it is: a decision, with no opinion on geometry.
 */
export type PlanFramingDecision = 'frame' | 'endSession' | 'idle';

export function planFramingDecision(
  planOpen: boolean,
  route: object | null,
  framedRoute: object | null,
): PlanFramingDecision {
  // Not just "do nothing": closing forgets what was framed, so reopening frames
  // again, and cancels a frame issued in the instant before the sheet went away.
  if (!planOpen) return 'endSession';
  if (!route || route === framedRoute) return 'idle';
  return 'frame';
}
