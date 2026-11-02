// src/lib/national-map/camera.ts
// The map camera: layout-frame coordinates → CSS pixels.
//   screenX = x * scale + tx,  screenY = y * scale + ty
//
// Zoom is reported relative to the national fit (`zoomFactor`), because every
// level-of-detail rule on this map is "how far past the national view are we",
// independent of screen size.

import type { Bounds } from './projection';

export interface Camera {
  scale: number;
  tx: number;
  ty: number;
}

export interface Viewport {
  width: number;
  height: number;
}

export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export const NO_INSETS: Insets = { top: 0, right: 0, bottom: 0, left: 0 };

/** Furthest in, relative to the national fit. 1:1M geometry stops being useful past this. */
export const MAX_ZOOM = 60;
/** Slightly past the fit, so the composition can breathe on a wall display. */
export const MIN_ZOOM = 0.85;

export function fitBounds(b: Bounds, vp: Viewport, insets: Insets = NO_INSETS, padding = 16): Camera {
  const w = Math.max(1, vp.width - insets.left - insets.right - padding * 2);
  const h = Math.max(1, vp.height - insets.top - insets.bottom - padding * 2);
  const bw = Math.max(1e-6, b.maxX - b.minX);
  const bh = Math.max(1e-6, b.maxY - b.minY);
  const scale = Math.min(w / bw, h / bh);
  const cx = insets.left + padding + w / 2;
  const cy = insets.top + padding + h / 2;
  return {
    scale,
    tx: cx - ((b.minX + b.maxX) / 2) * scale,
    ty: cy - ((b.minY + b.maxY) / 2) * scale,
  };
}

export function zoomFactor(cam: Camera, fit: Camera): number {
  return fit.scale > 0 ? cam.scale / fit.scale : 1;
}

/** Zoom by `factor` keeping the layout point under (px, py) fixed on screen. */
export function zoomAt(cam: Camera, fit: Camera, factor: number, px: number, py: number): Camera {
  const min = fit.scale * MIN_ZOOM;
  const max = fit.scale * MAX_ZOOM;
  const scale = Math.max(min, Math.min(max, cam.scale * factor));
  const f = scale / cam.scale;
  return { scale, tx: px - (px - cam.tx) * f, ty: py - (py - cam.ty) * f };
}

export function pan(cam: Camera, dx: number, dy: number): Camera {
  return { ...cam, tx: cam.tx + dx, ty: cam.ty + dy };
}

/**
 * Keep at least `margin` px of the composed frame on screen, so a fling can
 * never lose the country off the edge of a wall display.
 */
export function clampToBounds(cam: Camera, b: Bounds, vp: Viewport, margin = 80): Camera {
  const left = b.minX * cam.scale + cam.tx;
  const right = b.maxX * cam.scale + cam.tx;
  const top = b.minY * cam.scale + cam.ty;
  const bottom = b.maxY * cam.scale + cam.ty;
  let { tx, ty } = cam;
  if (right < margin) tx += margin - right;
  if (left > vp.width - margin) tx -= left - (vp.width - margin);
  if (bottom < margin) ty += margin - bottom;
  if (top > vp.height - margin) ty -= top - (vp.height - margin);
  return { scale: cam.scale, tx, ty };
}

export function toScreen(cam: Camera, x: number, y: number): [number, number] {
  return [x * cam.scale + cam.tx, y * cam.scale + cam.ty];
}

export function toLayout(cam: Camera, sx: number, sy: number): [number, number] {
  return [(sx - cam.tx) / cam.scale, (sy - cam.ty) / cam.scale];
}

/** Frame a layout-space box, never zooming in past `maxZoom` × the national fit. */
export function frameBox(b: Bounds, vp: Viewport, fit: Camera, insets: Insets, maxZoom = 12): Camera {
  const cam = fitBounds(b, vp, insets, 48);
  if (cam.scale <= fit.scale * maxZoom) return cam;
  const scale = fit.scale * maxZoom;
  const cx = (b.minX + b.maxX) / 2;
  const cy = (b.minY + b.maxY) / 2;
  const sx = insets.left + (vp.width - insets.left - insets.right) / 2;
  const sy = insets.top + (vp.height - insets.top - insets.bottom) / 2;
  return { scale, tx: sx - cx * scale, ty: sy - cy * scale };
}
