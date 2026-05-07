// mo-ui.jsx — chrome for the statewide instrument.
// USGS-only voice: percentile language, mono typography, no Eddy.

function HeaderBar({ dayOffset }) {
  const today = new Date(2026, 4, 6);
  const d = new Date(today); d.setDate(d.getDate() + dayOffset);
  const stamp = d.toISOString().slice(0, 10);
  return (
    <div style={{
      position: "absolute", top: 14, left: 14, right: 14,
      display: "flex", alignItems: "center", justifyContent: "space-between",
      pointerEvents: "none", zIndex: 5,
    }}>
      <div style={{
        background: "rgba(31,26,20,.92)", color: "#F2EAD8",
        border: "1.5px solid rgba(242,234,216,.18)",
        borderRadius: 4, padding: "10px 16px",
        boxShadow: "3px 3px 0 rgba(0,0,0,.5)",
        fontFamily: "Geist Mono, monospace", fontSize: 11, letterSpacing: ".15em",
        textTransform: "uppercase", pointerEvents: "auto",
      }}>
        <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: ".22em", color: "#E6DCBE" }}>
          USGS · NWIS · Missouri
        </div>
        <div style={{ marginTop: 2, fontSize: 9.5, color: "rgba(242,234,216,.65)" }}>
          Surface water · stream order ≥4 · {window.MO_RIVERS.length} reaches · {window.MO_RIVERS.reduce((s, r) => s + r.gauges.length, 0)} active gauges
        </div>
      </div>
      <div style={{
        background: "rgba(31,26,20,.92)", color: "#F2EAD8",
        border: "1.5px solid rgba(242,234,216,.18)", borderRadius: 4, padding: "10px 14px",
        boxShadow: "3px 3px 0 rgba(0,0,0,.5)",
        fontFamily: "Geist Mono, monospace", fontSize: 11, letterSpacing: ".15em",
        textTransform: "uppercase", pointerEvents: "auto",
      }}>
        <div style={{ fontSize: 9.5, color: "rgba(242,234,216,.55)" }}>Snapshot</div>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#E6DCBE", marginTop: 2 }}>
          {stamp}{dayOffset === 0 && <span style={{ color: "#3E8FB8", marginLeft: 8 }}>· LIVE</span>}
        </div>
      </div>
    </div>
  );
}

function PercentileLegend() {
  return (
    <div style={{
      position: "absolute", left: 14, top: 110, zIndex: 5,
      background: "rgba(247,246,243,.96)",
      border: "1.5px solid rgba(45,42,36,.4)", borderRadius: 4, padding: "10px 12px",
      boxShadow: "3px 3px 0 rgba(45,42,36,.35)",
      fontFamily: "Geist Mono, monospace", fontSize: 10, color: "#1F1A14",
    }}>
      <div style={{ fontSize: 9, letterSpacing: ".15em", textTransform: "uppercase", color: "rgba(45,42,36,.6)", marginBottom: 6 }}>
        Discharge percentile
      </div>
      {window.MO_PERCENTILE_CLASSES.map(c => (
        <div key={c.short} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
          <span style={{ width: 16, height: 4, background: c.color, borderRadius: 2 }} />
          <span style={{ fontWeight: 600, width: 56 }}>{c.short}</span>
          <span style={{ color: "rgba(45,42,36,.7)" }}>{c.label}</span>
        </div>
      ))}
      <div style={{
        marginTop: 8, paddingTop: 8, borderTop: "1px solid rgba(45,42,36,.18)",
        fontSize: 9, color: "rgba(45,42,36,.55)", letterSpacing: ".05em",
      }}>
        Period of record: 1921–present (varies by site)
      </div>
    </div>
  );
}

// Sparkline: 30-day daily-value history for a single gauge, with P25-P75 ribbon
function GaugeSparkline({ river, gauge, dayOffset, width = 280, height = 80 }) {
  const days = 30;
  // Compute history
  const points = [];
  const ribbonHi = []; const ribbonLo = [];
  for (let i = 0; i <= days; i++) {
    const off = dayOffset - (days - i);
    const p = window.gaugeHistoryAt(gauge, river.basin, river.order, off);
    points.push(p);
    // Ribbon = synthetic P25-P75 for this site (just the seasonal baseline ± 15)
    const seed = parseInt(gauge.id.slice(-3), 10) || 0;
    const phase = ((i + seed % 30) / 30) * Math.PI;
    ribbonHi.push(72 + Math.sin(phase) * 4);
    ribbonLo.push(28 + Math.cos(phase) * 4);
  }
  const xAt = (i) => (i / days) * width;
  const yAt = (p) => height - 8 - (p / 100) * (height - 16);
  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"}${xAt(i).toFixed(1)} ${yAt(p).toFixed(1)}`).join(" ");
  const ribbonPath =
    ribbonHi.map((v, i) => `${i === 0 ? "M" : "L"}${xAt(i)} ${yAt(v)}`).join(" ") +
    " " +
    ribbonLo.slice().reverse().map((v, i) => `L${xAt(days - i)} ${yAt(v)}`).join(" ") + " Z";
  const cur = points[points.length - 1];
  const curColor = window.colorForPercentile(cur);
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} style={{ display: "block" }}>
      {/* baseline grid */}
      <line x1="0" y1={yAt(50)} x2={width} y2={yAt(50)}
        stroke="rgba(45,42,36,.15)" strokeDasharray="2 3" />
      <line x1="0" y1={yAt(75)} x2={width} y2={yAt(75)}
        stroke="rgba(45,42,36,.10)" />
      <line x1="0" y1={yAt(25)} x2={width} y2={yAt(25)}
        stroke="rgba(45,42,36,.10)" />
      {/* P25–P75 ribbon */}
      <path d={ribbonPath} fill="rgba(45,120,137,.16)" />
      {/* line */}
      <path d={linePath} stroke={curColor} strokeWidth="2" fill="none" strokeLinejoin="round" />
      {/* current marker */}
      <circle cx={xAt(days)} cy={yAt(cur)} r="3.5" fill={curColor} stroke="#fff" strokeWidth="1.5" />
      {/* labels */}
      <text x="3" y={yAt(75) - 2} fontSize="8" fill="rgba(45,42,36,.55)" fontFamily="Geist Mono">P75</text>
      <text x="3" y={yAt(25) - 2} fontSize="8" fill="rgba(45,42,36,.55)" fontFamily="Geist Mono">P25</text>
      <text x={width - 3} y={yAt(cur) - 6} textAnchor="end" fontSize="9" fontWeight="700" fontFamily="Geist Mono" fill={curColor}>
        P{Math.round(cur)}
      </text>
    </svg>
  );
}

function GaugeHover({ hoveredGauge }) {
  if (!hoveredGauge) return null;
  const { river, gauge } = hoveredGauge;
  const cls = window.classifyPercentile(gauge.percentile);
  return (
    <div style={{
      position: "absolute", right: 14, top: 110, width: 320, zIndex: 6,
      background: "rgba(247,246,243,.97)",
      border: "1.5px solid rgba(45,42,36,.5)", borderRadius: 4, padding: 14,
      boxShadow: "3px 3px 0 rgba(45,42,36,.4)",
      fontFamily: "Geist, sans-serif",
    }}>
      <div style={{ fontFamily: "Geist Mono", fontSize: 9.5, letterSpacing: ".15em", textTransform: "uppercase", color: "rgba(45,42,36,.6)" }}>
        USGS #{gauge.id}
      </div>
      <div style={{ fontSize: 16, fontWeight: 700, color: "#1F1A14", marginTop: 3, lineHeight: 1.2 }}>
        {gauge.site}
      </div>
      <div style={{ fontFamily: "Geist Mono", fontSize: 10, color: "rgba(45,42,36,.65)", marginTop: 4 }}>
        {river.name} · {river.basin} basin · order {river.order}
      </div>
      <div style={{
        marginTop: 10, padding: "6px 10px",
        background: cls.color, color: "#fff",
        fontFamily: "Geist Mono", fontSize: 11, fontWeight: 700, letterSpacing: ".1em",
        display: "inline-flex", alignItems: "center", gap: 8, borderRadius: 2,
      }}>
        <span>P{Math.round(gauge.percentile)}</span>
        <span style={{ opacity: .85, fontWeight: 500 }}>{cls.label}</span>
      </div>
      <div style={{ marginTop: 12 }}>
        <GaugeSparkline river={river} gauge={gauge} dayOffset={0} width={290} height={70} />
      </div>
      <div style={{
        marginTop: 8, fontFamily: "Geist Mono", fontSize: 9.5, color: "rgba(45,42,36,.55)",
        letterSpacing: ".05em",
      }}>
        Click to lock detail panel →
      </div>
    </div>
  );
}

function GaugeDetail({ focusedGauge, dayOffset, onClose }) {
  if (!focusedGauge) return null;
  // Find the river it belongs to
  let river = null;
  for (const r of window.MO_RIVERS) {
    if (r.gauges.find(g => g.id === focusedGauge.id)) { river = r; break; }
  }
  if (!river) return null;
  const cls = window.classifyPercentile(focusedGauge.percentile);
  return (
    <div style={{
      position: "absolute", right: 14, top: 110, bottom: 130, width: 360, zIndex: 8,
      background: "rgba(247,246,243,.98)",
      border: "1.5px solid rgba(45,42,36,.5)", borderRadius: 4, padding: 18,
      boxShadow: "4px 4px 0 rgba(45,42,36,.45)",
      fontFamily: "Geist, sans-serif",
      overflow: "auto",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontFamily: "Geist Mono", fontSize: 9.5, letterSpacing: ".18em", textTransform: "uppercase", color: "rgba(45,42,36,.55)" }}>
            USGS Site #{focusedGauge.id}
          </div>
          <div style={{ fontSize: 19, fontWeight: 700, color: "#1F1A14", marginTop: 3, lineHeight: 1.2 }}>
            {focusedGauge.site}
          </div>
        </div>
        <button onClick={onClose} style={{
          appearance: "none", border: "1.5px solid rgba(45,42,36,.4)", background: "#fff",
          width: 26, height: 26, borderRadius: 4, cursor: "pointer",
          fontFamily: "Geist Mono", fontSize: 14, color: "rgba(45,42,36,.7)",
        }}>×</button>
      </div>

      <div style={{ marginTop: 10, fontFamily: "Geist Mono", fontSize: 11, color: "rgba(45,42,36,.7)", letterSpacing: ".04em" }}>
        {river.name} · {river.basin} basin · stream order {river.order}
      </div>

      <div style={{
        marginTop: 14, padding: "10px 14px",
        background: cls.color, color: "#fff", borderRadius: 3,
        display: "flex", alignItems: "baseline", gap: 12,
      }}>
        <div style={{ fontFamily: "Geist Mono", fontSize: 32, fontWeight: 700, lineHeight: 1 }}>
          P{Math.round(focusedGauge.percentile)}
        </div>
        <div style={{ fontFamily: "Geist", fontSize: 13, opacity: .9 }}>
          {cls.label} for this date
        </div>
      </div>

      <div style={{ marginTop: 18, fontFamily: "Geist Mono", fontSize: 10, letterSpacing: ".15em", textTransform: "uppercase", color: "rgba(45,42,36,.6)" }}>
        30-day discharge percentile
      </div>
      <div style={{ marginTop: 8, padding: 10, background: "#F4EFE7", border: "1px solid rgba(45,42,36,.15)", borderRadius: 3 }}>
        <GaugeSparkline river={river} gauge={focusedGauge} dayOffset={dayOffset} width={310} height={120} />
      </div>

      <div style={{ marginTop: 14, fontFamily: "Geist Mono", fontSize: 10, letterSpacing: ".15em", textTransform: "uppercase", color: "rgba(45,42,36,.6)" }}>
        Period of record context
      </div>
      <div style={{
        marginTop: 8,
        display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8,
        fontFamily: "Geist Mono", fontSize: 11,
      }}>
        <Stat label="Median (DOY)" value="P50" />
        <Stat label="Today vs. median" value={`${focusedGauge.percentile > 50 ? "+" : ""}${(focusedGauge.percentile - 50).toFixed(0)}pp`} />
        <Stat label="Years on record" value={`${20 + (parseInt(focusedGauge.id.slice(-3), 10) % 80)}`} />
        <Stat label="Trend (7-day)" value={focusedGauge.percentile > 60 ? "rising" : focusedGauge.percentile < 35 ? "falling" : "steady"} />
      </div>

      <div style={{
        marginTop: 14, paddingTop: 12, borderTop: "1px dashed rgba(45,42,36,.25)",
        fontFamily: "Geist Mono", fontSize: 10, color: "rgba(45,42,36,.55)", letterSpacing: ".05em", lineHeight: 1.5,
      }}>
        Source: USGS National Water Information System · waterservices.usgs.gov · IV/DV/STAT endpoints. All values shown as percentile rank against the gauge's daily period of record for this calendar date.
      </div>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div>
      <div style={{ fontSize: 9, letterSpacing: ".12em", textTransform: "uppercase", color: "rgba(45,42,36,.55)" }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: "#1F1A14", marginTop: 2 }}>{value}</div>
    </div>
  );
}

// Time scrubber across the bottom — drives everything
function TimeScrubber({ dayOffset, setDayOffset }) {
  const RANGE = 365;
  return (
    <div style={{
      position: "absolute", left: 14, right: 14, bottom: 14, height: 110, zIndex: 7,
      background: "rgba(31,26,20,.94)", border: "1.5px solid rgba(242,234,216,.2)",
      borderRadius: 4, padding: "10px 16px 14px",
      boxShadow: "3px 3px 0 rgba(0,0,0,.5)",
      color: "#F2EAD8",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <div>
          <span style={{ fontFamily: "Geist Mono", fontSize: 10, letterSpacing: ".18em", textTransform: "uppercase", color: "#E6DCBE", fontWeight: 700 }}>Statewide gauge tape</span>
          <span style={{ marginLeft: 12, fontFamily: "Geist Mono", fontSize: 10, color: "rgba(242,234,216,.55)" }}>
            scrub 365d — every river re-paints from synthesized DV history
          </span>
        </div>
        <div style={{ fontFamily: "Geist Mono", fontSize: 11, color: "#3E8FB8", letterSpacing: ".08em" }}>
          {dayOffset === 0 ? "TODAY" : `${Math.abs(dayOffset)}d ago`}
        </div>
      </div>

      <div style={{ position: "relative", height: 60 }}>
        <StatewideTrendline />

        <div style={{
          position: "absolute", top: 0, bottom: 0,
          left: `${((RANGE + dayOffset) / RANGE) * 100}%`,
          width: 2, background: "#F2EAD8", boxShadow: "0 0 8px rgba(242,234,216,.6)",
          transform: "translateX(-50%)", pointerEvents: "none",
        }}>
          <div style={{
            position: "absolute", top: -6, left: "50%", transform: "translateX(-50%)",
            width: 10, height: 10, background: "#F2EAD8", borderRadius: 99,
            border: "1.5px solid #1F1A14",
          }} />
        </div>

        <input type="range" min={-RANGE} max={0} step={1} value={dayOffset}
          onChange={e => setDayOffset(parseInt(e.target.value))}
          style={{
            position: "absolute", inset: 0, width: "100%", height: "100%",
            opacity: 0, cursor: "ew-resize", margin: 0,
          }} />
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4, fontFamily: "Geist Mono", fontSize: 9, color: "rgba(242,234,216,.5)", letterSpacing: ".1em" }}>
        <span>365d</span><span>270d</span><span>180d</span><span>90d</span><span>today</span>
      </div>
    </div>
  );
}

// Mini line: aggregate statewide percentile across last 365 days
function StatewideTrendline() {
  const RANGE = 365;
  const W = 1500, H = 60;
  const points = React.useMemo(() => {
    const out = [];
    for (let i = -RANGE; i <= 0; i += 3) {
      const snap = window.snapshotAt(i);
      let sum = 0, n = 0;
      for (const r of window.MO_RIVERS) {
        for (const g of snap[r.id]) { sum += g.percentile; n++; }
      }
      const avg = sum / n;
      const x = ((RANGE + i) / RANGE) * W;
      const y = H - 6 - (avg / 100) * (H - 12);
      out.push([x, y, avg]);
    }
    return out;
  }, []);
  const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none"
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}>
      <line x1="0" y1={H - 6 - (50 / 100) * (H - 12)} x2={W} y2={H - 6 - (50 / 100) * (H - 12)}
        stroke="rgba(242,234,216,.2)" strokeDasharray="3 4" />
      <path d={path + ` L ${W} ${H} L 0 ${H} Z`} fill="rgba(62,143,184,.18)" />
      <path d={path} stroke="#3E8FB8" strokeWidth="1.5" fill="none" />
    </svg>
  );
}

// Bottom-left summary chip: how many rivers in each band right now
function StatewideSummary({ snapshot }) {
  const counts = { low: 0, below: 0, normal: 0, above: 0, high: 0 };
  for (const r of window.MO_RIVERS) {
    const p = window.riverPercentileFromSnapshot(r.id, snapshot);
    if (p < 10) counts.low++;
    else if (p < 25) counts.below++;
    else if (p < 75) counts.normal++;
    else if (p < 90) counts.above++;
    else counts.high++;
  }
  const items = [
    { k: "low",    label: "Much below", color: "#8B2C1B", n: counts.low },
    { k: "below",  label: "Below",      color: "#C36A4A", n: counts.below },
    { k: "normal", label: "Normal",     color: "#2D7889", n: counts.normal },
    { k: "above",  label: "Above",      color: "#3E8FB8", n: counts.above },
    { k: "high",   label: "Much above", color: "#1A4F5C", n: counts.high },
  ];
  return (
    <div style={{
      position: "absolute", left: 14, bottom: 140, zIndex: 5,
      background: "rgba(247,246,243,.96)", border: "1.5px solid rgba(45,42,36,.4)",
      borderRadius: 4, padding: "10px 14px",
      boxShadow: "3px 3px 0 rgba(45,42,36,.35)",
      fontFamily: "Geist Mono, monospace", fontSize: 11, color: "#1F1A14",
    }}>
      <div style={{ fontSize: 9, letterSpacing: ".15em", textTransform: "uppercase", color: "rgba(45,42,36,.6)", marginBottom: 8 }}>
        Statewide right now
      </div>
      <div style={{ display: "flex", gap: 14 }}>
        {items.map(it => (
          <div key={it.k} style={{ textAlign: "center" }}>
            <div style={{
              fontFamily: "Geist Mono", fontSize: 22, fontWeight: 700,
              color: it.color, lineHeight: 1,
            }}>{it.n}</div>
            <div style={{
              marginTop: 4, fontSize: 8.5, letterSpacing: ".08em",
              color: "rgba(45,42,36,.6)", textTransform: "uppercase",
            }}>{it.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

window.HeaderBar = HeaderBar;
window.PercentileLegend = PercentileLegend;
window.GaugeHover = GaugeHover;
window.GaugeDetail = GaugeDetail;
window.TimeScrubber = TimeScrubber;
window.StatewideSummary = StatewideSummary;
