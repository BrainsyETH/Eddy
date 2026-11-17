# Services for Big Sugar Creek and the Illinois River (OK), November 2026

Phase 8.5 research for two new rivers. **Nothing has been written to any database.** Sources
were checked on 2026-11-02, so `source_checked_at` stays valid until about 2027-05-01
(`SOURCE_MAX_AGE_DAYS = 180`).

| River | New businesses in the CSV | Links to existing rows | Held or excluded |
|---|---|---|---|
| `illinois-river` | **10** (8 outfitters, 2 campgrounds): `services-illinois-river.csv` | none | 13 (see below) |
| `big-sugar-creek` | **0** | **1** (a `big-sugar-creek` link for Big Elk): `services-big-sugar-creek.csv` | 5 (see below) |

## Blocked: neither river row exists yet

Production has neither a `big-sugar-creek` nor an `illinois-river` row in `rivers` (read-only
query, 2026-11-02). I ran the importer's validate-only mode on both files (no `--import`). It
read production through a read connection (`ilefwfpvphadsbptiaur (read)`) and refused both
files for one reason only:

- `services-illinois-river.csv` plans 10 INSERTs. It reports 10 problems, all of them
  `unknown river slug(s): illinois-river`. It found no name collisions, no
  `insertProblems` (every row has `city`), and no offering, source, date or coordinate errors.
- `services-big-sugar-creek.csv` plans 1 UPDATE. It reports 1 problem:
  `unknown river slug(s): big-sugar-creek`.

I did not work around this. Once Phase 9 creates each river row, re-run the validation, read
the diff, and import:

```bash
cd missouri-float-planner
export EXPECTED_SUPABASE_REF=ilefwfpvphadsbptiaur
npx tsx scripts/import-services-csv.ts scripts/ingestion/services-illinois-river.csv --out /tmp/illinois-services.diff.txt
npx tsx scripts/import-services-csv.ts scripts/ingestion/services-big-sugar-creek.csv --out /tmp/big-sugar-services.diff.txt
# after review and explicit authorization only:
npx tsx scripts/import-services-csv.ts scripts/ingestion/services-illinois-river.csv --import
npx tsx scripts/import-services-csv.ts scripts/ingestion/services-big-sugar-creek.csv --import
npm run db:check-services
```

**Do not** pass `--overwrite` to the Big Sugar file. It would let the importer remove links and
re-point `is_primary`.

## Where the authority comes from

- **GRDA (the regulator) publishes an outfitter list.** The
  [2025 GRDA Illinois River Guide and Map](https://grda.com/wp-content/uploads/2025/06/Illinois-River-Guide-and-Map-2025-final.pdf)
  is the latest GRDA document that lists commercial resorts and float operators. It gives each
  one's address, phone, website and river mile, plus key icons: Camping, Vessel Rentals,
  Shuttle (private vessels), and Cabins and/or RV Hook-up.
  - The icons cannot be used as `services_offered` on their own. "Vessel rentals", "Camping" and
    "Cabins and/or RV" each map to more than one enum value, which is the same ambiguity the
    importer rejects for `camping` and `lodging`.
  - So each row's offerings come from the operator's own pages, or from TravelOK for Riverside.
- **GRDA licensing.** The Feb 2024 GRDA board deck
  ([scenic rivers licensing capacity study](https://illinoisriver.org/images/uploads/20240216/scenic-rivers-licensing-capacity-study-bod-2-20741.pdf),
  GRDA letterhead, hosted by illinoisriver.org) lists every commercial float operator's 2024
  licence renewal and its 2016–2023 floater counts. It is the only per-operator licence list
  GRDA has published that I could find. GRDA's own Illinois River page links no licence list.
- **TravelOK** (Oklahoma Tourism & Recreation Department) listings are agency directory pages.
  They are undated, so I used them to corroborate only. The one exception is Riverside, where
  TravelOK is the readable source for services; see that entry.

**Rule applied to the Illinois list.** A business went into the CSV only if all three held:
(a) it is on GRDA's 2025 list, or it is a riverside campground with its own live site;
(b) its details could be read today from its own live site, or from an agency listing when
the site was unreachable; and (c) nothing signals that it has closed or lost its licence.

## Illinois River: the 10 rows in the CSV

No row has coordinates. All are `managing_agency=Private` except Echota (left blank: it is a
tribal enterprise, and the importer's agency enum has no tribal value). River miles in the
descriptions are GRDA's.

### Arrowhead Resort (`arrowhead-resort`), outfitter, GRDA RM 32.5

- **Operating:** the rules page carries "POLICY – CANCELLATION 2026". GRDA 2025 lists it, and it
  held 381 licences in 2024.
- **Sources:** [home](https://arrowheadresortok.com/), [floating](https://arrowheadresortok.com/floating),
  [camping](https://arrowheadresortok.com/camping), [cabins](https://arrowheadresortok.com/cabins),
  rules-and-policies page.
- **Address and phones:** address, phone and email come from the site. The toll-free number
  800-749-1140 comes from the GRDA guide. Reservations go through the Campspot link on the site
  (Campspot returns 403 to automated fetches).
- **Offerings:**
  - raft and single/tandem kayak rental (floating page);
  - full RV hookups, electric and non-electric main campground, primitive sites 43–57 with
    picnic tables (camping page);
  - cabins;
  - "showerhouse nearby" (cabins page).
- **Not claimed:**
  - `shuttle`: the site describes no shuttle for private boats, and GRDA shows no shuttle icon.
  - "Arrowhead-Thunderbird", a name one directory uses. I could not confirm it from a primary
    source, so it is not in `alt_names`. "Thunderbird Resort" from the lead list appears to be
    this business.

### Eagle Bluff Resort (`eagle-bluff-resort`), outfitter, GRDA RM 36.1

- **Operating:** the site shows a live price list ("NEW CAMPING RATES ARE HERE!") and a
  FareHarbor booking link. Guest reviews on the site run from Jul to Oct 2025. GRDA 2025 lists
  it, and it held 319 licences in 2024.
- **Sources:** [home](https://www.eaglebluffresort.com/), [price list](https://www.eaglebluffresort.com/price-list),
  [services](https://www.eaglebluffresort.com/services), about-us page.
- **Offerings:**
  - raft, kayak and tube rental ("Kayak, raft & tube rentals"; tube trips);
  - primitive camping (Family and Late Night campgrounds), electric sites and full-hookup RV sites;
  - cabins (Bigfoot, Big Buck, Elk Lodge, Black Bear, Big Barn);
  - "hot showers", "On-site camp store", "Restaurant on-site & open on weekends" (home page).
- **Not claimed:**
  - `shuttle`: "shuttle service" on the about page is for its own floats, not a stated
    private-boat shuttle.
  - Email: Cloudflare obfuscates it on the page.
  - Toll-free number: GRDA prints only the vanity form 1-800-OK-RIVER.
- **Source disagreement:** the site's "ideal 3.5–5.5 ft" water level names no gauge. It is
  rejected in the dossier and does not belong here.

### Peyton's Place Resort (`peytons-place-resort`), outfitter, GRDA RM 36.8

- **Operating:** the home page says "Reserve Now for the 2026 Season!" and "© 2026". It also says
  "Closed for Season" (seasonal), and carries a stale banner saying the 2025 season is open.
  I did not record the temporary closure in `seasonal_notes`. GRDA 2025 lists it, and it held
  420 licences in 2024.
- **Sources:** [home](https://www.peytonsplace.com/), [float trips & rates](https://www.peytonsplace.com/FloatTripsRates.html),
  [accommodations](https://www.peytonsplace.com/Accommodations/), [contact](https://www.peytonsplace.com/ContactUs.html).
- **Address and phones:** phone and toll-free come from the site. The email is the reservations
  address on the contact page. Reservations go through the ResNexus link on the site.
- **Offerings:**
  - canoe, raft and kayak rental, with "Rates include shuttles" (its own floats only, so no
    `shuttle`);
  - A-frame and log cabins, apartment, bunkhouse;
  - RV park "19 spaces with 50 Amp electrical, sewage and water", so `rv_sites=19`;
  - electric and primitive campsites, with "picnic tables… restroom/ shower facility";
  - camp store.
- **Not claimed:** `lodge_rooms`, even though the site mentions a "48-bed lodge". It is a group
  bunk lodge and is covered by the description.

### War Eagle Resort (`war-eagle-resort`), outfitter, GRDA RM 39.8

- **Operating:** "© 2026". The site says "Online booking is coming for 2027" and asks guests to
  book by phone or email. GRDA 2025 lists it, and it held 692 licences in 2024 (the most).
- **Sources:** [home](https://wareagleresort.com/), [floating](https://wareagleresort.com/floating),
  [camping](https://wareagleresort.com/camping).
- **Address and phones:** the toll-free number comes from the GRDA guide.
- **Offerings:**
  - raft and kayak rental;
  - "Cabins, bunk houses, and motels", so `cabins` and `lodge_rooms`;
  - primitive tent camping and RV camping;
  - "the store" next to the main office.
- **Source disagreement:** the home page says "full-hookup RV". The camping page says
  water + electric, "no sewer". The description follows the camping page.
- **Seasonal notes:** "every stay requires at least one float trip" is a standing policy, so it
  went into `seasonal_notes`, following the Shady Beach precedent.

### Diamondhead Resort (`diamondhead-resort`), outfitter, GRDA RM 40.0

- **Operating:** the site has current rate pages. The footer reads "© 2025". GRDA 2025 lists it,
  and it held 516 licences in 2024. GRDA lists `diamondheadresort.us`, which redirects to
  `diamondheadresorts.com`.
- **Sources:** [floating](https://diamondheadresorts.com/float_the_illinois_river_with_diamondhead_resort_in_tahlequah/),
  [camping & RV](https://diamondheadresorts.com/camping_and_rv_hookups_at_diamondhead_resort_tahlequah_oklahoma/),
  [lodging](https://diamondheadresorts.com/motel-cabins-bunkhouses/),
  [directions](https://diamondheadresorts.com/directions_to_diamondhead_resort_in_tahlequah_oklahoma/).
- **Address and phones:** the street address comes from the site's map link (12081 OK-10). Both
  phones appear on the site.
- **Offerings:**
  - raft and single/tandem kayak rental;
  - primitive tent camping, water + electric RV sites and 30/50-amp full-hookup RV sites;
  - motel rooms, so `lodge_rooms`; cabins; bunkhouses;
  - "showers stay hot".
- **Not claimed:** `shuttle`. "We'll handle the shuttle" refers to its own floats.

### Illinois River Outfitters (`illinois-river-outfitters`), outfitter, GRDA RM 40.0

- **Operating: weakest evidence of the own-site group.** The site has live rates and a FareHarbor
  booking link but no date. GRDA 2025 lists it, it held 75 licences in 2024, and it reported
  9,808 floaters in 2023.
- **Source:** [home](https://www.illinoisriveroutfitters.com/), a one-page site.
- **Address:** the street address comes from the GRDA guide. **`zip` is left blank** because GRDA
  prints "74664", which looks like a typo for 74464, and the site gives no address.
- **Offerings:**
  - raft and sit-on-top kayak rental;
  - **private-boat shuttle**: "Private Shuttle Service… people that bring their own equipment",
    priced from Edmondson ($20), Peavine Hollow ($25), Round Hollow ($35) and Chewey Bridge
    ($50) to its landing. GRDA also shows the shuttle icon;
  - A-frame cabins, full-service RV hookups and primitive tent camping.
- This is the only Illinois row with `shuttle`. I used `shuttle` only for a stated
  private-boat shuttle, which is GRDA's own icon definition.

### Riverbend Floats (`riverbend-floats`), outfitter, GRDA RM 55.0

- **Operating:** "© 2026", with Peek booking links. GRDA 2025 lists it.
  `riverbendbythebridge.com` redirects to this site. GRDA's 2024 renewals list "Riverbend by
  the Bridge" (338 licences) and "Riverbend Floats" (100) separately, and they now appear to be
  one business, so "Riverbend by the Bridge" is in `alt_names`.
- **Sources:** [home](https://www.riverbendfloats.com/), [contact](https://www.riverbendfloats.com/contact),
  [information](https://www.riverbendfloats.com/information).
- **Address:** 17252 SH-10 (contact page).
- **Phone disagreement:** the site shows 918-207-5373. GRDA and TravelOK show 918-708-6800. The
  CSV uses the operator's own number.
- **Offerings:**
  - raft, kayak and tube rental (incl. cooler tubes), with a bus to its private launch;
  - "Cabin rentals… three different cabin options", so `cabins`.
- **Not claimed:** any camping offering. GRDA shows a camping icon, but the site offers no
  camping.

### Riverside Camp (`riverside-camp`), outfitter, GRDA RM 27.5

- **Operating:** GRDA 2025 lists it, it held 150 licences in 2024 ("Riverside Camp, Inc."), and
  it reported 5,386 floaters in 2023. `riversideresortokla.com` answers but returns **403** to
  automated fetches, so the site could not be read.
- **Primary sources:** the GRDA guide (name, address, phone, website, river mile) and
  [TravelOK id 6406](https://www.travelok.com/listings/view.profile/id.6406) ("Riverside
  Resort"; services).
- **Offerings (TravelOK):**
  - raft, canoe and kayak rental;
  - cabins with kitchenettes and a group lodge;
  - "electric hookup sites as well as primitive camping sites";
  - camp store.
- **Not claimed:**
  - `camping_rv`: "electric hookup sites" does not say RV.
  - The TravelOK season (May 1 – Labor Day): the listing is undated.
- **Recheck:** the services and season before import, once the site can be read.

### Highwater Camp (`highwater-camp`), campground, GRDA RM 11.8 (Watts, above Flint Creek)

- **Operating:** the site links GRDA's camping-permit store with a 2026-06-19 booking date and
  states the season "Open May 1st - November 15th", so `season_open_month=5` and
  `season_close_month=11`. GRDA 2025 lists it.
- **Sources:** [home](https://www.highwatercamp.com/), [camping](https://www.highwatercamp.com/camping),
  FAQs, river access pass page.
- **Address and phone:** the street address comes from GRDA; phone and email from the site.
- **Offerings:**
  - one primitive group site (#3) and two electric RV/tent sites (#1, #2), so
    `camping_primitive` and `camping_rv`;
  - "Picnic tables, trash barrels, and fire rings".
- **Explicitly none:** boat rentals, shuttle, showers, running water.
- **Private-boat landing:** non-campers can buy a River Access Pass to launch or take out at its
  gravel bar. This is in the description. It is a published private-landing term, a candidate
  launch point for the dossier's upper section that has not been reviewed as an access point.
- **Site counts:** `tent_sites` and `rv_sites` are left blank. Site #3 is one open group area,
  not a count of sites.

### Echota Village RV Park (`echota-village-rv-park`), campground

- **Operating:** "© Echota Village RV Park 2026". The rates page says "Camping (RV/tent) is
  available all year".
- **Not on GRDA's 2025 outfitter list.** GRDA licensed "Echota Village" for 46 float licences in
  2024, but today's site advertises no floats. So it is a campground, not an outfitter, and has
  no rental offerings.
- **Sources:** [home](https://www.echotavillagerv.com/), [rates](https://www.echotavillagerv.com/rates/).
- **Offerings:**
  - "16 RV slips… sewer hookup, electric and water", so `rv_sites=16`;
  - primitive tent area and bell-tent rentals;
  - a "Double Wide Cabin" rental (the site notes it is currently closed for the season);
  - convenience store.
- **Operator:** the site says it is run by the United Keetoowah Band of Cherokee Indians
  Corporate Board. `managing_agency` is blank because the CHECK constraint has no tribal value.
- **River mile:** none given. The address (16315 Hwy 10) is next to Falcon Floats (RM 53.4), but
  the site states no mile.

## Big Sugar Creek

### Proposed link for an existing Elk business: Big Elk Floats and Camping (in the CSV)

`big-elk-floats-and-camping` should get a **secondary** `big-sugar-creek` link. Do not create a
new row for it.

- [Floating page](https://bigelkfloatsandcamping.com/floating/): "Big Sugar personal boats are
  boat shuttle only. we can not vehicle shuttle." ($40 per boat).
- [Home page](https://bigelkfloatsandcamping.com/): "canoeing, and kayaking on Missouri's scenic
  Elk River & Big Sugar Creek".

**Can the importer add this link safely? Yes.** The row names `slug` explicitly and claims only
the existing `name` and `type`, the existing `verified_source`, and `source_checked_at`.

- **Links are only added.** `planRow` adds only links the service lacks
  (`import-services-csv.ts`, `linkAdds` at line 655). Without `--overwrite` it removes nothing
  (`linkRemoves`, lines 658–659) and never re-points the primary (`primaryFlips`, lines
  663–668).
- **The new link is not primary.** For an update, `insert_primary` is `null` (line 946). The RPC
  inserts a new link with `is_primary = (slug = insert_primary)`, which is false, and does
  nothing if the link already exists. See `20260824184746_river_links_say_where_they_came_from.sql`,
  lines 118–122. `elk` stays primary.
- **The new link records a source.** It gets `verified_source = https://bigelkfloatsandcamping.com/`
  with `checked_at = 2026-11-02`.
- **The only column write is `last_verified_at`**, from 2026-10-04 to 2026-11-02.
  `verified_source` is unchanged because the CSV repeats the stored value. I confirmed this in
  the live validate-only diff. An offline `planRow` check, with `big-sugar-creek` added to the
  river map, gives `UPDATE … last_verified_at …` and `+ river link big-sugar-creek`, with no
  removes and no primary flips.
- **Never run this file with `--overwrite`.**

**Other Elk businesses: not proposed.**

- Shady Beach, Elk River Floats/Wayside and River Ranch: their home pages do not mention
  Big Sugar.
- Eagles Nest Camp & Canoe: a Visit Missouri search snippet said it floats "Elk River, Big Sugar
  Creek and Indian Creek". The listing page now returns an empty template, and
  `eaglesnestcampcanoe.com` reset the connection. **Candidate only, not verified.**
- Kozy Kamp, Trestle Park, Lower Elk River Adventures and Wayside: the sites reset the
  connection. Two Sons returned 406. None could be checked.

### Held: no row in the CSV

None of these could be shown to be **currently operating** from a primary source today. Their
details are drafted below so they can be added in a follow-up CSV once confirmed. Do not import
the drafts as they stand.

| Lead | What I found | Why held |
|---|---|---|
| **Ables Sugar Island Camp & Canoe**, 1354 Big Sugar Creek Rd, Pineville MO 64856, 417-223-4410 | [MCFA member listing](https://missouricanoe.org/places/ables-sugar-island-camp-and-canoe/) (address, phone, email eables2@yahoo.com, site sugarislandcanoe.com, category Big Sugar Creek). [City of Pineville outfitters page](https://pinevillemo.us/attractions/canoeing/outfitters/) (name, PO Box 716, same phone; the page is stale: Big Elk's phone there is out of date). [Hipcamp](https://www.hipcamp.com/en-US/land/missouri-ables-sugar-island-camp-lz9hl09y) has an operator-voice text: 11 acres of RV and tent camping, "over 100 canoes and kayaks", and "we also operate Big Rock Park… 4 miles east". It is an unclaimed listing; the host record was created 2025-04-30. | The operator's site `sugarislandcanoe.com` is **blocked** by this session's proxy (CONNECT 502). MCFA and the city page are undated, and Hipcamp is a directory. Nothing shows a 2025–2026 season or rates. **Most likely real; one phone call or an allowed fetch clears it.** |
| **Big Rock Camp Grounds / Big Rock Park** | The owner confirmed the location: plus code 8687JMCF+95 = 36.6209375, −94.3270625, TNM Eddy mile 38.97, 81 m from the channel (dossier addendum). The phone (630) 444-1200 is from the owner's lead. Sugar Island's Hipcamp text says it operates Big Rock as a "sister campground" with "camping and day-use". | Its existence and operation rest on one directory text. There is no primary source for a phone, season or services. The location is owner-confirmed; whether it is operating is not. |
| **Creekside Campground**, 274 Creekside Rd, Powell MO 65730, 417-435-2274 | Directories only. Hipcamp has "Creekside 1 Campground" (274 Creekside Rd, no phone). allcampsandparks.com has two listings with different phones (619-371-8495; 417-435-2274) and different names. The email in the lead (creeksidecampground1@yahoo.com) appears in no source I could read. | No primary source, and the directories disagree on its identity. |
| **Camp Tilden**, 8739 Big Sugar Creek Rd | The only mention is an undated Arkansas Canoe Club forum post: "the people at Cyclone… run Camp Tilden… $2 to park… aren't really open until later in May". I found no listing, site or agency record. | **Excluded.** I cannot establish what it is: a public campground, a pay-parking spot, or an organizational camp. |
| **Big Sugar Creek State Park** | The [official park page](https://mostateparks.com/park/big-sugar-creek-state-park) lists a trail and interpretive programs only, with no camping and no creek access. The "Reserve a Campsite" link is site-wide navigation. | **Not a campground.** Not listed, consistent with the dossier's exclusion. |

Draft facts for a follow-up CSV, **only after confirmation**:

- **Sugar Island.** `type=outfitter`, `river_slugs=big-sugar-creek`, `city=Pineville`,
  `zip=64856`, `phone=417-223-4410`, `website=http://www.sugarislandcanoe.com`.
  - `services_offered`: candidates are `canoe_rental|kayak_rental`, plus camping only once the
    operator says whether its sites are tent, RV or both.
  - No coordinates. The address points are approximate (~200 m from the channel).
- **Big Rock.** `type=campground`, `river_slugs=big-sugar-creek`.
  - Coordinates `36.6209375,-94.3270625`. Use `geocode_precision=approximate`, not `exact`: a
    plus code locates a ~14 m cell on the owner's Google pin, not a surveyed campground
    entrance.
  - `geocode_source=owner_confirmed_google_plus_code_8687JMCF+95` and
    `geocoded_at=2026-11-02T00:00:00Z`. Cite the dossier addendum in `field_sources`.

## Illinois River: held, doubtful and excluded

| Business (GRDA RM) | Evidence | Decision |
|---|---|---|
| **Sparrow Hawk Camp**, 21985 N Ben George Rd (52.2), 918-456-8371 | GRDA 2025; 90 licences in 2024 ("Sparrow Hawk Recreation"); [TravelOK 7145](https://www.travelok.com/listings/view.profile/id.7145) (raft floats, weekends from Memorial Day). No website. MapQuest shows it as "Closed"; a Q2 2026 regional newsletter says it is open all year. | **Doubtful:** the status signals conflict and there is no own site. Confirm by phone. |
| **Town Branch Guest Ranch**, Park Hill (59.3), 918-316-7621 | GRDA 2025 (camping, rentals, cabins icons); 60 licences in 2024; Airbnb cabins #1–#7. `townbranchguestranch.com` is **blocked**. | **Held:** no readable primary source for services. |
| **Upper Illinois River Floats**, 63320 S 4625 Rd, Proctor (24.1), 918-308-9868 | GRDA 2025 (all four icons). The same address and phone appear in directories as "Lazy River Campground & Floats" (lazyrivercampgroundok.com), and GRDA's 2024 renewals list "Lazy River Campground" (10). The site **resets the connection**. | **Held:** the business's identity rests on directories, and its site is unreadable. |
| **Fidler's Bend Outdoor Adventure**, 58088 Barnett Dr, Colcord (16.3) | GRDA 2025 (camping and rentals icons). Not in the 2024 renewals. Campspot lists it on Flint Creek and the Illinois. `fidlersbendoutdoor.com` is **blocked**. | **Held.** |
| **Rivercane Resort**, 17278 S 540 Rd, Tahlequah, 918-822-0057 | GRDA 2025 shows camping and rentals icons, but no river mile. [TravelOK 35051](https://www.travelok.com/listings/view.profile/id.35051) describes only an RV park "a short distance from the Illinois River". No website. Not in the 2024 renewals. | **Held:** the sources disagree on what it offers. |
| **Hanging Rock Camp**, 7453 N Hwy 10 (32.2), 918-456-3088 | GRDA 2025; 125 licences in 2024; [TravelOK 3324](https://www.travelok.com/listings/view.profile/id.3324). **`hangingrockfloats.com` is a GoDaddy parking page** (redirects to `/lander`). It filed no 2023 floater report. | **Doubtful:** the parked domain is a closure signal. Confirm by phone. |
| **Falcon Floats**, 16326 N Hwy 10 (53.4), 918-456-8058 | GRDA 2025. GRDA's 2024 renewals **withheld all licences** (311) for "All American/Falcon Floats" pending an administrative hearing on the 2023 permits. `www.illinoisriver.net` is **blocked**. | **Doubtful:** licence status after 2024 is unknown. |
| **All American Floats**, 17170 N Hwy 10 (55.0) | GRDA 2025. Same 2024 licence hold as Falcon. `allamericanfloats.com` is a domain-for-sale placeholder (research notes) and reset the connection today. | **Doubtful / probably closed.** |
| **Gypsy Camp & Canoe**; **Illinois River RV Campground & Floats** (Siloam Springs, AR, on AR-59) | Both are on GRDA 2025 and hold CFA 1 licences, but both businesses are in **Arkansas** on the AGFC Upper Illinois water trail. | **Excluded:** the Eddy record is OK-only from Watts down. They are candidates for a future AR section (see the dossier notes). |
| **Flint Ridge P.O.A.**; **Illinois River Yacht Club** (3.4) | These appear in GRDA's 2024 renewals but are not public businesses (a property-owners association and a private club). | **Excluded.** |
| **WOKA Whitewater Park** (2.6) | GRDA lists it under "Other Services" ("Rental services"). It is outside the dossier corridor, which excludes WOKA until GRDA describes passage at the Lake Frances dam remnant. | **Not listed.** Revisit with the corridor. |
| **Natural Falls State Park**; **Travelin' Joe's Coffee & RV Park** | GRDA "Other Services". Neither is on the river, as far as shown. | **Not listed.** |
| "Bluff Landing" | No business by that name found. | Lead unconfirmed. |

### Public camping on the corridor: not listed

- **GRDA public access areas.** The 2025 guide says GRDA access areas "can be used
  for… camping" ($14 per site per night, designated sites only). It does not say **which** areas
  have designated campsites.
  - GRDA's booking store (`grda.rentmy.co`, linked as "Float Permits & Camping Reservations")
    renders its park list client-side and showed only Lake Hudson's Snowdale Park.
  - So no PAA campground row was created. Asking GRDA which PAAs have campsites (918-456-3251)
    is the next step. Rows would use `type=campground` with GRDA as the source.
- **USACE Tenkiller (Murrell Home, Boy Scout Hole, Welling Bridge).** I found no primary source
  for camping at these.
- **USACE Tenkiller (Carter's Landing and lake parks).** These lie below the Barren Fork
  confluence, outside the dossier corridor.

## Coordinates

None of the 10 Illinois rows has coordinates, under the "authoritative or owner source only"
rule. Three operator pages embed points, but each is a Google place or address pin, which the
rule excludes. Leave them for the normal geocoding and review pass, and do not import them as
pins:

- Eagle Bluff: schema.org 36.0337128, −94.9153581.
- Diamondhead: Google embed of "12081 OK-10", 35.9836979, −94.9232978.
- Riverbend: Google business pin, 35.948291, −94.91047.

## Sites this session could not reach (allow them to re-check)

| Host | Result |
|---|---|
| `sugarislandcanoe.com` | proxy CONNECT 502 |
| `www.illinoisriver.net` | proxy CONNECT 502 |
| `fidlersbendoutdoor.com` | proxy CONNECT 502 |
| `townbranchguestranch.com` | proxy CONNECT 502 |
| `lazyrivercampgroundok.com` | connection reset |
| `eaglesnestcampcanoe.com` | connection reset |
| `kozykamp.com` | connection reset |
| `trestlepark.com` | connection reset |
| `lowerelkriveradventures.com` | connection reset |
| `waysidecamp.com` | connection reset |
| `allamericanfloats.com` | connection reset |
| `riversideresortokla.com` | HTTP 403 |
| `campspot.com` | HTTP 403 |
| `campendium.com` | HTTP 403 |
| `illinoisrivercampground.com` | HTTP 406 |
| `twosonsfloats.com` | HTTP 406 |
| `hangingrockfloats.com` | parked domain |

## Questions for the owner

1. Confirm Sugar Island and Big Rock are operating, and get Big Rock's real phone number (the
   630 area code is an Illinois number). Also ask whether Sugar Island publishes landing terms
   for private boats; the dossier needs them for single-river pairs.
2. Ask GRDA (918-456-3251) for its current licensed-operator list. That would settle Falcon,
   All American, Hanging Rock and Sparrow Hawk. Also ask which access areas have designated
   campsites.
