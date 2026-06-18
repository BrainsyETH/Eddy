# River Guide Image Sourcing Runbook

Goal: bring every River Guide float card and hero up to photo parity. Four of the
six new guides already have Eddy-hosted photos on every card (Eleven Point,
Meramec, Niangua, Huzzah). This runbook covers the remaining gaps:

| Guide | Hero | Float cards missing a photo |
|-------|------|------------------------------|
| **Jacks Fork** | borrowed NPS Rocky Falls shot → replace | all 4 |
| **Courtois Creek** | reuses the Huzzah Conservation Area photo → replace | all 3 |
| **Current River** | OK (Montauk) | §6 "Lower river" only |

> Why this is a runbook and not finished assets: the session that wrote the
> guides had no outbound internet and no Vercel blob token, so it could neither
> download candidate photos nor host them. Everything except the actual
> file-fetch is prepared here.

## Hosting: just drop files in `public/`

No blob token needed. Files under `missouri-float-planner/public/blog/<river>/`
are served from Eddy's own origin/CDN (Vercel edge), same-origin so no
`next.config` image allowlist entry is required. The companion migration
(`supabase/migrations/00135_river_guide_section_images.sql`) already points each
photo field at these stable paths — so the workflow is:

1. Pick a properly-licensed photo for a slot (see tables below).
2. Save it (resized to ~1600px wide, optimized `.jpg`) at the exact target path.
3. Once all the files for a river are in place, run that river's block in
   migration `00135` (or the whole file). **Do not run a river's block before its
   files exist** — a missing file renders a broken `<img>`, which is worse than
   the clean numbered-tile fallback.
4. Record attribution in the "Credits" section at the bottom of this file for any
   non-public-domain (Creative Commons) image.

## Licensing rules

- **NPS images** (nps.gov) are generally public domain, **but** some carry an
  individual photographer/volunteer credit with restrictions. Check the credit
  line on each image's page; only use ones marked NPS / public domain.
- **Wikimedia Commons**: each file has its own license. Prefer **Public
  Domain / CC0 / CC-BY**. Record author + license + file URL for any CC image.
  CC-BY (and CC-BY-SA) require visible attribution — add it to Credits below.
- **USFS** (Mark Twain National Forest) photos are often public domain; verify
  per image.
- Avoid "all rights reserved" stock, outfitter, or random web images.

## Slot manifest

Target paths are relative to `missouri-float-planner/public/`. The
`guide_data` field column is what migration `00135` sets.

### Jacks Fork — `blog/jacks-fork/` (slug `jacks-fork-river-float-trips-missouri`)

| Slot | guide_data field | Target file | Subject | Where to look |
|------|------------------|-------------|---------|---------------|
| Hero | `hero.photo_url` | `blog/jacks-fork/hero.jpg` | The river itself: a bluff-lined Jacks Fork float, or the iconic red Alley Mill | NPS *Alley Spring and Mill* (public domain): nps.gov/places/alley-spring-and-mill.htm · Commons **Category:Jacks Fork River** (~7 photos) |
| §1 Upper canyon (Buck Hollow→Rymers) | `sections[id=1].photo` | `blog/jacks-fork/01-upper-canyon.jpg` | Jam Up Cave's 80-ft arch, or upper-canyon bluffs | NPS *ozar* Jam Up Cave pages · Commons Category:Jacks Fork River |
| §2 Rymers→Alley | `sections[id=2].photo` | `blog/jacks-fork/02-rymers-to-alley.jpg` | gravel bar / mid-river bluff | Commons Category:Jacks Fork River |
| §3 Alley Spring run (Alley→Eminence) | `sections[id=3].photo` | `blog/jacks-fork/03-alley-spring.jpg` | Alley Spring's blue pool or the red mill | NPS nps.gov/places/alley-spring-and-mill.htm (PD) |
| §4 Eminence→Two Rivers | `sections[id=4].photo` | `blog/jacks-fork/04-eminence-two-rivers.jpg` | Jacks Fork–Current junction near Eminence | Commons (a junction photo near Eminence exists) |

### Current River — `blog/current/` (slug `current-river-float-trips-missouri`)

| Slot | guide_data field | Target file | Subject | Where to look |
|------|------------------|-------------|---------|---------------|
| §6 Lower river (Big Spring→Doniphan) | `sections[id=6].photo` | `blog/current/06-lower-river.jpg` | Big Spring's blue pool, or the wide lower Current | NPS *Big Spring* (PD): nps.gov/ozar/learn/historyculture/big-spring.htm · Commons Category:Springs of Missouri / Category:Current River (Missouri) |

### Courtois Creek — `blog/courtois/` (slug `courtois-creek-float-trips-missouri`)

> **No open-licensed Courtois Creek photos exist on Wikimedia Commons** (verified
> by search — the category is empty). Best options, in order: (1) an original or
> outfitter-supplied photo (Bass River Resort is the on-creek operator); (2) a
> USFS Mark Twain National Forest / Berryman area public-domain photo; (3) leave
> these as the clean numbered-tile fallback (don't add files / don't run the
> Courtois block). Do **not** substitute a generic non-Courtois photo labeled as
> a specific creek bend.

| Slot | guide_data field | Target file | Subject |
|------|------------------|-------------|---------|
| Hero | `hero.photo_url` | `blog/courtois/hero.jpg` | a clear Ozark creek / Mark Twain NF scene |
| §1 Brazil→Highway 8 | `sections[id=1].photo` | `blog/courtois/01-brazil-hwy8.jpg` | secluded upper creek |
| §2 Highway 8→Bass River | `sections[id=2].photo` | `blog/courtois/02-hwy8-bass-river.jpg` | limestone bluffs |
| §3 Bass River→Scotia | `sections[id=3].photo` | `blog/courtois/03-bass-river-scotia.jpg` | gravel bars |

## Credits

Fill in for every Creative Commons (non-public-domain) image used, so the site
satisfies CC attribution:

```
blog/<river>/<file>.jpg — "<photo title>" by <author>, <license> — <source URL>
```

(NPS / USFS public-domain images need no attribution but are nice to credit.)
