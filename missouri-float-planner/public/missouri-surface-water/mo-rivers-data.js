// mo-rivers-data.js
// Synthesized Missouri stream network — modeled after NHDPlus stream-order-4+
// reaches and the active USGS gauge distribution. Geometry is in a stylized
// 1600x1000 SVG space mapped roughly to Missouri's bounding box:
//   x = 0  ≈ -95.8°W   (KS border)
//   x = 1600 ≈ -89.0°W (IL border, eastern bootheel)
//   y = 0   ≈ 40.6°N   (IA border)
//   y = 1000 ≈ 35.9°N  (AR border)
//
// Each river: stream order (4-8, drives weight), basin, named reaches with
// gauge sites, and an SVG path. Gauge sites carry real USGS site numbers
// where I know them and synthetic-but-plausible numbers elsewhere.

(function () {

  // ───────── State outline (rough Missouri silhouette) ─────────
  // Hand-traced approximation of Missouri's borders for the basemap.
  const STATE_OUTLINE = "M 60 60 L 1180 60 L 1190 180 L 1240 200 L 1280 240 L 1320 320 L 1360 380 L 1380 460 L 1380 540 L 1420 600 L 1440 700 L 1430 760 L 1380 800 L 1310 820 L 1260 850 L 1230 920 L 1200 940 L 1100 945 L 980 940 L 60 940 L 50 700 L 55 400 L 60 60 Z";

  // Major cities (gravity points for orientation)
  const CITIES = [
    { name: "Kansas City",   x: 90,   y: 360, type: "metro" },
    { name: "St. Louis",     x: 1280, y: 420, type: "metro" },
    { name: "Springfield",   x: 470,  y: 760, type: "metro" },
    { name: "Columbia",      x: 720,  y: 400, type: "metro" },
    { name: "Jefferson City",x: 740,  y: 470, type: "city" },
    { name: "Cape Girardeau",x: 1300, y: 760, type: "city" },
    { name: "Joplin",        x: 240,  y: 800, type: "city" },
    { name: "Rolla",         x: 920,  y: 580, type: "city" },
    { name: "Poplar Bluff",  x: 1180, y: 850, type: "city" },
    { name: "St. Joseph",    x: 130,  y: 220, type: "city" },
    { name: "Hannibal",      x: 1100, y: 280, type: "city" },
    { name: "West Plains",   x: 880,  y: 870, type: "city" },
  ];

  // ───────── Rivers ─────────
  // Stream order ~ visual weight & narrative importance.
  // Order 8 — Mississippi
  // Order 7 — Missouri
  // Order 6 — Osage, Meramec, lower Gasconade, lower White
  // Order 5 — Current, Eleven Point, Black, Niangua, Big Piney, Spring, Grand
  // Order 4 — tributaries (Jacks Fork, Huzzah, Bourbeuse, Fox, Salt, etc.)

  const RIVERS = [
    // ────────── Order 8 — the great rivers
    {
      id: "mississippi", name: "Mississippi River", basin: "Mississippi", order: 8,
      path: "M 1100 60 C 1140 140, 1190 220, 1230 340 S 1290 540, 1310 680 S 1330 820, 1310 940",
      gauges: [
        { id: "07010000", site: "Mississippi at St. Louis",     t: 0.42, percentile: 62 },
        { id: "07020500", site: "Mississippi at Chester, IL",    t: 0.55, percentile: 64 },
        { id: "07022000", site: "Mississippi at Cape Girardeau", t: 0.78, percentile: 68 },
      ],
    },
    {
      id: "missouri", name: "Missouri River", basin: "Missouri", order: 7,
      path: "M 60 240 C 200 260, 360 280, 520 320 S 720 380, 900 410 S 1100 410, 1240 400",
      gauges: [
        { id: "06893000", site: "Missouri at Kansas City",      t: 0.04, percentile: 71 },
        { id: "06909000", site: "Missouri at Boonville",         t: 0.42, percentile: 73 },
        { id: "06934500", site: "Missouri at Hermann",           t: 0.78, percentile: 75 },
      ],
    },

    // ────────── Order 6
    {
      id: "osage", name: "Osage River", basin: "Missouri", order: 6,
      path: "M 50 600 C 180 580, 320 580, 460 590 S 620 620, 720 470",
      gauges: [
        { id: "06918060", site: "Osage at Schell City",     t: 0.18, percentile: 44 },
        { id: "06926510", site: "Osage at Warsaw",          t: 0.46, percentile: 52 },
        { id: "06927000", site: "Osage at St. Thomas",      t: 0.86, percentile: 58 },
      ],
    },
    {
      id: "meramec", name: "Meramec River", basin: "Mississippi", order: 6,
      path: "M 920 580 C 1000 580, 1080 600, 1160 620 S 1240 640, 1280 660",
      gauges: [
        { id: "07014500", site: "Meramec near Steelville",  t: 0.10, percentile: 88 },
        { id: "07018500", site: "Meramec at Sullivan",       t: 0.48, percentile: 91 },
        { id: "07019000", site: "Meramec at Eureka",         t: 0.92, percentile: 94 },
      ],
    },
    {
      id: "gasconade", name: "Gasconade River", basin: "Missouri", order: 6,
      path: "M 720 760 C 760 700, 800 640, 820 580 S 800 500, 760 460",
      gauges: [
        { id: "06933500", site: "Gasconade above Jerome",   t: 0.30, percentile: 56 },
        { id: "06934000", site: "Gasconade at Rich Fountain",t: 0.62, percentile: 58 },
        { id: "06934500", site: "Gasconade near Hermann",   t: 0.94, percentile: 60 },
      ],
    },
    {
      id: "white", name: "White River", basin: "Mississippi", order: 6,
      path: "M 360 920 C 460 880, 560 850, 660 860 S 760 880, 820 920",
      gauges: [
        { id: "07054410", site: "White at Branson",          t: 0.30, percentile: 38 },
        { id: "07057500", site: "White at Forsyth",          t: 0.55, percentile: 42 },
      ],
    },

    // ────────── Order 5 — the floatable backbone
    {
      id: "current", name: "Current River", basin: "Black", order: 5,
      path: "M 1020 540 C 1010 600, 980 660, 940 720 S 880 820, 820 880",
      gauges: [
        { id: "07064533", site: "Current at Montauk",        t: 0.04, percentile: 55 },
        { id: "07066000", site: "Current at Akers",          t: 0.36, percentile: 58 },
        { id: "07067000", site: "Current at Van Buren",      t: 0.84, percentile: 60 },
        { id: "07068000", site: "Current at Doniphan",       t: 0.97, percentile: 63 },
      ],
    },
    {
      id: "jacks-fork", name: "Jacks Fork", basin: "Black", order: 4,
      path: "M 800 640 C 850 660, 900 680, 940 720",
      gauges: [
        { id: "07065200", site: "Jacks Fork at Alley",       t: 0.50, percentile: 32 },
      ],
    },
    {
      id: "eleven-point", name: "Eleven Point", basin: "Black", order: 5,
      path: "M 940 580 C 980 660, 1020 740, 1060 820 S 1100 920, 1110 940",
      gauges: [
        { id: "07071500", site: "Eleven Point at Bardley",   t: 0.55, percentile: 51 },
      ],
    },
    {
      id: "black", name: "Black River", basin: "Black", order: 5,
      path: "M 1080 620 C 1100 700, 1130 780, 1160 850 S 1180 920, 1180 940",
      gauges: [
        { id: "07061500", site: "Black at Annapolis",        t: 0.30, percentile: 70 },
        { id: "07062500", site: "Black at Poplar Bluff",     t: 0.86, percentile: 74 },
      ],
    },
    {
      id: "st-francis", name: "St. Francis", basin: "Mississippi", order: 5,
      path: "M 1180 580 C 1210 660, 1240 740, 1260 820 S 1270 920, 1260 940",
      gauges: [
        { id: "07037500", site: "St. Francis at Patterson",  t: 0.36, percentile: 78 },
        { id: "07040100", site: "St. Francis near Roselle",  t: 0.78, percentile: 82 },
      ],
    },
    {
      id: "niangua", name: "Niangua River", basin: "Osage", order: 5,
      path: "M 460 800 C 500 740, 540 680, 580 620 S 620 560, 640 540",
      gauges: [
        { id: "06923500", site: "Niangua at Windyville",     t: 0.40, percentile: 47 },
      ],
    },
    {
      id: "big-piney", name: "Big Piney", basin: "Gasconade", order: 5,
      path: "M 720 760 C 740 700, 760 640, 760 580 S 760 520, 760 460",
      gauges: [
        { id: "06933000", site: "Big Piney near Big Piney",  t: 0.50, percentile: 50 },
      ],
    },
    {
      id: "spring", name: "Spring River", basin: "Arkansas", order: 5,
      path: "M 230 800 C 280 820, 340 840, 400 860 S 460 870, 480 870",
      gauges: [
        { id: "07186000", site: "Spring near Waco",          t: 0.18, percentile: 85 },
      ],
    },
    {
      id: "grand", name: "Grand River", basin: "Missouri", order: 5,
      path: "M 320 80 C 360 160, 380 240, 400 320 S 420 400, 460 460",
      gauges: [
        { id: "06897500", site: "Grand at Sumner",           t: 0.50, percentile: 90 },
        { id: "06899500", site: "Grand near Brunswick",      t: 0.96, percentile: 95 },
      ],
    },
    {
      id: "salt", name: "Salt River", basin: "Mississippi", order: 5,
      path: "M 720 200 C 800 220, 880 250, 960 270 S 1080 290, 1100 290",
      gauges: [
        { id: "05507600", site: "Salt near New London",      t: 0.85, percentile: 66 },
      ],
    },

    // ────────── Order 4 — tributaries
    {
      id: "huzzah", name: "Huzzah Creek", basin: "Meramec", order: 4,
      path: "M 1020 580 C 1050 600, 1080 620, 1100 640",
      gauges: [{ id: "07014000", site: "Huzzah at Davisville", t: 0.50, percentile: 76 }],
    },
    {
      id: "bourbeuse", name: "Bourbeuse River", basin: "Meramec", order: 4,
      path: "M 1000 480 C 1080 520, 1160 560, 1220 600",
      gauges: [{ id: "07016500", site: "Bourbeuse at Union",   t: 0.70, percentile: 80 }],
    },
    {
      id: "bryant", name: "Bryant Creek", basin: "White", order: 4,
      path: "M 660 760 C 680 800, 700 840, 720 880",
      gauges: [{ id: "07053810", site: "Bryant at Tecumseh",   t: 0.50, percentile: 28 }],
    },
    {
      id: "north-fork-white", name: "North Fork White", basin: "White", order: 5,
      path: "M 760 740 C 780 800, 800 850, 820 900",
      gauges: [{ id: "07057500", site: "NF White at Tecumseh", t: 0.60, percentile: 36 }],
    },
    {
      id: "james", name: "James River", basin: "White", order: 5,
      path: "M 470 730 C 510 760, 560 800, 620 830 S 680 850, 720 870",
      gauges: [{ id: "07050700", site: "James at Galena",      t: 0.55, percentile: 42 }],
    },
    {
      id: "pomme-de-terre", name: "Pomme de Terre", basin: "Osage", order: 4,
      path: "M 380 700 C 400 660, 420 620, 460 590",
      gauges: [{ id: "06921070", site: "Pomme at Polk",        t: 0.50, percentile: 48 }],
    },
    {
      id: "sac", name: "Sac River", basin: "Osage", order: 4,
      path: "M 360 720 C 320 660, 300 600, 320 560 S 340 540, 360 540",
      gauges: [{ id: "06919500", site: "Sac near Stockton",    t: 0.50, percentile: 39 }],
    },
    {
      id: "courtois", name: "Courtois Creek", basin: "Meramec", order: 4,
      path: "M 1000 620 C 1030 640, 1060 650, 1080 660",
      gauges: [{ id: "07014100", site: "Courtois near Berryman", t: 0.50, percentile: 70 }],
    },
    {
      id: "platte", name: "Platte River", basin: "Missouri", order: 4,
      path: "M 110 80 C 130 140, 140 200, 150 260 S 150 320, 150 360",
      gauges: [{ id: "06820500", site: "Platte at Sharps Station", t: 0.85, percentile: 82 }],
    },
    {
      id: "chariton", name: "Chariton River", basin: "Missouri", order: 5,
      path: "M 540 80 C 560 160, 570 240, 580 320 S 590 380, 600 400",
      gauges: [
        { id: "06904500", site: "Chariton at Novinger",      t: 0.30, percentile: 88 },
        { id: "06905500", site: "Chariton at Prairie Hill",  t: 0.70, percentile: 92 },
      ],
    },
    {
      id: "nodaway", name: "Nodaway River", basin: "Missouri", order: 4,
      path: "M 80 80 C 100 140, 105 200, 110 260 S 115 300, 120 320",
      gauges: [{ id: "06817000", site: "Nodaway at Burlington Jct", t: 0.40, percentile: 84 }],
    },
    {
      id: "lamine", name: "Lamine River", basin: "Missouri", order: 4,
      path: "M 480 540 C 500 500, 510 460, 520 420 S 525 390, 530 380",
      gauges: [{ id: "06906500", site: "Lamine near Otterville", t: 0.50, percentile: 64 }],
    },
    {
      id: "moreau", name: "Moreau River", basin: "Missouri", order: 4,
      path: "M 600 540 C 640 520, 680 500, 720 480",
      gauges: [{ id: "06910800", site: "Moreau at Jefferson City", t: 0.85, percentile: 56 }],
    },
    {
      id: "cuivre", name: "Cuivre River", basin: "Mississippi", order: 4,
      path: "M 980 280 C 1020 300, 1060 320, 1100 340",
      gauges: [{ id: "05514500", site: "Cuivre near Troy",     t: 0.50, percentile: 72 }],
    },
    {
      id: "fabius", name: "Fabius River", basin: "Mississippi", order: 4,
      path: "M 800 80 C 840 140, 880 200, 920 250 S 980 270, 1020 280",
      gauges: [{ id: "05495000", site: "Fabius near Monticello", t: 0.70, percentile: 86 }],
    },
    {
      id: "wyaconda", name: "Wyaconda River", basin: "Mississippi", order: 4,
      path: "M 880 80 C 900 130, 920 170, 950 200 S 1000 220, 1040 230",
      gauges: [{ id: "05496000", site: "Wyaconda above Canton", t: 0.70, percentile: 78 }],
    },
    {
      id: "elk", name: "Elk River", basin: "Arkansas", order: 4,
      path: "M 130 880 C 180 890, 230 895, 280 900",
      gauges: [{ id: "07189000", site: "Elk near Tiff City",   t: 0.50, percentile: 92 }],
    },
    {
      id: "shoal", name: "Shoal Creek", basin: "Arkansas", order: 4,
      path: "M 200 800 C 230 820, 260 835, 280 845",
      gauges: [{ id: "07187000", site: "Shoal near Joplin",    t: 0.50, percentile: 74 }],
    },
  ];

  // ───────── Percentile interpretation (USGS standard) ─────────
  // Using the USGS public-facing color scheme for the 7-class flow ranking.
  const PERCENTILE_CLASSES = [
    { min: 0,  max: 10,  label: "Much below normal",  short: "<P10",  color: "#8B2C1B" },
    { min: 10, max: 25,  label: "Below normal",        short: "P10–25",color: "#C36A4A" },
    { min: 25, max: 75,  label: "Normal",              short: "P25–75",color: "#2D7889" },
    { min: 75, max: 90,  label: "Above normal",        short: "P75–90",color: "#3E8FB8" },
    { min: 90, max: 100, label: "Much above normal",   short: ">P90",  color: "#1A4F5C" },
  ];
  // Critical extras
  const PERCENTILE_EXTRA = {
    high: { label: "High",  color: "#2A1F66" }, // ≥ 95th + above flood threshold
    low:  { label: "Low",   color: "#6B2A1A" }, // < 5th
  };

  function classifyPercentile(p) {
    for (const c of PERCENTILE_CLASSES) {
      if (p >= c.min && p < c.max) return c;
    }
    return PERCENTILE_CLASSES[PERCENTILE_CLASSES.length - 1];
  }

  // ───────── Synthesized 365-day daily-value history ─────────
  // For each gauge, build a year of synthetic DV percentiles driven by:
  // - seasonal baseline (spring high, late-summer low — typical for MO)
  // - regional rain events that ripple by basin
  // - per-gauge responsiveness (tied to drainage size = inverse stream order)

  const REGIONAL_EVENTS = [
    // Most recent → 365 days back
    { day:   -3, intensity: 1.6, basins: ["Mississippi", "Meramec"] },
    { day:  -12, intensity: 0.9, basins: "all" },
    { day:  -28, intensity: 1.3, basins: ["Black", "White"] },
    { day:  -45, intensity: 0.7, basins: ["Osage", "Missouri"] },
    { day:  -68, intensity: 1.8, basins: "all" }, // big spring event
    { day:  -95, intensity: 0.6, basins: ["Arkansas"] },
    { day: -120, intensity: 1.4, basins: ["Mississippi", "Meramec", "Black"] },
    { day: -160, intensity: 0.8, basins: ["Missouri", "Osage"] },
    { day: -210, intensity: 2.1, basins: "all" }, // last fall's flood
    { day: -260, intensity: 0.7, basins: ["White", "Arkansas"] },
    { day: -310, intensity: 1.5, basins: ["Black", "Mississippi"] },
    { day: -345, intensity: 0.9, basins: "all" },
  ];

  function seasonalBaseline(dayOffset) {
    // dayOffset 0 = today (May 6, 2026), -180 ≈ early November.
    // Map dayOffset → calendar day-of-year (DOY).
    const today = new Date(2026, 4, 6);
    const d = new Date(today);
    d.setDate(d.getDate() + dayOffset);
    const start = new Date(d.getFullYear(), 0, 0);
    const doy = Math.floor((d - start) / 86400000);
    // Spring peak ~ DOY 110 (April 20), low ~ DOY 240 (Aug 28).
    const phase = ((doy - 60) / 365) * 2 * Math.PI;
    return 50 + Math.cos(phase) * 18; // baseline percentile 32–68 across the year
  }

  function gaugeHistoryAt(gauge, basin, order, dayOffset) {
    const responsiveness = (8 - order) * 0.55 + 0.4; // smaller streams react faster/sharper
    const base = seasonalBaseline(dayOffset);
    let bump = 0;
    for (const ev of REGIONAL_EVENTS) {
      if (ev.day > dayOffset) continue;
      const inScope = ev.basins === "all" || ev.basins.includes(basin) || ev.basins.includes(gauge.id.slice(0, 2));
      if (!inScope) continue;
      const dist = dayOffset - ev.day;
      bump += ev.intensity * responsiveness * Math.exp(-dist / (5 + (8 - order) * 2));
    }
    // Per-gauge offset so neighbors don't all march in lockstep
    const seed = parseInt(gauge.id.slice(-3), 10) || 0;
    const jitter = ((seed % 17) - 8) * 0.6;
    let p = base + bump * 14 + jitter;
    return Math.max(2, Math.min(99, p));
  }

  // Convenience: compute every gauge's percentile at a given day offset.
  function snapshotAt(dayOffset) {
    const out = {};
    for (const r of RIVERS) {
      out[r.id] = r.gauges.map(g => ({
        ...g,
        percentile: gaugeHistoryAt(g, r.basin, r.order, dayOffset),
      }));
    }
    return out;
  }

  // For a river, derive a single "river percentile" from its gauges (flow-weighted mean).
  function riverPercentileFromSnapshot(riverId, snap) {
    const gs = snap[riverId];
    if (!gs || !gs.length) return 50;
    return gs.reduce((s, g) => s + g.percentile, 0) / gs.length;
  }

  window.MO_STATE_OUTLINE = STATE_OUTLINE;
  window.MO_CITIES = CITIES;
  window.MO_RIVERS = RIVERS;
  window.MO_PERCENTILE_CLASSES = PERCENTILE_CLASSES;
  window.MO_PERCENTILE_EXTRA = PERCENTILE_EXTRA;
  window.classifyPercentile = classifyPercentile;
  window.gaugeHistoryAt = gaugeHistoryAt;
  window.snapshotAt = snapshotAt;
  window.riverPercentileFromSnapshot = riverPercentileFromSnapshot;
})();
