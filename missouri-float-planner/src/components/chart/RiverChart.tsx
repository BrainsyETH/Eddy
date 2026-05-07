'use client';

// src/components/chart/RiverChart.tsx
// Stylized SVG cartographic chart of all 7 Ozark float rivers.
// Ported from the Stitch design at
//   /tmp/stitch-design/extracted/robust-river-map/project/{river-map.jsx,map-ui.jsx,river-data.js}
// onto Eddy's tech stack.
//
// This is a *visual instrument*, not a real map — see src/data/river-chart.ts.
// Clicking a river or one of its access points calls onSelectRiver(slug),
// which the parent uses to drop the user into the real /plan?river=<slug>
// MapLibre planner.

import { useEffect, useMemo, useRef, useState } from 'react';
import { CHART_LEVELS, CHART_RIVERS, CHART_VIEWBOX, type ChartAccess, type ChartRiver } from '@/data/river-chart';

interface RiverChartProps {
  onSelectRiver: (slug: string) => void;
  /** Optional: ms between particle redraws. Default 60ms (~16fps). */
  particleTickMs?: number;
}

interface SampledPoint { x: number; y: number; angle: number }

function sampleAt(pathEl: SVGPathElement | null, t: number): SampledPoint {
  if (!pathEl) return { x: 0, y: 0, angle: 0 };
  const len = pathEl.getTotalLength();
  const p = pathEl.getPointAtLength(len * t);
  const p2 = pathEl.getPointAtLength(Math.min(len, len * t + 0.5));
  return { x: p.x, y: p.y, angle: Math.atan2(p2.y - p.y, p2.x - p.x) };
}

export default function RiverChart({ onSelectRiver, particleTickMs = 60 }: RiverChartProps) {
  const [hoveredRiver, setHoveredRiver] = useState<string | null>(null);
  const [hoveredAccess, setHoveredAccess] = useState<{ river: ChartRiver; access: ChartAccess } | null>(null);

  return (
    <div className="relative w-full h-full" style={{ background: '#F2EAD8' }}>
      <svg
        viewBox={`0 0 ${CHART_VIEWBOX.width} ${CHART_VIEWBOX.height}`}
        preserveAspectRatio="xMidYMid slice"
        style={{ width: '100%', height: '100%', display: 'block' }}
      >
        <ParchmentBasemap />

        {/* Hidden geometry layer — access points and labels sample these via getElementById */}
        <g aria-hidden="true">
          {CHART_RIVERS.map((r) => (
            <path key={r.id} id={`chart-geom-${r.id}`} d={r.path} fill="none" stroke="none" />
          ))}
        </g>

        {/* Visible rivers */}
        {CHART_RIVERS.map((river) => {
          const isHovered = hoveredRiver === river.id;
          const dimmed = !!hoveredRiver && !isHovered;
          return (
            <RiverPath
              key={river.id}
              river={river}
              hovered={isHovered}
              dimmed={dimmed}
              onHover={(id) => setHoveredRiver(id)}
              onClick={() => onSelectRiver(river.id)}
              particleTickMs={particleTickMs}
            />
          );
        })}

        {/* Access medallions (above river lines) */}
        {CHART_RIVERS.map((river) => (
          <AccessLayer
            key={`access-${river.id}`}
            river={river}
            hoveredAccess={hoveredAccess}
            dimmed={!!hoveredRiver && hoveredRiver !== river.id}
            onHover={setHoveredAccess}
            onClick={() => onSelectRiver(river.id)}
          />
        ))}

        {/* River name labels */}
        {CHART_RIVERS.map((river) => (
          <RiverLabel
            key={`label-${river.id}`}
            river={river}
            hovered={hoveredRiver === river.id}
            dimmed={!!hoveredRiver && hoveredRiver !== river.id}
          />
        ))}
      </svg>

      {/* Access bloom popover (top right) */}
      {hoveredAccess && <AccessBloom hovered={hoveredAccess} />}
    </div>
  );
}

// ───────── Parchment basemap ─────────
function ParchmentBasemap() {
  return (
    <g>
      <defs>
        <radialGradient id="rc-vignette" cx="50%" cy="48%" r="70%">
          <stop offset="0%" stopColor="#F2EAD8" />
          <stop offset="70%" stopColor="#E6DCBE" />
          <stop offset="100%" stopColor="#C9B98E" />
        </radialGradient>
        <pattern id="rc-grain" width="180" height="180" patternUnits="userSpaceOnUse">
          {Array.from({ length: 80 }).map((_, i) => {
            const seed = (i * 9301 + 49297) % 233280;
            const x = seed % 180;
            const y = Math.floor(seed / 180) % 180;
            const r = ((seed % 7) / 10) + 0.3;
            return <circle key={i} cx={x} cy={y} r={r} fill="rgba(105,80,40,.06)" />;
          })}
        </pattern>
        <pattern id="rc-topo" width="240" height="240" patternUnits="userSpaceOnUse">
          {[0, 1, 2, 3, 4].map((i) => (
            <path
              key={`h${i}`}
              d={`M -20 ${30 + i * 45} Q 60 ${10 + i * 45} 120 ${40 + i * 45} T 260 ${30 + i * 45}`}
              stroke="rgba(120,90,40,.13)"
              strokeWidth="0.7"
              fill="none"
            />
          ))}
          {[0, 1, 2].map((i) => (
            <path
              key={`v${i}`}
              d={`M ${40 + i * 70} -10 Q ${70 + i * 70} 80 ${50 + i * 70} 140 T ${40 + i * 70} 260`}
              stroke="rgba(120,90,40,.13)"
              strokeWidth="0.5"
              fill="none"
              opacity="0.6"
            />
          ))}
        </pattern>
      </defs>

      <rect width={CHART_VIEWBOX.width} height={CHART_VIEWBOX.height} fill="url(#rc-vignette)" />
      <rect width={CHART_VIEWBOX.width} height={CHART_VIEWBOX.height} fill="url(#rc-topo)" />
      <rect width={CHART_VIEWBOX.width} height={CHART_VIEWBOX.height} fill="url(#rc-grain)" />

      {/* Faint state-line border */}
      <path
        d="M 80 100 L 1500 80 L 1530 920 L 60 940 Z"
        fill="none"
        stroke="rgba(80,60,30,.18)"
        strokeWidth="2"
        strokeDasharray="6 8"
      />

      {/* Field-chart titling */}
      <text
        x={CHART_VIEWBOX.width / 2}
        y={80}
        textAnchor="middle"
        style={{
          fontFamily: 'var(--font-display), Fredoka, system-ui, sans-serif',
          fontSize: 28,
          letterSpacing: '0.4em',
          fill: 'rgba(80,60,30,.20)',
          fontWeight: 500,
        }}
      >
        MISSOURI · OZARKS
      </text>
      <text
        x={CHART_VIEWBOX.width / 2}
        y={CHART_VIEWBOX.height - 30}
        textAnchor="middle"
        style={{
          fontFamily: 'var(--font-mono), "Geist Mono", ui-monospace, monospace',
          fontSize: 11,
          letterSpacing: '0.35em',
          fill: 'rgba(80,60,30,.30)',
        }}
      >
        EDDY · FIELD CHART · NO. VII
      </text>
    </g>
  );
}

// ───────── A single river: line + animated flow particles ─────────
interface RiverPathProps {
  river: ChartRiver;
  hovered: boolean;
  dimmed: boolean;
  onHover: (slug: string | null) => void;
  onClick: () => void;
  particleTickMs: number;
}

function RiverPath({ river, hovered, dimmed, onHover, onClick, particleTickMs }: RiverPathProps) {
  const pathRef = useRef<SVGPathElement | null>(null);
  const level = CHART_LEVELS[river.level];
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      if (now - last >= particleTickMs) {
        setTick((t) => (t + 1) % 1_000_000);
        last = now;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [particleTickMs]);

  // Particle positions are derived from a base offset that drifts with `tick`.
  const particleCount = Math.round(level.density * 18);
  const particles = useMemo(() => {
    return Array.from({ length: particleCount }, (_, i) => {
      // Stable seed per particle (so they move at slightly different speeds)
      const seed = ((i * 9301 + 49297) % 233280) / 233280;
      return { i, seed, baseT: i / particleCount };
    });
  }, [particleCount]);

  const path = pathRef.current;
  const handDrawnGhost = (
    <path
      d={river.path}
      stroke="rgba(80,60,30,.20)"
      strokeWidth={level.weight + 1.5}
      strokeLinecap="round"
      fill="none"
      transform="translate(1.5, 1)"
    />
  );

  return (
    <g
      style={{
        opacity: dimmed ? 0.32 : 1,
        transition: 'opacity 240ms cubic-bezier(.4,0,.2,1)',
        cursor: 'pointer',
      }}
      onMouseEnter={() => onHover(river.id)}
      onMouseLeave={() => onHover(null)}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
    >
      {/* Glow under the river */}
      <path
        d={river.path}
        stroke={level.glow}
        strokeWidth={level.weight + 8}
        strokeLinecap="round"
        fill="none"
        opacity={hovered ? 0.9 : 0.55}
      />

      {handDrawnGhost}

      {/* The river itself */}
      <path
        ref={pathRef}
        d={river.path}
        stroke={level.color}
        strokeWidth={level.weight}
        strokeLinecap="round"
        fill="none"
        style={{
          filter: hovered ? `drop-shadow(0 0 6px ${level.glow})` : 'none',
          transition: 'stroke-width 200ms',
        }}
      />

      {/* Flow particles */}
      {path && particles.map((p) => {
        // Per-frame t = (baseT + tick * speed) mod 1
        const driftPerTick = 0.006 * level.speed * (0.85 + p.seed * 0.3);
        const t = (p.baseT + tick * driftPerTick) % 1;
        const s = sampleAt(path, t);
        const fade = Math.sin(t * Math.PI);
        const len = 6 + level.speed * 4;
        return (
          <g key={p.i} transform={`translate(${s.x} ${s.y}) rotate(${(s.angle * 180) / Math.PI})`} pointerEvents="none">
            <ellipse cx={0} cy={0} rx={len} ry={1.4} fill="#fff" opacity={0.55 * fade} />
            <circle cx={len * 0.5} cy={0} r={1.6} fill="#fff" opacity={0.85 * fade} />
          </g>
        );
      })}
    </g>
  );
}

// ───────── River name label, riding along the path ─────────
function RiverLabel({ river, hovered, dimmed }: { river: ChartRiver; hovered: boolean; dimmed: boolean }) {
  const [pos, setPos] = useState<{ x: number; y: number; angle: number } | null>(null);

  useEffect(() => {
    const el = document.getElementById(`chart-geom-${river.id}`) as SVGPathElement | null;
    if (!el) return;
    const s = sampleAt(el, river.labelT);
    const offsetN = -18;
    const nx = -Math.sin(s.angle);
    const ny = Math.cos(s.angle);
    setPos({ x: s.x + nx * offsetN, y: s.y + ny * offsetN, angle: (s.angle * 180) / Math.PI });
  }, [river.id, river.labelT]);

  if (!pos) return null;

  // Keep text upright (don't flip when path angle is steep)
  let a = pos.angle;
  if (a > 90 || a < -90) a += 180;

  return (
    <g
      transform={`translate(${pos.x} ${pos.y}) rotate(${a})`}
      pointerEvents="none"
      style={{ opacity: dimmed ? 0.32 : 1, transition: 'opacity 240ms' }}
    >
      <text
        textAnchor="middle"
        style={{
          fontFamily: 'var(--font-display), Fredoka, system-ui, sans-serif',
          fontSize: hovered ? 19 : 17,
          fontWeight: 600,
          fill: '#0F2D35',
          paintOrder: 'stroke',
          stroke: 'rgba(255,255,255,.85)',
          strokeWidth: 4,
          strokeLinejoin: 'round',
          letterSpacing: '0.02em',
          transition: 'font-size 160ms',
        }}
      >
        {river.name}
      </text>
    </g>
  );
}

// ───────── Access medallions (one layer per river) ─────────
function AccessLayer({
  river,
  hoveredAccess,
  dimmed,
  onHover,
  onClick,
}: {
  river: ChartRiver;
  hoveredAccess: { river: ChartRiver; access: ChartAccess } | null;
  dimmed: boolean;
  onHover: (next: { river: ChartRiver; access: ChartAccess } | null) => void;
  onClick: () => void;
}) {
  const [pathEl, setPathEl] = useState<SVGPathElement | null>(null);

  useEffect(() => {
    const el = document.getElementById(`chart-geom-${river.id}`) as SVGPathElement | null;
    setPathEl(el);
  }, [river.id]);

  if (!pathEl) return null;

  return (
    <g style={{ opacity: dimmed ? 0.3 : 1, transition: 'opacity 240ms' }}>
      {river.access.map((access, idx) => {
        const isHovered =
          hoveredAccess?.river.id === river.id && hoveredAccess.access.name === access.name;
        return (
          <AccessPoint
            key={`${river.id}-${idx}`}
            access={access}
            pathEl={pathEl}
            hovered={isHovered}
            onMouseEnter={() => onHover({ river, access })}
            onMouseLeave={() => onHover(null)}
            onClick={onClick}
          />
        );
      })}
    </g>
  );
}

function AccessPoint({
  access,
  pathEl,
  hovered,
  onMouseEnter,
  onMouseLeave,
  onClick,
}: {
  access: ChartAccess;
  pathEl: SVGPathElement;
  hovered: boolean;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onClick: () => void;
}) {
  const pos = useMemo(() => sampleAt(pathEl, access.t), [pathEl, access.t]);

  // Color by access type — borrowed from the design's CSS tokens
  const stroke =
    access.type === 'put-in'  ? '#84cc16' :   // lime / "support"
    access.type === 'take-out' ? '#F07052' :  // coral / "accent"
                                  '#2D7889';  // teal / "primary"

  return (
    <g
      transform={`translate(${pos.x} ${pos.y})`}
      style={{ cursor: 'pointer' }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
    >
      {/* Looping ripples */}
      <circle cx={0} cy={0} r={6} fill="none" stroke={stroke} strokeWidth={1.5} opacity={0.6}>
        <animate attributeName="r" from="6" to="22" dur="2.2s" repeatCount="indefinite" />
        <animate attributeName="opacity" from="0.6" to="0" dur="2.2s" repeatCount="indefinite" />
      </circle>
      <circle cx={0} cy={0} r={6} fill="none" stroke={stroke} strokeWidth={1.5} opacity={0.6}>
        <animate attributeName="r" from="6" to="22" dur="2.2s" begin="1.1s" repeatCount="indefinite" />
        <animate attributeName="opacity" from="0.6" to="0" dur="2.2s" begin="1.1s" repeatCount="indefinite" />
      </circle>

      {/* Medallion */}
      <circle
        cx={0}
        cy={0}
        r={hovered ? 8 : 5.5}
        fill="#fff"
        stroke={stroke}
        strokeWidth={hovered ? 3 : 2.5}
        style={{ transition: 'r 160ms, stroke-width 160ms' }}
      />
      {hovered && <circle cx={0} cy={0} r={2.5} fill={stroke} />}
    </g>
  );
}

// ───────── Access bloom popover (top-right) ─────────
function AccessBloom({ hovered }: { hovered: { river: ChartRiver; access: ChartAccess } }) {
  const { river, access } = hovered;
  const pillBg =
    access.type === 'put-in'  ? '#ecfccb' :
    access.type === 'take-out' ? '#fee2e2' : '#cffafe';
  const pillFg =
    access.type === 'put-in'  ? '#3f6212' :
    access.type === 'take-out' ? '#9f1239' : '#155e75';
  const pillBorder =
    access.type === 'put-in'  ? '#bef264' :
    access.type === 'take-out' ? '#fca5a5' : '#67e8f9';

  return (
    <div
      className="absolute top-4 right-4 w-[280px] z-20 pointer-events-none"
      style={{
        background: '#fff',
        border: '2px solid #1e3a4a',
        borderRadius: 8,
        boxShadow: '3px 3px 0 #6b7280',
        padding: 14,
        animation: 'rc-bloom-in 200ms cubic-bezier(.4,0,.2,1)',
      }}
    >
      <div
        style={{
          fontFamily: 'var(--font-mono), "Geist Mono", ui-monospace, monospace',
          fontSize: 10,
          letterSpacing: '.15em',
          textTransform: 'uppercase',
          color: '#6b7280',
        }}
      >
        {river.name} · access
      </div>
      <div
        style={{
          fontFamily: 'var(--font-display), Fredoka, system-ui, sans-serif',
          fontWeight: 600,
          fontSize: 22,
          color: '#0F2D35',
          lineHeight: 1.1,
          marginTop: 2,
        }}
      >
        {access.name}
      </div>
      <div
        style={{
          display: 'inline-block',
          marginTop: 8,
          fontFamily: 'var(--font-sans), system-ui, sans-serif',
          fontWeight: 700,
          fontSize: 11,
          padding: '3px 8px',
          borderRadius: 99,
          background: pillBg,
          color: pillFg,
          border: `1.5px solid ${pillBorder}`,
          textTransform: 'uppercase',
          letterSpacing: '.08em',
        }}
      >
        {access.type === 'both' ? 'put-in / take-out' : access.type}
      </div>
      <div style={{ fontSize: 13.5, color: '#374151', marginTop: 10, lineHeight: 1.5 }}>
        {access.notes}
      </div>
      <div
        style={{
          display: 'flex',
          gap: 12,
          marginTop: 12,
          fontFamily: 'var(--font-mono), "Geist Mono", ui-monospace, monospace',
          fontSize: 11,
          color: '#4b5563',
        }}
      >
        <div>
          <b style={{ color: '#0F2D35' }}>Class</b> {access.difficulty}
        </div>
        <div>
          <b style={{ color: '#0F2D35' }}>Lot</b> {access.lot}
        </div>
      </div>
      <div
        style={{
          marginTop: 10,
          fontFamily: 'var(--font-mono), "Geist Mono", ui-monospace, monospace',
          fontSize: 10,
          color: '#9ca3af',
          letterSpacing: '.08em',
        }}
      >
        click to open the {river.name} planner →
      </div>

      <style jsx>{`
        @keyframes rc-bloom-in {
          0%   { opacity: 0; transform: translateY(8px) scale(.96); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>
  );
}
