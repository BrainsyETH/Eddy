-- 00104_correct_current_river_guide_data.sql
-- Corrects mile-marker errors and section assignments in the Current River
-- guide_data seeded by 00102. The original draft conflated Welch Spring
-- (mile 13.7, on the Cedargrove–Akers stretch) and Cave Spring (mile 21.9,
-- on the Akers–Pulltite stretch). All POI miles below match the live
-- get_river_pois() RPC, which is what the river-page float planner uses.
--
-- Adds a sixth section ("The springs run", Cedargrove → Akers Ferry) to
-- give Welch and Medlock the correct home. Existing FAQ / pro tips /
-- seasons / mile_stats are unchanged.

UPDATE blog_posts
SET guide_data = jsonb_set(
  jsonb_set(guide_data, '{springs}', $J$
    [
      { "name": "Cliff Jump",                "mile": "11.8", "note": "Small bluff jump on the Cedargrove–Akers stretch. Check water depth before you leap." },
      { "name": "Medlock Cave & Spring",     "mile": "12.6", "note": "River-right cave entrance just upstream of Welch — easy to miss. Worth a paddle-by." },
      { "name": "Welch Spring & Hospital",   "mile": "13.7", "note": "Ruined 1913 sanitarium built to use the spring's 'curative' air. Pull off river-right and walk up — this one is on the Cedargrove–Akers float, not Akers–Pulltite." },
      { "name": "Cave Spring",               "mile": "21.9", "note": "The famous flooded cave mouth you can paddle into. River-right between Akers and Pulltite. Stay near the entrance; it goes deep." },
      { "name": "Pulltite Spring",           "mile": "26.3", "note": "Smaller spring, easy walk-up from the Pulltite Campground at the takeout." },
      { "name": "Round Spring",              "mile": "35.2", "note": "Circular blue spring pool — a 50-foot-wide bowl. NPS interpretive site, walk to it from the parking lot." },
      { "name": "Big Spring",                "mile": "90.2", "note": "Largest single-outlet spring in Missouri (~290 million gallons/day). Reliably blue, surrounded by old CCC stonework." }
    ]
  $J$::jsonb),
  '{sections}', $J$
    [
      { "id": 1, "name": "Headwaters", "from": "Montauk", "to": "Cedargrove",
        "miles": "9", "time": "3–4 hr", "diff": "II", "crowd": "Quiet",
        "best": "Experienced paddlers, fly fishers",
        "photo": "https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/access-points/1770003451989-Montauk-9DBZH6CuKRaiCxQEd6sBa5MWkONotQ.png",
        "body": "Cold, fast, narrow, and tight against rhododendron-lined banks. This is trout country — Montauk State Park stocks the river daily in season — and the most technical water on the Current. Tan Vat (mile 0.9) and Baptist Camp (mile 2.1) shorten it to a half-day." },
      { "id": 2, "name": "The springs run", "from": "Cedargrove", "to": "Akers Ferry",
        "miles": "8", "time": "3–4 hr", "diff": "I–II", "crowd": "Moderate",
        "best": "Half-day floats, spring chasers, history buffs",
        "photo": "https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/access-points/1770002957258-Cedargrove_Camping-yzww7OvOt8bAQbx5r5cQi2prywhEP7.png",
        "body": "Cedargrove (mile 9) puts you straight into bluff country. Pass Cliff Jump (mile 11.8), Medlock Cave & Spring (12.6), and the standout: Welch Spring with its abandoned 1913 hospital ruins at mile 13.7 — pull off river-right and walk up. Take out at Akers Ferry, the last hand-cranked vehicle ferry in Missouri." },
      { "id": 3, "name": "The classic", "from": "Akers Ferry", "to": "Pulltite",
        "miles": "10", "time": "4–5 hr", "diff": "I", "crowd": "Busy summers",
        "best": "First-timers, families",
        "photo": "https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/access-points/1770138762324-Hickory_Landing-Syf9KcQjMk709morGPRranGWa6fbcJ.png",
        "body": "The most popular family float on the river. From Akers Ferry (mile 16.7) you drift down past Cave Spring at mile 21.9 — the flooded cave you can paddle into — and finish at Pulltite (mile 26.3), where the takeout is a designed campground with a boat ramp and another walk-up spring." },
      { "id": 4, "name": "The middle", "from": "Round Spring", "to": "Two Rivers",
        "miles": "17", "time": "6–7 hr or overnight", "diff": "I–II", "crowd": "Moderate",
        "best": "Overnighters, bluffs and quiet",
        "photo": "https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/access-points/1769964210817-Jerktail-yAc9L945aNRrMoORTETdXu0ONpFM2I.png",
        "body": "Round Spring (a 50-foot-wide blue bowl — walk to it from the parking lot) feeds the river with another 26 million gallons per day. From here it's gravel bars, towering bluffs, and a steady current down past Jerktail Landing (free camping), Broadfoot, and Two Rivers, where the Jacks Fork joins." },
      { "id": 5, "name": "Powder Mill to Big Spring", "from": "Powder Mill", "to": "Big Spring",
        "miles": "31", "time": "2–3 days", "diff": "I", "crowd": "Quiet midweek",
        "best": "Multi-day, springs and miles",
        "photo": "https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/access-points/1769959365528-Roberts_Field_Stilt_House-wJZVnwELX7eEt7a0h9hwGp0QDjGZmr.png",
        "body": "The big-water lower Current. The river widens, the bluffs get taller, and the gradient slackens just enough to let you stop swimming and start drifting. Stage at Powder Mill (mile 58.7), camp at Log Yard or Waymeyer, push through Van Buren Riverfront Park (mile 85.9), and finish at Big Spring (mile 90.2) — one of the largest single springs on Earth." },
      { "id": 6, "name": "Lower river", "from": "Big Spring", "to": "Doniphan",
        "miles": "≈30", "time": "1–2 days", "diff": "I", "crowd": "Sleepy",
        "best": "Long quiet drifts, anglers",
        "photo": null,
        "body": "Below Big Spring the river broadens further and motorboats become legal. Hickory Landing, Gooseneck, Bay Nothing, and Float Camp Recreation Area string along the south end before the river crosses into Mark Twain National Forest near Doniphan." }
    ]
  $J$::jsonb
),
updated_at = now()
WHERE slug = 'current-river-float-trips-missouri';
