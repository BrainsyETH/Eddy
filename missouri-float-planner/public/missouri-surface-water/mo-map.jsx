// mo-map.jsx — statewide Missouri river instrument.
// SVG basemap (state silhouette + cities), all rivers as percentile-colored
// strokes with stream-order weight, animated particles only on rising or
// peak (>P75) gauges. Click a river to drill into its gauge detail.

const MO_W = 1600, MO_H = 1000;

function sampleAt(pathEl, t) {
  if (!pathEl) return { x: 0, y: 0, angle: 0 };
  const len = pathEl.getTotalLength();
  const p = pathEl.getPointAtLength(len * t);
  const p2 = pathEl.getPointAtLength(Math.min(len, len * t + 0.5));
  return { x: p.x, y: p.y, angle: Math.atan2(p2.y - p.y, p2.x - p.x) };
}

function colorForPercentile(p) {
  const cls = window.classifyPercentile(p);
  return cls.color;
}

function MOBasemap() {
  return (
    <g>
      <defs>
        <radialGradient id="mo-bg" cx="50%" cy="50%" r="75%">
          <stop offset="0%" stopColor="#F2EAD8" />
          <stop offset="65%" stopColor="#E6DCBE" />
          <stop offset="100%" stopColor="#C9B98E" />
        </radialGradient>
        <pattern id="mo-grain" width="180" height="180" patternUnits="userSpaceOnUse">
          {Array.from({ length: 70 }).map((_, i) => {
            const seed = (i * 9301 + 49297) % 233280;
            const x = seed % 180, y = ((seed / 180) | 0) % 180;
            const r = ((seed % 7) / 10) + 0.3;
            return <circle key={i} cx={x} cy={y} r={r} fill="rgba(105,80,40,.07)" />;
          })}
        </pattern>
      </defs>

      <rect width={MO_W} height={MO_H} fill="#1F1A14" />
      {/* state silhouette */}
      <path d={window.MO_STATE_OUTLINE}
        fill="url(#mo-bg)"
        stroke="rgba(80,60,30,.55)"
        strokeWidth="2.5"
        strokeLinejoin="round" />
      <path d={window.MO_STATE_OUTLINE} fill="url(#mo-grain)" />

      {/* faint title */}
      <text x={MO_W / 2} y={48} textAnchor="middle"
        style={{
          fontFamily: "Geist Mono, monospace",
          fontSize: 13, letterSpacing: "0.45em",
          fill: "rgba(80,60,30,.5)", fontWeight: 500,
        }}>STATE OF MISSOURI · SURFACE WATER NETWORK</text>
    </g>
  );
}

function CityDots() {
  return (
    <g>
      {window.MO_CITIES.map(c => (
        <g key={c.name} transform={`translate(${c.x} ${c.y})`}>
          <circle r={c.type === "metro" ? 4 : 2.5}
            fill="rgba(45,42,36,.7)"
            stroke="rgba(247,246,243,.85)" strokeWidth="1.5" />
          <text x={c.type === "metro" ? 9 : 7} y={4}
            style={{
              fontFamily: "Geist Mono, monospace",
              fontSize: c.type === "metro" ? 11 : 9.5,
              fontWeight: c.type === "metro" ? 600 : 400,
              fill: "rgba(45,42,36,.75)",
              letterSpacing: "0.04em",
              paintOrder: "stroke",
              stroke: "rgba(242,234,216,.85)",
              strokeWidth: 3,
              strokeLinejoin: "round",
            }}>{c.name}</text>
        </g>
      ))}
    </g>
  );
}

// One river path + particles + label
function RiverLine({ river, snapshot, hovered, dimmed, onHover, onClick, animate, focused }) {
  const pathRef = React.useRef(null);
  const [particles, setParticles] = React.useState([]);
  const rafRef = React.useRef(0);

  // River percentile = mean of its gauges
  const riverP = window.riverPercentileFromSnapshot(river.id, snapshot);
  const color = colorForPercentile(riverP);
  const isFloatable = !!window.MO_FLOATER[river.id];
  const verdict = isFloatable ? window.floaterVerdict(river.id) : null;
  const verdictTone = verdict ? window.MO_STAGE_VERDICTS[verdict] : null;
  // Floatable rivers get extra weight to register on the map
  const weight = (0.8 + (river.order - 3) * 0.9) * (isFloatable ? 1.4 : 1);

  // Particles only when in active range (>P60 or focused/hovered or floatable+prime/pushy)
  const isActive = riverP >= 60 || hovered || focused ||
    (isFloatable && (verdict === "prime" || verdict === "pushy"));

  React.useEffect(() => {
    if (!isActive || !animate) { setParticles([]); return; }
    const n = Math.round(2 + river.order * 1.2);
    setParticles(Array.from({ length: n }, (_, i) => ({
      t: i / n + Math.random() * 0.05, seed: Math.random(),
    })));
  }, [river.id, isActive, animate, river.order]);

  React.useEffect(() => {
    if (!isActive || !animate || particles.length === 0) return;
    let last = performance.now();
    const speed = 0.04 + (riverP / 100) * 0.10;
    const tick = (now) => {
      const dt = (now - last) / 1000; last = now;
      setParticles(prev => prev.map(p => {
        let nt = p.t + dt * speed * (0.8 + p.seed * 0.4);
        if (nt > 1) nt -= 1;
        return { ...p, t: nt };
      }));
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [isActive, animate, particles.length, riverP]);

  const path = pathRef.current;

  return (
    <g style={{
      opacity: dimmed ? 0.22 : 1,
      transition: "opacity 240ms",
      cursor: "pointer",
    }}
      onMouseEnter={() => onHover && onHover(river)}
      onMouseLeave={() => onHover && onHover(null)}
      onClick={(e) => { e.stopPropagation(); onClick && onClick(river); }}>

      {/* hit area — thicker invisible stroke */}
      <path d={river.path} stroke="transparent" strokeWidth={Math.max(14, weight * 3)}
        fill="none" strokeLinecap="round" />

      {/* glow when hovered/focused */}
      {(hovered || focused) && (
        <path d={river.path} stroke={color} strokeWidth={weight + 7}
          opacity="0.35" strokeLinecap="round" fill="none"
          style={{ filter: `drop-shadow(0 0 6px ${color})` }} />
      )}

      <path ref={pathRef} d={river.path}
        stroke={color} strokeWidth={weight}
        strokeLinecap="round" fill="none" />

      {/* Floater inner stroke — a parallel inset line colored by stage verdict */}
      {isFloatable && verdictTone && (
        <path d={river.path}
          stroke={verdictTone.inner} strokeWidth={Math.max(1.2, weight * 0.42)}
          strokeLinecap="round" fill="none"
          strokeDasharray={verdict === "hazard" ? "4 3" : "none"}
          opacity={hovered || focused ? 1 : 0.92} />
      )}

      {/* Dam-controlled marker — small triangular tick at midpoint */}
      {isFloatable && window.MO_FLOATER[river.id].damControlled && pathRef.current && (
        <DamMarker pathRef={pathRef} />
      )}

      {/* particles */}
      {path && particles.map((p, i) => {
        const s = sampleAt(path, p.t);
        const fade = Math.sin(p.t * Math.PI);
        const len = 4 + river.order * 0.5;
        return (
          <g key={i} transform={`translate(${s.x} ${s.y}) rotate(${(s.angle * 180) / Math.PI})`}
            style={{ pointerEvents: "none" }}>
            <ellipse cx="0" cy="0" rx={len} ry="0.9" fill="#fff" opacity={0.55 * fade} />
            <circle cx={len * 0.5} cy="0" r="1.1" fill="#fff" opacity={0.9 * fade} />
          </g>
        );
      })}

      {/* label, only for order ≥5 or hovered/focused */}
      {(river.order >= 5 || hovered || focused) && (
        <RiverLineLabel river={river} pathRef={pathRef} hovered={hovered || focused} />
      )}
    </g>
  );
}

function DamMarker({ pathRef }) {
  const [pos, setPos] = React.useState(null);
  React.useEffect(() => {
    const path = pathRef.current;
    if (!path) return;
    setPos(sampleAt(path, 0.08));
  }, []);
  if (!pos) return null;
  return (
    <g transform={`translate(${pos.x} ${pos.y})`} style={{ pointerEvents: "none" }}>
      <polygon points="-5,-5 5,-5 0,5" fill="#1F1A14" stroke="#F2EAD8" strokeWidth="1.3" />
    </g>
  );
}

function RiverLineLabel({ river, pathRef, hovered }) {  const [pos, setPos] = React.useState(null);
  React.useEffect(() => {
    const compute = () => {
      const path = pathRef.current;
      if (!path) return false;
      const s = sampleAt(path, 0.5);
      const offsetN = -(8 + river.order);
      const nx = -Math.sin(s.angle), ny = Math.cos(s.angle);
      setPos({ x: s.x + nx * offsetN, y: s.y + ny * offsetN, angle: (s.angle * 180) / Math.PI });
      return true;
    };
    if (!compute()) {
      const raf = requestAnimationFrame(compute);
      return () => cancelAnimationFrame(raf);
    }
  }, [river.id]);
  if (!pos) return null;
  let a = pos.angle;
  if (a > 90 || a < -90) a += 180;
  const fontSize = hovered ? 13 : Math.max(9, 6 + river.order);
  return (
    <g transform={`translate(${pos.x} ${pos.y}) rotate(${a})`} style={{ pointerEvents: "none" }}>
      <text textAnchor="middle"
        style={{
          fontFamily: "Geist Mono, monospace",
          fontSize, fontWeight: hovered ? 700 : 500,
          fill: "rgba(20,24,30,.85)",
          letterSpacing: "0.04em",
          paintOrder: "stroke",
          stroke: "rgba(242,234,216,.9)", strokeWidth: 3.5, strokeLinejoin: "round",
        }}>{river.name.replace(" River", "").replace(" Creek", " Cr.")}</text>
    </g>
  );
}

// Gauge dots — visible at all times, glow when above P75
function GaugeDots({ snapshot, focusedRiver, onHoverGauge, onClickGauge, hoveredGauge }) {
  return (
    <g>
      {window.MO_RIVERS.map(river => {
        const dimmed = focusedRiver && focusedRiver.id !== river.id;
        return (
          <g key={river.id} style={{ opacity: dimmed ? 0.25 : 1, transition: "opacity 200ms" }}>
            {snapshot[river.id].map((g, i) => (
              <GaugeDot key={g.id} river={river} gauge={g} idx={i}
                hovered={hoveredGauge && hoveredGauge.id === g.id}
                onHover={onHoverGauge} onClick={onClickGauge} />
            ))}
          </g>
        );
      })}
    </g>
  );
}

function GaugeDot({ river, gauge, idx, hovered, onHover, onClick }) {
  const [pos, setPos] = React.useState(null);
  React.useEffect(() => {
    const path = document.getElementById(`mo-geom-${river.id}`);
    if (!path) {
      const raf = requestAnimationFrame(() => {
        const p = document.getElementById(`mo-geom-${river.id}`);
        if (p) setPos(sampleAt(p, gauge.t));
      });
      return () => cancelAnimationFrame(raf);
    }
    setPos(sampleAt(path, gauge.t));
  }, [river.id, gauge.t]);
  if (!pos) return null;
  const color = colorForPercentile(gauge.percentile);
  const isPeak = gauge.percentile >= 75;
  return (
    <g transform={`translate(${pos.x} ${pos.y})`}
      style={{ cursor: "pointer" }}
      onMouseEnter={() => onHover && onHover({ river, gauge })}
      onMouseLeave={() => onHover && onHover(null)}
      onClick={(e) => { e.stopPropagation(); onClick && onClick({ river, gauge }); }}>
      {isPeak && (
        <circle r={5} fill="none" stroke={color} strokeWidth="1.2" opacity="0.7">
          <animate attributeName="r" from="5" to="14" dur="2.2s" repeatCount="indefinite" />
          <animate attributeName="opacity" from="0.7" to="0" dur="2.2s" repeatCount="indefinite" />
        </circle>
      )}
      <circle r={hovered ? 6 : 3.5} fill="#fff"
        stroke={color} strokeWidth={hovered ? 2.5 : 1.8}
        style={{ transition: "r 140ms" }} />
      {hovered && <circle r="1.6" fill={color} />}
    </g>
  );
}

function GeometryPaths() {
  return (
    <svg style={{ position: "absolute", width: 0, height: 0 }} aria-hidden="true">
      {window.MO_RIVERS.map(r => (
        <path key={r.id} id={`mo-geom-${r.id}`} d={r.path} />
      ))}
    </svg>
  );
}

function FloaterCard({ river }) {
  if (!river) return null;
  const fp = window.MO_FLOATER[river.id];
  if (!fp) return null;
  const verdict = window.floaterVerdict(river.id);
  const tone = window.MO_STAGE_VERDICTS[verdict];
  const forecast = window.stageForecast(river.id, 0);
  const stage = fp.baseStage;
  const bands = fp.stageBands;
  // Build stage gauge — 0 to hazard*1.2
  const max = bands.hazard * 1.2;
  const pct = (v) => Math.min(100, (v / max) * 100);
  return (
    <div style={{
      position: "absolute", right: 14, top: 110, width: 340, zIndex: 7,
      background: "rgba(247,246,243,.97)",
      border: "1.5px solid rgba(45,42,36,.5)", borderRadius: 4, padding: 16,
      boxShadow: "4px 4px 0 rgba(45,42,36,.45)",
      fontFamily: "Geist, sans-serif",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontFamily: "Geist Mono", fontSize: 9.5, letterSpacing: ".18em", textTransform: "uppercase", color: "rgba(45,42,36,.55)" }}>
          Floater profile
        </div>
        {fp.damControlled && (
          <span style={{
            fontFamily: "Geist Mono", fontSize: 9, letterSpacing: ".12em", textTransform: "uppercase",
            background: "#1F1A14", color: "#E6DCBE", padding: "2px 6px", borderRadius: 2,
          }}>▲ Dam-controlled</span>
        )}
      </div>
      <div style={{ fontSize: 19, fontWeight: 700, color: "#1F1A14", marginTop: 4 }}>
        {fp.label}
      </div>
      <div style={{ fontFamily: "Geist Mono", fontSize: 10.5, color: "rgba(45,42,36,.65)", marginTop: 2 }}>
        Class {fp.classRating} · {fp.milesTypical} mi typical · {fp.popularPutIn} → {fp.popularTakeOut}
      </div>

      <div style={{
        marginTop: 12, padding: "8px 12px",
        background: tone.color, color: "#fff", borderRadius: 3,
        display: "flex", alignItems: "baseline", gap: 10,
      }}>
        <span style={{ fontFamily: "Geist Mono", fontSize: 22, fontWeight: 700, lineHeight: 1 }}>
          {stage.toFixed(2)} ft
        </span>
        <span style={{ fontFamily: "Geist Mono", fontSize: 11, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase" }}>
          {tone.label}
        </span>
        <span style={{ fontFamily: "Geist", fontSize: 11, opacity: .85, marginLeft: "auto" }}>{tone.desc}</span>
      </div>

      {/* Stage band gauge */}
      <div style={{ marginTop: 12 }}>
        <div style={{ fontFamily: "Geist Mono", fontSize: 9, letterSpacing: ".15em", textTransform: "uppercase", color: "rgba(45,42,36,.6)", marginBottom: 4 }}>
          Stage bands (ft)
        </div>
        <div style={{ position: "relative", height: 22, background: "#F4EFE7", border: "1px solid rgba(45,42,36,.18)", borderRadius: 2 }}>
          <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${pct(bands.bony)}%`, background: "rgba(184,157,114,.5)" }} />
          <div style={{ position: "absolute", left: `${pct(bands.bony)}%`, top: 0, bottom: 0, width: `${pct(bands.pushy) - pct(bands.bony)}%`, background: "rgba(78,184,107,.5)" }} />
          <div style={{ position: "absolute", left: `${pct(bands.pushy)}%`, top: 0, bottom: 0, width: `${pct(bands.hazard) - pct(bands.pushy)}%`, background: "rgba(62,143,184,.5)" }} />
          <div style={{ position: "absolute", left: `${pct(bands.hazard)}%`, top: 0, right: 0, bottom: 0, background: "rgba(220,38,38,.5)" }} />
          <div style={{ position: "absolute", left: `${pct(stage)}%`, top: -2, bottom: -2, width: 2, background: "#1F1A14" }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 3, fontFamily: "Geist Mono", fontSize: 8.5, color: "rgba(45,42,36,.55)" }}>
          <span>0</span><span>{bands.bony}</span><span>{bands.pushy}</span><span>{bands.hazard}+</span>
        </div>
      </div>

      {/* Forecast + temp + rain */}
      <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
        <FStat label="Water temp" value={`${fp.tempF}°F`} />
        <FStat label="Days dry" value={fp.daysSinceRain} sub={fp.daysSinceRain >= 5 ? "clear" : fp.daysSinceRain <= 1 ? "muddy" : "ok"} />
        <FStat label="3-day forecast" value={`${forecast[2]}`} sub="ft" />
      </div>

      {/* Mini forecast line */}
      <div style={{ marginTop: 10, padding: 8, background: "#F4EFE7", border: "1px solid rgba(45,42,36,.15)", borderRadius: 3 }}>
        <div style={{ fontFamily: "Geist Mono", fontSize: 9, letterSpacing: ".12em", textTransform: "uppercase", color: "rgba(45,42,36,.55)", marginBottom: 4 }}>
          NWS AHPS · 72-hr stage
        </div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 32 }}>
          {[stage, ...forecast].map((v, i) => {
            const h = (v / max) * 30;
            const isFc = i > 0;
            return (
              <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                <div style={{
                  width: "100%", height: h, background: isFc ? "rgba(45,120,137,.5)" : tone.color,
                  border: isFc ? "1px dashed rgba(45,120,137,.7)" : "none",
                  borderRadius: 1,
                }} />
                <div style={{ fontFamily: "Geist Mono", fontSize: 8, color: "rgba(45,42,36,.6)" }}>
                  {i === 0 ? "now" : `+${i}d`}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ marginTop: 10, fontFamily: "Geist", fontSize: 11.5, color: "rgba(45,42,36,.75)", lineHeight: 1.4, fontStyle: "italic" }}>
        {fp.note}
      </div>
    </div>
  );
}

function FStat({ label, value, sub }) {
  return (
    <div style={{ background: "#F4EFE7", border: "1px solid rgba(45,42,36,.15)", borderRadius: 3, padding: "6px 8px" }}>
      <div style={{ fontFamily: "Geist Mono", fontSize: 8.5, letterSpacing: ".1em", textTransform: "uppercase", color: "rgba(45,42,36,.55)" }}>{label}</div>
      <div style={{ fontFamily: "Geist Mono", fontSize: 15, fontWeight: 700, color: "#1F1A14", marginTop: 2 }}>
        {value} {sub && <span style={{ fontSize: 10, fontWeight: 500, color: "rgba(45,42,36,.6)" }}>{sub}</span>}
      </div>
    </div>
  );
}

window.FloaterCard = FloaterCard;

function MOMap({ snapshot, hoveredRiver, setHoveredRiver, focusedRiver, setFocusedRiver,
  hoveredGauge, setHoveredGauge, setFocusedGauge, animate }) {
  return (
    <svg viewBox={`0 0 ${MO_W} ${MO_H}`} preserveAspectRatio="xMidYMid meet"
      style={{ width: "100%", height: "100%", display: "block", background: "#1F1A14" }}
      onClick={() => { setFocusedRiver(null); setFocusedGauge(null); }}>
      <MOBasemap />
      <CityDots />
      {/* render lower-order first so big rivers paint on top */}
      {[...window.MO_RIVERS].sort((a, b) => a.order - b.order).map(river => {
        const isHovered = hoveredRiver && hoveredRiver.id === river.id;
        const isFocused = focusedRiver && focusedRiver.id === river.id;
        const dimmed = (focusedRiver && !isFocused) || (hoveredRiver && !isHovered && !isFocused);
        return (
          <RiverLine key={river.id} river={river} snapshot={snapshot}
            hovered={isHovered} focused={isFocused} dimmed={!!dimmed}
            onHover={setHoveredRiver}
            onClick={(r) => setFocusedRiver(r)}
            animate={animate} />
        );
      })}
      <GaugeDots snapshot={snapshot}
        focusedRiver={focusedRiver}
        hoveredGauge={hoveredGauge}
        onHoverGauge={setHoveredGauge}
        onClickGauge={({ gauge }) => setFocusedGauge(gauge)} />
    </svg>
  );
}

window.MOMap = MOMap;
window.GeometryPaths = GeometryPaths;
window.colorForPercentile = colorForPercentile;
