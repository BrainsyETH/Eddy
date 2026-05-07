'use client';

// Pure SVG implementation of the Missouri Surface Water map.
//
// We deliberately do NOT use MapLibre / vector tiles / glyph PBFs / sprites
// here. Real Supabase geometry is projected from WGS84 into a 1600x1000 SVG
// viewBox via a simple Albers-like equal-area projection centered on
// Missouri. This sidesteps the entire CSP/glyph/style-validation surface
// MapLibre brings, and matches the Claude Design reference visually.
//
// Particles ride along the rendered <path> elements using
// getTotalLength() + getPointAtLength(), the same trick the design uses.

import { useEffect, useRef, useMemo } from 'react';
import {
  PERCENTILE_CLASSES,
  STAGE_VERDICTS,
  classifyPercentile,
  type MORiver,
  type MOCampground,
  type StageVerdict,
} from '@/lib/usgs/mo-statewide-data';
import type { MoStatewideGauge } from '@/app/api/usgs/mo-statewide/route';

// ─── Projection ─────────────────────────────────────────────────────────
//
// The viewBox is fixed at 1600×1000 but the projection window is computed
// at runtime from the bounding box of the actual data (rivers + gauges +
// campgrounds), so the canvas auto-frames to wherever the data actually
// lives. The state silhouette renders in the same projection and is
// allowed to overflow the viewBox; it gets clipped naturally by SVG.

const W = 1600;
const H = 1000;
const PADDING = 60;

type Projector = (lon: number, lat: number) => [number, number];

function buildProjector(bbox: {
  minLon: number;
  maxLon: number;
  minLat: number;
  maxLat: number;
}): Projector {
  const lonSpan = bbox.maxLon - bbox.minLon || 0.001;
  const latSpan = bbox.maxLat - bbox.minLat || 0.001;
  const centerLon = (bbox.minLon + bbox.maxLon) / 2;
  const centerLat = (bbox.minLat + bbox.maxLat) / 2;
  const cosLat = Math.cos((centerLat * Math.PI) / 180);

  const innerW = W - 2 * PADDING;
  const innerH = H - 2 * PADDING;
  const scaleByLon = innerW / lonSpan;
  const scaleByLat = innerH / (latSpan / cosLat);
  const scale = Math.min(scaleByLon, scaleByLat);

  return (lon, lat) => {
    const x = (lon - centerLon) * scale + W / 2;
    const y = -(lat - centerLat) * (scale / cosLat) + H / 2;
    return [x, y];
  };
}

function lineToPath(coords: Array<[number, number]>, project: Projector): string {
  if (!coords.length) return '';
  return coords
    .map(([lon, lat], i) => {
      const [x, y] = project(lon, lat);
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(' ');
}

function polygonToPath(coords: Array<[number, number]>, project: Projector): string {
  return lineToPath(coords, project) + ' Z';
}

// ─── Static geometry ────────────────────────────────────────────────────

// Hand-traced TIGER 2023 outline, ~80 vertices.
const MO_OUTLINE: Array<[number, number]> = [
  [-95.77, 40.58], [-95.36, 40.50], [-94.94, 40.49], [-94.63, 40.57],
  [-94.23, 40.57], [-93.78, 40.58], [-93.32, 40.58], [-92.86, 40.59],
  [-92.39, 40.60], [-91.93, 40.61], [-91.71, 40.61],
  [-91.50, 40.40], [-91.42, 40.20], [-91.36, 40.00], [-91.43, 39.83],
  [-91.51, 39.60], [-91.43, 39.40], [-91.30, 39.18],
  [-91.05, 39.00], [-90.74, 38.87], [-90.35, 38.72], [-90.20, 38.59],
  [-90.18, 38.45], [-90.30, 38.27], [-90.27, 38.10], [-90.15, 37.95],
  [-89.99, 37.79], [-89.83, 37.61], [-89.65, 37.43], [-89.52, 37.25],
  [-89.50, 37.07], [-89.51, 36.88], [-89.42, 36.70],
  [-89.29, 36.62], [-89.20, 36.50], [-89.13, 36.38], [-89.18, 36.23],
  [-89.27, 36.08], [-89.49, 36.00], [-89.69, 36.00],
  [-90.07, 36.00], [-90.30, 36.00], [-90.50, 36.50],
  [-90.80, 36.50], [-91.20, 36.50], [-91.50, 36.50], [-91.80, 36.50],
  [-92.10, 36.50], [-92.40, 36.50], [-92.85, 36.50], [-93.30, 36.50],
  [-93.70, 36.50], [-94.10, 36.50], [-94.45, 36.50], [-94.62, 36.50],
  [-94.61, 36.85], [-94.61, 37.20], [-94.62, 37.55], [-94.62, 37.90],
  [-94.61, 38.25], [-94.61, 38.55], [-94.61, 38.85], [-94.61, 39.10],
  [-94.65, 39.30], [-94.78, 39.45], [-94.95, 39.55], [-95.13, 39.62],
  [-95.32, 39.70], [-95.45, 39.83], [-95.55, 39.97], [-95.62, 40.12],
  [-95.69, 40.27], [-95.74, 40.42], [-95.77, 40.58],
];

const CITIES: Array<{ name: string; lon: number; lat: number; type: 'metro' | 'city' }> = [
  { name: 'Kansas City',   lon: -94.578, lat: 39.099, type: 'metro' },
  { name: 'St. Louis',     lon: -90.199, lat: 38.627, type: 'metro' },
  { name: 'Springfield',   lon: -93.298, lat: 37.209, type: 'metro' },
  { name: 'Columbia',      lon: -92.334, lat: 38.952, type: 'metro' },
  { name: 'Jefferson City',lon: -92.173, lat: 38.577, type: 'city'  },
  { name: 'Cape Girardeau',lon: -89.518, lat: 37.306, type: 'city'  },
  { name: 'Joplin',        lon: -94.513, lat: 37.084, type: 'city'  },
];

// ─── Component ──────────────────────────────────────────────────────────

interface MOMapProps {
  rivers: MORiver[];
  campgrounds: MOCampground[];
  gauges: MoStatewideGauge[];
  verdictByRiver: Record<string, StageVerdict>;
  percentileByRiver: Record<string, number | null>;
  percentileByGauge: Record<string, number | null>;
  hoveredRiverId: string | null;
  focusedRiverId: string | null;
  hoveredGaugeId: string | null;
  focusedGaugeId: string | null;
  showCampgrounds: boolean;
  showAccessPoints: boolean;
  showPOIs: boolean;
  onHoverRiver: (id: string | null) => void;
  onFocusRiver: (id: string | null) => void;
  onHoverGauge: (id: string | null) => void;
  onFocusGauge: (id: string | null) => void;
  onClickCampground: (id: string | null) => void;
  onClickAccessPoint: (id: string | null) => void;
  onClickPoi: (id: string | null) => void;
}

const POI_TONES: Record<string, string> = {
  spring: '#1D525F',
  cave: '#3D3425',
  historical_site: '#7A684B',
  scenic_viewpoint: '#347A47',
  waterfall: '#256574',
  geological: '#5C4E38',
  other: '#524D43',
};

function colorForPercentile(p: number | null | undefined): string {
  if (p == null || isNaN(p)) return '#857D70';
  return classifyPercentile(p).color;
}

function strokeWidthForRiver(
  lengthMiles: number | null | undefined,
  hovered: boolean,
  focused: boolean,
): number {
  // Wider base than before — at this zoom level, 2px lines disappear.
  // Length-weighted: longer rivers paint as the trunk, smaller as tributaries.
  const m = lengthMiles ?? 60;
  const base = Math.max(4, Math.min(8, 3.5 + m / 35));
  if (focused) return base + 3.5;
  if (hovered) return base + 2;
  return base;
}

export default function MOMap(props: MOMapProps) {
  // ── Compute projection window from data bbox ───────────────────────────
  const bbox = useMemo(() => {
    let minLon = Infinity, maxLon = -Infinity;
    let minLat = Infinity, maxLat = -Infinity;
    const include = (lon: number, lat: number) => {
      if (lon < minLon) minLon = lon;
      if (lon > maxLon) maxLon = lon;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    };

    for (const r of props.rivers) {
      for (const [lon, lat] of r.geometry.coordinates as Array<[number, number]>) {
        include(lon, lat);
      }
      for (const g of r.gauges ?? []) include(g.lon, g.lat);
      for (const a of r.access_points ?? []) include(a.lon, a.lat);
    }
    for (const c of props.campgrounds) include(c.lon, c.lat);

    // Fall back to the full state if we somehow have no data points.
    if (!isFinite(minLon)) {
      minLon = -95.77; maxLon = -89.13; minLat = 36.0; maxLat = 40.61;
    }

    // 8% padding on each side so geometry doesn't kiss the edge.
    const lonPad = (maxLon - minLon) * 0.08 + 0.05;
    const latPad = (maxLat - minLat) * 0.08 + 0.05;
    return {
      minLon: minLon - lonPad,
      maxLon: maxLon + lonPad,
      minLat: minLat - latPad,
      maxLat: maxLat + latPad,
    };
  }, [props.rivers, props.campgrounds]);

  const project = useMemo(() => buildProjector(bbox), [bbox]);

  const stateOutlinePath = useMemo(
    () => polygonToPath(MO_OUTLINE, project),
    [project],
  );
  const riverPaths = useMemo(() => {
    const out: Record<string, string> = {};
    for (const r of props.rivers) {
      out[r.id] = lineToPath(r.geometry.coordinates as Array<[number, number]>, project);
    }
    return out;
  }, [props.rivers, project]);

  // Cities visible in the framed area (plus a small buffer outside, so the
  // nearest metro still anchors the user's orientation).
  const visibleCities = useMemo(() => {
    const lonBuf = (bbox.maxLon - bbox.minLon) * 0.18;
    const latBuf = (bbox.maxLat - bbox.minLat) * 0.18;
    return CITIES.filter(
      (c) =>
        c.lon >= bbox.minLon - lonBuf &&
        c.lon <= bbox.maxLon + lonBuf &&
        c.lat >= bbox.minLat - latBuf &&
        c.lat <= bbox.maxLat + latBuf,
    );
  }, [bbox]);

  // ─── Particles ─────────────────────────────────────────────────────────
  // For each river that's "active" (mean percentile ≥ 60 or hovered/focused
  // or floatable+prime/pushy), seed N particles. On every frame walk each
  // particle's t, sample the rendered <path>'s point, and render as small
  // <circle>s. The DOM <path> elements have stable ids so we can grab them.
  const particlesContainerRef = useRef<SVGGElement | null>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    type P = { riverId: string; t: number; speed: number };
    const particles: P[] = [];
    for (const r of props.rivers) {
      const p = props.percentileByRiver[r.slug] ?? 50;
      const verdict = props.verdictByRiver[r.slug];
      const isActive =
        p >= 60 ||
        props.hoveredRiverId === r.id ||
        props.focusedRiverId === r.id ||
        verdict === 'prime' ||
        verdict === 'pushy';
      if (!isActive) continue;
      const n = p < 25 ? 2 : p < 75 ? 4 : 7;
      for (let i = 0; i < n; i++) {
        particles.push({
          riverId: r.id,
          t: i / n + Math.random() * 0.04,
          speed: 0.04 + (p / 100) * 0.08 + Math.random() * 0.02,
        });
      }
    }

    let last = performance.now();
    const draw = () => {
      const now = performance.now();
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;

      const g = particlesContainerRef.current;
      if (!g) {
        rafRef.current = requestAnimationFrame(draw);
        return;
      }

      // Clear and redraw all particles.
      while (g.firstChild) g.removeChild(g.firstChild);

      for (const p of particles) {
        p.t += p.speed * dt;
        if (p.t > 1) p.t -= 1;

        const path = document.getElementById(
          `mo-river-path-${p.riverId}`,
        ) as SVGPathElement | null;
        if (!path) continue;

        const len = path.getTotalLength();
        if (!len) continue;
        const pt = path.getPointAtLength(p.t * len);

        const verdict = props.verdictByRiver[
          props.rivers.find((r) => r.id === p.riverId)?.slug ?? ''
        ];
        const tone =
          verdict === 'prime'  ? STAGE_VERDICTS.prime.inner :
          verdict === 'pushy'  ? STAGE_VERDICTS.pushy.inner :
          verdict === 'hazard' ? STAGE_VERDICTS.hazard.inner :
          verdict === 'bony'   ? STAGE_VERDICTS.bony.inner :
          '#F2EAD8';

        const c1 = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        c1.setAttribute('cx', `${pt.x}`);
        c1.setAttribute('cy', `${pt.y}`);
        c1.setAttribute('r', '4');
        c1.setAttribute('fill', tone);
        c1.setAttribute('opacity', '0.55');
        g.appendChild(c1);

        const c2 = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        c2.setAttribute('cx', `${pt.x}`);
        c2.setAttribute('cy', `${pt.y}`);
        c2.setAttribute('r', '1.6');
        c2.setAttribute('fill', '#FAF8F4');
        g.appendChild(c2);
      }

      rafRef.current = requestAnimationFrame(draw);
    };
    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [
    props.rivers,
    props.percentileByRiver,
    props.verdictByRiver,
    props.hoveredRiverId,
    props.focusedRiverId,
  ]);

  // Sort rivers so lower-order paint underneath higher-order, and the
  // hovered/focused one always renders last (on top).
  const orderedRivers = useMemo(() => {
    return [...props.rivers].sort((a, b) => {
      const aTop = a.id === props.hoveredRiverId || a.id === props.focusedRiverId;
      const bTop = b.id === props.hoveredRiverId || b.id === props.focusedRiverId;
      if (aTop && !bTop) return 1;
      if (bTop && !aTop) return -1;
      return (a.length_miles ?? 0) - (b.length_miles ?? 0);
    });
  }, [props.rivers, props.hoveredRiverId, props.focusedRiverId]);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="xMidYMid meet"
      className="absolute inset-0 h-full w-full"
      onClick={(e) => {
        // Empty-area click clears focus.
        if (e.target === e.currentTarget) {
          props.onFocusRiver(null);
          props.onFocusGauge(null);
          props.onClickCampground(null);
          props.onClickAccessPoint(null);
          props.onClickPoi(null);
        }
      }}
    >
      <defs>
        <radialGradient id="mo-bg" cx="50%" cy="50%" r="85%">
          <stop offset="0%" stopColor="#F4ECDB" />
          <stop offset="60%" stopColor="#EADFC2" />
          <stop offset="100%" stopColor="#D4C394" />
        </radialGradient>
        <pattern id="mo-grain" width="180" height="180" patternUnits="userSpaceOnUse">
          {Array.from({ length: 70 }).map((_, i) => {
            const seed = (i * 9301 + 49297) % 233280;
            const x = seed % 180;
            const y = ((seed / 180) | 0) % 180;
            const r = ((seed % 7) / 10) + 0.3;
            return <circle key={i} cx={x} cy={y} r={r} fill="rgba(105,80,40,0.07)" />;
          })}
        </pattern>
        {/* Clip path so the parchment fill respects MO's borders even when
            the silhouette overflows the viewBox. */}
        <clipPath id="mo-clip">
          <path d={stateOutlinePath} />
        </clipPath>
      </defs>

      {/* Backdrop (matches Eddy primary-900) */}
      <rect width={W} height={H} fill="#0F2D35" />

      {/* State silhouette — parchment fill, clipped to state, plus a stroked
          border for definition. The state path may extend off-canvas; SVG
          clips it naturally. */}
      <g clipPath="url(#mo-clip)">
        <rect width={W} height={H} fill="url(#mo-bg)" />
        <rect width={W} height={H} fill="url(#mo-grain)" />
      </g>
      <path
        d={stateOutlinePath}
        fill="none"
        stroke="rgba(80,60,30,0.55)"
        strokeWidth={2.5}
        strokeLinejoin="round"
      />

      {/* Title */}
      <text
        x={W / 2}
        y={48}
        textAnchor="middle"
        fontFamily="var(--font-mono), ui-monospace, monospace"
        fontSize={13}
        letterSpacing="0.45em"
        fill="rgba(80,60,30,0.5)"
        fontWeight={500}
      >
        STATE OF MISSOURI · SURFACE WATER NETWORK
      </text>

      {/* Cities */}
      <g>
        {visibleCities.map((c) => {
          const [cx, cy] = project(c.lon, c.lat);
          return (
            <g key={c.name} transform={`translate(${cx} ${cy})`}>
              <circle
                r={c.type === 'metro' ? 5 : 3.5}
                fill="rgba(45,42,36,0.78)"
                stroke="rgba(247,246,243,0.9)"
                strokeWidth={1.5}
              />
              <text
                x={c.type === 'metro' ? 10 : 8}
                y={5}
                fontFamily="var(--font-mono), ui-monospace, monospace"
                fontSize={c.type === 'metro' ? 13 : 11}
                fontWeight={c.type === 'metro' ? 700 : 500}
                fill="rgba(45,42,36,0.85)"
                paintOrder="stroke"
                stroke="rgba(242,234,216,0.92)"
                strokeWidth={3}
                strokeLinejoin="round"
              >
                {c.name}
              </text>
            </g>
          );
        })}
      </g>

      {/* Rivers — outer "casing" + main stroke + verdict inner stroke */}
      {orderedRivers.map((r) => {
        const d = riverPaths[r.id];
        if (!d) return null;
        const slug = r.slug;
        const percentile = props.percentileByRiver[slug];
        const verdict = props.verdictByRiver[slug];
        const color = colorForPercentile(percentile);
        const isHovered = props.hoveredRiverId === r.id;
        const isFocused = props.focusedRiverId === r.id;
        const sw = strokeWidthForRiver(r.length_miles, isHovered, isFocused);
        const verdictTone =
          verdict === 'prime'  ? STAGE_VERDICTS.prime.inner :
          verdict === 'pushy'  ? STAGE_VERDICTS.pushy.inner :
          verdict === 'hazard' ? STAGE_VERDICTS.hazard.inner :
          verdict === 'bony'   ? STAGE_VERDICTS.bony.inner :
          'transparent';
        const dim =
          (props.focusedRiverId && !isFocused) ||
          (props.hoveredRiverId && !isHovered && !isFocused);

        return (
          <g
            key={r.id}
            style={{ opacity: dim ? 0.32 : 1, transition: 'opacity 200ms', cursor: 'pointer' }}
            onMouseEnter={() => props.onHoverRiver(r.id)}
            onMouseLeave={() => props.onHoverRiver(null)}
            onClick={(e) => {
              e.stopPropagation();
              props.onFocusRiver(r.id);
            }}
          >
            {/* Hit target */}
            <path d={d} stroke="transparent" strokeWidth={Math.max(18, sw * 3)} fill="none" strokeLinecap="round" />
            {/* Glow */}
            {(isHovered || isFocused) && (
              <path
                d={d}
                stroke={color}
                strokeWidth={sw + 7}
                fill="none"
                strokeLinecap="round"
                opacity={0.35}
                style={{ filter: `drop-shadow(0 0 6px ${color})` }}
              />
            )}
            {/* Main stroke */}
            <path
              id={`mo-river-path-${r.id}`}
              d={d}
              stroke={color}
              strokeWidth={sw}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {/* Verdict inner stroke */}
            {verdict !== 'unknown' && verdictTone !== 'transparent' && (
              <path
                d={d}
                stroke={verdictTone}
                strokeWidth={Math.max(1.2, sw * 0.42)}
                fill="none"
                strokeLinecap="round"
                strokeDasharray={verdict === 'hazard' ? '4 3' : undefined}
                opacity={isHovered || isFocused ? 1 : 0.92}
              />
            )}
          </g>
        );
      })}

      {/* Particles (continuously redrawn by the RAF effect above) */}
      <g ref={particlesContainerRef} pointerEvents="none" />

      {/* Gauges */}
      <g>
        {props.gauges.map((g) => {
          const r = props.rivers.find((x) => x.id === g.river_id);
          const gauge = r?.gauges?.find((x) => x.site_id === g.site_no);
          if (!gauge) return null;
          const [x, y] = project(gauge.lon, gauge.lat);
          const p = props.percentileByGauge[g.site_no] ?? g.percentile;
          const color = colorForPercentile(p);
          const isPeak = p != null && p >= 75;
          const isHovered = props.hoveredGaugeId === g.site_no;
          const isFocused = props.focusedGaugeId === g.site_no;
          return (
            <g
              key={g.site_no}
              transform={`translate(${x} ${y})`}
              style={{ cursor: 'pointer' }}
              onMouseEnter={() => props.onHoverGauge(g.site_no)}
              onMouseLeave={() => props.onHoverGauge(null)}
              onClick={(e) => {
                e.stopPropagation();
                props.onFocusGauge(g.site_no);
              }}
            >
              {isPeak && (
                <circle r={5} fill="none" stroke={color} strokeWidth={1.2} opacity={0.7}>
                  <animate attributeName="r" from="5" to="14" dur="2.2s" repeatCount="indefinite" />
                  <animate attributeName="opacity" from="0.7" to="0" dur="2.2s" repeatCount="indefinite" />
                </circle>
              )}
              <circle
                r={isFocused ? 8 : isHovered ? 7 : g.is_primary ? 6 : 4}
                fill="#FAF8F4"
                stroke={color}
                strokeWidth={g.is_primary ? 2.5 : 1.8}
              />
              {(isHovered || isFocused) && <circle r={1.8} fill={color} />}
            </g>
          );
        })}
      </g>

      {/* Access points */}
      {props.showAccessPoints && (
        <g>
          {props.rivers.flatMap((r) =>
            (r.access_points ?? []).map((a) => {
              const [x, y] = project(a.lon, a.lat);
              return (
                <g
                  key={a.id}
                  transform={`translate(${x} ${y})`}
                  style={{ cursor: 'pointer' }}
                  onClick={(e) => {
                    e.stopPropagation();
                    props.onClickAccessPoint(a.id);
                  }}
                >
                  <circle r={4} fill="#4EB86B" stroke="#F2EAD8" strokeWidth={1.5} />
                </g>
              );
            }),
          )}
        </g>
      )}

      {/* Campgrounds */}
      {props.showCampgrounds && (
        <g>
          {props.campgrounds.map((c) => {
            const [x, y] = project(c.lon, c.lat);
            const r = c.total_sites != null ? Math.min(10, 4 + c.total_sites / 25) : 4;
            return (
              <g
                key={c.id}
                transform={`translate(${x} ${y})`}
                style={{ cursor: 'pointer' }}
                onClick={(e) => {
                  e.stopPropagation();
                  props.onClickCampground(c.id);
                }}
              >
                <circle r={r} fill="#7A684B" stroke="#F2EAD8" strokeWidth={2} opacity={0.95} />
              </g>
            );
          })}
        </g>
      )}

      {/* POIs */}
      {props.showPOIs && (
        <g>
          {props.rivers.flatMap((r) =>
            (r.pois ?? []).map((p) => {
              const [x, y] = project(p.lon, p.lat);
              const tone = POI_TONES[p.type] ?? '#524D43';
              return (
                <g
                  key={p.id}
                  transform={`translate(${x} ${y})`}
                  style={{ cursor: 'pointer' }}
                  onClick={(e) => {
                    e.stopPropagation();
                    props.onClickPoi(p.id);
                  }}
                >
                  <circle r={5.5} fill={tone} stroke="#FAF8F4" strokeWidth={2} />
                </g>
              );
            }),
          )}
        </g>
      )}

      {/* Period of record footer note */}
      <text
        x={W - 14}
        y={H - 14}
        textAnchor="end"
        fontFamily="var(--font-mono), ui-monospace, monospace"
        fontSize={10}
        fill="rgba(80,60,30,0.55)"
      >
        Geometry: USGS NHD via Supabase · Live data: USGS NWIS
      </text>

      {/* Reference key for percentile coloring */}
      <text
        x={14}
        y={H - 14}
        fontFamily="var(--font-mono), ui-monospace, monospace"
        fontSize={9}
        letterSpacing="0.1em"
        fill="rgba(80,60,30,0.55)"
      >
        Stream colour: percentile vs. period of record · {PERCENTILE_CLASSES.length} bands
      </text>
    </svg>
  );
}
