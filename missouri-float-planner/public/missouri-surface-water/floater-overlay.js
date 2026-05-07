// floater-overlay.js — curated floater data layered on top of the statewide
// percentile map. Maps a subset of MO_RIVERS to outfitter-style stage thresholds,
// surfaces 3-day forecast, water temp, days-since-rain, and dam-controlled flags.
//
// Drawn from the canonical Eddy river-data.js + plausible outfitter ranges.

(function () {

  // Per-river floater profile.
  // stageBands: gauge-height feet boundaries — bony / prime / pushy / hazardous
  // baseStage: representative current stage (ft) used when no other source available
  // tempF: representative water temp right now (°F)
  // daysSinceRain: integer
  // damControlled: true if release-controlled (tailwater)
  // popularPutIn / popularTakeOut, classRating, milesTypical
  const FLOATER = {
    "current": {
      label: "Current River",
      stageBands: { bony: 1.8, prime: 2.2, pushy: 4.5, hazard: 6.0 },
      baseStage: 3.21, tempF: 62, daysSinceRain: 4, damControlled: false,
      classRating: "I–II", milesTypical: "8–10",
      popularPutIn: "Akers Ferry", popularTakeOut: "Pulltite",
      note: "Spring-fed, glassy clear when rain holds off. Family-friendly Akers→Pulltite.",
    },
    "jacks-fork": {
      label: "Jacks Fork",
      stageBands: { bony: 2.0, prime: 2.4, pushy: 4.2, hazard: 5.5 },
      baseStage: 1.8, tempF: 64, daysSinceRain: 6, damControlled: false,
      classRating: "I–II", milesTypical: "10–14",
      popularPutIn: "Bay Creek", popularTakeOut: "Alley Spring",
      note: "Upper reaches need 2.4+ to avoid scraping. Bony below that.",
    },
    "eleven-point": {
      label: "Eleven Point",
      stageBands: { bony: 2.5, prime: 3.0, pushy: 5.0, hazard: 7.0 },
      baseStage: 2.95, tempF: 58, daysSinceRain: 5, damControlled: false,
      classRating: "I–II", milesTypical: "10–18",
      popularPutIn: "Greer Crossing", popularTakeOut: "Riverton",
      note: "Wild & Scenic. Greer Spring doubles flow mid-stretch — cold all summer.",
    },
    "meramec": {
      label: "Meramec",
      stageBands: { bony: 2.5, prime: 3.5, pushy: 5.0, hazard: 7.5 },
      baseStage: 5.4, tempF: 71, daysSinceRain: 1, damControlled: false,
      classRating: "I", milesTypical: "6–12",
      popularPutIn: "Scott's Ford", popularTakeOut: "Cherokee",
      note: "Closest float to St. Louis. Pushy after recent rain.",
    },
    "big-piney": {
      label: "Big Piney",
      stageBands: { bony: 2.0, prime: 2.4, pushy: 4.0, hazard: 5.5 },
      baseStage: 2.6, tempF: 67, daysSinceRain: 8, damControlled: false,
      classRating: "I–II", milesTypical: "8–14",
      popularPutIn: "Mason Bridge", popularTakeOut: "Ross Access",
      note: "Quieter than the Gasconade. Bluffs and gravel bars.",
    },
    "niangua": {
      label: "Niangua",
      stageBands: { bony: 2.4, prime: 2.8, pushy: 4.5, hazard: 6.0 },
      baseStage: 3.0, tempF: 56, daysSinceRain: 5, damControlled: true,
      classRating: "I", milesTypical: "6–10",
      popularPutIn: "Bennett Spring", popularTakeOut: "Prosperine",
      note: "Bennett Spring tailwater — trout-cold up top. Release-affected.",
    },
    "huzzah": {
      label: "Huzzah Creek",
      stageBands: { bony: 1.8, prime: 2.2, pushy: 3.6, hazard: 5.0 },
      baseStage: 1.2, tempF: 70, daysSinceRain: 9, damControlled: false,
      classRating: "I–II", milesTypical: "6–8",
      popularPutIn: "Scotia", popularTakeOut: "Hazel Creek",
      note: "Best on the rise after a rain. Bony otherwise.",
    },
    "courtois": {
      label: "Courtois Creek",
      stageBands: { bony: 1.8, prime: 2.2, pushy: 3.4, hazard: 4.8 },
      baseStage: 2.5, tempF: 68, daysSinceRain: 4, damControlled: false,
      classRating: "I–II", milesTypical: "5–8",
      popularPutIn: "Berryman", popularTakeOut: "Bass' River Resort",
      note: "Twisty, intimate. Joins Huzzah then Meramec.",
    },
    "black": {
      label: "Black River",
      stageBands: { bony: 2.2, prime: 2.8, pushy: 4.5, hazard: 6.5 },
      baseStage: 3.4, tempF: 70, daysSinceRain: 3, damControlled: true,
      classRating: "I–II", milesTypical: "6–12",
      popularPutIn: "Annapolis", popularTakeOut: "Lesterville",
      note: "Clearwater Lake release controls flow downstream of Annapolis.",
    },
    "north-fork-white": {
      label: "North Fork White",
      stageBands: { bony: 2.0, prime: 2.5, pushy: 4.0, hazard: 5.5 },
      baseStage: 2.7, tempF: 60, daysSinceRain: 7, damControlled: false,
      classRating: "I–II", milesTypical: "8–12",
      popularPutIn: "Hammond Camp", popularTakeOut: "Patrick Bridge",
      note: "Spring-fed, trout water up top. Less crowded than the Current.",
    },
    "bryant": {
      label: "Bryant Creek",
      stageBands: { bony: 1.8, prime: 2.3, pushy: 3.8, hazard: 5.0 },
      baseStage: 1.9, tempF: 64, daysSinceRain: 8, damControlled: false,
      classRating: "I–II", milesTypical: "5–9",
      popularPutIn: "Vera Cruz", popularTakeOut: "Hodgson Mill",
      note: "Small water, narrow corridors. Needs recent rain.",
    },
    "james": {
      label: "James River",
      stageBands: { bony: 2.0, prime: 2.6, pushy: 4.2, hazard: 6.0 },
      baseStage: 2.5, tempF: 69, daysSinceRain: 6, damControlled: false,
      classRating: "I–II", milesTypical: "6–10",
      popularPutIn: "Hootentown", popularTakeOut: "Galena",
      note: "Springfield-area float. Smallmouth water.",
    },
    "elk": {
      label: "Elk River",
      stageBands: { bony: 1.8, prime: 2.4, pushy: 3.8, hazard: 5.5 },
      baseStage: 3.1, tempF: 73, daysSinceRain: 2, damControlled: false,
      classRating: "I", milesTypical: "5–8",
      popularPutIn: "Pineville", popularTakeOut: "Tiff City",
      note: "SW corner. Warmer than Ozark spring rivers — good for July.",
    },
    "spring": {
      label: "Spring River",
      stageBands: { bony: 2.0, prime: 2.6, pushy: 4.2, hazard: 6.0 },
      baseStage: 3.6, tempF: 66, daysSinceRain: 2, damControlled: false,
      classRating: "I–II", milesTypical: "6–10",
      popularPutIn: "Carthage", popularTakeOut: "Riverton",
      note: "Pushy this week — recent rain in basin.",
    },
    "gasconade": {
      label: "Gasconade",
      stageBands: { bony: 2.5, prime: 3.5, pushy: 5.5, hazard: 8.0 },
      baseStage: 3.6, tempF: 69, daysSinceRain: 5, damControlled: false,
      classRating: "I–II", milesTypical: "8–14",
      popularPutIn: "Riddle Bridge", popularTakeOut: "Jerome",
      note: "Big curling Ozark river. Long pools.",
    },
  };

  // Stage classification → floater verdict
  const STAGE_VERDICTS = {
    bony:    { label: "Bony",      color: "#B89D72", inner: "#D9C9B0", desc: "Will scrape — pack light or wait." },
    prime:   { label: "Prime",     color: "#2D7889", inner: "#4EB86B", desc: "Sweet spot. Go." },
    pushy:   { label: "Pushy",     color: "#1A4F5C", inner: "#3E8FB8", desc: "Fast — strong paddlers only." },
    hazard:  { label: "Hazardous", color: "#A33122", inner: "#DC2626", desc: "Stay off the water." },
    unknown: { label: "—",         color: "#6B6459", inner: "#A49C8E", desc: "" },
  };

  function stageToVerdict(stage, bands) {
    if (!bands || stage == null) return "unknown";
    if (stage < bands.bony) return "bony";
    if (stage < bands.prime) return "bony";   // below prime threshold
    if (stage < bands.pushy) return "prime";
    if (stage < bands.hazard) return "pushy";
    return "hazard";
  }

  // Synthetic 3-day forecast: project stage forward based on regional events
  // already in the synthetic record. Returns array [t+1, t+2, t+3] of stages.
  function stageForecast(riverId, dayOffset) {
    const fp = FLOATER[riverId];
    if (!fp) return null;
    const out = [];
    const base = fp.baseStage;
    // Tiny modulation derived from the river id seed to make it not flat
    const seed = riverId.length * 7 + 13;
    for (let d = 1; d <= 3; d++) {
      const phase = ((d + seed) % 9) / 9 * Math.PI;
      const drift = Math.sin(phase) * (base * 0.08);
      const trend = (fp.daysSinceRain < 3 ? 0.15 : -0.05) * d;
      out.push(+(base + drift + trend).toFixed(2));
    }
    return out;
  }

  // For a river, derive current floater stage (we use baseStage for now —
  // real impl would pull live USGS gh).
  function currentStage(riverId) {
    return FLOATER[riverId] ? FLOATER[riverId].baseStage : null;
  }

  function floaterVerdict(riverId) {
    const fp = FLOATER[riverId];
    if (!fp) return "unknown";
    return stageToVerdict(fp.baseStage, fp.stageBands);
  }

  window.MO_FLOATER = FLOATER;
  window.MO_STAGE_VERDICTS = STAGE_VERDICTS;
  window.stageToVerdict = stageToVerdict;
  window.stageForecast = stageForecast;
  window.currentStage = currentStage;
  window.floaterVerdict = floaterVerdict;
})();
