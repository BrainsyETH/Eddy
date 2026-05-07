// River geometry and metadata for the Eddy interactive map.
// Coordinates are in the map's stylized 1600x1000 SVG space — NOT real lat/lng.
// Each river is a hand-crafted curve that flows top-left to bottom-right (downstream).
// Access points sit ON the path at parametric positions (0..1).

(function () {
  // ───────── Condition model ─────────
  // Each river has a current "stage" reading + interpretation. The same data drives
  // (a) particle speed/density, (b) line color/weight, (c) Eddy's verdict copy.
  //
  // Levels: bony < skinny < prime < pushy < blown
  //   bony    — too low to float comfortably, scraping
  //   skinny  — runnable but slow, walking the shoals
  //   prime   — sweet spot
  //   pushy   — high but floatable, fast, watch strainers
  //   blown   — flood / unsafe, stay off

  const LEVELS = {
    bony:    { label: "Bony",    badge: "low",     color: "#B89D72", glow: "rgba(184,157,114,0)",  weight: 2.0, speed: 0.25, density: 0.4, verdict: "wait",   blurb: "Scraping bottom — pack light or wait." },
    skinny:  { label: "Skinny",  badge: "low",     color: "#9BB5A8", glow: "rgba(155,181,168,.25)",weight: 2.5, speed: 0.55, density: 0.7, verdict: "wait",   blurb: "Runnable but slow. You'll walk a few shoals." },
    prime:   { label: "Prime",   badge: "flowing", color: "#2D7889", glow: "rgba(45,120,137,.45)", weight: 3.4, speed: 1.00, density: 1.0, verdict: "float",  blurb: "Right in the sweet spot. Great day to float." },
    pushy:   { label: "Pushy",   badge: "high",    color: "#3D8FB0", glow: "rgba(61,143,176,.55)", weight: 4.6, speed: 1.65, density: 1.3, verdict: "float",  blurb: "Moving fast. Strong paddlers only — watch for strainers." },
    blown:   { label: "Blown out",badge:"danger",  color: "#A33122", glow: "rgba(163,49,34,.55)",  weight: 5.8, speed: 2.40, density: 1.6, verdict: "danger", blurb: "Flood stage. Hard no. Stay off the water." },
  };

  // ───────── Rivers ─────────
  // Each river: an SVG path (cubic curves only, downstream order), a list of
  // access points (t = position along path 0..1), a current level, gauge meta,
  // and a "voice" — Eddy's note about the river itself.

  const RIVERS = [
    {
      id: "current",
      name: "Current River",
      blurb: "Eddy's home water. Spring-fed, cold, classic Ozark blue.",
      // Long, curving NNE → SSW spine
      path: "M 1080 140 C 1100 220, 1040 280, 1015 340 S 970 460, 980 540 S 945 660, 905 740 S 850 850, 790 905",
      level: "prime",
      gauge: { id: "07067000", site: "Van Buren, MO", reading: "3.21 ft", cfs: "412 cfs", trend: "steady" },
      voice: "Sitting at 3.2 ft — right in the sweet spot.",
      access: [
        { t: 0.04, name: "Baptist Camp",     type: "put-in",  difficulty: "I",   notes: "Gravel ramp. Outfitter shuttle.", lot: "40 cars" },
        { t: 0.20, name: "Cedargrove",       type: "put-in",  difficulty: "I",   notes: "Cold spring boil 200 yd downstream.", lot: "25 cars" },
        { t: 0.36, name: "Akers Ferry",      type: "both",    difficulty: "I-II",notes: "Last operating ferry on the river.", lot: "60 cars" },
        { t: 0.52, name: "Pulltite",         type: "both",    difficulty: "I",   notes: "Big spring + a quiet beach.", lot: "50 cars" },
        { t: 0.68, name: "Round Spring",     type: "both",    difficulty: "I",   notes: "Cave tours. Crowded summer weekends.", lot: "80 cars" },
        { t: 0.84, name: "Two Rivers",       type: "both",    difficulty: "I",   notes: "Confluence with Jacks Fork.", lot: "45 cars" },
        { t: 0.97, name: "Van Buren",        type: "take-out",difficulty: "I",   notes: "Town take-out. Showers, food.", lot: "ample" },
      ],
    },
    {
      id: "jacks-fork",
      name: "Jacks Fork",
      blurb: "The Current's wilder little sister. Bluffs, cold runs, a cave or two.",
      path: "M 720 380 C 780 400, 840 430, 900 470 S 990 510, 1015 540",
      level: "skinny",
      gauge: { id: "07066000", site: "Eminence, MO", reading: "1.8 ft", cfs: "118 cfs", trend: "falling" },
      voice: "Down to 1.8 ft. Doable but you'll be dragging.",
      access: [
        { t: 0.05, name: "Buck Hollow",   type: "put-in",  difficulty: "II",  notes: "Upper Jacks. Only floatable on high water.", lot: "15 cars" },
        { t: 0.30, name: "Bay Creek",     type: "both",    difficulty: "I-II",notes: "First reliable upper put-in.", lot: "20 cars" },
        { t: 0.55, name: "Alley Spring",  type: "both",    difficulty: "I",   notes: "Old red mill. Very photogenic.", lot: "70 cars" },
        { t: 0.78, name: "Eminence",      type: "both",    difficulty: "I",   notes: "Town take-out, outfitters everywhere.", lot: "ample" },
        { t: 0.96, name: "Two Rivers",    type: "take-out",difficulty: "I",   notes: "Joins the Current.", lot: "shared" },
      ],
    },
    {
      id: "eleven-point",
      name: "Eleven Point",
      blurb: "Wild & Scenic designation. Cold, clear, and lonelier than the Current.",
      path: "M 880 220 C 940 320, 1000 420, 1090 520 S 1180 700, 1230 820",
      level: "prime",
      gauge: { id: "07071500", site: "Bardley, MO", reading: "2.95 ft", cfs: "298 cfs", trend: "steady" },
      voice: "Holding at 2.95 ft. Cold and clean — pack a layer.",
      access: [
        { t: 0.08, name: "Thomasville",   type: "put-in",  difficulty: "I",   notes: "Headwaters. Skinny in summer.", lot: "12 cars" },
        { t: 0.30, name: "Cane Bluff",    type: "both",    difficulty: "I-II",notes: "First big put-in below Greer.", lot: "30 cars" },
        { t: 0.45, name: "Greer Crossing",type: "both",    difficulty: "II",  notes: "Greer Spring doubles the flow here.", lot: "40 cars" },
        { t: 0.65, name: "Riverton",      type: "both",    difficulty: "I-II",notes: "Hwy 160 bridge. Outfitter base.", lot: "55 cars" },
        { t: 0.85, name: "Whitten",       type: "take-out",difficulty: "I",   notes: "Quiet gravel bar take-out.", lot: "15 cars" },
        { t: 0.97, name: "Hufstedler",    type: "take-out",difficulty: "I",   notes: "Last public access before TLD.", lot: "10 cars" },
      ],
    },
    {
      id: "meramec",
      name: "Meramec",
      blurb: "Long, easy, family water. Closer to St. Louis than the rest.",
      path: "M 240 460 C 360 500, 480 540, 600 580 S 820 640, 940 690 S 1100 760, 1200 800",
      level: "pushy",
      gauge: { id: "07014500", site: "Steelville, MO", reading: "5.4 ft", cfs: "910 cfs", trend: "rising" },
      voice: "Up to 5.4 ft and rising. Moving — strong paddlers only today.",
      access: [
        { t: 0.05, name: "Maramec Spring",type: "put-in",  difficulty: "I",   notes: "Park access. Cold spring boil.", lot: "ample" },
        { t: 0.22, name: "Scott's Ford",  type: "both",    difficulty: "I",   notes: "Wide gravel bar. Family-friendly.", lot: "40 cars" },
        { t: 0.42, name: "Cherokee Landing", type: "both", difficulty: "I",   notes: "Outfitter base, full service.", lot: "60 cars" },
        { t: 0.62, name: "Onondaga",      type: "both",    difficulty: "I",   notes: "State park, cave tours.", lot: "70 cars" },
        { t: 0.82, name: "Meramec State Park", type: "both", difficulty:"I",  notes: "Big lot, restrooms, store.", lot: "ample" },
        { t: 0.97, name: "Robertsville",  type: "take-out",difficulty: "I",   notes: "Last public ramp before STL suburbs.", lot: "30 cars" },
      ],
    },
    {
      id: "big-piney",
      name: "Big Piney",
      blurb: "Quieter cousin of the Gasconade. Bluffs, cliffs, less traffic.",
      path: "M 540 220 C 600 280, 620 360, 640 440 S 660 580, 700 660",
      level: "prime",
      gauge: { id: "06933500", site: "Big Piney, MO", reading: "2.6 ft", cfs: "240 cfs", trend: "steady" },
      voice: "2.6 ft and clean. Eddy's quiet pick this weekend.",
      access: [
        { t: 0.08, name: "Slabtown",      type: "put-in",  difficulty: "I",   notes: "Tiny lot. Locals only.", lot: "8 cars" },
        { t: 0.28, name: "Dog's Bluff",   type: "both",    difficulty: "I-II",notes: "Tall bluff swim hole.", lot: "15 cars" },
        { t: 0.48, name: "Mason Bridge",  type: "both",    difficulty: "I",   notes: "Hwy AF crossing.", lot: "20 cars" },
        { t: 0.70, name: "Ross Access",   type: "both",    difficulty: "I",   notes: "MDC ramp. Free.", lot: "25 cars" },
        { t: 0.94, name: "Boiling Springs",type:"take-out",difficulty: "I",   notes: "Resort + take-out.", lot: "ample" },
      ],
    },
    {
      id: "niangua",
      name: "Niangua",
      blurb: "Bennett Spring's tailwater. Trout up top, float down low.",
      path: "M 380 700 C 460 720, 540 740, 620 770 S 780 820, 880 850",
      level: "prime",
      gauge: { id: "06923500", site: "Windyville, MO", reading: "3.0 ft", cfs: "355 cfs", trend: "steady" },
      voice: "3.0 ft and trout-cold up top. Float warms up by Prosperine.",
      access: [
        { t: 0.05, name: "Bennett Spring",type: "put-in",  difficulty: "I",   notes: "Trout park. Fly water.", lot: "ample" },
        { t: 0.30, name: "Barclay",       type: "both",    difficulty: "I",   notes: "Big outfitter hub.", lot: "100+ cars" },
        { t: 0.55, name: "Prosperine",    type: "both",    difficulty: "I",   notes: "Family-style float ends here.", lot: "70 cars" },
        { t: 0.78, name: "Moon Valley",   type: "both",    difficulty: "I",   notes: "Long quiet pools.", lot: "30 cars" },
        { t: 0.96, name: "Hwy 64 Bridge", type: "take-out",difficulty: "I",   notes: "Last access before Lake of the Ozarks.", lot: "20 cars" },
      ],
    },
    {
      id: "huzzah",
      name: "Huzzah Creek",
      blurb: "Small, fast, and rowdy. Best on the rise after a rain.",
      path: "M 460 360 C 500 420, 540 460, 580 500 S 620 540, 640 560",
      level: "bony",
      gauge: { id: "07014000", site: "Davisville, MO", reading: "1.2 ft", cfs: "48 cfs", trend: "falling" },
      voice: "1.2 ft. Bony. Wait for the next rain — then it sings.",
      access: [
        { t: 0.10, name: "Red Bluff",     type: "put-in",  difficulty: "II",  notes: "USFS campground. Walk-in.", lot: "20 cars" },
        { t: 0.40, name: "Scotia Bridge", type: "both",    difficulty: "I-II",notes: "Tight, fast water above here.", lot: "12 cars" },
        { t: 0.70, name: "Hazel Creek",   type: "both",    difficulty: "I",   notes: "Outfitter base.", lot: "40 cars" },
        { t: 0.95, name: "Huzzah Confluence", type: "take-out", difficulty:"I", notes: "Joins the Meramec.", lot: "shared" },
      ],
    },
  ];

  window.RIVER_LEVELS = LEVELS;
  window.RIVERS = RIVERS;
})();
