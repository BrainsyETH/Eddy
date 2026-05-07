// map-ui.jsx — overlay UI: top brand bar, mode switcher, river drawer,
// access point bloom, segment summary, Eddy Says verdict, and the gauge tape (the surprise).

const FLOAT_RATE_MPH = { bony: 0.8, skinny: 1.4, prime: 2.2, pushy: 3.5, blown: 4.5 };

function formatFloatTime(miles, level) {
  const mph = FLOAT_RATE_MPH[level] || 2.2;
  const hours = miles / mph;
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return `${h}h ${m.toString().padStart(2, "0")}m`;
}

// Stylized-coord distance → pretend miles (1 svg unit ≈ 0.018 mi to land in the right ballpark)
function svgToMiles(svgUnits) { return Math.max(0.5, svgUnits * 0.018); }

function pathLengthBetween(riverId, fromIdx, toIdx) {
  const el = document.getElementById(`geom-${riverId}`);
  if (!el) return 0;
  const total = el.getTotalLength();
  const river = window.RIVERS.find(r => r.id === riverId);
  const t1 = river.access[fromIdx].t;
  const t2 = river.access[toIdx].t;
  return Math.abs(t2 - t1) * total;
}

// ───────── Brand bar (top) ─────────
function BrandBar({ mode, setMode }) {
  const modes = [
    { id: "live",     label: "Live",      sub: "USGS now" },
    { id: "plan",     label: "Plan",      sub: "trips & shuttles" },
    { id: "discover", label: "Discover",  sub: "wander" },
  ];
  return (
    <div style={{
      position: "absolute", top: 16, left: 16, right: 16,
      display: "flex", alignItems: "center", justifyContent: "space-between",
      pointerEvents: "none", zIndex: 5,
    }}>
      {/* Left: brand */}
      <div style={{
        display: "flex", alignItems: "center", gap: 12,
        background: "rgba(15,45,53,.92)", color: "#fff",
        border: "2px solid var(--color-primary-900)",
        borderRadius: 10, padding: "8px 14px 8px 8px",
        boxShadow: "3px 3px 0 var(--color-accent-600)",
        pointerEvents: "auto",
        backdropFilter: "blur(6px)",
      }}>
        <img src="assets/Eddy_favicon.png" width="36" height="36"
          style={{ borderRadius: 6, border: "1px solid rgba(255,255,255,.3)" }} />
        <div>
          <div style={{ fontFamily: "Fredoka", fontWeight: 700, fontSize: 20, lineHeight: 1, color: "var(--color-accent-500)" }}>Eddy</div>
          <div style={{ fontFamily: "Geist Mono", fontSize: 9.5, letterSpacing: ".2em", textTransform: "uppercase", color: "rgba(255,255,255,.65)", marginTop: 3 }}>
            Field Chart · Ozarks
          </div>
        </div>
      </div>

      {/* Center: mode switcher */}
      <div style={{
        display: "flex", gap: 0,
        background: "rgba(247,246,243,.96)",
        border: "2px solid var(--color-primary-900)",
        borderRadius: 10, padding: 4,
        boxShadow: "3px 3px 0 var(--color-neutral-500)",
        pointerEvents: "auto",
      }}>
        {modes.map(m => {
          const active = mode === m.id;
          return (
            <button key={m.id} onClick={() => setMode(m.id)}
              style={{
                appearance: "none", border: "none", cursor: "pointer",
                background: active ? "var(--color-primary-800)" : "transparent",
                color: active ? "#fff" : "var(--color-primary-800)",
                padding: "6px 16px", borderRadius: 6,
                display: "flex", flexDirection: "column", alignItems: "center", gap: 1,
                transition: "background 160ms",
                minWidth: 100,
              }}>
              <span style={{ fontFamily: "Fredoka", fontWeight: 600, fontSize: 15, lineHeight: 1.1 }}>{m.label}</span>
              <span style={{
                fontFamily: "Geist Mono", fontSize: 9, letterSpacing: ".15em",
                textTransform: "uppercase",
                color: active ? "rgba(255,255,255,.7)" : "var(--color-neutral-500)",
              }}>{m.sub}</span>
            </button>
          );
        })}
      </div>

      {/* Right: time/legend */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10,
        background: "rgba(247,246,243,.96)",
        border: "2px solid var(--color-primary-900)",
        borderRadius: 10, padding: "6px 12px",
        boxShadow: "3px 3px 0 var(--color-neutral-500)",
        pointerEvents: "auto",
        fontFamily: "Geist Mono", fontSize: 11, color: "var(--color-primary-900)",
      }}>
        <span style={{ width: 8, height: 8, borderRadius: 99, background: "var(--color-support-500)", boxShadow: "0 0 6px var(--color-support-500)" }} />
        <span style={{ letterSpacing: ".08em" }}>USGS · live</span>
      </div>
    </div>
  );
}

// ───────── River roster (left) — only in plan/live ─────────
function RiverRoster({ rivers, levelOverrides, hoveredRiver, setHoveredRiver, selectedSegment, setSelectedSegment }) {
  const LEVELS = window.RIVER_LEVELS;
  return (
    <div style={{
      position: "absolute", left: 16, top: 96, bottom: 96, width: 280,
      background: "rgba(247,246,243,.96)",
      border: "2px solid var(--color-primary-800)",
      boxShadow: "3px 3px 0 var(--color-neutral-500)",
      borderRadius: 10, padding: 14, zIndex: 4,
      display: "flex", flexDirection: "column", gap: 10,
      overflowY: "auto",
    }}>
      <div>
        <div style={{ fontFamily: "Geist Mono", fontSize: 10, letterSpacing: ".15em", textTransform: "uppercase", color: "var(--color-neutral-500)" }}>The Seven</div>
        <div style={{ fontFamily: "Fredoka", fontWeight: 600, fontSize: 22, color: "var(--color-primary-800)", lineHeight: 1.1, marginTop: 2 }}>
          Ozark Rivers
        </div>
      </div>
      {rivers.map(river => {
        const lvl = levelOverrides[river.id] || river.level;
        const level = LEVELS[lvl];
        const active = (hoveredRiver && hoveredRiver.id === river.id) || (selectedSegment && selectedSegment.riverId === river.id);
        return (
          <div key={river.id}
            onMouseEnter={() => setHoveredRiver(river)}
            onMouseLeave={() => setHoveredRiver(null)}
            onClick={() => {
              setSelectedSegment({ riverId: river.id, fromIdx: 0, toIdx: river.access.length - 1 });
            }}
            style={{
              padding: "8px 10px", border: `2px solid ${active ? "var(--color-accent-500)" : "var(--color-neutral-200)"}`,
              borderRadius: 6, cursor: "pointer", background: active ? "var(--color-secondary-50)" : "#fff",
              transition: "all 160ms",
            }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
              <div style={{ fontFamily: "Fredoka", fontWeight: 600, fontSize: 15, color: "var(--color-primary-900)" }}>{river.name}</div>
              <span style={{
                fontFamily: "Geist Mono", fontSize: 10, fontWeight: 700,
                color: level.color, padding: "2px 6px", borderRadius: 99,
                border: `1.5px solid ${level.color}`, background: "rgba(255,255,255,.6)",
                whiteSpace: "nowrap",
              }}>● {level.label}</span>
            </div>
            <div style={{ fontFamily: "Geist Mono", fontSize: 10, color: "var(--color-neutral-500)", marginTop: 3 }}>
              {river.gauge.reading} · {river.gauge.cfs} · {river.gauge.trend}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ───────── Access bloom (hover popover) ─────────
function AccessBloom({ hoveredAccess }) {
  if (!hoveredAccess) return null;
  const { river, access } = hoveredAccess;
  return (
    <div style={{
      position: "absolute", right: 16, top: 96, width: 280,
      background: "#fff",
      border: "2px solid var(--color-primary-800)",
      borderRadius: 8,
      boxShadow: "3px 3px 0 var(--color-neutral-500)",
      padding: 14, zIndex: 6,
      animation: "bloom-in 200ms cubic-bezier(.4,0,.2,1)",
    }}>
      <div style={{ fontFamily: "Geist Mono", fontSize: 10, letterSpacing: ".15em", textTransform: "uppercase", color: "var(--color-neutral-500)" }}>
        {river.name} · access
      </div>
      <div style={{ fontFamily: "Fredoka", fontWeight: 600, fontSize: 22, color: "var(--color-primary-900)", lineHeight: 1.1, marginTop: 2 }}>
        {access.name}
      </div>
      <div style={{
        display: "inline-block", marginTop: 8,
        fontFamily: "Geist", fontWeight: 700, fontSize: 11,
        padding: "3px 8px", borderRadius: 99,
        background: access.type === "put-in" ? "var(--color-support-100)" :
                    access.type === "take-out" ? "var(--color-accent-100)" : "var(--color-primary-100)",
        color: access.type === "put-in" ? "var(--color-support-700)" :
               access.type === "take-out" ? "var(--color-accent-700)" : "var(--color-primary-700)",
        border: `1.5px solid ${access.type === "put-in" ? "var(--color-support-300)" : access.type === "take-out" ? "var(--color-accent-300)" : "var(--color-primary-300)"}`,
        textTransform: "uppercase", letterSpacing: ".08em",
      }}>
        {access.type === "both" ? "put-in / take-out" : access.type}
      </div>
      <div style={{ fontSize: 13.5, color: "var(--color-neutral-700)", marginTop: 10, lineHeight: 1.5 }}>
        {access.notes}
      </div>
      <div style={{ display: "flex", gap: 12, marginTop: 12, fontFamily: "Geist Mono", fontSize: 11, color: "var(--color-neutral-600)" }}>
        <div><b style={{ color: "var(--color-primary-900)" }}>Class</b> {access.difficulty}</div>
        <div><b style={{ color: "var(--color-primary-900)" }}>Lot</b> {access.lot}</div>
      </div>
      <div style={{ marginTop: 10, fontFamily: "Geist Mono", fontSize: 10, color: "var(--color-neutral-400)", letterSpacing: ".08em" }}>
        click to start a segment from here →
      </div>
    </div>
  );
}

// ───────── Segment summary (bottom, when range selected) ─────────
function SegmentSummary({ selectedSegment, levelOverrides, onClear }) {
  if (!selectedSegment) return null;
  const river = window.RIVERS.find(r => r.id === selectedSegment.riverId);
  const lvl = levelOverrides[river.id] || river.level;
  const level = window.RIVER_LEVELS[lvl];
  const range = selectedSegment.fromIdx !== selectedSegment.toIdx;
  const a = river.access[selectedSegment.fromIdx];
  const b = river.access[selectedSegment.toIdx];

  if (!range) {
    return (
      <div style={{
        position: "absolute", left: "50%", bottom: 130,
        transform: "translateX(-50%)",
        background: "var(--color-primary-900)", color: "#fff",
        border: "2px solid var(--color-primary-900)",
        borderRadius: 8, padding: "10px 16px",
        boxShadow: "3px 3px 0 var(--color-accent-600)",
        fontFamily: "Geist", fontSize: 13, zIndex: 5,
        display: "flex", alignItems: "center", gap: 10,
      }}>
        <span style={{ fontFamily: "Fredoka", fontWeight: 600, color: "var(--color-accent-300)" }}>{a.name}</span>
        <span style={{ opacity: .6 }}>· now click another access on the {river.name} →</span>
      </div>
    );
  }

  const lenSvg = pathLengthBetween(river.id, selectedSegment.fromIdx, selectedSegment.toIdx);
  const miles = svgToMiles(lenSvg);
  const time = formatFloatTime(miles, lvl);
  const fromAcc = selectedSegment.fromIdx < selectedSegment.toIdx ? a : b;
  const toAcc = selectedSegment.fromIdx < selectedSegment.toIdx ? b : a;

  return (
    <div style={{
      position: "absolute", left: 16, right: 16, bottom: 130,
      pointerEvents: "none", display: "flex", justifyContent: "center", zIndex: 5,
    }}>
      <div style={{
        background: "var(--color-secondary-50)",
        border: "3px solid var(--color-primary-800)",
        borderRadius: 12, padding: "14px 20px",
        boxShadow: "4px 4px 0 var(--color-accent-600)",
        display: "flex", alignItems: "center", gap: 24,
        pointerEvents: "auto",
        animation: "bloom-in 240ms cubic-bezier(.4,0,.2,1)",
      }}>
        <div>
          <div style={{ fontFamily: "Geist Mono", fontSize: 10, letterSpacing: ".15em", textTransform: "uppercase", color: "var(--color-neutral-500)" }}>
            Float on the {river.name}
          </div>
          <div style={{ fontFamily: "Fredoka", fontWeight: 600, fontSize: 22, color: "var(--color-primary-900)", lineHeight: 1.1, marginTop: 2 }}>
            {fromAcc.name}<span style={{ color: "var(--color-accent-600)", margin: "0 10px" }}>→</span>{toAcc.name}
          </div>
        </div>
        <div style={{ width: 1, height: 44, background: "var(--color-neutral-300)" }} />
        <Stat label="Distance" value={miles.toFixed(1)} unit="mi" />
        <Stat label={`Float time @ ${level.label}`} value={time} unit="" />
        <Stat label="Class" value={`${a.difficulty}–${b.difficulty}`.replace(/(\w+)–\1/, "$1")} unit="" />
        <Stat label="Conditions" value={level.label} unit="" tone={level.color} />
        <button onClick={onClear} style={{
          appearance: "none", border: "2px solid var(--color-primary-800)",
          background: "#fff", color: "var(--color-primary-800)",
          fontFamily: "Geist", fontWeight: 600, fontSize: 12,
          padding: "6px 12px", borderRadius: 6, cursor: "pointer",
          boxShadow: "2px 2px 0 var(--color-neutral-400)",
        }}>Clear</button>
      </div>
    </div>
  );
}
function Stat({ label, value, unit, tone }) {
  return (
    <div>
      <div style={{ fontFamily: "Geist Mono", fontSize: 9.5, letterSpacing: ".15em", textTransform: "uppercase", color: "var(--color-neutral-500)" }}>{label}</div>
      <div style={{ fontFamily: "Geist Mono", fontWeight: 600, fontSize: 22, color: tone || "var(--color-primary-900)", lineHeight: 1.1, marginTop: 2 }}>
        {value}{unit ? <span style={{ fontSize: 13, color: "var(--color-neutral-500)", marginLeft: 3 }}>{unit}</span> : null}
      </div>
    </div>
  );
}

// ───────── Eddy Says (live mode, when a river is hovered or selected) ─────────
function EddySays({ river, levelOverrides }) {
  if (!river) return null;
  const lvl = levelOverrides[river.id] || river.level;
  const level = window.RIVER_LEVELS[lvl];
  const verdictColor = {
    float: "var(--cond-flowing-fg)",
    wait:  "var(--cond-low-fg)",
    danger:"var(--cond-danger-fg)",
  }[level.verdict];
  const verdictBg = {
    float: "var(--cond-flowing-bg)",
    wait:  "var(--cond-low-bg)",
    danger:"var(--cond-danger-bg)",
  }[level.verdict];
  return (
    <div style={{
      position: "absolute", right: 16, bottom: 130, width: 320,
      background: "var(--color-secondary-50)",
      border: "2px solid var(--color-primary-800)",
      borderRadius: 12, padding: 14, zIndex: 5,
      boxShadow: "3px 3px 0 var(--color-accent-600)",
      display: "flex", gap: 12,
    }}>
      <img src="assets/Eddy_favicon.png" width="56" height="56"
        style={{ borderRadius: 8, border: "2px solid var(--color-primary-800)", flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <span style={{ fontFamily: "Geist Mono", fontSize: 9.5, letterSpacing: ".15em", textTransform: "uppercase", color: "var(--color-neutral-500)" }}>Eddy says</span>
          <span style={{
            background: verdictBg, color: verdictColor,
            border: `1.5px solid ${verdictColor}`,
            borderRadius: 99, padding: "1px 8px",
            fontFamily: "Geist", fontWeight: 700, fontSize: 10.5, textTransform: "uppercase", letterSpacing: ".08em",
          }}>{level.verdict === "float" ? "Float!" : level.verdict === "wait" ? "Wait." : "Stay off."}</span>
        </div>
        <div style={{ fontFamily: "Fredoka", fontWeight: 600, fontSize: 15, color: "var(--color-primary-900)", marginTop: 6, lineHeight: 1.35 }}>
          {river.voice}
        </div>
        <div style={{ fontFamily: "Geist Mono", fontSize: 10, color: "var(--color-neutral-500)", marginTop: 6, letterSpacing: ".06em" }}>
          USGS #{river.gauge.id} · {river.gauge.site}
        </div>
      </div>
    </div>
  );
}

// ───────── Gauge tape — the surprise (bottom strip) ─────────
// Scrubbable 30-day timeline. Shifts each river's level retroactively based
// on synthetic rain events, so the whole chart "remembers" how the system flowed.
function GaugeTape({ timeOffset, setTimeOffset, levelOverrides }) {
  // Synthetic rain events: each is { day, intensity, riversBoosted }
  const RAIN = [
    { day: -27, intensity: 0.6, scope: ["meramec", "huzzah"] },
    { day: -22, intensity: 1.4, scope: "all" },
    { day: -14, intensity: 0.9, scope: ["current", "jacks-fork", "eleven-point"] },
    { day: -8,  intensity: 0.5, scope: ["niangua", "big-piney"] },
    { day: -3,  intensity: 1.1, scope: "all" },
  ];
  const days = 30;
  const W = 100; // percentage
  const ticks = Array.from({ length: 31 });

  return (
    <div style={{
      position: "absolute", left: 16, right: 16, bottom: 16,
      background: "rgba(15,45,53,.94)",
      border: "2px solid var(--color-primary-900)",
      boxShadow: "3px 3px 0 var(--color-accent-600)",
      borderRadius: 10, padding: "10px 16px 14px", zIndex: 7,
      color: "#fff",
      backdropFilter: "blur(8px)",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontFamily: "Geist Mono", fontSize: 9.5, letterSpacing: ".18em", textTransform: "uppercase", color: "var(--color-accent-300)" }}>Gauge Tape</span>
          <span style={{ fontFamily: "Geist Mono", fontSize: 10, color: "rgba(255,255,255,.55)" }}>scrub to see how the system has flowed — rain events ripple through</span>
        </div>
        <div style={{ fontFamily: "Geist Mono", fontSize: 11, color: "var(--color-accent-300)", letterSpacing: ".08em" }}>
          {timeOffset === 0 ? "NOW" : `${Math.abs(timeOffset)}d ago`}
        </div>
      </div>

      {/* The tape itself */}
      <div style={{ position: "relative", height: 50, marginTop: 4 }}>
        {/* day ticks */}
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "flex-end" }}>
          {ticks.map((_, i) => (
            <div key={i} style={{
              flex: 1, height: i % 5 === 0 ? 12 : 6,
              borderLeft: "1px solid rgba(255,255,255,.18)",
            }} />
          ))}
        </div>

        {/* rain events */}
        {RAIN.map((r, i) => {
          const x = ((days + r.day) / days) * 100;
          return (
            <div key={i} style={{
              position: "absolute", left: `${x}%`, bottom: 12,
              width: 2 + r.intensity * 10, height: 28 + r.intensity * 12,
              background: "linear-gradient(180deg, rgba(72,159,206,.0) 0%, rgba(72,159,206,.65) 100%)",
              transform: "translateX(-50%)",
              borderRadius: 2,
              pointerEvents: "none",
            }} />
          );
        })}

        {/* mini per-river spark line — abstracted */}
        <svg viewBox="0 0 300 50" preserveAspectRatio="none"
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}>
          {window.RIVERS.slice(0, 7).map((river, ri) => {
            const baseY = 30 + (ri - 3) * 1.5;
            // generate a path that bumps after each rain event affecting this river
            const pts = [];
            for (let d = -days; d <= 0; d++) {
              const x = ((days + d) / days) * 300;
              let bump = 0;
              for (const r of RAIN) {
                if (r.scope === "all" || r.scope.includes(river.id)) {
                  const dist = d - r.day;
                  if (dist >= 0) bump += r.intensity * Math.exp(-dist / 5);
                }
              }
              pts.push(`${x.toFixed(1)},${(baseY - bump * 4).toFixed(1)}`);
            }
            return <polyline key={ri} points={pts.join(" ")}
              fill="none" stroke="rgba(255,255,255,.22)" strokeWidth="0.8" />;
          })}
        </svg>

        {/* scrubber handle */}
        <div style={{
          position: "absolute", top: -2, bottom: -2,
          left: `${((days + timeOffset) / days) * 100}%`,
          width: 2, background: "var(--color-accent-500)",
          boxShadow: "0 0 12px var(--color-accent-500)",
          transform: "translateX(-50%)",
          pointerEvents: "none",
        }}>
          <div style={{
            position: "absolute", top: -8, left: "50%", transform: "translateX(-50%)",
            width: 12, height: 12, borderRadius: 99,
            background: "var(--color-accent-500)",
            border: "2px solid #fff",
          }} />
        </div>

        {/* invisible range input on top */}
        <input type="range" min={-days} max={0} step={1} value={timeOffset}
          onChange={e => setTimeOffset(parseInt(e.target.value))}
          style={{
            position: "absolute", inset: 0, width: "100%", height: "100%",
            opacity: 0, cursor: "ew-resize", margin: 0,
          }} />
      </div>

      {/* day axis labels */}
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4, fontFamily: "Geist Mono", fontSize: 9, color: "rgba(255,255,255,.5)", letterSpacing: ".08em" }}>
        <span>30d ago</span><span>20d</span><span>10d</span><span>now</span>
      </div>
    </div>
  );
}

// Compute level overrides given a timeOffset and the same rain events.
function computeLevelOverrides(timeOffset) {
  const RAIN = [
    { day: -27, intensity: 0.6, scope: ["meramec", "huzzah"] },
    { day: -22, intensity: 1.4, scope: "all" },
    { day: -14, intensity: 0.9, scope: ["current", "jacks-fork", "eleven-point"] },
    { day: -8,  intensity: 0.5, scope: ["niangua", "big-piney"] },
    { day: -3,  intensity: 1.1, scope: "all" },
  ];
  // Each river has a "baseline" decay level that drifts down without rain.
  const ladder = ["bony", "skinny", "prime", "pushy", "blown"];
  const baseIdx = { current: 2, "jacks-fork": 1, "eleven-point": 2, meramec: 2, "big-piney": 2, niangua: 2, huzzah: 0 };
  const out = {};
  for (const river of window.RIVERS) {
    let bump = 0;
    for (const r of RAIN) {
      if (r.day > timeOffset) continue; // future rain doesn't affect us
      if (r.scope === "all" || r.scope.includes(river.id)) {
        const dist = timeOffset - r.day;
        bump += r.intensity * Math.exp(-dist / 6);
      }
    }
    let idx = baseIdx[river.id] ?? 2;
    if (bump > 0.4) idx += 1;
    if (bump > 1.2) idx += 1;
    if (bump > 2.2) idx += 1;
    idx = Math.max(0, Math.min(4, idx));
    out[river.id] = ladder[idx];
  }
  return out;
}

window.BrandBar = BrandBar;
window.RiverRoster = RiverRoster;
window.AccessBloom = AccessBloom;
window.SegmentSummary = SegmentSummary;
window.EddySays = EddySays;
window.GaugeTape = GaugeTape;
window.computeLevelOverrides = computeLevelOverrides;
