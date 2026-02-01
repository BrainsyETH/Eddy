-- Migration: Update Eleven Point River access points with detailed information
-- Updates description, parking_info, road_access, and facilities fields
-- Does NOT change locations or other existing data

-- Thomasville (Highway 99)
UPDATE access_points SET
  description = 'Mile zero on the Eleven Point. Thomasville is where the Middle Fork joins the main stem, bringing enough water to make floating possible - but only during higher flows, typically March through June. In summer and fall, the river above Greer Spring is often too low for comfortable floating. The upper section from here to Cane Bluff (9.3 miles) passes through beautiful but rugged terrain with smallmouth bass, goggle-eye, and chain pickerel. Expect shallow riffles, possible portages around remnants of an old low-water bridge at mile 3.8, and absolutely no services. At mile 3.0, Posey Spring enters from a small cave in a woodland setting. At mile 6.2, Roaring Spring pours from a horizontal crack in the bluff face in a dramatic cascade. This is a warm-water section - the river transforms completely when it meets Greer Spring downstream.',
  parking_info = 'USFS gravel lot at the Hwy 99 bridge. Small lot, fits ~10-12 vehicles. Rarely crowded due to seasonal limitations on this upper section.',
  road_access = 'Paved via State Highway 99 in Thomasville. From Alton, take Hwy 160 west 12 miles, turn right on Hwy 99 north for 1.5 miles to the bridge.',
  facilities = 'No amenities. No restrooms, no water, no trash service. Thomasville itself is a very small community with no services for floaters. Note: Forest Service lists this site as currently "Closed" - verify status before planning a launch here.'
WHERE name ILIKE '%Thomasville%' AND river_id IN (SELECT id FROM rivers WHERE slug = 'eleven-point');

-- Cane Bluff
UPDATE access_points SET
  description = 'The first public access below Thomasville and a scenic stop anchored by the towering 250-foot Cane Bluff directly across the river. A rock slide in 1991 scarred the bluff face and knocked down trees, adding to the dramatic scenery. This works as a takeout for the 9.3-mile Thomasville run or as a put-in for the 7.3-mile float to Greer Crossing. The river between Cane Bluff and Greer is still in the warm-water section - good smallmouth and goggle-eye fishing with moderate current. Like Thomasville, this section runs best in spring. At mile 14.8, McCormack Hollow enters on the left with a lake, fishing, and a picnic area about a mile up the hollow.',
  parking_info = 'USFS gravel lot on river left. Moderate capacity, ~12-15 vehicles. Picnic area adjacent.',
  road_access = 'From Alton, take Hwy 19 north 3 miles, turn left on County Road 410, then right on County Road 405 to the access. Mix of paved and gravel; passable for standard vehicles.',
  facilities = 'USFS picnic area with vault toilet and picnic tables. No water, no camping, no trash service - pack in/pack out.'
WHERE name ILIKE '%Cane Bluff%' AND river_id IN (SELECT id FROM rivers WHERE slug = 'eleven-point');

-- Greer Crossing Recreation Area / Greer Spring
UPDATE access_points SET
  description = 'The hub of the Eleven Point and the river''s most important access point. Greer Crossing sits at the Hwy 19 bridge, right where Greer Spring Branch enters the river 0.6 miles upstream. Greer Spring - the 2nd largest in Missouri at 214+ million gallons/day - doubles the size of the river and drops the water temperature dramatically, creating a cold-water fishery that supports trout year-round. The 5.5-mile stretch downstream from here to Turner Mill South is designated Blue Ribbon Trout Area (flies and artificial lures only, 1 trout daily, 18" minimum). This is the standard put-in for most Eleven Point floats: Greer to Turner Mill (4.9 mi, 2-3 hrs), Greer to Whitten (11 mi, 5-6 hrs), or the popular Greer to Riverton (19 mi, excellent 2-day float or one long day). The campground fills on weekends - arrive Friday afternoon or reserve ahead. Richard''s Outfitters operates nearby for canoe/kayak rentals.',
  parking_info = 'Paved USFS parking area with separate lots for the campground, picnic area, and boat ramp. Ample capacity. This is the busiest access on the Eleven Point - arrive early on summer weekends.',
  road_access = 'Fully paved. From Alton, take Hwy 19 north 9.5 miles. The campground entrance (Forest Road 3188) is on the right, just north of the Eleven Point bridge. From Winona, take Hwy 19 south 17 miles.',
  facilities = 'USFS campground: 16 single sites ($10/night) and 3 double sites ($15/night), paid at the fee tube. 50% discount with Interagency Senior/Access Pass. Each site has table, fire ring, lantern post. Vault toilet. Seasonal drinking water and trash bins (May 1-Oct 1). Campground host in summer. Single-lane concrete boat ramp. Picnic area with 5 sites, pedestal grills, and drinking water. Greer Spring trailhead parking nearby (0.9-mile hike down to the spring). Greer Mill historic site accessible by short trail. 4-mile hiking trail to McCormack Lake. Ozark Trail passes through.'
WHERE (name ILIKE '%Greer%') AND river_id IN (SELECT id FROM rivers WHERE slug = 'eleven-point');

-- Turner Mill North
UPDATE access_points SET
  description = 'Turner Mill North sits on the left bank at the historic site of a community that once had a general store, post office, school, and Turner''s Mill itself. The mill operated from the 1850s through the early 20th century. This access marks the downstream end of the Blue Ribbon Trout Area and the beginning of the White Ribbon Trout Area (stocked rainbow trout, more liberal harvest rules). Turner Mill North is 4.9 miles downstream from Greer - a short, popular float through Mary Decker Shoal, a chute-type rapid with large boulders scattered across the streambed. The gravel roads to get here are the biggest barrier - the access itself is functional but remote. If you''re choosing between the two Turner Mill accesses, South is slightly easier to reach.',
  parking_info = 'Small USFS gravel lot on river left (north bank). Limited capacity, ~8-10 vehicles.',
  road_access = 'Remote. From Winona, take Hwy 19 south 11.5 miles, turn right on NF-3152 for 6 miles, then right on NF-3190, which dead-ends at the river. All gravel for the last ~6 miles. Roads can be rough and narrow - high-clearance vehicle recommended, especially after rain.',
  facilities = 'Day-use picnic area with vault toilet and boat launch. No camping at this access. No water, no trash service.'
WHERE name ILIKE '%Turner Mill North%' AND river_id IN (SELECT id FROM rivers WHERE slug = 'eleven-point');

-- Turner Mill South
UPDATE access_points SET
  description = 'The more accessible of the two Turner Mill accesses, on the south bank. Turner Mill South is a popular choice for both put-in and takeout. It''s the standard takeout for the Greer to Turner Mill float (4.9 mi, a great half-day trout fishing trip through the Blue Ribbon area) and a put-in for the longer Turner Mill to Whitten (6.5 mi) or Turner Mill to Riverton (14 mi) runs. The 5 campsites are rustic but adequate for an overnight along the river. Below Turner Mill, the river enters White Ribbon Trout Area waters with stocked rainbow trout from MDC (March-October). The TripAdvisor-favorite "Turner''s Mill to Riverton" float (about 14 miles, 6 hrs) passes through increasingly scenic territory with bluffs, float camps, and the Irish Wilderness nearby.',
  parking_info = 'USFS gravel lot on river right (south bank). Moderate capacity, ~12-15 vehicles. Major landing/launch area.',
  road_access = 'From Alton, take Hwy 19 north 1.5 miles, turn right on Hwy AA for 4.8 miles, then left on County Road 127 (becomes FS-3153) for 4.5 miles to the river. Mix of paved and gravel. Less remote than Turner Mill North but still a gravel finish.',
  facilities = 'USFS campground: 5 rustic campsites with tables, fire rings, lantern posts. Vault toilet. Single-lane concrete boat launch. No water, no trash service. Dispersed camping in the national forest is also permitted outside designated sites.'
WHERE name ILIKE '%Turner Mill South%' AND river_id IN (SELECT id FROM rivers WHERE slug = 'eleven-point');

-- Whitten
UPDATE access_points SET
  description = 'Whitten is a popular midpoint access on the lower Eleven Point. It''s the standard put-in for the crowd-favorite Whitten to Riverton day float (8 miles, 4-5 hrs) - one of the most commonly recommended floats on the river. Also serves as the takeout for the Greer to Whitten run (11 mi, 5-6 hrs). The river here is in the White Ribbon Trout Area with stocked rainbow trout, plus good smallmouth and goggle-eye fishing. Expect some motorized boat traffic (25 hp limit applies on the entire Eleven Point). The steep descent into the access is worth noting if you''re hauling a trailer. Between Whitten and Riverton, the river passes through Whites Creek Float Camp, Greenbriar Float Camp, and Boze Mill Float Camp - all boat-access-only primitive camps with vault toilets for overnighting.',
  parking_info = 'USFS gravel lot on river right. Moderate capacity. Can be busy on weekends with both motorized and non-motorized users.',
  road_access = 'From Alton, take Hwy 19 north 1.5 miles, right on Hwy AA for 9 miles, then left on Whitten Church Road (FR-4144/County Road 137) for 2.2 miles to the access. Mix of paved and gravel with a steep descent to the river on the final section.',
  facilities = 'Vault toilet (accessible). Single-lane concrete boat ramp. No water, no picnic tables, no camping at the access itself. Dispersed camping is permitted in the surrounding national forest.'
WHERE name ILIKE '%Whitten%' AND river_id IN (SELECT id FROM rivers WHERE slug = 'eleven-point');

-- Riverton East (Highway 160) / Riverton
UPDATE access_points SET
  description = 'Riverton is the second-most important access on the Eleven Point, and the easiest to reach. Sitting right on Hwy 160 with a paved lot and outfitter services, it''s the takeout for the popular Greer to Riverton 2-day float (19 mi) and the Whitten to Riverton day float (8 mi). It''s also the put-in for the 8.7-mile run down to The Narrows (Hwy 142), the final float on the scenic river. Hufstedler''s outfitter is right at the bridge and handles rentals and shuttles. Below Riverton, the river valley widens. At mile 33.4 (Boze Mill Spring), the valley opens noticeably. Morgan Spring Float Camp sits 7.7 miles downstream, and the dramatic Narrows area features the ridge between the Eleven Point and Frederick Creek - only 30 feet wide at the overlook. No camping at the Riverton access itself, but Hufstedler''s has cabin and campsite options.',
  parking_info = 'USFS lot on river left, just upstream of the Hwy 160 bridge. Paved. Good capacity - this is a major landing/launch area. Additional overflow parking nearby.',
  road_access = 'Fully paved via State Highway 160. From Alton, take Hwy 160 east 13 miles. From Doniphan, take Hwy 160 west 25 miles. The access is at the Riverton bridge.',
  facilities = 'Accessible restroom (vault toilet). Boat ramp. This is the main landing side. No camping allowed. Hufstedler''s Camp, Canoe Rental and Store is located at the Riverton bridge - canoe, kayak, raft, paddleboard, and tube rentals; cabins (1-3 bedroom); hot showers; free firewood; store.'
WHERE name ILIKE '%Riverton%' AND river_id IN (SELECT id FROM rivers WHERE slug = 'eleven-point');

-- The Narrows (Highway 142)
UPDATE access_points SET
  description = 'The last access on the Eleven Point National Scenic River. The Narrows gets its name from the dramatic geological feature here: a narrow ridge of land (only about 30 feet wide at the overlook) separates the Eleven Point from Frederick Creek. Sullivan, Jones, and Blue Springs enter from the right at mile 44.0, nestled against the steep bluff. A foot trail leads to an overlook at the top. This is the standard takeout for the Riverton to Narrows float (8.7 mi, 4-5 hrs), which passes through Morgan Spring Float Camp and the most dramatic scenery on the lower river. Below the Hwy 142 bridge, the Wild and Scenic River designation ends, but the river continues south toward Arkansas. Myrtle Access (MDC, mile 48) is ~4 miles downstream near the state line for those continuing.',
  parking_info = 'USFS paved parking lot. Single-lane concrete boat ramp. Moderate capacity.',
  road_access = 'Paved via State Highway 142. From Alton, take Hwy 160 east to the Hwy 142 junction, then south. From Thayer, take Hwy 142 east 19 miles. From Doniphan, take Hwy 142 west 27 miles.',
  facilities = 'Vault toilet. Paved parking. Concrete boat ramp. No camping, no water, no picnic facilities.'
WHERE name ILIKE '%Narrows%' AND river_id IN (SELECT id FROM rivers WHERE slug = 'eleven-point');

-- Myrtle (MDC)
UPDATE access_points SET
  description = 'The last Missouri access on the Eleven Point, located at the site of the old Stubblefield Ferry. Myrtle sits about 4 miles below The Narrows and just 1 mile north of the Arkansas state line (mile 49). This is a remote, minimally developed MDC access primarily used by anglers targeting the lower river''s smallmouth bass, goggle-eye, and walleye (20,000 fingerling walleye were stocked in this section in 2022). The Wild and Scenic designation ended at The Narrows, so the river here has a slightly different character - wider, slower, and less dramatic scenery. Limited camping is allowed. For most floaters, The Narrows is the more practical final takeout, but Myrtle is here for those who want to squeeze every last mile of Missouri river.',
  parking_info = 'Small MDC gravel lot on the west side. Limited capacity. This is a remote access.',
  road_access = 'From Thayer, take Hwy 142 east 19 miles, then south on Hwy H for 7 miles, then left on County Road 278 for 2.5 miles. All gravel on the final approach. Remote and winding.',
  facilities = 'MDC access with limited camping permitted. Vault toilet. No water, no trash service. Minimal amenities.'
WHERE name ILIKE '%Myrtle%' AND river_id IN (SELECT id FROM rivers WHERE slug = 'eleven-point');
