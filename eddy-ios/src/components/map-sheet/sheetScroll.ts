// eddy-ios/src/components/map-sheet/sheetScroll.ts
// The handshake between the sheet and whatever is scrolling inside it.
//
// A sheet you drag and a list you scroll are the same downward flick until
// somebody decides which one it belongs to. The rule, borrowed from the
// website's rail.tsx and from every native maps sheet:
//
//   at the smallest detent   the content does not scroll at all
//   above it, content has somewhere to go in the drag's direction
//                            a vertical drag moves the CONTENT
//   above it, content at its top, pulling down
//                            moves the SHEET
//   above it, content at its end, pushing up
//                            moves the SHEET (and opens it further)
//
// "Above it" used to read "at full": below the tallest detent every drag moved
// the sheet, so at `half` trying to read a long Overview lurched the sheet to
// `full` instead. The content scrolls at every detent above the peek now; a
// page that is SHORT still hands every drag to the sheet, because a scroller
// with nowhere to go must not swallow the gesture that opens the sheet.
//
// The last line is the one that needs state shared across components: the sheet
// gesture lives in MapSheet and the scroller lives in a tab page several levels
// down, and the gesture has to read the scroll offset every frame to know
// whether the content still has somewhere to go.
//
// A tiny context rather than props, and deliberately not exported from the
// directory: it never crosses out of the sheet.
import { createContext, useContext, type MutableRefObject } from 'react';
import type { GestureType } from 'react-native-gesture-handler';
import type { SharedValue } from 'react-native-reanimated';
import type { Detent } from './sheetGeometry';

export interface SheetScroll {
  /**
   * Offset of the page the reader is actually on, written on the UI thread.
   *
   * PUBLISHED BY WHICHEVER PAGE IS IN FRONT, and by no other. Every page keeps
   * its own offset privately and copies it here when it becomes the front one.
   * A single value that every page wrote to unconditionally was wrong in a way
   * that only showed up two tabs in: scroll Details down, swipe to Camping —
   * which sits at its top — and a pull down neither scrolled Camping, because
   * it had nowhere to go, nor collapsed the sheet, because the sheet still
   * believed the content was scrolled 300pt down.
   */
  scrollY: SharedValue<number>;
  /**
   * How far the front page CAN scroll: its content height less its layout
   * height, never negative. Published by the same page that publishes scrollY,
   * on the JS thread from the scroller's size callbacks. The sheet's pan reads
   * it to know whether an upward drag still has content to move or should
   * open the sheet instead; 0 means "nothing to scroll", which is every short
   * page and every page before it has measured.
   */
  scrollRange: SharedValue<number>;
  /**
   * The sheet's own pan, so a scroller can declare itself simultaneous with it.
   *
   * DECLARED FROM THE SCROLLER'S SIDE, not the sheet's. The sheet used to name
   * a pool of page refs up front, which was wrong twice over: RNGH rewrites
   * that config in place on first attach (extractGestureRelations replaces the
   * refs with resolved tags), so refs still null then were dropped for good;
   * and it put an array of NATIVE ELEMENT refs into this context, one careless
   * capture away from the crash that shipped — a worklet closure is
   * serialised, and a ReactNativeElement cannot be. A page mounts already
   * knowing the pan, so it can simply say so itself.
   */
  panRef: MutableRefObject<GestureType | undefined>;
  /** Scrolling is off at the smallest detent — there is nothing below the fold. */
  detent: Detent;
  /** True once the sheet is as open as this content allows. */
  atFull: boolean;
  /**
   * The tallest a page may be, before that page's own header and tab bar.
   *
   * Already discounts everything a page does not get: the gap between the
   * tallest detent and the full available height, the grabber, and the bottom
   * inset. See sheetGeometry.pageBudget for why it is derived from `available`
   * rather than from the detent the sheet actually settled on.
   */
  pageBudget: number;
  /**
   * Identity of what the sheet is showing. Pages are keyed by it, so a new
   * selection gets fresh scrollers rather than ones still carrying the last
   * pin's offsets — a native offset outlives a re-render, and the tab keys of
   * two access points are the same strings.
   */
  resetKey: string;
}

export const SheetScrollContext = createContext<SheetScroll | null>(null);

export function useSheetScroll(): SheetScroll | null {
  return useContext(SheetScrollContext);
}
