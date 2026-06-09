-- Migration: Update Jacks Fork River access points with detailed information
-- Updates description, parking_info, road_access, and facilities fields
-- Does NOT change locations or other existing data

-- South Prong / Highway Y Bridge
UPDATE access_points SET
  description = 'This is mile zero - the technical start of the Jacks Fork where the North and South Prongs meet. Floating from here requires high water (typically March-May only) and is only recommended for experienced paddlers. The river here is very narrow, shallow, and prone to strainers and deadfall at bends. In normal or low water, you''ll be walking more than floating. Most floaters skip this and start at Buck Hollow, 6.8 miles downstream. If you do launch here, expect Class I-II water with a steep gradient of ~9 ft/mile and absolutely no services until Buck Hollow.',
  parking_info = 'Small MDC gravel lot at the Hwy Y bridge. Fits ~8-10 vehicles. Rarely crowded since most floaters start at Buck Hollow.',
  road_access = 'Paved via State Highway Y from Mountain View area. The bridge is where the North and South Prongs converge to form the Jacks Fork.',
  facilities = 'No facilities. No restrooms, no water, no trash service. Pack everything in and out.'
WHERE (name ILIKE '%South Prong%' OR name ILIKE '%Highway Y%') AND river_id IN (SELECT id FROM rivers WHERE slug = 'jacks-fork');

-- Buck Hollow (Highway 17)
UPDATE access_points SET
  description = 'The standard put-in for the upper Jacks Fork. Buck Hollow is where most spring-season floaters begin, as the river above here is often too shallow or choked with deadfall. From here downstream to Bay Creek (18.4 miles), the river carves through one of Missouri''s deepest and most dramatic valleys - 200-foot bluffs, towering cedars, and virtually zero development. The gradient is steep (~7-9 ft/mi) with frequent Class I-II shoals. Blue Spring enters at mile 9.6, where the river constricts and can be a challenging run. Jam Up Cave, with its 80-foot-high entrance arch, is visible from the river. No cell service. This is wilderness floating - bring maps, first aid, and be self-sufficient.',
  parking_info = 'NPS gravel lot on river right, just before the Hwy 17 bridge. Holds ~15-20 vehicles. Can fill on spring weekends.',
  road_access = 'Paved via State Highway 17. From Mountain View, take Hwy 17 north ~3.6 miles. Access is on the right just before crossing the Jacks Fork.',
  facilities = 'NPS backcountry campground with vault toilet and fire rings. No water, no trash service. Pack in/pack out. USGS gauge station on-site (07065200).'
WHERE name ILIKE '%Buck Hollow%' AND river_id IN (SELECT id FROM rivers WHERE slug = 'jacks-fork');

-- Bluff View (Salvation Army Access)
UPDATE access_points SET
  description = 'A minor access point primarily useful as an intermediate stop between Buck Hollow and Rymers. The scenery here is stunning - you''re deep in the valley with towering bluffs. Blue Spring access is just 0.4 miles downstream at mile 9.6 and is the better stop if you''re looking to explore. Bluff View works as an emergency takeout or for paddlers who want a shorter 2.4-mile run from Buck Hollow, but most floaters blow right past it.',
  parking_info = 'Very small gravel pulloff. Room for maybe 5-6 vehicles. Not a primary access - more of an emergency takeout.',
  road_access = 'Off Highway O via a short gravel spur. From Hwy 17, take Hwy O east. Access is on river right.',
  facilities = 'Primitive NPS access. No restrooms, no water, no amenities of any kind.'
WHERE (name ILIKE '%Bluff View%' OR name ILIKE '%Salvation Army%') AND river_id IN (SELECT id FROM rivers WHERE slug = 'jacks-fork');

-- Blue Spring (Jacks Fork)
UPDATE access_points SET
  description = 'Blue Spring is a beautiful, cold-water spring that feeds into the Jacks Fork from river right. The NPS campground here is small and peaceful - a great base camp for exploring the upper valley. Just downstream, the river constricts through a narrow chute that can be technical in higher water. This marks the beginning of one of the most scenic stretches on the entire river - Jam Up Cave''s massive 80-foot arch is a few miles ahead. From here to Rymers is 6.6 miles of deep-valley floating through virtually untouched Ozark wilderness. Only floatable when water levels are adequate, typically spring through early summer.',
  parking_info = 'Small NPS gravel lot off Hwy OO. Fits ~10 vehicles. From Mountain View, take Hwy 60 east 1 mile past Hwy 17, turn north on Hwy OO, go ~2 miles, then left on County Road OO-493 for ~2 miles to the access.',
  road_access = 'Mix of paved (Hwy OO) and gravel county roads. The last ~2 miles on CR OO-493 are gravel but maintained. Passenger vehicles fine in dry conditions.',
  facilities = 'NPS backcountry campground with vault toilet, fire rings, and lantern posts. No water, no trash service.'
WHERE name ILIKE '%Blue Spring%' AND river_id IN (SELECT id FROM rivers WHERE slug = 'jacks-fork');

-- Rymers Landing
UPDATE access_points SET
  description = 'Rymers sits just downstream from Ebb & Flow Spring on river right. It''s the first real intermediate access between Buck Hollow and Bay Creek, making it a useful takeout for a 9.4-mile day float from Buck Hollow or a put-in for the 9-mile run to Bay Creek. The valley begins opening slightly here but is still deeply forested and remote. Rymers is named after an early settler family. The campground is quiet and rarely crowded - a good overnight option for multi-day trips through the upper Jacks Fork. No cell service.',
  parking_info = 'Small NPS gravel lot on river right. Fits ~10-12 vehicles. Access off County Highway M.',
  road_access = 'From Mountain View, take Hwy 60 east 6 miles, turn north on Hwy M, proceed ~6 miles north along Hwy M and gravel County Road M-471 to the access. Last portion is gravel - narrow and winding.',
  facilities = 'NPS backcountry campground with vault toilet, fire rings, lantern posts, and picnic tables. No water, no trash service. Camping fee: $10/night (as of 2022). 14-day max stay, 6 people/2 tents/2 vehicles per site.'
WHERE name ILIKE '%Rymers%' AND river_id IN (SELECT id FROM rivers WHERE slug = 'jacks-fork');

-- Bay Creek
UPDATE access_points SET
  description = 'Bay Creek marks the transition from the upper Jacks Fork (seasonal, Class II) to the lower Jacks Fork (year-round, Class I). This is where the deep, narrow valley starts to widen and the river becomes more accessible. It''s the most popular put-in for the classic 5.8-mile float to Alley Spring - a perfect half-day trip that passes through Fish Trap Hole and Grandma Rocks before arriving at Alley Spring. Outfitters like Windy''s and Harvey''s regularly shuttle here. Also works as the takeout for the long Bay Creek run from Buck Hollow (18.4 miles, full-day expedition). The campground is basic but functional for overnighters.',
  parking_info = 'NPS gravel lot on river left. Moderate capacity, ~15-20 vehicles. Can get busy on peak weekends since it''s a popular put-in for the Bay Creek to Alley Spring float.',
  road_access = 'From Eminence, take Hwy 106 west past Alley Spring, continue ~5 miles to County Road 106-425. Turn and follow to the river. Mostly paved with short gravel section at the end.',
  facilities = 'NPS backcountry campground with vault toilet, lantern posts, fire rings. No water, no trash service. Camping fee: $10/night. Non-reservable, first-come first-served.'
WHERE name ILIKE '%Bay Creek%' AND river_id IN (SELECT id FROM rivers WHERE slug = 'jacks-fork');

-- Alley Spring
UPDATE access_points SET
  description = 'The crown jewel of the Jacks Fork. Alley Spring is the 7th largest spring in Missouri, pumping 81 million gallons per day of crystal-clear water into the river - this is what makes the lower Jacks Fork floatable year-round. The iconic red Alley Mill (featured on the Missouri state quarter) and the spring pool are must-sees even if you''re not floating. This is the primary takeout for the popular Bay Creek to Alley Spring float (5.8 mi, 3-4 hrs) and the main put-in for the Alley Spring to Eminence run (6.3 mi, 3-4 hrs). The campground is the most developed on the Jacks Fork with full amenities. Families love this spot - the swimming area near the campground is shallow and accessible, the trails are easy, and Harvey''s outfitter is right across the road for rentals and shuttles. No cell service, but the campground host and ranger station provide info. Roads and parking spurs are all paved, making this the most RV-friendly access on the river.',
  parking_info = 'Large paved NPS parking area with designated spurs for each campsite. Additional day-use parking near Alley Mill and the spring. Largest parking area on the Jacks Fork - rarely an issue finding a spot except major holiday weekends.',
  road_access = 'Fully paved. From Eminence, take Hwy 106 west ~6 miles. Well-signed NPS entrance on the south side of Hwy 106, just before crossing the Jacks Fork. From Mountain View, take Hwy 60 east to County Hwy E, north 10 miles to Hwy 106, then west 2 miles.',
  facilities = 'Major NPS front-country campground: 146 family sites (some reservable via Recreation.gov), 26 electric sites with 20/30/50 amp service and water hookups (reservable), 3 group sites ($100/night), 14 cluster sites ($35/night). Flush toilets and hot showers April 15-Oct 15. Dump station. Campground host on-site in summer. Amphitheater with ranger programs. General store (Harvey''s) across the road sells firewood, ice, snacks, beer, and floating supplies. Historic Alley Mill open for tours. Multiple hiking trails including Alley Overlook and Ozark Trail connections.'
WHERE name ILIKE '%Alley Spring%' AND river_id IN (SELECT id FROM rivers WHERE slug = 'jacks-fork');

-- Buttin Rock / Eminence (Highway 19)
UPDATE access_points SET
  description = 'Eminence is the hub of the Jacks Fork and your last chance for real civilization until the river meets the Current. It''s the takeout for the Alley Spring to Eminence float (6.3 mi) and the put-in for the gentle Eminence to Two Rivers run (7.3 mi) that ends at the Current River confluence. The stretch below Eminence is noticeably calmer - Class I water, wider channels, and more gravel bars. This is the most accessible point on the river for day-trippers: paved roads, nearby food and gas, and multiple outfitters within walking distance. Cell service is spotty but available in town. If you''re resupplying mid-trip, this is the place.',
  parking_info = 'Town access with multiple parking options. NPS access at Buttin Rock on river right just upstream of the Hwy 19 bridge. Additional parking at Joshua T. Chilton Memorial Landing (mile 37.6) and Jacks Fork Campground (mile 38.1). Combined capacity 30+ vehicles.',
  road_access = 'Fully paved via State Highway 19 in downtown Eminence. The town sits at the intersection of Hwy 19 and Hwy 106. From the north: Hwy 19 south from Winona (12 miles). From the south: Hwy 19 north from Alton.',
  facilities = 'Eminence is a full-service town (pop. ~600) and the self-proclaimed "Canoeing Capital of the World." Gas stations, restaurants, general stores, outfitters (Harvey''s satellite office at Hwy 19/106 intersection, Windy''s, Jacks Fork Canoe Rental), lodging, and the Roy L Beck Golf Course. Jacks Fork Campground (NPS) at mile 38.1 offers electric sites for RVs. The Buttin Rock access itself is a simple river access with no facilities at the ramp.'
WHERE (name ILIKE '%Eminence%' OR name ILIKE '%Buttin Rock%') AND river_id IN (SELECT id FROM rivers WHERE slug = 'jacks-fork');

-- Shawnee Creek
UPDATE access_points SET
  description = 'A quiet backcountry stop 4 miles downstream from Eminence on river right. Shawnee Creek enters the Jacks Fork here, and the campground sits at the confluence. It''s useful as an intermediate access between Eminence and Two Rivers - either a short 4.6-mile float from Eminence or a 2.7-mile paddle to Two Rivers. The old Salem, Winona and Southern Railroad once ran up Horse Hollow (mile 32.3) and along the Jacks Fork through this area. This stretch of river is gentle Class I with good gravel bars for swimming and camping. Most people float past Shawnee Creek on the way to Two Rivers.',
  parking_info = 'Small NPS gravel lot on river right. Fits ~8-10 vehicles.',
  road_access = 'Gravel access road off the main route between Eminence and Two Rivers. From Eminence, head east on local roads - follow signs. The gravel road is passable for standard vehicles in dry conditions.',
  facilities = 'NPS backcountry campground with porta-john, lantern posts, and fire rings. No water, no trash service. Camping fee: $10/night.'
WHERE name ILIKE '%Shawnee Creek%' AND river_id IN (SELECT id FROM rivers WHERE slug = 'jacks-fork');

-- Two Rivers (Current River Confluence) - This is shared with Current River
UPDATE access_points SET
  description = 'Where the Jacks Fork ends and the Current River begins. The confluence is dramatic - the Jacks Fork doubles the volume of the Current, and from here downstream the river is substantially wider and deeper. Two Rivers is the standard takeout for the Eminence to Two Rivers float (7.3 mi, 3-4 hrs) and a launching point for continuing down the Current toward Powder Mill, Log Yard, and beyond. The general store here is essential for multi-day trips - stock up, because there''s nothing until Van Buren (~34 river miles downstream on the Current). Expect more motorized traffic (jon boats) on the Current below this point, especially on weekends.',
  parking_info = 'NPS gravel lot with moderate capacity, ~20-25 vehicles. Can be very busy on summer weekends since it serves both Jacks Fork takeouts and Current River floaters.',
  road_access = 'Paved access. From Eminence, head east. The landing is about 0.1 miles below where the Jacks Fork empties into the Current River.',
  facilities = 'NPS campground operated by Two Rivers Canoe Rental. General store - the last one for ~30 miles if heading downstream on the Current. Outfitter services, canoe/kayak/raft/tube rentals, and shuttle. Vault toilets.'
WHERE name ILIKE '%Two Rivers%' AND river_id IN (SELECT id FROM rivers WHERE slug = 'jacks-fork');
