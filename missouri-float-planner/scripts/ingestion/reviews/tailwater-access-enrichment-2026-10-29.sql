-- Visitor facts for the 38 approved access points on Norfork, White and
-- Lake Taneycomo (issue #1541). Evidence and sources per field:
-- tailwater-access-enrichment-evidence-2026-10-29.json; review notes:
-- TAILWATER_ACCESS_ENRICHMENT_2026-10-29.md.
-- Target: ilefwfpvphadsbptiaur. APPLIED 2026-10-29 (COMMIT in place of the final
-- ROLLBACK). Ends in ROLLBACK for preview; only an
-- authorized apply replaces the final ROLLBACK with COMMIT.
--
-- Fills only empty description, parking_info, road_access, road_surface,
-- amenities and local_tips. Replaces facilities only where the stored text is
-- exactly the reviewed prior text. Sets fee_required on every row: true or
-- false only with a cited source, otherwise NULL (unverified), which the
-- access page no longer renders as "No fee". Pins, names, miles, endpoint
-- flags and photos are untouched.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
DO $review$
DECLARE
  v_changes jsonb := $changes$[
 {
  "id": "45894ef8-8dc6-459b-8277-193463ce2fd1",
  "river": "norfork-tailwater",
  "name": "Dry Run Creek Access (Norfork National Fish Hatchery)",
  "description": "Walk-in fishing on Dry Run Creek, the short hatchery-fed stream beside the U.S. Fish and Wildlife Service's Norfork National Fish Hatchery just below Norfork Dam. Fishing here is reserved for young anglers and mobility-impaired anglers.",
  "facilities_old": "NOT a float put-in and not a launch (kind park, so the importer never marks it a float endpoint): walk-in bank fishing at the hatchery near the mouth of Dry Run Creek, catch-and-release, RESTRICTED to youth under 16 and mobility-impaired anglers; ADA piers and walkways, paved parking",
  "facilities": "Walk-in bank fishing at the Norfork National Fish Hatchery, limited to anglers under 16 and mobility-impaired anglers; ADA piers and walkways, paved parking",
  "fee_required": null,
  "fee_notes": null,
  "parking_info": null,
  "road_access": "From Hwy 5 at Salesville, bear onto Hwy 177 south about 2 miles to the hatchery; from Pineville, take Hwy 177 northwest across Norfork Dam and turn right onto Fish Hatchery Circle.",
  "road_surface": [],
  "amenities": [],
  "local_tips": "Catch-and-release only for anglers under 16 and mobility-impaired anglers (card required), single barbless artificial lures only, and mobility-impaired anglers must fish from the access pier or boardwalk. Hours: Fishing sunrise to sunset (AGFC rule); hatchery open daily 7 a.m.-3:15 p.m., closed federal holidays."
 },
 {
  "id": "8d46b4d6-a718-4555-99ea-ff2db9f013a8",
  "river": "taneycomo",
  "name": "Shepherd of the Hills Hatchery Bank Access",
  "description": "Bank fishing along Lake Taneycomo at MDC's Shepherd of the Hills Fish Hatchery and Conservation Education Center, just below Table Rock Dam. About 2-3 miles of trails reach the shoreline, with fishing access points (some with stairs) and picnic areas.",
  "facilities_old": null,
  "facilities": null,
  "fee_required": null,
  "fee_notes": null,
  "parking_info": "MDC area map shows parking lots along Hatchery Road; area bulletin boards are in the parking areas.",
  "road_access": "From Branson, take Hwy 165 southwest about 6 miles to Hatchery Road near Table Rock Dam.",
  "road_surface": [
   "paved"
  ],
  "amenities": [
   "parking",
   "restrooms",
   "picnic"
  ],
  "local_tips": "No fishing within 760 feet below Table Rock Dam, in hatchery raceways or the marked outlets; from there to Fall Creek only flies and artificial lures are allowed and rainbow trout 12-20 inches must be released. Hours: Area 4 a.m.-10 p.m. daily; conservation center Tue-Sat 9 a.m.-5 p.m., closed Sun, Mon and state holidays."
 },
 {
  "id": "31d79668-3294-45f9-92f8-ece72809d0ef",
  "river": "norfork-tailwater",
  "name": "Dam-Quarry Boat Ramp",
  "description": "Corps of Engineers boat ramp at Quarry Park on the North Fork River just below Norfork Dam, next to Dam Quarry Campground.",
  "facilities_old": null,
  "facilities": null,
  "fee_required": true,
  "fee_notes": "USACE day-use fee for ramp and parking users, paid by card at the automated machine. America the Beautiful passes apply.",
  "parking_info": null,
  "road_access": "From Mountain Home, take Hwy 5 south 14 miles to Salesville, then Hwy 177 east 2 miles; park is below Norfork Dam, follow signs.",
  "road_surface": [],
  "amenities": [
   "boat_ramp",
   "picnic"
  ],
  "local_tips": null
 },
 {
  "id": "80db3a77-db31-4b8a-9010-248534a1f4cc",
  "river": "norfork-tailwater",
  "name": "Dam-Quarry Campground",
  "description": null,
  "facilities_old": "68 reservable riverfront sites with electric/water, dump station, restrooms; direct bank access to the tailwater; fee site on recreation.gov",
  "facilities": "68 reservable electric sites, two group shelters and a group area, bathhouses and an on-site boat ramp; fee site on Recreation.gov",
  "fee_required": true,
  "fee_notes": "Camping $24-$80 per night; reserve on Recreation.gov.",
  "parking_info": null,
  "road_access": "From Mountain Home, take Hwy 5 south 14 miles to Salesville, then Hwy 177 east 2 miles; park is below Norfork Dam, follow signs.",
  "road_surface": [],
  "amenities": [
   "camping",
   "restrooms",
   "boat_ramp",
   "picnic"
  ],
  "local_tips": "Sites 1-13 and 61-68 switch to electric-only (no water) starting November 1; 14-night maximum stay."
 },
 {
  "id": "6fa46369-646b-4cc0-bc66-719a0851cf34",
  "river": "taneycomo",
  "name": "Shepherd of the Hills Hatchery Boat Ramp",
  "description": "MDC concrete boat ramp at the Shepherd of the Hills Fish Hatchery below Table Rock Dam, the uppermost launch on Lake Taneycomo. MDC's Cooper Creek Access is about 5 miles downstream.",
  "facilities_old": "One-lane concrete ramp, the uppermost launch on Taneycomo; parking ~20 rigs, restrooms, picnic areas",
  "facilities": "One-lane concrete ramp, the uppermost launch on Taneycomo; parking, restrooms, picnic areas",
  "fee_required": null,
  "fee_notes": null,
  "parking_info": "MDC area map shows parking lots along Hatchery Road; area bulletin boards are in the parking areas.",
  "road_access": "From Branson, take Hwy 165 southwest about 6 miles to Hatchery Road near Table Rock Dam.",
  "road_surface": [
   "paved"
  ],
  "amenities": [
   "boat_ramp",
   "parking",
   "restrooms",
   "picnic"
  ],
  "local_tips": "Houseboats, airboats and personal watercraft are prohibited, and boats may not be left unattended overnight. Hours: Area 4 a.m.-10 p.m. daily; conservation center Tue-Sat 9 a.m.-5 p.m."
 },
 {
  "id": "1daa6131-dd01-4dec-bb66-f64a82936ac1",
  "river": "norfork-tailwater",
  "name": "Bill Ackerman River Ridge Access",
  "description": "AGFC walk-in fishing access on the North Fork River, dedicated in 2004 to former commissioner Bill Ackerman and AGFC's first handicapped-accessible walk-in fishing facility on the river. It is the only public access between the Norfork Dam boat ramp and the White River confluence.",
  "facilities_old": null,
  "facilities": null,
  "fee_required": null,
  "fee_notes": null,
  "parking_info": null,
  "road_access": "Off River Ridge Road.",
  "road_surface": [],
  "amenities": [],
  "local_tips": "Marks the downstream end of the Norfork catch-and-release area (from Long Hole to this access): trout must be released immediately, artificial lures or flies with barbless hooks only."
 },
 {
  "id": "00434692-242e-4d35-bfc7-d0d40c5e160e",
  "river": "norfork-tailwater",
  "name": "Norfork Access",
  "description": null,
  "facilities_old": "Two concrete ramps, paved parking, ADA boater transfer lift; the standard tailwater take-out, at the North Fork-White confluence in the town of Norfork",
  "facilities": "Concrete ramp, paved parking and an ADA boater transfer lift at the North Fork-White confluence in Norfork; a separate AGFC ramp is on the west bank",
  "fee_required": null,
  "fee_notes": null,
  "parking_info": null,
  "road_access": null,
  "road_surface": [],
  "amenities": [
   "boat_ramp"
  ],
  "local_tips": null
 },
 {
  "id": "d318b329-0715-498b-9f38-4218656ecc77",
  "river": "taneycomo",
  "name": "Cooper Creek Access",
  "description": "MDC access on Lake Taneycomo near Branson with a concrete boat ramp, about 5 miles downstream of the Shepherd of the Hills Hatchery ramp.",
  "facilities_old": "Concrete ramp, large parking (~40 rigs), two ADA covered fishing docks, privy; MDC places it 5 miles below the hatchery ramp, which the flowline confirms",
  "facilities": "Concrete ramp, large parking lot, an ADA covered fishing dock and a privy, 5 miles below the hatchery ramp",
  "fee_required": null,
  "fee_notes": null,
  "parking_info": "Large parking lot.",
  "road_access": "From W 76 Country Blvd and Fall Creek Rd in Branson, take Fall Creek Rd south 1.8 miles, turn left on River Valley Rd for 0.1 mile, then left on Cooper Creek Rd; entrance on the left.",
  "road_surface": [
   "paved"
  ],
  "amenities": [
   "parking",
   "restrooms",
   "boat_ramp"
  ],
  "local_tips": "One ADA-accessible covered dock for shore fishing; camping is prohibited. Hours: 4 a.m.-10 p.m. daily; fishing and launching/landing boats allowed 24 hours."
 },
 {
  "id": "d240a07b-3aa3-424e-a5fa-f0841d38b306",
  "river": "taneycomo",
  "name": "Branson City Ramp (Branson Lakeside RV Park)",
  "description": "Boat launch at the south end of Branson Lakeside RV Park, the City of Branson's campground on the Lake Taneycomo shoreline downtown.",
  "facilities_old": "Public one-lane concrete ramp beside the city-owned Branson Lakeside RV Park, downtown Branson lakefront; public fishing docks nearby; parking ~20 rigs",
  "facilities": "Public concrete ramp at the south end of the city-owned Branson Lakeside RV Park on the downtown Branson lakefront; public fishing docks nearby",
  "fee_required": null,
  "fee_notes": null,
  "parking_info": null,
  "road_access": null,
  "road_surface": [],
  "amenities": [
   "boat_ramp",
   "camping"
  ],
  "local_tips": "Hours: RV park office 9 a.m.-5 p.m. daily; no ramp hours posted."
 },
 {
  "id": "2c030369-c607-4f71-a9c3-546b23d747d0",
  "river": "taneycomo",
  "name": "North Beach Park",
  "description": "City of Branson pedestrian park on Lake Taneycomo next to Branson Landing, with two fishing docks and a paved lakeside path that connects to the Branson Landing boardwalk.",
  "facilities_old": null,
  "facilities": null,
  "fee_required": null,
  "fee_notes": null,
  "parking_info": "City directs visitors to park in the Belk parking lot.",
  "road_access": null,
  "road_surface": [],
  "amenities": [
   "picnic"
  ],
  "local_tips": "Alcohol, smoking and weapons are prohibited in city parks; pets must be leashed. Hours: 6 a.m.-10 p.m."
 },
 {
  "id": "ae9f03b6-e2af-42fd-bcaf-08cd410a6a16",
  "river": "taneycomo",
  "name": "Rockaway Beach Access",
  "description": "Small access on Lake Taneycomo in Rockaway Beach on Hwy 176 with a concrete boat ramp, maintained by the City of Rockaway Beach under a cooperative agreement with MDC.",
  "facilities_old": "One-lane concrete ramp on Hwy 176, maintained by the City of Rockaway Beach; ADA covered fishing dock, parking ~20 rigs, restrooms; open 4 AM-10 PM",
  "facilities": "One-lane concrete ramp on Hwy 176, maintained by the City of Rockaway Beach; ADA covered fishing dock, parking, privy, fish-cleaning station; open 4 AM-10 PM",
  "fee_required": null,
  "fee_notes": null,
  "parking_info": "MDC area map shows a parking lot.",
  "road_access": "In Rockaway Beach on Hwy 176.",
  "road_surface": [],
  "amenities": [
   "parking",
   "restrooms",
   "boat_ramp",
   "picnic"
  ],
  "local_tips": "Covered public fishing dock accessible to anglers with disabilities, plus a fish-cleaning station. Hours: 4 a.m.-10 p.m. daily; fishing and launching/landing boats allowed 24 hours."
 },
 {
  "id": "b965b0a3-868c-4408-ac68-432772db14de",
  "river": "taneycomo",
  "name": "Empire Park Ramp (Forsyth)",
  "description": null,
  "facilities_old": null,
  "facilities": null,
  "fee_required": null,
  "fee_notes": null,
  "parking_info": null,
  "road_access": null,
  "road_surface": [],
  "amenities": [
   "boat_ramp"
  ],
  "local_tips": "MDC lists a covered public fishing dock here accessible to anglers with disabilities."
 },
 {
  "id": "0e240aa2-ed5c-400c-987d-e5e84d289e5e",
  "river": "white",
  "name": "Jim Griffin Access",
  "description": "AGFC boat access just below Bull Shoals Dam, off Powerhouse Road on the state park side of the river. A Corps of Engineers fishing pier sits beside the concrete ramp.",
  "facilities_old": "Concrete ramp, restroom, USACE fishing pier and parking just below Bull Shoals Dam (Baxter County side); catch-and-release water",
  "facilities": "Concrete ramp, seasonal restroom, USACE fishing pier and paved parking just below Bull Shoals Dam, off Powerhouse Road; catch-and-release water",
  "fee_required": null,
  "fee_notes": null,
  "parking_info": "Paved AGFC parking area.",
  "road_access": "Off Hwy 178 at Bull Shoals Dam via Powerhouse Road (state park side).",
  "road_surface": [],
  "amenities": [
   "boat_ramp",
   "parking",
   "restrooms"
  ],
  "local_tips": "AGFC marks the ramp and USACE pier as accessible; the restroom is seasonal, and the access lies in the AGFC-mapped Bull Shoals catch-and-release area (check current trout rules)."
 },
 {
  "id": "65078ca0-704f-4128-b0ec-ca2b42a31cc9",
  "river": "white",
  "name": "Forrest and Nina Wood Rivercliff Access",
  "description": "AGFC boat access on the Bull Shoals town side of the river below the dam, across from Jim Griffin Access; AGFC materials also call it Forrest and Nina Wood State Park Access. A Corps of Engineers fishing pier is beside the concrete ramp.",
  "facilities_old": "Concrete ramp, paved parking and USACE fishing pier below the Bull Shoals powerhouse",
  "facilities": "Concrete ramp, paved parking and USACE fishing pier on the Bull Shoals town side, across from Jim Griffin Access",
  "fee_required": null,
  "fee_notes": null,
  "parking_info": "Paved AGFC parking area.",
  "road_access": "In Bull Shoals via Rivercliff Drive and Clubhouse Lane.",
  "road_surface": [],
  "amenities": [
   "boat_ramp",
   "parking"
  ],
  "local_tips": "AGFC marks the ramp and USACE pier as accessible; the access lies in the AGFC-mapped Bull Shoals catch-and-release area (check current trout rules)."
 },
 {
  "id": "aeac4958-b052-4df3-9ba1-ebef160140b9",
  "river": "white",
  "name": "Bull Shoals-White River State Park Ramp",
  "description": "Boat ramp inside Bull Shoals-White River State Park, next to the park's trout dock and store and a barrier-free fishing pier along the campground riverbank.",
  "facilities_old": null,
  "facilities": null,
  "fee_required": null,
  "fee_notes": null,
  "parking_info": "Paved parking area at the ramp.",
  "road_access": "From US 62 at Flippin take Hwy 178 about 10 miles north to the park, or from Mountain Home go 6 miles north on Hwy 5 then 8 miles west on Hwy 178; the ramp is by the trout dock in the campground.",
  "road_surface": [],
  "amenities": [
   "boat_ramp",
   "parking",
   "camping",
   "restrooms",
   "picnic"
  ],
  "local_tips": "A barrier-free fishing pier is beside the trout dock near the ramp. Hours: Campground/picnic area open all year; bathhouses open March–November; trout dock (marina) daily 7 a.m.–6 p.m. March–October, Fri–Tue 7:30 a.m.–4 p.m. Nov and Feb, closed Dec–Jan."
 },
 {
  "id": "04bd028e-bd22-451b-8b86-a618dfc0fb83",
  "river": "white",
  "name": "Gaston's Access",
  "description": "Concrete-plank boat ramp next to Gaston's White River Resort near Lakeview.",
  "facilities_old": null,
  "facilities": null,
  "fee_required": null,
  "fee_notes": null,
  "parking_info": null,
  "road_access": null,
  "road_surface": [],
  "amenities": [
   "boat_ramp"
  ],
  "local_tips": null
 },
 {
  "id": "938a458b-3b64-437d-90b5-d435e325c4a7",
  "river": "white",
  "name": "White Hole Access",
  "description": "AGFC boat access at White Hole, downstream of Partee Shoal and Three Chutes on the Bull Shoals tailwater.",
  "facilities_old": null,
  "facilities": null,
  "fee_required": null,
  "fee_notes": null,
  "parking_info": "Gravel AGFC parking area.",
  "road_access": null,
  "road_surface": [],
  "amenities": [
   "boat_ramp",
   "parking"
  ],
  "local_tips": null
 },
 {
  "id": "5caefde8-f9fa-4da5-9c4f-385583621cf7",
  "river": "white",
  "name": "Bronie Yurkonis Walk-In Access (The Narrows)",
  "description": "Baxter County walk-in access at The Narrows, upstream of Wildcat Shoals. There is no boat ramp.",
  "facilities_old": null,
  "facilities": null,
  "fee_required": null,
  "fee_notes": null,
  "parking_info": "Gravel parking area.",
  "road_access": null,
  "road_surface": [],
  "amenities": [
   "parking"
  ],
  "local_tips": null
 },
 {
  "id": "032f9325-e17e-4510-a2a9-084621973f5b",
  "river": "white",
  "name": "Wildcat Shoals Access",
  "description": "AGFC boat access at Wildcat Shoals, below The Narrows. AGFC rebuilt the ramp in 2018 and added a restroom building in 2025.",
  "facilities_old": null,
  "facilities": null,
  "fee_required": null,
  "fee_notes": null,
  "parking_info": "Paved upper and lower parking areas.",
  "road_access": null,
  "road_surface": [],
  "amenities": [
   "boat_ramp",
   "parking",
   "restrooms"
  ],
  "local_tips": "The year-round restroom has an accessible sidewalk from the upper parking lot."
 },
 {
  "id": "7433821d-623c-45d1-84f0-707d1f53bac5",
  "river": "white",
  "name": "Cotter Access (Big Spring Park)",
  "description": "AGFC boat ramp in the City of Cotter's Big Spring Park, just below the Hwy 62B bridge. The park also has a spring-fed swimming hole, riverside picnic cabanas and a riverbank walking trail.",
  "facilities_old": null,
  "facilities": null,
  "fee_required": false,
  "fee_notes": null,
  "parking_info": "Paved AGFC parking area at the ramp; the city notes a large parking lot by the farmers market.",
  "road_access": "Park entrance at the corner of Cotter Road (Hwy 345) and Big Spring Parkway in Cotter.",
  "road_surface": [],
  "amenities": [
   "boat_ramp",
   "parking",
   "restrooms",
   "picnic"
  ],
  "local_tips": "AGFC marks the ramp and parking as accessible; the restroom is seasonal. Hours: City parks open daily 5 a.m.–10 p.m."
 },
 {
  "id": "e41a11c4-a904-4026-8ecd-e0ee0e0e5344",
  "river": "white",
  "name": "Armstrong Hole Walk-In Access",
  "description": null,
  "facilities_old": null,
  "facilities": null,
  "fee_required": false,
  "fee_notes": null,
  "parking_info": null,
  "road_access": "On Cotter Road in Cotter.",
  "road_surface": [],
  "amenities": [],
  "local_tips": "Hours: City parks open daily 5 a.m.–10 p.m.",
  "managing_agency": "Municipal"
 },
 {
  "id": "8172624e-45b8-4546-98ff-301c89b9b320",
  "river": "white",
  "name": "Roundhouse Shoals Walk-In Access",
  "description": null,
  "facilities_old": null,
  "facilities": null,
  "fee_required": false,
  "fee_notes": null,
  "parking_info": null,
  "road_access": "On Cotter Road in Cotter.",
  "road_surface": [],
  "amenities": [
   "picnic"
  ],
  "local_tips": "Hours: City parks open daily 5 a.m.–10 p.m.",
  "managing_agency": "Municipal"
 },
 {
  "id": "a2757a09-8faa-4cb4-b035-3e030d3b0156",
  "river": "white",
  "name": "Rim Shoals Access",
  "description": "AGFC boat access with a T-shaped fishing pier near the mouth of Jenkins Creek, at the head of the Rim Shoals catch-and-release area. A separate AGFC walk-in access and riverside trail lie just downstream.",
  "facilities_old": "Concrete ramp, paved parking, restrooms, T-shaped fishing pier and separate walk-in at the Rim Shoals catch-and-release area",
  "facilities": "Concrete ramp, paved parking and T-shaped fishing pier at the Rim Shoals catch-and-release area; restrooms and a separate walk-in at the nearby walk-in lot",
  "fee_required": null,
  "fee_notes": null,
  "parking_info": "Paved parking at the boat ramp and a separate paved lot at the walk-in access.",
  "road_access": "From US 62/412 take Hwy 126 (or Red Bud Rd from Gassville) to Buford Cutoff, then Rim Shoals Road; the walk-in/trail lot is 0.3 mile down Rim Shoals Lane.",
  "road_surface": [],
  "amenities": [
   "boat_ramp",
   "parking",
   "restrooms"
  ],
  "local_tips": "AGFC marks the ramp as accessible; the year-round restrooms are at the walk-in parking lot, and the Rim Shoals stretch is a catch-and-release area (check current trout rules)."
 },
 {
  "id": "cb511837-22d7-436c-a5c7-739d07c1fb5c",
  "river": "white",
  "name": "Ranchette Access",
  "description": "AGFC boat access at Ranchette, downstream of Shoestring Shoal and upstream of Crane Island.",
  "facilities_old": "Concrete ramp with two paved parking areas on the Jenkins Creek loop below Rim Shoals",
  "facilities": "Concrete ramp with two paved parking areas below Rim Shoals",
  "fee_required": null,
  "fee_notes": null,
  "parking_info": "Two paved parking areas.",
  "road_access": null,
  "road_surface": [],
  "amenities": [
   "boat_ramp",
   "parking"
  ],
  "local_tips": null
 },
 {
  "id": "fc5a46ba-94b1-4575-bdce-17f32cfdcbad",
  "river": "white",
  "name": "Buffalo City Access",
  "description": "AGFC boat access at Buffalo City, just upstream of the Buffalo River confluence, with two concrete ramps.",
  "facilities_old": null,
  "facilities": null,
  "fee_required": null,
  "fee_notes": null,
  "parking_info": "Two paved parking areas.",
  "road_access": null,
  "road_surface": [],
  "amenities": [
   "boat_ramp",
   "parking"
  ],
  "local_tips": null
 },
 {
  "id": "7f732412-d0ef-40e3-a42a-5d668304639f",
  "river": "white",
  "name": "Cartney Access",
  "description": "AGFC boat access at Cartney, below the Buffalo River confluence. A separate AGFC Cartney walk-in access (no boat launching) is a short way downstream.",
  "facilities_old": "Concrete ramp with gravel parking at Cartney; a separate Cartney walk-in sits upstream",
  "facilities": "Concrete ramp with gravel parking at Cartney; a separate Cartney walk-in sits downstream",
  "fee_required": null,
  "fee_notes": null,
  "parking_info": "Gravel parking area.",
  "road_access": null,
  "road_surface": [],
  "amenities": [
   "boat_ramp",
   "parking"
  ],
  "local_tips": null
 },
 {
  "id": "53274499-3f0a-4a71-837d-194d85483f97",
  "river": "white",
  "name": "Shipp's Ferry Access",
  "description": "AGFC boat access at Shipps Ferry, downstream of Cartney and Barren Creek Shoal.",
  "facilities_old": null,
  "facilities": null,
  "fee_required": null,
  "fee_notes": null,
  "parking_info": "Gravel parking area.",
  "road_access": null,
  "road_surface": [],
  "amenities": [
   "boat_ramp",
   "parking"
  ],
  "local_tips": null
 },
 {
  "id": "468ec156-0c49-4b02-99a2-c9365729af6e",
  "river": "white",
  "name": "Norfork Access",
  "description": "AGFC boat access in the town of Norfork, where the North Fork River joins the White River. AGFC maps a separate Norfork Access West ramp on the opposite bank.",
  "facilities_old": "Two concrete ramps, paved parking and ADA boater transfer lift at the North Fork confluence in Norfork",
  "facilities": "Concrete ramp, paved parking and an ADA boater transfer lift at the North Fork confluence in Norfork; a separate AGFC ramp is on the west bank",
  "fee_required": null,
  "fee_notes": null,
  "parking_info": "Paved parking area. AGFC rules prohibit storing vehicles or boats at the access.",
  "road_access": null,
  "road_surface": [],
  "amenities": [
   "boat_ramp",
   "parking"
  ],
  "local_tips": "An AGFC boater transfer lift for mobility-impaired boaters is at this ramp, which also marks the boundary between the White River's two emergency trout-limit zones."
 },
 {
  "id": "8e2daec9-1879-4bc9-a6f2-bfb311316161",
  "river": "white",
  "name": "Red's Landing Access",
  "description": "AGFC boat access on the White River a few miles below Norfork, near Mathis Island.",
  "facilities_old": null,
  "facilities": null,
  "fee_required": null,
  "fee_notes": null,
  "parking_info": "Two paved parking areas. AGFC rules prohibit storing vehicles or boats at the access.",
  "road_access": null,
  "road_surface": [],
  "amenities": [
   "boat_ramp",
   "parking"
  ],
  "local_tips": null
 },
 {
  "id": "4e43ed07-b5ac-462f-90d8-98ebf6e1c3c9",
  "river": "white",
  "name": "Sneed Creek Access",
  "description": "AGFC boat access at the mouth of Sneed Creek in the Ozark National Forest, upstream of Calico Rock.",
  "facilities_old": null,
  "facilities": null,
  "fee_required": null,
  "fee_notes": null,
  "parking_info": "Gravel parking area, built 2010. AGFC rules prohibit storing vehicles or boats at the access.",
  "road_access": "Reached by Forest Service Road 1105B, a gravel road.",
  "road_surface": [],
  "amenities": [
   "boat_ramp",
   "parking"
  ],
  "local_tips": null
 },
 {
  "id": "9c297aae-cc0e-439c-81b5-55a81192f2d2",
  "river": "white",
  "name": "Chesmond Ferry Access",
  "description": "AGFC boat access at the old Chesmond Ferry crossing in Izard County, upstream of Calico Rock near City Rock Bluff.",
  "facilities_old": null,
  "facilities": null,
  "fee_required": null,
  "fee_notes": null,
  "parking_info": "Paved parking; AGFC funded chip sealing of the access road and parking area through the Marine Fuel Tax program in 2022. AGFC rules prohibit storing vehicles or boats at the access.",
  "road_access": null,
  "road_surface": [
   "paved"
  ],
  "amenities": [
   "boat_ramp",
   "parking"
  ],
  "local_tips": null
 },
 {
  "id": "08182690-80b3-41f9-83e8-2eed56c8821f",
  "river": "white",
  "name": "Calico Rock City Park Access",
  "description": "Concrete boat ramp with paved parking on the White River at Calico Rock.",
  "facilities_old": null,
  "facilities": null,
  "fee_required": false,
  "fee_notes": null,
  "parking_info": "Paved parking area. AGFC rules prohibit storing vehicles or boats at the access.",
  "road_access": null,
  "road_surface": [],
  "amenities": [
   "boat_ramp",
   "parking"
  ],
  "local_tips": null
 },
 {
  "id": "3fa1c59d-854d-4d9d-af61-52a1a5ca74d0",
  "river": "white",
  "name": "Boswell Shoals Access",
  "description": "Primitive Forest Service boat access at Boswell Shoals near Optimus in the Ozark National Forest, shown as 'Optimus Access' on AGFC's tailwater map.",
  "facilities_old": null,
  "facilities": null,
  "fee_required": null,
  "fee_notes": null,
  "parking_info": "Dirt parking area.",
  "road_access": null,
  "road_surface": [
   "dirt"
  ],
  "amenities": [
   "parking"
  ],
  "local_tips": "Forest Road 91089C to the access is dirt and not maintained for passenger cars."
 },
 {
  "id": "78c3f527-927a-4557-ae4f-fd213664b325",
  "river": "white",
  "name": "Mount Olive Access",
  "description": "AGFC boat access near the Mount Olive community in Izard County, between Calico Rock and Sylamore.",
  "facilities_old": null,
  "facilities": null,
  "fee_required": null,
  "fee_notes": null,
  "parking_info": "Gravel parking area. AGFC rules prohibit storing vehicles or boats at the access.",
  "road_access": null,
  "road_surface": [],
  "amenities": [
   "boat_ramp",
   "parking"
  ],
  "local_tips": null
 },
 {
  "id": "408d7163-72df-48ce-b81b-c2e6ba644255",
  "river": "white",
  "name": "Sylamore Ferry Access",
  "description": null,
  "facilities_old": null,
  "facilities": null,
  "fee_required": null,
  "fee_notes": null,
  "parking_info": "Gravel parking area on this side. AGFC rules prohibit storing vehicles or boats at the access.",
  "road_access": "From Highway 5 at Allison, a short state-maintained spur (Highway 933, Section 2, the old Highway 9 alignment) runs east to the river.",
  "road_surface": [],
  "amenities": [
   "boat_ramp",
   "parking"
  ],
  "local_tips": "A bank-parallel fishing pier that AGFC lists as mobility-impaired accessible is next to the ramp."
 },
 {
  "id": "d4f8b6df-78ac-4b16-b70c-bf0f1217cfc1",
  "river": "white",
  "name": "Round Bottom Access",
  "description": "AGFC boat access at Round Bottom in Stone County, downstream of Sylamore.",
  "facilities_old": null,
  "facilities": null,
  "fee_required": null,
  "fee_notes": null,
  "parking_info": "Gravel parking area. AGFC rules prohibit storing vehicles or boats at the access.",
  "road_access": null,
  "road_surface": [],
  "amenities": [
   "boat_ramp",
   "parking"
  ],
  "local_tips": null
 },
 {
  "id": "122d937b-3e16-4c71-8a31-5dbc66fd7574",
  "river": "white",
  "name": "Guion Access (Stone County)",
  "description": null,
  "facilities_old": null,
  "facilities": null,
  "fee_required": null,
  "fee_notes": null,
  "parking_info": null,
  "road_access": "Off Arkansas Highway 58 at Guion, at the river crossing.",
  "road_surface": [],
  "amenities": [
   "boat_ramp"
  ],
  "local_tips": "The Highway 58 bridge at Guion is the downstream end of the AGFC-managed Bull Shoals tailwater trout water."
 },
 {
  "id": "c997d64d-7459-471d-98af-caff3fe519e4",
  "river": "white",
  "name": "Guion Access (Izard County)",
  "description": null,
  "facilities_old": null,
  "facilities": null,
  "fee_required": null,
  "fee_notes": null,
  "parking_info": "Paved parking area. AGFC rules prohibit storing vehicles or boats at the access.",
  "road_access": "Off Arkansas Highway 58 at Guion, at the river crossing.",
  "road_surface": [],
  "amenities": [
   "boat_ramp",
   "parking"
  ],
  "local_tips": "The Highway 58 bridge at Guion is the downstream end of the AGFC-managed Bull Shoals tailwater trout water."
 }
]$changes$::jsonb;
  c jsonb;
  n integer;
BEGIN
  IF jsonb_array_length(v_changes) <> 38 THEN RAISE EXCEPTION 'Expected 38 access points'; END IF;
  FOR c IN SELECT * FROM jsonb_array_elements(v_changes) LOOP
    PERFORM 1 FROM public.access_points a JOIN public.rivers r ON r.id = a.river_id
      WHERE a.id = (c->>'id')::uuid AND a.name = c->>'name' AND r.slug = c->>'river' AND a.approved
      FOR UPDATE OF a;
    IF NOT FOUND THEN RAISE EXCEPTION 'Identity changed: %', c->>'name'; END IF;
    IF c->>'facilities' IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.access_points
        WHERE id = (c->>'id')::uuid AND facilities = c->>'facilities_old') THEN
      RAISE EXCEPTION 'Facilities text changed since review: %', c->>'name';
    END IF;
    UPDATE public.access_points a SET
      description = COALESCE(nullif(btrim(a.description), ''), c->>'description'),
      facilities = COALESCE(c->>'facilities', a.facilities),
      fee_required = (c->>'fee_required')::boolean,
      fee_notes = c->>'fee_notes',
      parking_info = COALESCE(nullif(btrim(a.parking_info), ''), c->>'parking_info'),
      road_access = COALESCE(nullif(btrim(a.road_access), ''), c->>'road_access'),
      road_surface = CASE WHEN coalesce(cardinality(a.road_surface), 0) = 0
        THEN ARRAY(SELECT jsonb_array_elements_text(c->'road_surface')) ELSE a.road_surface END,
      amenities = CASE WHEN coalesce(cardinality(a.amenities), 0) = 0
        THEN ARRAY(SELECT jsonb_array_elements_text(c->'amenities')) ELSE a.amenities END,
      local_tips = COALESCE(nullif(btrim(a.local_tips), ''), c->>'local_tips'),
      managing_agency = COALESCE(a.managing_agency, c->>'managing_agency'),
      updated_at = now()
    WHERE a.id = (c->>'id')::uuid;
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n <> 1 THEN RAISE EXCEPTION 'Expected one update for %', c->>'name'; END IF;
  END LOOP;
END $review$;
ROLLBACK;
