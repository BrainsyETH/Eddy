// river-map.jsx — the cartographic instrument itself.
//
// Renders an SVG-based stylized Ozark map: parchment basemap with hillshade,
// 7 rivers as flowing curves with particle systems, access points as bloomable
// medallions, and segment selection between consecutive access points.
//
// Props:
//   mode: "live" | "plan" | "discover"
//   onSelectSegment(segment | null)
//   onHoverAccess(access | null)
//   selectedSegment: { riverId, fromIdx, toIdx } | null
//   tweaks: { particleDensity, particleSpeed, palette, topo, rendering }
//   timeOffset: number — days back from "now" (0 = current). Restyles river levels.

const RM_W = 1600, RM_H = 1000;

// Parametric path sampling — get point + tangent at t∈[0,1] on an SVG path.
function sampleAt(pathEl, t) {
  if (!pathEl) return { x: 0, y: 0, angle: 0 };
  const len = pathEl.getTotalLength();
  const p = pathEl.getPointAtLength(len * t);
  const p2 = pathEl.getPointAtLength(Math.min(len, len * t + 0.5));
  return { x: p.x, y: p.y, angle: Math.atan2(p2.y - p.y, p2.x - p.x) };
}

// ───────── Hillshade / topo basemap ─────────
function ParchmentBasemap({ palette, topo }) {
  const isDusk = palette === "dusk";
  const isMoss = palette === "moss";
  const bg1 = isDusk ? "#2A2733" : isMoss ? "#3A4438" : "#F2EAD8";
  const bg2 = isDusk ? "#3A3645" : isMoss ? "#4D5A48" : "#E6DCBE";
  const grain = isDusk ? "rgba(255,255,255,.04)" : "rgba(105,80,40,.06)";
  const topoStroke = isDusk ? "rgba(200,180,210,.10)" : isMoss ? "rgba(220,210,170,.12)" : "rgba(120,90,40,.13)";

  return (
    <g>
      <defs>
        <radialGradient id="rm-vignette" cx="50%" cy="48%" r="70%">
          <stop offset="0%" stopColor={bg1} />
          <stop offset="70%" stopColor={bg2} />
          <stop offset="100%" stopColor={isDusk ? "#1A1822" : isMoss ? "#2A302A" : "#C9B98E"} />
        </radialGradient>
        <pattern id="rm-grain" width="180" height="180" patternUnits="userSpaceOnUse">
          {/* hand-stippled noise — random dots */}
          {Array.from({ length: 80 }).map((_, i) => {
            const seed = (i * 9301 + 49297) % 233280;
            const x = (seed % 180);
            const y = ((seed / 180) | 0) % 180;
            const r = ((seed % 7) / 10) + 0.3;
            return <circle key={i} cx={x} cy={y} r={r} fill={grain} />;
          })}
        </pattern>

        {/* Topo lines — concentric noisy curves suggesting hill ridges */}
        <pattern id="rm-topo" width="240" height="240" patternUnits="userSpaceOnUse">
          {[0, 1, 2, 3, 4].map(i => (
            <path key={i}
              d={`M -20 ${30 + i * 45} Q 60 ${10 + i * 45} 120 ${40 + i * 45} T 260 ${30 + i * 45}`}
              stroke={topoStroke} strokeWidth="0.7" fill="none" />
          ))}
          {[0, 1, 2].map(i => (
            <path key={"v" + i}
              d={`M ${40 + i * 70} -10 Q ${70 + i * 70} 80 ${50 + i * 70} 140 T ${40 + i * 70} 260`}
              stroke={topoStroke} strokeWidth="0.5" fill="none" opacity=".6" />
          ))}
        </pattern>
      </defs>

      <rect width={RM_W} height={RM_H} fill="url(#rm-vignette)" />
      {topo && <rect width={RM_W} height={RM_H} fill="url(#rm-topo)" />}
      <rect width={RM_W} height={RM_H} fill="url(#rm-grain)" />

      {/* Faint state-line / political boundary — Missouri-ish suggestion */}
      <path d="M 80 100 L 1500 80 L 1530 920 L 60 940 Z" fill="none"
        stroke={isDusk ? "rgba(255,255,255,.08)" : "rgba(80,60,30,.18)"}
        strokeWidth="2" strokeDasharray="6 8" />

      {/* "MISSOURI OZARKS" hand-drawn label, very faint */}
      <text x={RM_W / 2} y={80} textAnchor="middle"
        style={{
          fontFamily: "Fredoka, system-ui",
          fontSize: 28,
          letterSpacing: "0.4em",
          fill: isDusk ? "rgba(255,255,255,.12)" : "rgba(80,60,30,.20)",
          fontWeight: 500,
        }}>MISSOURI · OZARKS</text>
      <text x={RM_W / 2} y={970} textAnchor="middle"
        style={{
          fontFamily: "Geist Mono, monospace",
          fontSize: 11, letterSpacing: "0.35em",
          fill: isDusk ? "rgba(255,255,255,.18)" : "rgba(80,60,30,.30)",
        }}>EDDY · FIELD CHART · NO. VII</text>
    </g>
  );
}

// ───────── A single river: line + flowing particles + tag ─────────
function RiverPath({ river, level, paused, density, speed, hovered, dimmed, onHover, onClick, rendering, palette }) {
  const pathRef = React.useRef(null);
  const [particles, setParticles] = React.useState([]);
  const rafRef = React.useRef(0);

  // Init particles on mount or when density changes
  React.useEffect(() => {
    const path = pathRef.current;
    if (!path) return;
    const n = Math.round(level.density * density * 18);
    const init = Array.from({ length: n }, (_, i) => ({
      t: i / n + Math.random() * 0.02,
      seed: Math.random(),
    }));
    setParticles(init);
  }, [river.id, density, level.density]);

  // Animate
  React.useEffect(() => {
    if (paused) return;
    let last = performance.now();
    const tick = (now) => {
      const dt = (now - last) / 1000;
      last = now;
      setParticles(prev => prev.map(p => {
        let nt = p.t + dt * 0.04 * level.speed * speed * (0.85 + p.seed * 0.3);
        if (nt > 1) nt = nt - 1;
        return { ...p, t: nt };
      }));
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [paused, level.speed, speed]);

  // Render points by sampling current path
  const path = pathRef.current;
  const isDuskOrMoss = palette === "dusk" || palette === "moss";
  const ghostColor = isDuskOrMoss ? "rgba(255,255,255,.08)" : "rgba(80,60,30,.20)";

  // wavy "hand-drawn" duplicate offset paths, optional
  const handDrawn = rendering === "handdrawn";

  return (
    <g style={{
      opacity: dimmed ? 0.32 : 1,
      transition: "opacity 240ms cubic-bezier(.4,0,.2,1)",
      cursor: "pointer",
    }} onMouseEnter={() => onHover && onHover(river)} onMouseLeave={() => onHover && onHover(null)} onClick={() => onClick && onClick(river)}>

      {/* shadow/glow under the river */}
      <path d={river.path} stroke={level.glow} strokeWidth={level.weight + 8}
        strokeLinecap="round" fill="none" opacity={hovered ? 0.9 : 0.55} />

      {/* hand-drawn double stroke effect */}
      {handDrawn && (
        <path d={river.path} stroke={ghostColor} strokeWidth={level.weight + 1.5}
          strokeLinecap="round" fill="none" transform="translate(1.5, 1)" />
      )}

      {/* the river itself */}
      <path ref={pathRef} d={river.path}
        stroke={level.color} strokeWidth={level.weight}
        strokeLinecap="round" fill="none"
        style={{
          filter: hovered ? `drop-shadow(0 0 6px ${level.glow})` : "none",
          transition: "stroke-width 200ms",
        }} />

      {/* flow particles */}
      {path && particles.map((p, i) => {
        const s = sampleAt(path, p.t);
        const fade = Math.sin(p.t * Math.PI); // taper at ends
        // particle is a tiny tear-drop oriented downstream
        const len = 6 + level.speed * 4;
        return (
          <g key={i} transform={`translate(${s.x} ${s.y}) rotate(${(s.angle * 180) / Math.PI})`}
            style={{ pointerEvents: "none" }}>
            <ellipse cx={0} cy={0} rx={len} ry={1.4}
              fill="#fff" opacity={0.55 * fade} />
            <circle cx={len * 0.5} cy={0} r={1.6} fill="#fff" opacity={0.85 * fade} />
          </g>
        );
      })}

      {/* river name label */}
      <RiverLabel river={river} pathRef={pathRef} hovered={hovered} palette={palette} />
    </g>
  );
}

function RiverLabel({ river, pathRef, hovered, palette }) {
  const [pos, setPos] = React.useState(null);
  React.useEffect(() => {
    const compute = () => {
      const path = pathRef.current;
      if (!path) return false;
      const labelT = { current: 0.55, "jacks-fork": 0.5, "eleven-point": 0.45, meramec: 0.34, "big-piney": 0.55, niangua: 0.42, huzzah: 0.45 }[river.id] || 0.5;
      const s = sampleAt(path, labelT);
      const offsetN = -18;
      const nx = -Math.sin(s.angle), ny = Math.cos(s.angle);
      setPos({ x: s.x + nx * offsetN, y: s.y + ny * offsetN, angle: (s.angle * 180) / Math.PI });
      return true;
    };
    if (!compute()) {
      const raf = requestAnimationFrame(compute);
      return () => cancelAnimationFrame(raf);
    }
  }, [river.id, river.path]);
  if (!pos) return null;

  const isDuskOrMoss = palette === "dusk" || palette === "moss";
  const fill = isDuskOrMoss ? "rgba(255,255,255,.85)" : "var(--color-primary-900)";
  const stroke = isDuskOrMoss ? "rgba(0,0,0,.7)" : "rgba(255,255,255,.8)";

  // Keep text upright (don't flip when path angle is steep)
  let a = pos.angle;
  if (a > 90 || a < -90) a += 180;

  return (
    <g transform={`translate(${pos.x} ${pos.y}) rotate(${a})`} style={{ pointerEvents: "none" }}>
      <text textAnchor="middle"
        style={{
          fontFamily: "Fredoka, system-ui",
          fontSize: hovered ? 19 : 17,
          fontWeight: 600,
          fill,
          paintOrder: "stroke",
          stroke,
          strokeWidth: 4,
          strokeLinejoin: "round",
          letterSpacing: "0.02em",
          transition: "font-size 160ms",
        }}>
        {river.name}
      </text>
    </g>
  );
}

// ───────── Access point — ripple medallion ─────────
function AccessPoint({ river, idx, access, pathEl, isHovered, isInSegment, onHover, onClick, mode }) {
  const pos = React.useMemo(
    () => (pathEl ? sampleAt(pathEl, access.t) : null),
    [pathEl, access.t]
  );
  if (!pos) return null;

  const colorByType = {
    "put-in":   "var(--color-support-500)",
    "take-out": "var(--color-accent-500)",
    "both":     "var(--color-primary-500)",
  }[access.type];

  const showRipples = mode !== "discover" || isHovered;

  return (
    <g transform={`translate(${pos.x} ${pos.y})`}
      style={{ cursor: "pointer" }}
      onMouseEnter={() => onHover && onHover({ river, access, idx })}
      onMouseLeave={() => onHover && onHover(null)}
      onClick={(e) => { e.stopPropagation(); onClick && onClick({ river, access, idx }); }}>

      {/* ripples */}
      {showRipples && (
        <>
          <circle cx={0} cy={0} r={6} fill="none" stroke={colorByType} strokeWidth="1.5"
            opacity={0.6}>
            <animate attributeName="r" from="6" to="22" dur="2.2s" repeatCount="indefinite" />
            <animate attributeName="opacity" from="0.6" to="0" dur="2.2s" repeatCount="indefinite" />
          </circle>
          <circle cx={0} cy={0} r={6} fill="none" stroke={colorByType} strokeWidth="1.5"
            opacity={0.6}>
            <animate attributeName="r" from="6" to="22" dur="2.2s" begin="1.1s" repeatCount="indefinite" />
            <animate attributeName="opacity" from="0.6" to="0" dur="2.2s" begin="1.1s" repeatCount="indefinite" />
          </circle>
        </>
      )}

      {/* medallion — always rendered */}
      <circle cx={0} cy={0}
        r={isHovered ? 8 : isInSegment ? 7 : 5.5}
        fill="#fff"
        stroke={colorByType}
        strokeWidth={isHovered ? 3 : 2.5}
        style={{ transition: "r 160ms, stroke-width 160ms" }} />

      {isHovered && (
        <circle cx={0} cy={0} r={2.5} fill={colorByType} />
      )}
    </g>
  );
}

// ───────── Segments — drawn between hovered/selected access pairs ─────────
function SegmentOverlay({ river, level, fromIdx, toIdx, pathRef }) {
  const [d, setD] = React.useState("");
  React.useEffect(() => {
    const path = pathRef.current;
    if (!path) return;
    const len = path.getTotalLength();
    const t1 = river.access[fromIdx].t;
    const t2 = river.access[toIdx].t;
    const tMin = Math.min(t1, t2), tMax = Math.max(t1, t2);
    // sample many points between them
    const N = 40;
    let str = "";
    for (let i = 0; i <= N; i++) {
      const t = tMin + ((tMax - tMin) * i) / N;
      const p = path.getPointAtLength(len * t);
      str += `${i === 0 ? "M" : "L"}${p.x.toFixed(1)} ${p.y.toFixed(1)} `;
    }
    setD(str);
  }, [river.id, fromIdx, toIdx]);

  return (
    <g style={{ pointerEvents: "none" }}>
      <path d={d} stroke="var(--color-accent-500)" strokeWidth={level.weight + 7}
        strokeLinecap="round" fill="none" opacity={0.25} />
      <path d={d} stroke="var(--color-accent-600)" strokeWidth={level.weight + 1}
        strokeLinecap="round" fill="none" opacity={0.95}
        strokeDasharray="14 10">
        <animate attributeName="stroke-dashoffset" from="0" to="-48" dur="2.4s" repeatCount="indefinite" />
      </path>
    </g>
  );
}

// ───────── Eddy swimming the selected segment (the surprise!) ─────────
function EddySwimmer({ river, fromIdx, toIdx, pathRef }) {
  const [pos, setPos] = React.useState(null);
  React.useEffect(() => {
    const path = pathRef.current;
    if (!path) return;
    let raf;
    const t1 = river.access[fromIdx].t;
    const t2 = river.access[toIdx].t;
    const tStart = Math.min(t1, t2);
    const tEnd = Math.max(t1, t2);
    const startTime = performance.now();
    const dur = 6000;
    const tick = (now) => {
      const u = ((now - startTime) % dur) / dur;
      const t = tStart + (tEnd - tStart) * u;
      const s = sampleAt(path, t);
      setPos({ x: s.x, y: s.y, angle: (s.angle * 180) / Math.PI, u });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [river.id, fromIdx, toIdx]);
  if (!pos) return null;

  return (
    <g transform={`translate(${pos.x} ${pos.y}) rotate(${pos.angle})`} style={{ pointerEvents: "none" }}>
      {/* wake */}
      <ellipse cx={-22} cy={0} rx={18} ry={3} fill="#fff" opacity={0.5} />
      <ellipse cx={-32} cy={-3} rx={10} ry={1.5} fill="#fff" opacity={0.3} />
      <ellipse cx={-32} cy={3} rx={10} ry={1.5} fill="#fff" opacity={0.3} />
      {/* canoe */}
      <ellipse cx={0} cy={0} rx={14} ry={5}
        fill="var(--color-secondary-500)" stroke="var(--color-primary-900)" strokeWidth="1.5" />
      {/* eddy mascot dot */}
      <circle cx={2} cy={0} r={3.2} fill="var(--color-accent-500)" stroke="var(--color-primary-900)" strokeWidth="1" />
      {/* paddle */}
      <line x1={2} y1={0} x2={10} y2={-9} stroke="var(--color-primary-900)" strokeWidth="1.4" />
    </g>
  );
}

// ───────── The map root ─────────
function RiverMap({ mode, hoveredAccess, setHoveredAccess, selectedSegment, setSelectedSegment, hoveredRiver, setHoveredRiver, tweaks, levelOverrides }) {
  const pathRefs = React.useRef({});
  const RIVERS = window.RIVERS;
  const LEVELS = window.RIVER_LEVELS;

  const onAccessClick = ({ river, idx }) => {
    // Selection logic: first click sets "from" on this river; second click sets "to" if same river.
    if (!selectedSegment || selectedSegment.riverId !== river.id) {
      setSelectedSegment({ riverId: river.id, fromIdx: idx, toIdx: idx });
    } else if (selectedSegment.fromIdx === selectedSegment.toIdx) {
      setSelectedSegment({ riverId: river.id, fromIdx: selectedSegment.fromIdx, toIdx: idx });
    } else {
      // Reset to single-point
      setSelectedSegment({ riverId: river.id, fromIdx: idx, toIdx: idx });
    }
  };

  const segRiver = selectedSegment ? RIVERS.find(r => r.id === selectedSegment.riverId) : null;
  const segIsRange = selectedSegment && selectedSegment.fromIdx !== selectedSegment.toIdx;

  return (
    <svg viewBox={`0 0 ${RM_W} ${RM_H}`} preserveAspectRatio="xMidYMid slice"
      style={{ width: "100%", height: "100%", display: "block", background: "#000" }}
      onClick={() => setSelectedSegment(null)}>

      <ParchmentBasemap palette={tweaks.palette} topo={tweaks.topo} />

      {/* All rivers */}
      {RIVERS.map(river => {
        const lvl = levelOverrides[river.id] || river.level;
        const level = LEVELS[lvl];
        const isHovered = hoveredRiver && hoveredRiver.id === river.id;
        const isSeg = selectedSegment && selectedSegment.riverId === river.id;
        const dimmed = (hoveredRiver && !isHovered) || (selectedSegment && !isSeg);
        return (
          <RiverPath key={river.id}
            river={river} level={level}
            paused={mode === "paused"}
            density={tweaks.particleDensity}
            speed={tweaks.particleSpeed}
            hovered={isHovered || isSeg}
            dimmed={!!dimmed}
            onHover={setHoveredRiver}
            rendering={tweaks.rendering}
            palette={tweaks.palette}
            // assign ref via callback
            ref={el => { /* refs handled inside via internal ref */ }} />
        );
      })}

      {/* Segment overlay (drawn over the river but under the access points) */}
      {segIsRange && (() => {
        // Need the rendered path ref — easiest: re-query a hidden ref via id
        return <SegmentOverlayById river={segRiver}
          level={LEVELS[levelOverrides[segRiver.id] || segRiver.level]}
          fromIdx={selectedSegment.fromIdx} toIdx={selectedSegment.toIdx} />;
      })()}

      {/* Eddy swimming the segment */}
      {segIsRange && (
        <EddySwimmerById river={segRiver}
          fromIdx={selectedSegment.fromIdx} toIdx={selectedSegment.toIdx} />
      )}

      {/* Access points (only in live + plan modes; subtle in discover) */}
      {RIVERS.map(river => (
        <AccessLayer key={river.id} river={river}
          mode={mode}
          hoveredAccess={hoveredAccess}
          selectedSegment={selectedSegment}
          onHover={setHoveredAccess}
          onClick={onAccessClick}
          dimmed={(hoveredRiver && hoveredRiver.id !== river.id) || (selectedSegment && selectedSegment.riverId !== river.id)} />
      ))}
    </svg>
  );
}

// Wrapper components that own a hidden path ref so SegmentOverlay/Swimmer can sample it.
// We keep one invisible "geometry" path per river outside the visible rendering.
function GeometryPaths() {
  return (
    <svg style={{ position: "absolute", width: 0, height: 0 }} aria-hidden="true">
      {window.RIVERS.map(r => (
        <path key={r.id} id={`geom-${r.id}`} d={r.path} />
      ))}
    </svg>
  );
}

function SegmentOverlayById({ river, level, fromIdx, toIdx }) {
  const ref = React.useRef(document.getElementById(`geom-${river.id}`));
  React.useEffect(() => { ref.current = document.getElementById(`geom-${river.id}`); }, [river.id]);
  if (!ref.current) ref.current = document.getElementById(`geom-${river.id}`);
  return <SegmentOverlay river={river} level={level} fromIdx={fromIdx} toIdx={toIdx} pathRef={ref} />;
}

function EddySwimmerById({ river, fromIdx, toIdx }) {
  const ref = React.useRef(document.getElementById(`geom-${river.id}`));
  React.useEffect(() => { ref.current = document.getElementById(`geom-${river.id}`); }, [river.id]);
  if (!ref.current) ref.current = document.getElementById(`geom-${river.id}`);
  return <EddySwimmer river={river} fromIdx={fromIdx} toIdx={toIdx} pathRef={ref} />;
}

function AccessLayer({ river, mode, hoveredAccess, selectedSegment, onHover, onClick, dimmed }) {
  // Resolve the geometry path element synchronously by id, so positions compute on first render.
  const [pathEl, setPathEl] = React.useState(() => document.getElementById(`geom-${river.id}`));
  React.useEffect(() => {
    let el = document.getElementById(`geom-${river.id}`);
    if (el) { setPathEl(el); return; }
    // Geometry layer might not be mounted yet — retry next frame
    const raf = requestAnimationFrame(() => {
      setPathEl(document.getElementById(`geom-${river.id}`));
    });
    return () => cancelAnimationFrame(raf);
  }, [river.id]);

  return (
    <g style={{ opacity: dimmed ? 0.3 : 1, transition: "opacity 240ms", pointerEvents: dimmed ? "none" : "auto" }}>
      {pathEl && river.access.map((access, idx) => {
        const isHovered = hoveredAccess && hoveredAccess.river.id === river.id && hoveredAccess.idx === idx;
        const inSeg = selectedSegment && selectedSegment.riverId === river.id &&
          (idx === selectedSegment.fromIdx || idx === selectedSegment.toIdx);
        return (
          <AccessPoint key={idx} river={river} idx={idx} access={access} pathEl={pathEl}
            isHovered={isHovered} isInSegment={inSeg}
            mode={mode} onHover={onHover} onClick={onClick} />
        );
      })}
    </g>
  );
}

// Forward-ref: RiverPath needs a ref, but we route refs via the geometry layer.
// So redefine RiverPath without forwardRef (was using internal ref already).

window.RiverMap = RiverMap;
window.GeometryPaths = GeometryPaths;
