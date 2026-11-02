'use client';

// The canvas stage: camera, gestures, keyboard, hit testing, and the bridge
// to the renderer. It owns no product state — the parent decides what is
// selected, which view is on, and what a tap means in fullscreen.
//
// Camera rules from the plan:
//   * the camera never moves on its own — refreshes, new floods and view
//     changes leave it exactly where it is; only an explicit action (search,
//     reset, entering fullscreen from the overview) frames something;
//   * a resize keeps the national fit if the user was on it, otherwise keeps
//     the same center and zoom.

import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type Ref } from 'react';
import {
  clampToBounds,
  fitBounds,
  frameBox,
  pan,
  toLayout,
  zoomAt,
  zoomFactor,
  type Camera,
  type Insets,
  type Viewport,
} from '@/lib/national-map/camera';
import type { DecodedGeometry } from '@/lib/national-map/geometry';
import type { ClassifiedSite, Site } from '@/lib/national-map/marks';
import {
  applyAffine,
  buildLayout,
  invertComponent,
  layoutKindFor,
  projectComponent,
  componentOf,
  type Bounds,
  type Layout,
  type MapComponent,
} from '@/lib/national-map/projection';
import { GridIndex } from '@/lib/national-map/spatial-index';
import type { MapPalette } from '@/lib/national-map/theme';
import { NationalRenderer, type RenderMark } from './renderer';
import styles from './national-map.module.css';

export interface StageHandle {
  fitNational: () => void;
  /** Frame a box in landscape-frame coordinates, per component. */
  frameSites: (indices: number[]) => void;
  frameState: (code: string) => void;
  /** Center a site; `coverBottom` px of the viewport are hidden (a mobile sheet). */
  focusSite: (index: number, coverBottom?: number) => void;
  zoomBy: (factor: number) => void;
  /** Center (lng/lat) and zoom × national fit, for share links. */
  center: () => { lng: number; lat: number; zoom: number } | null;
  isNational: () => boolean;
  /** Screen position of a site (for anchoring a chooser). */
  screenOf: (index: number) => { x: number; y: number } | null;
}

export interface StageEvent {
  indices: number[];
  x: number;
  y: number;
}

interface Props {
  ref?: Ref<StageHandle>;
  geometry: DecodedGeometry | null;
  detail: DecodedGeometry | null;
  sites: Site[];
  classified: ClassifiedSite[];
  /** Bumps when a new frame arrives, so marks cross-fade instead of jumping. */
  frameVersion: number;
  palette: MapPalette;
  motion: boolean;
  dataLive: boolean;
  labels: boolean;
  insets: Insets;
  selectedIndex: number | null;
  featuredIndex: number | null;
  initialCenter: { lng: number; lat: number; zoom: number } | null;
  /** In map-only, a tap belongs to the parent (it reveals the tray). */
  interactive: boolean;
  ariaLabel: string;
  onTap: (event: StageEvent | null) => void;
  onHover: (event: StageEvent | null) => void;
  onCameraChange: () => void;
  onNeedDetail: () => void;
}

const DRAG_SLOP_PX = 5;

export default function MapStage(props: Props) {
  const {
    ref,
    geometry,
    detail,
    sites,
    classified,
    frameVersion,
    palette,
    motion,
    dataLive,
    labels,
    insets,
    selectedIndex,
    featuredIndex,
    initialCenter,
    interactive,
    ariaLabel,
    onTap,
    onHover,
    onCameraChange,
    onNeedDetail,
  } = props;
  const hostRef = useRef<HTMLDivElement>(null);
  const renderer = useRef<NationalRenderer | null>(null);
  const [vp, setVp] = useState<Viewport | null>(null);
  const camRef = useRef<Camera | null>(null);
  const userMoved = useRef(false);
  const initialApplied = useRef(false);
  const lastFrameVersion = useRef(frameVersion);

  // ── Renderer lifecycle ──────────────────────────────────────────────────
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const r = new NationalRenderer(host, palette);
    renderer.current = r;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setVp({ width, height });
    });
    ro.observe(host);
    const onVis = () => r.syncFxLoop();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      ro.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      r.destroy();
      renderer.current = null;
    };
    // The palette is pushed by its own effect; recreating canvases on a theme
    // change would drop the camera.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Size first: every later effect draws into canvases of this size.
  useEffect(() => {
    if (vp) renderer.current?.resize(vp);
  }, [vp]);
  useEffect(() => renderer.current?.setPalette(palette), [palette]);
  useEffect(() => renderer.current?.setGeometry(geometry, detail), [geometry, detail]);
  useEffect(() => renderer.current?.setLabels(labels), [labels]);
  useEffect(() => renderer.current?.setMotion(motion, dataLive), [motion, dataLive]);

  // ── Layout (landscape / portrait) ───────────────────────────────────────
  const layout: Layout | null = useMemo(() => {
    if (!geometry || !vp) return null;
    return buildLayout(layoutKindFor(vp.width, vp.height), geometry.components);
  }, [geometry, vp]);

  useEffect(() => {
    if (layout) renderer.current?.setLayout(layout);
  }, [layout]);

  // Laid-out positions and the hit index.
  const positions = useMemo(() => {
    const xs = new Float32Array(sites.length);
    const ys = new Float32Array(sites.length);
    if (layout) {
      sites.forEach((s, i) => {
        const [x, y] = applyAffine(layout.affine[s.component], s.x, s.y);
        xs[i] = x;
        ys[i] = y;
      });
    }
    return { xs, ys, index: new GridIndex(xs, ys, 6) };
  }, [sites, layout]);

  const drawable = useMemo(() => {
    const minZoom = new Float32Array(sites.length).fill(Infinity);
    for (const c of classified) minZoom[c.index] = c.style.minZoom;
    return minZoom;
  }, [classified, sites.length]);

  // ── Camera ──────────────────────────────────────────────────────────────
  const fit = useCallback((): Camera | null => {
    if (!layout || !vp) return null;
    return fitBounds(layout.bounds, vp, insets, Math.min(32, Math.max(12, vp.width * 0.02)));
  }, [layout, vp, insets]);

  /** `live`: one step of a pointer / wheel / key gesture (see renderer). */
  const commit = useCallback(
    (cam: Camera, moved: boolean, live = false) => {
      const f = fit();
      if (!f || !layout || !vp) return;
      const next = clampToBounds(cam, layout.bounds, vp);
      camRef.current = next;
      if (moved) userMoved.current = true;
      renderer.current?.setCamera(next, f.scale, live);
      if (zoomFactor(next, f) >= 2.2) onNeedDetail();
      onCameraChange();
    },
    [fit, layout, vp, onCameraChange, onNeedDetail],
  );

  const laidOutPoint = useCallback(
    (lng: number, lat: number): [number, number] | null => {
      if (!layout) return null;
      const comp = componentOf(lng, lat);
      const [x, y] = projectComponent(comp, lng, lat);
      return applyAffine(layout.affine[comp], x, y);
    },
    [layout],
  );

  // Fit / refit on layout or viewport change.
  useEffect(() => {
    const f = fit();
    if (!f || !vp) return;
    if (!initialApplied.current) {
      initialApplied.current = true;
      if (initialCenter) {
        const pt = laidOutPoint(initialCenter.lng, initialCenter.lat);
        if (pt) {
          const scale = f.scale * initialCenter.zoom;
          const cx = insets.left + (vp.width - insets.left - insets.right) / 2;
          const cy = insets.top + (vp.height - insets.top - insets.bottom) / 2;
          userMoved.current = true;
          commit({ scale, tx: cx - pt[0] * scale, ty: cy - pt[1] * scale }, false);
          return;
        }
      }
      commit(f, false);
      return;
    }
    const prev = camRef.current;
    if (!userMoved.current || !prev) {
      commit(f, false);
      return;
    }
    // Keep the same layout point centered at the same relative zoom.
    commit(prev, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fit]);

  // ── Marks ───────────────────────────────────────────────────────────────
  useEffect(() => {
    const marks: RenderMark[] = classified.map((c) => ({
      x: positions.xs[c.index],
      y: positions.ys[c.index],
      style: c.style,
      phase: ((c.index * 2654435761) >>> 0) / 4294967296,
    }));
    const fade = frameVersion !== lastFrameVersion.current;
    lastFrameVersion.current = frameVersion;
    renderer.current?.setMarks(marks, fade);
  }, [classified, positions, frameVersion]);

  useEffect(() => {
    const pt = (i: number | null) => (i === null || i >= positions.xs.length ? null : { x: positions.xs[i], y: positions.ys[i] });
    renderer.current?.setHighlights(pt(selectedIndex), pt(featuredIndex));
  }, [selectedIndex, featuredIndex, positions]);

  // ── Imperative handle ───────────────────────────────────────────────────
  const frameLaidBox = useCallback(
    (b: Bounds, maxZoom = 12) => {
      const f = fit();
      if (!f || !vp) return;
      userMoved.current = true;
      commit(frameBox(b, vp, f, insets, maxZoom), true);
    },
    [fit, vp, insets, commit],
  );

  useImperativeHandle(
    ref,
    () => ({
      fitNational: () => {
        const f = fit();
        if (!f) return;
        userMoved.current = false;
        commit(f, false);
      },
      frameSites: (indices) => {
        if (!indices.length) return;
        const b: Bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
        for (const i of indices) {
          b.minX = Math.min(b.minX, positions.xs[i]);
          b.maxX = Math.max(b.maxX, positions.xs[i]);
          b.minY = Math.min(b.minY, positions.ys[i]);
          b.maxY = Math.max(b.maxY, positions.ys[i]);
        }
        const pad = 4;
        frameLaidBox({ minX: b.minX - pad, minY: b.minY - pad, maxX: b.maxX + pad, maxY: b.maxY + pad });
      },
      frameState: (code) => {
        if (!geometry || !layout) return;
        const st = geometry.states.find((s) => s.code === code);
        if (!st) return;
        const a = layout.affine[st.component];
        const b: Bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
        for (const ring of st.rings) {
          for (let i = 0; i + 1 < ring.length; i += 2) {
            const [x, y] = applyAffine(a, ring[i], ring[i + 1]);
            b.minX = Math.min(b.minX, x);
            b.maxX = Math.max(b.maxX, x);
            b.minY = Math.min(b.minY, y);
            b.maxY = Math.max(b.maxY, y);
          }
        }
        frameLaidBox(b, 30);
      },
      focusSite: (i, coverBottom = 0) => {
        const f = fit();
        const cam = camRef.current;
        if (!f || !vp || !cam || i >= positions.xs.length) return;
        const scale = Math.max(cam.scale, f.scale * 6);
        const bottom = Math.max(insets.bottom, coverBottom);
        const cx = insets.left + (vp.width - insets.left - insets.right) / 2;
        const cy = insets.top + Math.max(40, vp.height - insets.top - bottom) / 2;
        userMoved.current = true;
        commit({ scale, tx: cx - positions.xs[i] * scale, ty: cy - positions.ys[i] * scale }, true);
      },
      zoomBy: (factor) => {
        const f = fit();
        const cam = camRef.current;
        if (!f || !cam || !vp) return;
        commit(zoomAt(cam, f, factor, vp.width / 2, vp.height / 2), true);
      },
      center: () => {
        const f = fit();
        const cam = camRef.current;
        if (!f || !cam || !vp || !layout) return null;
        const [lx, ly] = toLayout(cam, vp.width / 2, vp.height / 2);
        // Undo the layout affine of whichever component's box holds the point.
        let comp: MapComponent = 'l48';
        for (const c of ['ak', 'hi'] as MapComponent[]) {
          const a = layout.affine[c];
          const b = geometry!.components[c];
          const [x0, y0] = applyAffine(a, b.minX, b.minY);
          const [x1, y1] = applyAffine(a, b.maxX, b.maxY);
          if (lx >= x0 && lx <= x1 && ly >= y0 && ly <= y1) comp = c;
        }
        const a = layout.affine[comp];
        const [lng, lat] = invertComponent(comp, (lx - a.dx) / a.s, (ly - a.dy) / a.s);
        return { lng, lat, zoom: zoomFactor(cam, f) };
      },
      isNational: () => !userMoved.current,
      screenOf: (i) => {
        const cam = camRef.current;
        if (!cam || i >= positions.xs.length) return null;
        return { x: positions.xs[i] * cam.scale + cam.tx, y: positions.ys[i] * cam.scale + cam.ty };
      },
    }),
    [fit, commit, frameLaidBox, positions, geometry, layout, vp, insets],
  );

  // ── Hit testing ─────────────────────────────────────────────────────────
  const hit = useCallback(
    (sx: number, sy: number, radiusPx: number): number[] => {
      const cam = camRef.current;
      const f = fit();
      if (!cam || !f) return [];
      const z = zoomFactor(cam, f);
      const [lx, ly] = toLayout(cam, sx, sy);
      return positions.index.near(lx, ly, radiusPx / cam.scale, (i) => z >= drawable[i]);
    },
    [fit, positions, drawable],
  );

  // ── Gestures ────────────────────────────────────────────────────────────
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ startX: number; startY: number; moved: boolean; pinchDist: number | null } | null>(null);

  const local = (e: { clientX: number; clientY: number }) => {
    const r = hostRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    hostRef.current?.setPointerCapture(e.pointerId);
    const p = local(e);
    pointers.current.set(e.pointerId, p);
    if (pointers.current.size === 1) {
      gesture.current = { startX: p.x, startY: p.y, moved: false, pinchDist: null };
    } else if (pointers.current.size === 2 && gesture.current) {
      const [a, b] = [...pointers.current.values()];
      gesture.current.pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
      gesture.current.moved = true;
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const p = local(e);
    const prev = pointers.current.get(e.pointerId);
    if (!prev) {
      if (e.pointerType === 'mouse' && interactive) {
        const found = hit(p.x, p.y, 8);
        onHover(found.length ? { indices: found, x: p.x, y: p.y } : null);
      }
      return;
    }
    pointers.current.set(e.pointerId, p);
    const g = gesture.current;
    const cam = camRef.current;
    const f = fit();
    if (!g || !cam || !f || !interactive) return;
    if (pointers.current.size >= 2 && g.pinchDist) {
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const pm = { x: mid.x - (p.x - prev.x) / 2, y: mid.y - (p.y - prev.y) / 2 };
      let next = zoomAt(cam, f, dist / g.pinchDist, mid.x, mid.y);
      next = pan(next, mid.x - pm.x, mid.y - pm.y);
      g.pinchDist = dist;
      commit(next, true, true);
      return;
    }
    if (!g.moved && Math.hypot(p.x - g.startX, p.y - g.startY) < DRAG_SLOP_PX) return;
    g.moved = true;
    onHover(null);
    commit(pan(cam, p.x - prev.x, p.y - prev.y), true, true);
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const g = gesture.current;
    pointers.current.delete(e.pointerId);
    if (pointers.current.size > 0) return;
    gesture.current = null;
    if (!g || g.moved) return;
    const p = local(e);
    if (!interactive) {
      onTap(null);
      return;
    }
    const found = hit(p.x, p.y, e.pointerType === 'touch' ? 18 : 10);
    onTap(found.length ? { indices: found, x: p.x, y: p.y } : null);
  };

  const onPointerCancel = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (!pointers.current.size) gesture.current = null;
  };

  // Wheel needs a non-passive listener to prevent page zoom/scroll.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (!interactive) return;
      const cam = camRef.current;
      const f = fit();
      if (!cam || !f) return;
      const r = host.getBoundingClientRect();
      const delta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      commit(zoomAt(cam, f, Math.exp(-delta * 0.0018), e.clientX - r.left, e.clientY - r.top), true, true);
    };
    host.addEventListener('wheel', onWheel, { passive: false });
    return () => host.removeEventListener('wheel', onWheel);
  }, [fit, commit, interactive]);

  const onDoubleClick = (e: React.MouseEvent) => {
    if (!interactive) return;
    const cam = camRef.current;
    const f = fit();
    if (!cam || !f) return;
    const p = local(e);
    commit(zoomAt(cam, f, e.shiftKey ? 0.5 : 2, p.x, p.y), true);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!interactive) return;
    const cam = camRef.current;
    const f = fit();
    if (!cam || !f || !vp) return;
    const step = 60;
    let next: Camera | null = null;
    switch (e.key) {
      case '+':
      case '=':
        next = zoomAt(cam, f, 1.5, vp.width / 2, vp.height / 2);
        break;
      case '-':
      case '_':
        next = zoomAt(cam, f, 1 / 1.5, vp.width / 2, vp.height / 2);
        break;
      case 'ArrowLeft':
        next = pan(cam, step, 0);
        break;
      case 'ArrowRight':
        next = pan(cam, -step, 0);
        break;
      case 'ArrowUp':
        next = pan(cam, 0, step);
        break;
      case 'ArrowDown':
        next = pan(cam, 0, -step);
        break;
      case '0':
        userMoved.current = false;
        commit(f, false);
        e.preventDefault();
        return;
      default:
        return;
    }
    e.preventDefault();
    commit(next, true, true);
  };

  return (
    <div
      ref={hostRef}
      className={styles.stage}
      role="application"
      aria-roledescription="map"
      aria-label={ariaLabel}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onPointerLeave={(e) => {
        if (e.pointerType === 'mouse' && !pointers.current.size) onHover(null);
      }}
      onDoubleClick={onDoubleClick}
      onKeyDown={onKeyDown}
    />
  );
}
