// mo-history.js — synthetic 365-day percentile history + snapshot computation.
// Decoupled from geometry so the same logic works against fake or real river data.

(function () {
  const PERCENTILE_CLASSES = [
    { min: 0,  max: 10,  label: "Much below normal", short: "<P10",   color: "#8B2C1B" },
    { min: 10, max: 25,  label: "Below normal",       short: "P10–25", color: "#C36A4A" },
    { min: 25, max: 75,  label: "Normal",             short: "P25–75", color: "#2D7889" },
    { min: 75, max: 90,  label: "Above normal",       short: "P75–90", color: "#3E8FB8" },
    { min: 90, max: 100, label: "Much above normal",  short: ">P90",   color: "#1A4F5C" },
  ];

  const REGIONAL_EVENTS = [
    { day:   -3, intensity: 1.6, basins: ["Mississippi", "Meramec"] },
    { day:  -12, intensity: 0.9, basins: "all" },
    { day:  -28, intensity: 1.3, basins: ["Black", "White"] },
    { day:  -45, intensity: 0.7, basins: ["Osage", "Missouri"] },
    { day:  -68, intensity: 1.8, basins: "all" },
    { day:  -95, intensity: 0.6, basins: ["Arkansas"] },
    { day: -120, intensity: 1.4, basins: ["Mississippi", "Meramec", "Black"] },
    { day: -160, intensity: 0.8, basins: ["Missouri", "Osage"] },
    { day: -210, intensity: 2.1, basins: "all" },
    { day: -260, intensity: 0.7, basins: ["White", "Arkansas"] },
    { day: -310, intensity: 1.5, basins: ["Black", "Mississippi"] },
    { day: -345, intensity: 0.9, basins: "all" },
  ];

  function classifyPercentile(p) {
    for (const c of PERCENTILE_CLASSES) if (p >= c.min && p < c.max) return c;
    return PERCENTILE_CLASSES[PERCENTILE_CLASSES.length - 1];
  }

  function seasonalBaseline(dayOffset) {
    const today = new Date(2026, 4, 6);
    const d = new Date(today); d.setDate(d.getDate() + dayOffset);
    const start = new Date(d.getFullYear(), 0, 0);
    const doy = Math.floor((d - start) / 86400000);
    const phase = ((doy - 60) / 365) * 2 * Math.PI;
    return 50 + Math.cos(phase) * 18;
  }

  function gaugeHistoryAt(gauge, basin, order, dayOffset) {
    const responsiveness = (8 - order) * 0.55 + 0.4;
    const base = seasonalBaseline(dayOffset);
    let bump = 0;
    for (const ev of REGIONAL_EVENTS) {
      if (ev.day > dayOffset) continue;
      const inScope = ev.basins === "all" || ev.basins.includes(basin);
      if (!inScope) continue;
      const dist = dayOffset - ev.day;
      bump += ev.intensity * responsiveness * Math.exp(-dist / (5 + (8 - order) * 2));
    }
    const idStr = gauge.site_no || gauge.id || "0";
    const seed = parseInt(idStr.slice(-3), 10) || 0;
    const jitter = ((seed % 17) - 8) * 0.6;
    return Math.max(2, Math.min(99, base + bump * 14 + jitter));
  }

  function snapshotAt(dayOffset) {
    const out = {};
    for (const r of window.MO_RIVERS) {
      out[r.id] = r.gauges.map(g => ({
        ...g,
        id: g.site_no || g.id,
        site: g.name || g.site,
        percentile: gaugeHistoryAt(g, r.basin, r.order, dayOffset),
      }));
    }
    return out;
  }

  function riverPercentileFromSnapshot(riverId, snap) {
    const gs = snap[riverId];
    if (!gs || !gs.length) return 50;
    return gs.reduce((s, g) => s + g.percentile, 0) / gs.length;
  }

  window.MO_PERCENTILE_CLASSES = PERCENTILE_CLASSES;
  window.classifyPercentile = classifyPercentile;
  window.gaugeHistoryAt = gaugeHistoryAt;
  window.snapshotAt = snapshotAt;
  window.riverPercentileFromSnapshot = riverPercentileFromSnapshot;
})();
