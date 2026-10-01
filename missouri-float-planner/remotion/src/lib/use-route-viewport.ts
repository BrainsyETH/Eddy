import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { continueRender, delayRender } from "remotion";
import { REEL_SAFE } from "../../../shared/social-brand";
import { ROUTE_MAP_HEIGHT, ROUTE_STAGE_TOP } from "../../../shared/social-route-layout";

/** The CSS grid owns text/card sizing; both map layers use its actual viewport.
 * Undo Studio's preview scale and retain fractional pixels for exact alignment.
 * Layout effects settle a changed frame before Remotion captures it. */
export function useRouteViewport() {
  const ref = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState({ top: ROUTE_STAGE_TOP, height: ROUTE_MAP_HEIGHT });
  const [handle] = useState(() => delayRender("Route layout and fonts"));
  const measure = useCallback(() => {
    const element = ref.current;
    if (!element) return;
    const parent = element.offsetParent as HTMLElement;
    const bounds = element.getBoundingClientRect();
    const parentBounds = parent.getBoundingClientRect();
    const scale = parentBounds.width / parent.offsetWidth;
    const top = Math.round((REEL_SAFE.top + (bounds.top - parentBounds.top) / scale) * 1000) / 1000;
    const height = Math.round(bounds.height / scale * 1000) / 1000;
    setViewport(previous => previous.top === top && previous.height === height ? previous : { top, height });
  }, []);
  useLayoutEffect(measure);
  useLayoutEffect(() => {
    const observer = new ResizeObserver(measure);
    if (ref.current) observer.observe(ref.current);
    let cancelled = false;
    document.fonts.ready.then(() => {
      if (cancelled) return;
      measure();
      requestAnimationFrame(() => continueRender(handle));
    });
    return () => { cancelled = true; observer.disconnect(); continueRender(handle); };
  }, [handle, measure]);
  return { ref, ...viewport };
}
