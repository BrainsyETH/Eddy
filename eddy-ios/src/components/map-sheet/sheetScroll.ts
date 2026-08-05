// eddy-ios/src/components/map-sheet/sheetScroll.ts
// The handshake between the sheet and whatever is scrolling inside it.
//
// A sheet you drag and a list you scroll are the same downward flick until
// somebody decides which one it belongs to. The rule, borrowed from the
// website's rail.tsx and from every native maps sheet:
//
//   at the smallest detent   the content does not scroll at all
//   below full               a vertical drag moves the SHEET
//   at full, scrolled down   a vertical drag moves the CONTENT
//   at full, scrolled to top pulling down moves the sheet again
//
// The last line is the one that needs state shared across components: the sheet
// gesture lives in MapSheet and the scroller lives in a tab page several levels
// down, and the gesture has to read the scroll offset every frame to know
// whether the content still has somewhere to go.
//
// A tiny context rather than props, and deliberately not exported from the
// directory: it never crosses out of the sheet.
import { createContext, useContext, type RefObject } from 'react';
import type { SharedValue } from 'react-native-reanimated';
import type { Detent } from './sheetGeometry';

export interface SheetScroll {
  /**
   * Offset of the page the reader is actually on, written on the UI thread.
   *
   * ONE value for every page rather than one each. The sheet only ever cares
   * about the page in front, and a map of offsets would have to be indexed
   * inside a worklet on every frame of every drag.
   */
  scrollY: SharedValue<number>;
  /**
   * One ref per page, handed out by index.
   *
   * The sheet's pan declares itself simultaneous with all of them up front —
   * RNGH resolves a ref when the gesture is handled rather than when it is
   * built, so they can be empty at construction. Without the relation the pan
   * CANCELS the scroller the moment it activates, and the content would refuse
   * to scroll at the one detent where it is supposed to.
   */
  scrollRefs: RefObject<unknown>[];
  /** Scrolling is off at the smallest detent — there is nothing below the fold. */
  detent: Detent;
  /** True once the sheet is as open as this content allows. */
  atFull: boolean;
  /**
   * The whole height the sheet may occupy.
   *
   * A page needs it to cap itself: uncapped, long content would make the sheet
   * measure taller than the screen and the tail would be unreachable at any
   * detent. Capped, a SHORT page still measures its natural height — which is
   * what keeps a 115pt hazard callout a one-detent sheet instead of a mostly
   * empty tall one.
   */
  available: number;
}

export const SheetScrollContext = createContext<SheetScroll | null>(null);

export function useSheetScroll(): SheetScroll | null {
  return useContext(SheetScrollContext);
}
