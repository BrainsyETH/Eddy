'use client';

// Starfield + nebula wash behind the map — the "observatory" depth
// layer. Drawn ONCE per resize onto a static canvas (deterministic
// seeding, no per-frame work); a barely-there 9s CSS opacity breath is
// the only motion, and reduced-motion pins it fully still. Stars sit in
// screen space on purpose: distant sky shouldn't parallax with a
// camera move across a state.

import { useEffect, useRef } from 'react';
import { usePrefersReducedMotion } from './fx';

export default function Stars() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const draw = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      // Nebula wash — two broad teal pools, additive over the gradient.
      const neb = (cx: number, cy: number, r: number, a: number) => {
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
        g.addColorStop(0, `rgba(45,120,137,${a})`);
        g.addColorStop(1, 'rgba(45,120,137,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
      };
      neb(w * 0.78, h * 0.12, Math.max(w, h) * 0.5, 0.075);
      neb(w * 0.1, h * 0.85, Math.max(w, h) * 0.42, 0.055);

      // Stars — deterministic LCG so the sky never reshuffles.
      let seed = 987654321;
      const rand = () => {
        seed = (seed * 1103515245 + 12345) % 2147483648;
        return seed / 2147483648;
      };
      const N = 170;
      for (let i = 0; i < N; i++) {
        const x = rand() * w;
        const y = rand() * h;
        const r = (0.35 + rand() * 1.05) * dpr;
        const a = 0.12 + rand() * 0.5;
        // Cool parchment-teal starlight, not pure white.
        ctx.fillStyle = `rgba(${205 + Math.round(rand() * 40)},${225 + Math.round(rand() * 25)},235,${a})`;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
      // A handful of brighter stars with a soft halo.
      for (let i = 0; i < 7; i++) {
        const x = rand() * w;
        const y = rand() * h;
        const g = ctx.createRadialGradient(x, y, 0, x, y, 7 * dpr);
        g.addColorStop(0, 'rgba(235,245,250,0.85)');
        g.addColorStop(0.25, 'rgba(163,209,219,0.28)');
        g.addColorStop(1, 'rgba(163,209,219,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, 7 * dpr, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none absolute inset-0 h-full w-full"
      style={reduced ? undefined : { animation: 'mosw-breathe 9s ease-in-out infinite' }}
    />
  );
}
