-- Migration: Update Current River access points with detailed information
-- Updates description, parking_info, road_access, and facilities fields
-- Does NOT change locations or other existing data

-- Montauk State Park
UPDATE access_points SET
  description = 'Montauk State Park is the birthplace of the Current River, where Montauk Spring and Pigeon Creek converge to form the headwaters. This is primarily a trout fishing destination rather than a traditional float launch. The park is a full-service facility with a lodge, restaurant, cabins, and a well-maintained campground with electric hookups, showers, and flush toilets. The Missouri Department of Conservation operates a trout hatchery here with daily stockings. The park road out the back gate connects to Baptist Camp access a few miles downstream. Montauk is the natural base camp if you''re planning to float the upper Current the next morning.',
  parking_info = 'Large paved lots throughout the park. Ample parking year-round.',
  road_access = 'Paved all the way in via Hwy 119. Easy access from Salem (about 20 miles southwest).',
  facilities = 'Lodge with restaurant, general store, cabins, full-hookup campground, flush toilets, showers, fish cleaning stations, picnic areas.'
WHERE name ILIKE '%Montauk%' AND river_id IN (SELECT id FROM rivers WHERE slug = 'current-river');

-- Baptist Camp Access
UPDATE access_points SET
  description = 'Baptist Camp is the first real put-in on the Current River and the starting point for one of the most iconic upper river day floats. Managed by the Missouri Department of Conservation, this is a no-frills gravel access with a privy and parking area. The river here is narrow, clear, and intimate - you''re floating through the blue ribbon trout waters just below Montauk. In summer, the pool at the access doubles as a popular swimming hole, which can make it feel crowded. Cedargrove is 8 miles downstream, making this a manageable 3-5 hour day float with plenty of springs and scenery along the way, including Schafer Spring and the Susie Nichols cabin.',
  parking_info = 'Gravel lot with ample parking. Gets crowded on summer weekends and during trout season.',
  road_access = 'Follow the gravel road out the back of Montauk State Park. It turns to blacktop, then take the first right at the MDC sign for Baptist Camp. The gravel road down to the access is passable for all vehicles but narrow.',
  facilities = 'Privy (outhouse) only. No water, no camping allowed at this access.'
WHERE name ILIKE '%Baptist Camp%' AND river_id IN (SELECT id FROM rivers WHERE slug = 'current-river');

-- Cedargrove
UPDATE access_points SET
  description = 'Cedargrove is a primitive backcountry campground managed by the National Park Service, sitting at a low-water bridge crossing. This is the take-out for the Baptist Camp day float and put-in for the popular Cedargrove to Akers section. The low-water bridge is a notable feature - at normal levels you''ll need to portage your boat across the road. About 12-15 primitive campsites sit along the river, first-come first-served. There''s a small country store and Jadwin Canoe Rental about a mile up Hwy ZZ at the junction with Hwy K. The NPS charges a nightly camping fee ($10/night as of recent years). Outhouses are the only facilities.',
  parking_info = 'Small gravel area near the low-water bridge. Limited - plan accordingly on busy weekends.',
  road_access = 'Off Hwy K via Hwy ZZ. The final stretch is a gravel county road. Passable for all vehicles in dry conditions. The low-water bridge may be impassable during high water.',
  facilities = 'Vault toilets (outhouses) only. No water, no showers. Backcountry camping ($10/night). Small store 1 mile up the road.'
WHERE name ILIKE '%Cedargrove%' AND river_id IN (SELECT id FROM rivers WHERE slug = 'current-river');

-- Welch Landing
UPDATE access_points SET
  description = 'Welch Landing sits near one of the Current River''s most spectacular features - Welch Spring, the eighth largest spring in Missouri, pumping 75 million gallons per day into the river. The ruins of Dr. C.H. Diehl''s hospital for asthma patients (1920s-30s) sit near the spring and are a must-see stop. This is a small, less-developed access primarily used as an alternate put-in or take-out rather than a primary launch. It''s useful for shorter floats - 2.5 miles down to Akers Ferry makes a perfect short evening paddle, or pair with Cedargrove for a shorter day.',
  parking_info = 'Small gravel pulloff area. Very limited capacity.',
  road_access = 'Gravel road access off county roads. Can be tricky to find - follow signs carefully. Passable for standard vehicles in dry weather.',
  facilities = 'Minimal to none. No restrooms, no water, no camping at the landing itself.'
WHERE name ILIKE '%Welch%' AND river_id IN (SELECT id FROM rivers WHERE slug = 'current-river');

-- Akers Ferry
UPDATE access_points SET
  description = 'Akers Ferry is one of the Current River''s marquee access points and home to the last remaining two-car ferry in Missouri - a hand-cranked cable ferry that''s been operating for over a century. This is a major hub for float trips: the Akers to Pulltite stretch (10 miles) is widely considered the single best day float on the Current River, featuring Cave Spring where you can paddle 100+ feet into a cave. The NPS operates a group campground here with basic amenities. A seasonal camp store sells firewood, ice, snacks, and supplies. Multiple outfitters operate from this area including Akers Ferry Canoe Rental. The area sits at the junction of Hwys K and KK.',
  parking_info = 'Gravel parking area near the ferry. Can get very crowded on summer weekends. Additional overflow parking available.',
  road_access = 'From Salem: Hwy 19 south 4 miles, then Hwy KK west 16 miles to the junction with Hwy K. Paved the entire way - one of the most accessible upper river launches.',
  facilities = 'NPS group campground (4 group sites, tent-only, up to 45 people per site). Vault toilets, potable water, trash collection. Seasonal camp store nearby with firewood, ice, snacks. Canoe/kayak rentals available on site.'
WHERE name ILIKE '%Akers%' AND river_id IN (SELECT id FROM rivers WHERE slug = 'current-river');

-- Pulltite (also matches Pulltite Spring)
UPDATE access_points SET
  description = 'Pulltite is a well-developed NPS campground and the take-out for the famous Akers to Pulltite day float. It''s also the put-in for the next classic section down to Round Spring (9 miles). The campground is one of the nicest on the river with paved roads and parking spurs, flush toilets and showers (seasonal, April 15-Oct 15), and an amphitheater with ranger-led programs in summer. Across the river from the campground is the historic Pulltite Cabin and scenic Pulltite Spring - an azure pool filled with lime-green watercress at the base of a bluff. You can reach them by wading or paddling across. Current River Canoe Rental operates here and handles shuttles.',
  parking_info = 'Paved parking spurs in the campground. Separate day-use parking near the river access. Fills on peak weekends but generally adequate.',
  road_access = 'From Salem: Hwy 19 south 32 miles, then turn right onto Hwy EE to the end. Paved all the way. Well-signed.',
  facilities = 'NPS campground with ~55 sites ($16/night non-electric). Flush toilets and showers available April 15-Oct 15 (note: flood damage reverted facilities to vault toilet after Oct 2025 - check current status). Picnic tables, fire rings, grills. Current River Canoe Rental on site. Amphitheater.'
WHERE name ILIKE '%Pulltite%' AND river_id IN (SELECT id FROM rivers WHERE slug = 'current-river');

-- Round Spring
UPDATE access_points SET
  description = 'Round Spring is a full-service NPS campground and a natural dividing line on the Current River - above here is the quieter upper river; below, you begin to see more jon boats and motorized traffic toward Two Rivers. The campground is one of the best-equipped on the entire river system with electric hookups (50-amp), a dump station, flush toilets and showers (seasonal), paved roads and sites, and a ranger station. The namesake Round Spring is a stunning collapsed cavern with turquoise water - a short trail from the parking lot leads you there. Ranger-guided cave tours of Round Spring Cave are offered daily in summer. Wild horses are sometimes spotted in the adjacent fields.',
  parking_info = 'Paved parking throughout the campground and at the river access. Day-use parking near the spring. Good capacity.',
  road_access = 'Located directly on Hwy 19, about 13 miles north of Eminence. Fully paved, easy to find. One of the most highway-accessible points on the river.',
  facilities = 'NPS campground with ~60 sites including electric hookups (50-amp). Flush toilets and showers (April 15-Oct 15). Dump station. Ranger station. Picnic areas. Cave tours. Canoe rental (Carr''s Canoe Rental) nearby.'
WHERE name ILIKE '%Round Spring%' AND river_id IN (SELECT id FROM rivers WHERE slug = 'current-river');

-- Jerktail Landing
UPDATE access_points SET
  description = 'Jerktail Landing is a backcountry access point between Round Spring and Two Rivers. It''s significantly less developed and less used than the major upper river access points, making it a good choice for floaters looking for solitude. This is remote Ozark wilderness - expect gravel roads and minimal facilities. The landing serves primarily as a put-in or take-out for multi-day trips or for paddlers wanting to shorten the long Round Spring to Two Rivers run.',
  parking_info = 'Small gravel pulloff. Very limited capacity.',
  road_access = 'County gravel roads. Passable for most vehicles in dry conditions but remote and potentially confusing without GPS. Not recommended after heavy rain.',
  facilities = 'Minimal to none. Bring everything you need.'
WHERE name ILIKE '%Jerktail%' AND river_id IN (SELECT id FROM rivers WHERE slug = 'current-river');

-- Two Rivers (Jacks Fork Confluence)
UPDATE access_points SET
  description = 'Two Rivers is where the Jacks Fork River flows into the Current, nearly doubling its size. This is a major landmark on the river and a natural transition point - above here is the quieter upper Current; below, the river is bigger, deeper, and you''ll see increasing motorized boat traffic heading toward Van Buren. The NPS operates a campground here with full amenities. Two Rivers Canoe Rental operates from this location. This is also where most multi-day upper river trips end. The widened river below Two Rivers is popular with jon boats and jet boats, especially on weekends.',
  parking_info = 'Gravel and paved areas at the campground and access point. Adequate for most days.',
  road_access = 'Accessible via Hwy 106. Paved roads to the campground. Well-signed.',
  facilities = 'NPS campground with flush toilets and showers (seasonal). Picnic areas. Two Rivers Canoe Rental on site. Fire rings, picnic tables.'
WHERE name ILIKE '%Two Rivers%' AND river_id IN (SELECT id FROM rivers WHERE slug = 'current-river');

-- Powder Mill
UPDATE access_points SET
  description = 'Powder Mill is an old ferry site turned NPS campground and river access, reopened after significant flood damage repairs (closed from 2017 to 2020). The campground has 8 sites and sits near the Hwy 106 bridge. The gravel bar has changed significantly from pre-flood conditions, and vehicles should use caution to avoid getting stuck in loose gravel when accessing the river. Blue Spring - the ninth largest spring in Missouri, famous for its incredibly deep blue color - is just 1.3 miles downstream. It''s reached by a quarter-mile walk up its spring branch on river left.',
  parking_info = 'Small gravel area. The approach through the gravel bar can be tricky - use caution to avoid getting stuck.',
  road_access = 'Near the Current River bridge on Hwy 106, about 14 miles west of Ellington or 13 miles east of Eminence. Paved highway access, but the final approach to the river is gravel.',
  facilities = 'NPS backcountry campground with 8 sites ($5/night). Concrete vault toilet (replaced flush restroom after 2017 floods). No showers. No water hookups.'
WHERE name ILIKE '%Powder Mill%' AND river_id IN (SELECT id FROM rivers WHERE slug = 'current-river');

-- Roberts Field
UPDATE access_points SET
  description = 'Roberts Field is a small backcountry access and campground where Rocky Creek enters the Current on the right. It''s a quiet, lightly-used stop in a scenic stretch of river. The Falls of Rocky Creek, about 3 miles southwest, are a scenic side attraction for those willing to explore. This area sees far less traffic than the upper river access points.',
  parking_info = 'Small gravel area. Limited capacity but rarely an issue given low usage.',
  road_access = 'Gravel county roads. Remote but passable for standard vehicles in dry conditions.',
  facilities = 'Backcountry campground. Minimal facilities - vault toilet, fire rings. No water, no showers.'
WHERE name ILIKE '%Roberts Field%' AND river_id IN (SELECT id FROM rivers WHERE slug = 'current-river');

-- Log Yard
UPDATE access_points SET
  description = 'Log Yard is a backcountry access and campground on river left. Named for its history as a timber staging area, it''s now a quiet camping spot on the middle Current. This stretch of river features impressive bluffs, including Paint Rock Bluff at mile 72.5 downstream. The area is remote and sees modest traffic - a good overnight stop on a multi-day float.',
  parking_info = 'Small gravel area. Very limited but adequate for typical low usage.',
  road_access = 'Gravel county roads. Remote, passable for standard vehicles.',
  facilities = 'Backcountry campground. Vault toilet, fire rings. No water, no showers.'
WHERE name ILIKE '%Log Yard%' AND river_id IN (SELECT id FROM rivers WHERE slug = 'current-river');

-- Waymeyer Access
UPDATE access_points SET
  description = 'Waymeyer sits on river right at the mouth of Chilton Creek, accessed via County Road M-151 off Hwy M, about 10 miles north of Van Buren. This access has seen significant management changes in recent years. Due to riverbank erosion, the NPS restricts Waymeyer to non-commercial floaters only on summer weekends (Friday-Sunday). Commercial outfitters must use the nearby Pin Oak access during those times. Monday through Thursday, both commercial and non-commercial users can launch here. The Waymeyer to Van Buren run (about 7 miles) is a popular day float on the lower river.',
  parking_info = 'Gravel area. Limited space, especially with weekend restrictions channeling more users here on weekdays.',
  road_access = 'County Road M-151 off Hwy M. The final approach is gravel. Passable for all vehicles.',
  facilities = 'Basic river access only. No campground, no restrooms at the immediate access. Nearby facilities at Chilton Creek boat ramp area.'
WHERE name ILIKE '%Waymeyer%' AND river_id IN (SELECT id FROM rivers WHERE slug = 'current-river');

-- Van Buren (Riverfront Park or City Access)
UPDATE access_points SET
  description = 'Van Buren Riverfront Park is the main in-town access point on the Current River, sitting right at the Hwy 60 bridge in the town of Van Buren. This is the civilized hub of the lower Current - Van Buren is a small town but it has restaurants, a coffee shop, a gas station (Sinclair), basic shopping, and lodging options. The park has a developed riverfront area. Van Buren also serves as the gateway to Big Spring, located just 4 miles south on Hwy 103. This is a natural resupply and logistics point for longer river trips. Expect more motorized boat traffic in this area.',
  parking_info = 'Paved town parking near the riverfront park. Generally adequate. Additional parking in town.',
  road_access = 'Right on US Hwy 60 - one of the best highway-accessible points on the entire river. Easy to find, easy to reach from any direction.',
  facilities = 'Town amenities: restaurants, gas station, coffee shop, lodging. The park itself has basic riverfront access. No campground at the park, but Big Spring Campground is 4 miles south.'
WHERE name ILIKE '%Van Buren%' AND river_id IN (SELECT id FROM rivers WHERE slug = 'current-river');

-- Big Spring
UPDATE access_points SET
  description = 'Big Spring is one of the crown jewels of Missouri - one of the largest freshwater springs in North America, producing an average of 276 million gallons of water per day. The spring emerges from a massive cave opening at the base of a dolomite bluff, creating an awe-inspiring turquoise pool. The NPS operates a full-service campground here with paved sites, electric hookups, flush toilets, showers, picnic pavilions, and hiking trails. A 1.8-mile loop trail takes you above the spring with panoramic views. The campground is beautifully maintained with spacious sites. Historic CCC-era cabins on the property are being renovated. The spring itself is very accessible - you can drive right to it with ample parking including handicap spots.',
  parking_info = 'Large paved lots at the spring and throughout the campground. Plenty of parking including accessible spots.',
  road_access = 'From Van Buren: Hwy 60 west, then Hwy 103 south for 4 miles. Fully paved, well-signed. From Van Buren it''s a 10-minute drive.',
  facilities = 'Full-service NPS campground with electric and non-electric sites. Flush toilets, showers, picnic pavilions (recently rebuilt). Paved roads and sites. Hiking trails. Self-serve pay station. No on-site store - bring supplies from Van Buren.'
WHERE name ILIKE '%Big Spring%' AND river_id IN (SELECT id FROM rivers WHERE slug = 'current-river');

-- Gooseneck
UPDATE access_points SET
  description = 'Gooseneck is a Forest Service campground on river right, accessed via Farm Road 3142/County Road C10 off Hwy C. Named for the dramatic river bend in this area, it marks the transition into the remote lower Current. Below Gooseneck, the river enters increasingly wild and sparsely accessed territory heading toward Doniphan. This area is popular with fishing-focused floaters and those seeking solitude on multi-day trips. The stretch from Big Spring to Gooseneck passes several smaller springs and bluffs.',
  parking_info = 'Small gravel area at the campground.',
  road_access = 'Farm Road 3142/County Road C10 off Hwy C. Gravel, somewhat remote. Passable for standard vehicles in dry conditions.',
  facilities = 'Forest Service campground. Basic facilities - vault toilets, fire rings. No water, no showers.'
WHERE name ILIKE '%Gooseneck%' AND river_id IN (SELECT id FROM rivers WHERE slug = 'current-river');

-- Doniphan / T.L. Wright Memorial Access
UPDATE access_points SET
  description = 'T.L. Wright Memorial Access at Doniphan is the last major Missouri access point on the Current River before it crosses into Arkansas. Located on river right near the Hwy 160 bridge, Doniphan is a small town with stores, restaurants, lodging, and supplies. Private campgrounds operate nearby. This is the natural endpoint for lower Current River multi-day trips. Below Doniphan, the river continues about 12 miles to the Missouri-Arkansas state line and eventually to the confluence with the Black River in Pocahontas, Arkansas.',
  parking_info = 'Paved and gravel areas near the access. Adequate for typical usage.',
  road_access = 'Right off Hwy 160 in Doniphan. Fully paved, easy highway access.',
  facilities = 'River access with parking. Town of Doniphan nearby offers stores, meals, lodging, and gas. Private campgrounds in the area.'
WHERE (name ILIKE '%Doniphan%' OR name ILIKE '%T.L. Wright%' OR name ILIKE '%TL Wright%') AND river_id IN (SELECT id FROM rivers WHERE slug = 'current-river');
