'use client';

// src/app/embed/display/Ambient.tsx
// The slow current behind the display: a few soft channels with drifting foam,
// the Watershed diagram's motif. It is the only always-moving thing on screen,
// which is the point on a TV (nothing sits still long enough to burn in) and
// why it is kept faint and capped at ~30 fps for the modest chips in TVs.

import { useEffect, useRef } from 'react';
import styles from './display.module.css';

export default function Ambient() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = ref.current;
    const ctx = cv?.getContext('2d');
    if (!cv || !ctx) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const lanes = Array.from({ length: 7 }, (_, i) => ({ y: (i + 0.5) / 7, a: 28 + i * 6, f: 0.0018 + i * 0.0004, ph: i * 1.7 }));
    const size = () => { cv.width = cv.offsetWidth; cv.height = cv.offsetHeight; };
    size();
    let raf = 0, last = 0;
    const t0 = performance.now();
    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      if (now - last < 33 && !reduce) return;
      last = now;
      const t = (now - t0) / 1000;
      ctx.clearRect(0, 0, cv.width, cv.height);
      for (const l of lanes) {
        ctx.beginPath();
        for (let x = 0; x <= cv.width; x += 12) {
          const y = l.y * cv.height + l.a * Math.sin(x * l.f + l.ph + t * 0.03);
          if (x) ctx.lineTo(x, y); else ctx.moveTo(x, y);
        }
        ctx.setLineDash([]);
        ctx.strokeStyle = 'rgba(114,181,196,0.10)';
        ctx.lineWidth = 18;
        ctx.stroke();
        ctx.setLineDash([3, 34]);
        ctx.lineDashOffset = -t * 26 * (1 + l.f * 180);
        ctx.strokeStyle = 'rgba(212,234,239,0.32)';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      if (reduce) cancelAnimationFrame(raf);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  return <canvas ref={ref} className={styles.ambient} aria-hidden="true" />;
}
