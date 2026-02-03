import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Complete Guide to Current River Float Trips in Missouri [2026]',
  description: 'Discover why Current River is Missouri\'s most iconic float trip destination. Complete guide covers access points, outfitters, best seasons, wildlife, camping, and insider tips for planning your perfect paddle adventure.',
  keywords: [
    'Current River',
    'Current River float trips',
    'Missouri float trips',
    'Current River Missouri',
    'Ozark National Scenic Riverways',
    'Current River camping',
    'Current River outfitters',
    'Akers to Pulltite',
    'Cave Spring Missouri',
    'Big Spring Missouri',
    'Current River kayaking',
    'Current River canoeing',
    'Missouri river trips',
    'Ozark float trips',
  ],
  openGraph: {
    title: 'Complete Guide to Current River Float Trips in Missouri [2026]',
    description: 'Your comprehensive guide to Missouri\'s crown jewel float destination—from access points and outfitters to hidden springs and insider tips',
    type: 'article',
  },
};

export default function CurrentRiverGuidePage() {
  return (
    <article className="min-h-screen bg-white">
      <div className="max-w-4xl mx-auto px-4 py-16">
        {/* Header */}
        <header className="mb-12">
          <div className="flex items-center gap-4 text-sm text-gray-500 mb-4">
            <Link href="/blog" className="hover:text-blue-600">← Back to Blog</Link>
            <span>•</span>
            <time dateTime="2026-02-02">February 2, 2026</time>
            <span>•</span>
            <span>42 min read</span>
          </div>

          <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-6">
            The Complete Guide to Current River Float Trips in Missouri
          </h1>

          <p className="text-xl text-gray-600 leading-relaxed mb-6">
            Discover why Current River is Missouri&apos;s most iconic float trip destination—your 
            comprehensive guide to planning the perfect paddle adventure through crystal-clear 
            spring-fed water, towering limestone bluffs, and hidden blue springs.
          </p>
        </header>

        {/* Table of Contents */}
        <nav className="bg-blue-50 rounded-lg p-6 mb-12 border border-blue-100">
          <h2 className="font-bold text-lg mb-4">Quick Navigation</h2>
          <ul className="space-y-2">
            <li><a href="#introduction" className="text-blue-600 hover:underline">1. Introduction: Missouri&apos;s Crown Jewel</a></li>
            <li><a href="#river-overview" className="text-blue-600 hover:underline">2. River Overview: America&apos;s First National Scenic Riverway</a></li>
            <li><a href="#access-points" className="text-blue-600 hover:underline">3. Access Points & Put-Ins</a></li>
            <li><a href="#what-to-expect" className="text-blue-600 hover:underline">4. What to Expect: Conditions, Difficulty & Wildlife</a></li>
            <li><a href="#outfitters" className="text-blue-600 hover:underline">5. Outfitters & Rentals</a></li>
            <li><a href="#best-time" className="text-blue-600 hover:underline">6. Best Time to Float</a></li>
            <li><a href="#gear" className="text-blue-600 hover:underline">7. What to Bring: Essential Gear</a></li>
            <li><a href="#attractions" className="text-blue-600 hover:underline">8. Nearby Attractions</a></li>
            <li><a href="#local-tips" className="text-blue-600 hover:underline">9. Tips from Locals</a></li>
            <li><a href="#plan-trip" className="text-blue-600 hover:underline">10. Plan Your Trip</a></li>
          </ul>
        </nav>

        {/* Main Content */}
        <div className="prose prose-lg max-w-none">
          
          {/* Section 1: Introduction */}
          <section id="introduction" className="mb-12">
            <h2 className="text-3xl font-bold mb-4">1. Introduction: Missouri&apos;s Crown Jewel of Float Trips</h2>
            
            <p className="text-gray-700 mb-4">
              Picture this: crystal-clear spring-fed water so transparent you can count pebbles 10 feet down, 
              towering limestone bluffs rising from the riverbanks, and brilliant blue springs bubbling up from 
              mysterious underground caverns. This isn&apos;t a fantasy—it&apos;s every day on Missouri&apos;s 
              Current River.
            </p>

            <p className="text-gray-700 mb-4">
              As the most spring-fed river in the Ozarks and the centerpiece of America&apos;s first National 
              Scenic Riverway, the Current River has earned its reputation as <strong>the</strong> premier 
              float trip destination in Missouri. Whether you&apos;re a first-time floater or a seasoned paddler, 
              the Current River offers an unparalleled combination of accessibility, natural beauty, and adventure.
            </p>

            <div className="bg-blue-50 border-l-4 border-blue-500 p-6 mb-6">
              <h3 className="text-xl font-bold mb-3">Quick Stats</h3>
              <ul className="list-disc pl-6 space-y-1 text-gray-700">
                <li><strong>Length:</strong> 184 miles from Montauk State Park to the Black River confluence</li>
                <li><strong>Difficulty:</strong> Class I-II (beginner-friendly with occasional mild rapids)</li>
                <li><strong>Best For:</strong> Families, beginners, photographers, anglers, and anyone seeking stunning Ozark scenery</li>
                <li><strong>Peak Season:</strong> May through September (floatable year-round below Welch Spring)</li>
                <li><strong>Annual Visitors:</strong> Over 1.3 million people explore the Ozark National Scenic Riverways annually</li>
              </ul>
            </div>

            <h3 className="text-2xl font-bold mb-3">Who Should Float the Current River?</h3>
            <ul className="list-disc pl-6 space-y-2 text-gray-700 mb-6">
              <li><strong>Families:</strong> Gentle currents and shallow sections make it perfect for kids</li>
              <li><strong>Beginners:</strong> Class I water means you don&apos;t need prior paddling experience</li>
              <li><strong>Photographers:</strong> Cave Spring, Blue Spring, and dramatic bluffs offer endless photo ops</li>
              <li><strong>Anglers:</strong> Trophy trout fishing in upper sections; smallmouth bass throughout</li>
              <li><strong>Adventure Seekers:</strong> Multi-day camping trips through pristine wilderness</li>
              <li><strong>History Buffs:</strong> Explore historic mills, springs, and remnants of Ozark settlement</li>
            </ul>
          </section>

          {/* Section 2: River Overview */}
          <section id="river-overview" className="mb-12">
            <h2 className="text-3xl font-bold mb-4">2. River Overview: America&apos;s First National Scenic Riverway</h2>

            <h3 className="text-2xl font-bold mb-3">The Birth of a Protected Treasure</h3>
            <p className="text-gray-700 mb-4">
              The Current River made history on August 27, 1964, when President Lyndon Johnson signed the bill 
              creating the <strong>Ozark National Scenic Riverways</strong>—the first national park area established 
              to protect a river system. This groundbreaking conservation effort preserved 134 miles of the Current 
              River and Jacks Fork rivers, ensuring that future generations could experience these waterways as 
              wild and free-flowing.
            </p>

            <p className="text-gray-700 mb-4">
              The push for protection came after decades of threats. In the 1940s, the U.S. Army Corps of Engineers 
              proposed damming the Current River for hydroelectric plants—a plan that would have drowned the 
              river&apos;s spectacular springs and bluffs beneath reservoirs. Conservationists, led by visionaries 
              like Missouri Governor Herbert Hadley (who famously floated the river in 1909) and wilderness advocate 
              Leonard Hall, fought for years to save the river. Their efforts culminated in the 1964 Act of Congress, 
              with formal dedication occurring in 1971 when Patricia Nixon Cox cut the ribbon at Big Spring.
            </p>

            <h3 className="text-2xl font-bold mb-3">Geographic Context: The Heart of the Missouri Ozarks</h3>
            <p className="text-gray-700 mb-4">
              The Current River flows 184 miles through the rugged Ozark Highlands of southeastern Missouri, carving 
              its path through Shannon, Carter, Dent, and Texas counties. The river begins at the confluence of 
              Pigeon Creek and Montauk Springs in Montauk State Park (Dent County) and meanders southeast until it 
              joins the Black River in Pocahontas, Arkansas.
            </p>

            <p className="text-gray-700 mb-6">
              The river&apos;s watershed lies within the Mark Twain National Forest and the Ozark National Scenic 
              Riverways, creating a corridor of protected wilderness rarely found east of the Rockies. Towns like 
              Van Buren, Eminence, and Doniphan serve as gateways to the river, offering outfitters, lodging, and supplies.
            </p>

            <h3 className="text-2xl font-bold mb-3">Why the Current River Reigns Supreme</h3>
            
            <div className="bg-green-50 border-l-4 border-green-500 p-6 mb-6">
              <h4 className="text-xl font-bold mb-2">Spring-Fed Clarity</h4>
              <p className="text-gray-700">
                The Current River boasts the highest concentration of first-magnitude springs (those flowing over 
                100 cubic feet per second) in dolomite rock anywhere in the United States. Major springs like Welch 
                Spring (121 cfs), Cave Spring, Pulltite Spring, Round Spring, Blue Spring, and Big Spring (one of 
                the largest springs in the world at 286 million gallons per day) feed the river, ensuring consistent 
                flows and remarkably clear water year-round.
              </p>
            </div>

            <div className="bg-blue-50 border-l-4 border-blue-500 p-6 mb-6">
              <h4 className="text-xl font-bold mb-2">Year-Round Floatability</h4>
              <p className="text-gray-700">
                Unlike rain-fed rivers that fluctuate wildly, the Current&apos;s spring-fed nature means you can 
                float most sections throughout the year. The most popular sections (Akers to Pulltite, Cedar Grove 
                to Akers) are reliably floatable from spring through fall, while lower sections below Welch Spring 
                can be paddled even in winter.
              </p>
            </div>

            <h3 className="text-2xl font-bold mb-3">By the Numbers: Current River&apos;s Gradient and Character</h3>
            <ul className="list-disc pl-6 space-y-2 text-gray-700 mb-6">
              <li><strong>Overall Gradient:</strong> 4.4 feet per mile (gentle and forgiving)</li>
              <li><strong>Montauk to Akers:</strong> 8.7 ft/mi (faster upper section)</li>
              <li><strong>Akers to Jacks Fork Junction:</strong> 5 ft/mi (moderate pace, most popular)</li>
              <li><strong>Jacks Fork to Big Spring:</strong> 3.8 ft/mi (lazy and scenic)</li>
              <li><strong>Big Spring to Doniphan:</strong> 3.2 ft/mi (wide and slow, motorboat traffic)</li>
            </ul>

            <p className="text-gray-700 mb-4">
              The gradient tells the story: upper sections move briskly with occasional Class I-II riffles, while 
              lower sections meander lazily through broader valleys. Most floaters target the sweet spot between 
              Akers and Round Spring, where the river offers just enough current to keep you moving while providing 
              ample time to soak in the scenery.
            </p>
          </section>

          {/* Section 3: Access Points */}
          <section id="access-points" className="mb-12">
            <h2 className="text-3xl font-bold mb-4">3. Access Points & Put-Ins: Your Complete Launch Guide</h2>
            
            <p className="text-gray-700 mb-6">
              The Current River offers over 30 access points along its 184-mile course. Below are the most popular 
              access points used by outfitters and paddlers, listed downstream with approximate GPS coordinates, 
              facilities, and float times between key sections.
            </p>

            <h3 className="text-2xl font-bold mb-3">Upper Current River Access Points</h3>

            <div className="bg-gray-50 border border-gray-200 rounded-lg p-6 mb-6">
              <h4 className="text-xl font-bold mb-2">Baptist Camp Access</h4>
              <p className="text-gray-700 mb-2">
                <strong>Location:</strong> Upper Current River, near Montauk<br />
                <strong>GPS:</strong> ~37.5200°N, -91.7850°W<br />
                <strong>Facilities:</strong> Primitive access, limited parking
              </p>
              <p className="text-gray-700 mb-2">
                <strong>Notes:</strong> Trophy trout fishing section (blue ribbon); 18-inch minimum, 1 fish limit, 
                hard lures only. Low water in summer may require walking your craft.
              </p>
              <p className="text-gray-700">
                <strong>Float Times:</strong><br />
                • To Cedar Grove: 8 miles / 3-5 hours<br />
                • To Akers: 16 miles / 6-8 hours
              </p>
            </div>

            <div className="bg-gray-50 border border-gray-200 rounded-lg p-6 mb-6">
              <h4 className="text-xl font-bold mb-2">Cedar Grove Access</h4>
              <p className="text-gray-700 mb-2">
                <strong>Location:</strong> Upper Current River<br />
                <strong>GPS:</strong> ~37.4020°N, -91.5850°W<br />
                <strong>Facilities:</strong> Forest Service campground, parking, restrooms
              </p>
              <p className="text-gray-700 mb-2">
                <strong>Notes:</strong> Popular put-in for trophy trout section; low water bridge requires portage
              </p>
              <p className="text-gray-700">
                <strong>Float Times:</strong><br />
                • To Akers: 8 miles / 3-5 hours<br />
                • To Pulltite: 20 miles / 7-9 hours
              </p>
            </div>

            <div className="bg-gray-50 border border-gray-200 rounded-lg p-6 mb-6">
              <h4 className="text-xl font-bold mb-2">Welch Spring Access</h4>
              <p className="text-gray-700 mb-2">
                <strong>Location:</strong> Upper Current River<br />
                <strong>GPS:</strong> ~37.3800°N, -91.4900°W<br />
                <strong>Facilities:</strong> Parking, historic Welch Hospital ruins
              </p>
              <p className="text-gray-700 mb-2">
                <strong>Notes:</strong> Spectacular spring (121 cfs); historic tuberculosis hospital ruins to explore
              </p>
              <p className="text-gray-700">
                <strong>Float Times:</strong><br />
                • To Akers: 2.5 miles / 1.5-2 hours (popular short tube float)
              </p>
            </div>

            <div className="bg-blue-50 border-l-4 border-blue-500 p-6 mb-6">
              <h4 className="text-xl font-bold mb-2">Akers Ferry Access</h4>
              <p className="text-gray-700 mb-2">
                <strong>Location:</strong> Off State Route K near Salem<br />
                <strong>GPS:</strong> ~37.3650°N, -91.4560°W<br />
                <strong>Facilities:</strong> Outfitter (Akers Ferry Canoe Rental), campground (front country NPS site 
                with electric/non-electric), parking, restrooms, store, last operational 2-car ferry in Missouri<br />
                <strong>Fees:</strong> Front country camping: $16-19/night
              </p>
              <p className="text-gray-700 mb-2">
                <strong>Notes:</strong> One of the busiest access points; home to the famous hand-pulled car ferry (free to use!)
              </p>
              <p className="text-gray-700">
                <strong>Float Times:</strong><br />
                • To Pulltite: 12 miles / 4-6 hours (most popular single-day trip)<br />
                • To Round Spring: 22 miles / 7-9 hours (long day or overnight)
              </p>
            </div>

            <h3 className="text-2xl font-bold mb-3">Middle Current River Access Points</h3>

            <div className="bg-green-50 border-l-4 border-green-500 p-6 mb-6">
              <h4 className="text-xl font-bold mb-2">Pulltite Spring Campground</h4>
              <p className="text-gray-700 mb-2">
                <strong>Location:</strong> Off Highway 19<br />
                <strong>GPS:</strong> ~37.2880°N, -91.3620°W<br />
                <strong>Facilities:</strong> Front country NPS campground, parking, restrooms, outfitter 
                (Current River Canoe Rental), store, group sites, electric/non-electric sites<br />
                <strong>Fees:</strong> $16-19/night (front country); reservations at Recreation.gov
              </p>
              <p className="text-gray-700 mb-2">
                <strong>Notes:</strong> Major hub for floaters; Pulltite Spring feeds river here
              </p>
              <p className="text-gray-700">
                <strong>Float Times:</strong><br />
                • To Round Spring: 10 miles / 3-4 hours<br />
                • To Two Rivers: 30 miles / 10-12 hours (multi-day)
              </p>
            </div>

            <div className="bg-gray-50 border border-gray-200 rounded-lg p-6 mb-6">
              <h4 className="text-xl font-bold mb-2">Round Spring Access</h4>
              <p className="text-gray-700 mb-2">
                <strong>Location:</strong> Off Highway 19<br />
                <strong>GPS:</strong> ~37.2400°N, -91.2650°W<br />
                <strong>Facilities:</strong> Front country NPS campground, parking, restrooms, Round Spring 
                Caverns (ranger-led tours in summer), store<br />
                <strong>Fees:</strong> $16-19/night
              </p>
              <p className="text-gray-700 mb-2">
                <strong>Notes:</strong> Beautiful spring and cave; marks transition to higher motorboat traffic (40 HP limit begins here)
              </p>
              <p className="text-gray-700">
                <strong>Float Times:</strong><br />
                • To Two Rivers: 20 miles / 7-9 hours<br />
                • To Big Spring: 38 miles / 13-15 hours (multi-day)
              </p>
            </div>

            <div className="bg-gray-50 border border-gray-200 rounded-lg p-6 mb-6">
              <h4 className="text-xl font-bold mb-2">Two Rivers Campground</h4>
              <p className="text-gray-700 mb-2">
                <strong>Location:</strong> Confluence of Jacks Fork and Current River<br />
                <strong>GPS:</strong> ~37.1580°N, -91.2320°W<br />
                <strong>Facilities:</strong> Front country NPS campground, parking, restrooms, outfitter 
                (Two Rivers Canoe Rental)
              </p>
              <p className="text-gray-700 mb-2">
                <strong>Notes:</strong> Strategic junction point; popular multi-day trip destination
              </p>
              <p className="text-gray-700">
                <strong>Float Times:</strong><br />
                • To Powder Mill: 18 miles / 6-8 hours<br />
                • To Big Spring: 18 miles / 6-7 hours
              </p>
            </div>

            <h3 className="text-2xl font-bold mb-3">Lower Current River Access Points</h3>

            <div className="bg-gray-50 border border-gray-200 rounded-lg p-6 mb-6">
              <h4 className="text-xl font-bold mb-2">Van Buren Riverfront Park Access</h4>
              <p className="text-gray-700 mb-2">
                <strong>Location:</strong> Van Buren, Highway 60 Bridge<br />
                <strong>GPS:</strong> ~36.9940°N, -91.0090°W<br />
                <strong>Facilities:</strong> Parking, restrooms, nearby town (lodging, restaurants, stores)
              </p>
              <p className="text-gray-700 mb-2">
                <strong>Notes:</strong> Major town access; USGS water gage 07067000 located here
              </p>
              <p className="text-gray-700">
                <strong>Float Times:</strong><br />
                • To Big Spring: 4 miles / 1.5-2 hours
              </p>
            </div>

            <div className="bg-gray-50 border border-gray-200 rounded-lg p-6 mb-6">
              <h4 className="text-xl font-bold mb-2">Big Spring Access</h4>
              <p className="text-gray-700 mb-2">
                <strong>Location:</strong> Off Highway 60 south of Van Buren<br />
                <strong>GPS:</strong> ~36.9820°N, -90.9850°W<br />
                <strong>Facilities:</strong> Front country NPS campground, parking, restrooms, Big Spring 
                Historic District, CCC structures, entrance station<br />
                <strong>Fees:</strong> Park entrance fees may apply
              </p>
              <p className="text-gray-700 mb-2">
                <strong>Notes:</strong> One of the world&apos;s largest springs (286 million gallons/day); 
                no HP limit below this point means heavy motorboat traffic
              </p>
              <p className="text-gray-700">
                <strong>Float Times:</strong><br />
                • To Clubhouse Landing: 4 miles / 1.5-2 hours<br />
                • To Doniphan: 35 miles / 12-15 hours (multi-day)
              </p>
            </div>

            <div className="bg-blue-100 border border-blue-300 rounded-lg p-6 mb-6">
              <p className="text-gray-800 font-semibold mb-2">💡 Pro Tips for Access Point Selection</p>
              <ul className="list-disc pl-6 space-y-1 text-gray-700">
                <li><strong>Avoid crowds:</strong> Float Tuesday-Wednesday; avoid Saturdays between Memorial Day and Labor Day</li>
                <li><strong>Check water levels:</strong> USGS gage 07067000 at Van Buren provides real-time data</li>
                <li><strong>Reserve campsites:</strong> Popular front country sites (Akers, Pulltite, Round Spring) fill up fast—book at Recreation.gov</li>
                <li><strong>Respect private property:</strong> Stay on river or public land; many gravel bars are private</li>
                <li><strong>Motorboat awareness:</strong> Above Round Spring, HP limit is 40; above Akers/Alley Spring, rarely see motorboats</li>
              </ul>
            </div>
          </section>

          {/* Section 4: What to Expect */}
          <section id="what-to-expect" className="mb-12">
            <h2 className="text-3xl font-bold mb-4">4. What to Expect: Conditions, Difficulty & Wildlife</h2>

            <h3 className="text-2xl font-bold mb-3">Water Conditions by Season</h3>

            <div className="bg-green-50 border-l-4 border-green-500 p-6 mb-6">
              <h4 className="text-xl font-bold mb-2">Spring (March-May) ★★★★☆</h4>
              <p className="text-gray-700 mb-3">
                <strong>Water Levels:</strong> High from snowmelt and spring rains<br />
                <strong>Temperature:</strong> 50-60°F (chilly but refreshing)<br />
                <strong>Clarity:</strong> Excellent (springs maintain clarity)<br />
                <strong>Flow:</strong> Faster current, fewer gravel bars exposed
              </p>
              <p className="text-gray-700 mb-2"><strong>Pros:</strong></p>
              <ul className="list-disc pl-6 space-y-1 text-gray-700 mb-3">
                <li>Fewer crowds, vibrant wildflowers, comfortable air temps</li>
                <li>Best time for upper Jacks Fork (Buck Hollow to Alley Spring) when water is high enough</li>
              </ul>
              <p className="text-gray-700"><strong>Cons:</strong> Cold water requires wetsuit for tubing; unpredictable weather</p>
            </div>

            <div className="bg-yellow-50 border-l-4 border-yellow-500 p-6 mb-6">
              <h4 className="text-xl font-bold mb-2">Summer (June-August) ★★★★★</h4>
              <p className="text-gray-700 mb-3">
                <strong>Water Levels:</strong> Moderate to low (depends on rainfall)<br />
                <strong>Temperature:</strong> 58-65°F (spring-fed coolness even in July heat)<br />
                <strong>Clarity:</strong> Crystal clear<br />
                <strong>Flow:</strong> Moderate; more gravel bars exposed
              </p>
              <p className="text-gray-700 mb-2"><strong>Pros:</strong></p>
              <ul className="list-disc pl-6 space-y-1 text-gray-700 mb-3">
                <li>Warm air temps perfect for swimming; best time for tubing</li>
                <li>All sections floatable</li>
              </ul>
              <p className="text-gray-700"><strong>Cons:</strong> Crowded on weekends (especially Saturday); air temps can exceed 95°F</p>
            </div>

            <div className="bg-orange-50 border-l-4 border-orange-500 p-6 mb-6">
              <h4 className="text-xl font-bold mb-2">Fall (September-November) ★★★★★</h4>
              <p className="text-gray-700 mb-3">
                <strong>Water Levels:</strong> Low to moderate<br />
                <strong>Temperature:</strong> 55-60°F<br />
                <strong>Clarity:</strong> Pristine<br />
                <strong>Flow:</strong> Gentle and relaxing
              </p>
              <p className="text-gray-700 mb-2"><strong>Pros:</strong></p>
              <ul className="list-disc pl-6 space-y-1 text-gray-700 mb-3">
                <li>Stunning fall foliage (mid-October peak); fewer bugs; solitude on weekdays; ideal weather</li>
              </ul>
              <p className="text-gray-700"><strong>Cons:</strong> Shorter days; colder water by late October</p>
            </div>

            <div className="bg-blue-50 border-l-4 border-blue-500 p-6 mb-6">
              <h4 className="text-xl font-bold mb-2">Winter (December-February) ★★★☆☆</h4>
              <p className="text-gray-700 mb-3">
                <strong>Water Levels:</strong> Low but stable (spring-fed)<br />
                <strong>Temperature:</strong> 50-55°F (warmer than air in winter!)<br />
                <strong>Clarity:</strong> Incredibly clear<br />
                <strong>Flow:</strong> Slow and peaceful
              </p>
              <p className="text-gray-700 mb-2"><strong>Pros:</strong></p>
              <ul className="list-disc pl-6 space-y-1 text-gray-700 mb-3">
                <li>Total solitude; ethereal fog rising from warmer water on cold mornings; bald eagle sightings</li>
              </ul>
              <p className="text-gray-700"><strong>Cons:</strong> Cold air temps (30s-40s); need drysuit; limited outfitter services; shorter daylight</p>
            </div>

            <h3 className="text-2xl font-bold mb-3">Difficulty Rating: Class I-II (Beginner-Friendly)</h3>
            <p className="text-gray-700 mb-4">
              The Current River is classified as <strong>Class I water</strong> with occasional <strong>Class II riffles</strong>, 
              making it one of the most beginner-friendly rivers in Missouri.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <h4 className="font-bold mb-2">What Class I Means:</h4>
                <ul className="list-disc pl-6 space-y-1 text-gray-700 text-sm">
                  <li>Small waves, few obstructions</li>
                  <li>Easy self-rescue if you tip</li>
                  <li>Minimal paddling skills required</li>
                  <li>Perfect for families with children</li>
                </ul>
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h4 className="font-bold mb-2">Class II Sections (&ldquo;Fun Rapids&rdquo;):</h4>
                <ul className="list-disc pl-6 space-y-1 text-gray-700 text-sm">
                  <li>Located primarily between Cedar Grove and Akers</li>
                  <li>Small standing waves and easy ledges</li>
                  <li>Thrill without danger</li>
                  <li>Great for first-time paddlers seeking a little excitement</li>
                </ul>
              </div>
            </div>

            <h3 className="text-2xl font-bold mb-3">Notable Features & Landmarks</h3>

            <div className="bg-blue-50 border-l-4 border-blue-500 p-6 mb-6">
              <h4 className="text-xl font-bold mb-2">Cave Spring (Mile 97.8 from Montauk)</h4>
              <p className="text-gray-700 mb-3">
                The crown jewel of the Current River. This 140-foot-deep spring cave glows brilliant blue and is 
                large enough to paddle your canoe or kayak inside. Located about 5 miles below Akers on the left 
                bank, Cave Spring is the single most photographed spot on the river.
              </p>
              <p className="text-gray-700">
                <strong>Location:</strong> Between Akers and Pulltite (left bank)<br />
                <strong>Access:</strong> From river only (no road access)<br />
                <strong>Depth:</strong> 140 feet<br />
                <strong>Must-Do:</strong> Paddle into the cave entrance, swim in the brilliant blue pool
              </p>
            </div>

            <div className="bg-green-50 border-l-4 border-green-500 p-6 mb-6">
              <h4 className="text-xl font-bold mb-2">Welch Spring & Historic Hospital Ruins</h4>
              <p className="text-gray-700 mb-3">
                Welch Spring is a massive first-magnitude spring (121 cubic feet per second average flow) with a 
                fascinating history. From 1914 to 1932, a tuberculosis hospital operated here, drawing patients 
                seeking the &quot;healing&quot; spring air and water. Today, you can explore the historic stone 
                ruins of the Welch Hospital.
              </p>
              <p className="text-gray-700">
                <strong>Location:</strong> Upper Current River, 2.5 miles above Akers<br />
                <strong>Facilities:</strong> Parking, interpretive signs<br />
                <strong>Must-Do:</strong> Explore hospital ruins, photograph the spring pool
              </p>
            </div>

            <div className="bg-purple-50 border-l-4 border-purple-500 p-6 mb-6">
              <h4 className="text-xl font-bold mb-2">Blue Spring</h4>
              <p className="text-gray-700 mb-3">
                Missouri&apos;s ninth-largest spring and the one with the <strong>deepest blue color</strong> of 
                any Ozark spring. Located near Powder Mill, Blue Spring requires a 0.25-mile walk up its branch on 
                the left bank but is absolutely worth the detour.
              </p>
              <p className="text-gray-700">
                <strong>Location:</strong> Mile 60 (near Powder Mill)<br />
                <strong>Access:</strong> 0.25-mile hike up branch from river<br />
                <strong>Must-See:</strong> Deepest blue color of any Missouri spring
              </p>
            </div>

            <div className="bg-yellow-50 border-l-4 border-yellow-500 p-6 mb-6">
              <h4 className="text-xl font-bold mb-2">Big Spring</h4>
              <p className="text-gray-700 mb-3">
                One of the largest springs in the world, Big Spring pumps an average of <strong>286 million gallons 
                of water per day</strong> into the Current River. The spring forms a massive pool surrounded by 
                historic CCC-era stone and wood structures from the 1930s.
              </p>
              <p className="text-gray-700">
                <strong>Location:</strong> Mile 89.2 (accessible by road)<br />
                <strong>Flow:</strong> 286 million gallons/day (one of world&apos;s largest)<br />
                <strong>Must-See:</strong> Historic CCC structures, massive spring pool
              </p>
            </div>

            <h3 className="text-2xl font-bold mb-3">Wildlife Encounters</h3>
            <ul className="list-disc pl-6 space-y-2 text-gray-700 mb-6">
              <li><strong>River Otters:</strong> The Current River has a thriving river otter population. These playful mammals are most active at dawn and dusk. Watch for them sliding down muddy banks and fishing in clear pools.</li>
              <li><strong>Bald Eagles:</strong> Winter months (December-February) bring bald eagles to the river corridor. Look for them perched in tall sycamores near the water.</li>
              <li><strong>Great Blue Herons & Kingfishers:</strong> Year-round residents; you&apos;ll see dozens on any float.</li>
              <li><strong>Deer & Wild Turkey:</strong> Common sightings along riverbanks, especially early morning and evening.</li>
              <li><strong>Smallmouth Bass:</strong> The Current River is renowned for smallmouth bass fishing. Watch for them cruising gravel bars in clear water.</li>
              <li><strong>Trout:</strong> Rainbow and brown trout in upper sections (Baptist to Cedar Grove). This is a blue ribbon trophy trout fishery.</li>
            </ul>
          </section>

          {/* Section 5: Outfitters */}
          <section id="outfitters" className="mb-12">
            <h2 className="text-3xl font-bold mb-4">5. Outfitters & Rentals: Your Trusted Float Partners</h2>
            
            <p className="text-gray-700 mb-6">
              The Current River is served by numerous outfitters offering canoe, kayak, raft, and tube rentals, 
              plus shuttle services and camping. Here are five top-rated outfitters to help plan your trip:
            </p>

            <div className="bg-blue-50 border-l-4 border-blue-500 p-6 mb-6">
              <h3 className="text-xl font-bold mb-2">1. Current River Canoe Rental (Akers Ferry® Canoe Rental)</h3>
              <p className="text-gray-700 mb-3">
                <strong>Location:</strong> 36869 State Route K, Salem, MO 65560 (at Pulltite Spring Campground)<br />
                <strong>Phone:</strong> (573) 858-3224<br />
                <strong>Website:</strong> <a href="https://www.currentrivercanoe.com" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">currentrivercanoe.com</a>
              </p>
              <p className="text-gray-700 mb-3"><strong>Services Offered:</strong></p>
              <ul className="list-disc pl-6 space-y-1 text-gray-700 mb-3">
                <li>Canoe, kayak, raft, and tube rentals</li>
                <li>Shuttle service to Cedar Grove, Akers, Baptist Camp, Round Spring, Two Rivers</li>
                <li>Multi-day trip planning (up to 5+ days)</li>
                <li>On-site store and camping at Pulltite</li>
              </ul>
              <p className="text-gray-700 mb-3"><strong>Popular Trips:</strong></p>
              <ul className="list-disc pl-6 space-y-1 text-gray-700 mb-3">
                <li><strong>Akers to Pulltite:</strong> 12 miles / 4-6 hours (their signature trip—your car is waiting at the end!)</li>
                <li><strong>Cedar Grove to Akers:</strong> 8 miles / 3-5 hours</li>
                <li><strong>Cedar Grove to Pulltite:</strong> 20 miles / 7-9 hours (great overnight)</li>
              </ul>
              <p className="text-gray-700 mb-3">
                <strong>Rates (Approx.):</strong> Canoe $65-85, Kayak $40-55, Raft $75-95 (includes shuttle and equipment)
              </p>
              <p className="text-gray-700">
                <strong>Why Choose Them:</strong> Your vehicle is parked at Pulltite (their base), so when you finish 
                your float, you walk right to your car—no waiting for shuttles! The store opens at 8am, first bus to 
                Akers departs at 8:30am.
              </p>
            </div>

            <div className="bg-green-50 border-l-4 border-green-500 p-6 mb-6">
              <h3 className="text-xl font-bold mb-2">2. KC&apos;s on the Current</h3>
              <p className="text-gray-700 mb-3">
                <strong>Location:</strong> 206 Jefferson Street, Doniphan, MO 63935<br />
                <strong>Phone:</strong> (573) 996-7961<br />
                <strong>Website:</strong> <a href="http://www.kcsonthecurrent.com" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">kcsonthecurrent.com</a>
              </p>
              <p className="text-gray-700 mb-3"><strong>Services Offered:</strong></p>
              <ul className="list-disc pl-6 space-y-1 text-gray-700 mb-3">
                <li>Canoe, kayak, raft, and tube rentals</li>
                <li>Free shuttle upriver from their Doniphan base</li>
                <li>Full-service campground with RV sites, tent sites, cabins</li>
                <li>On-site convenience store and gear shop</li>
              </ul>
              <p className="text-gray-700 mb-3">
                <strong>Operating Season:</strong> May-September<br />
                <strong>Hours:</strong> Mon-Fri 10am-6pm, Sat-Sun 9am-7pm<br />
                <strong>Last Float:</strong> 2:00pm daily
              </p>
              <p className="text-gray-700">
                <strong>Why Choose Them:</strong> Perfect for lower Current River floats; the lazy, wide sections 
                near Doniphan are ideal for beginners and families. Their campground-to-river setup makes logistics easy.
              </p>
            </div>

            <div className="bg-purple-50 border-l-4 border-purple-500 p-6 mb-6">
              <h3 className="text-xl font-bold mb-2">3. Windy&apos;s Canoe Rental</h3>
              <p className="text-gray-700 mb-3">
                <strong>Location:</strong> Eminence, MO (serves Jacks Fork and Current River)<br />
                <strong>Website:</strong> <a href="https://windysfloats.com" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">windysfloats.com</a>
              </p>
              <p className="text-gray-700 mb-3">
                <strong>Why Choose Them:</strong> Great option if you&apos;re exploring both Jacks Fork and Current River. 
                Friendly service and well-maintained equipment.
              </p>
            </div>

            <div className="bg-yellow-50 border-l-4 border-yellow-500 p-6 mb-6">
              <h3 className="text-xl font-bold mb-2">4. Two Rivers Canoe Rental</h3>
              <p className="text-gray-700 mb-3">
                <strong>Location:</strong> Two Rivers Campground (Jacks Fork and Current River confluence)<br />
                <strong>Website:</strong> <a href="http://www.2riverscanoe.com" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">2riverscanoe.com</a>
              </p>
              <p className="text-gray-700 mb-3"><strong>Services Offered:</strong></p>
              <ul className="list-disc pl-6 space-y-1 text-gray-700 mb-3">
                <li>Multi-day expeditions</li>
                <li>Canoe and kayak rentals</li>
                <li>Specialty trips: Cedar Grove to Two Rivers (50 miles / 3 days) or Baptist to Two Rivers (58 miles / 3 days)</li>
              </ul>
              <p className="text-gray-700">
                <strong>Why Choose Them:</strong> Specializes in extended multi-day wilderness trips. Perfect for 
                experienced paddlers seeking the full Current River experience.
              </p>
            </div>

            <div className="bg-blue-100 border border-blue-300 rounded-lg p-6 mb-6">
              <p className="text-gray-800 font-semibold mb-2">💡 Choosing the Right Outfitter</p>
              <ul className="list-disc pl-6 space-y-1 text-gray-700">
                <li><strong>For first-timers:</strong> Start with Current River Canoe Rental (Akers to Pulltite) or KC&apos;s on the Current (Doniphan area)</li>
                <li><strong>For multi-day adventures:</strong> Two Rivers Canoe Rental specializes in extended trips with camping on gravel bars</li>
                <li><strong>For anglers:</strong> Jadwin Canoe Rental provides access to trophy trout waters</li>
                <li><strong>For families with kids:</strong> KC&apos;s on the Current (lower river, gentle water, short floats available)</li>
                <li><strong>For tubing:</strong> Akers Ferry (Welch to Akers 2.5 miles) or Windy&apos;s (Alley Spring to Eminence on Jacks Fork)</li>
              </ul>
            </div>
          </section>

          {/* Section 6: Best Time to Float */}
          <section id="best-time" className="mb-12">
            <h2 className="text-3xl font-bold mb-4">6. Best Time to Float: Season-by-Season Breakdown</h2>
            
            <p className="text-gray-700 mb-6">
              The Current River is floatable year-round thanks to its spring-fed nature, but each season offers 
              a unique experience. Here&apos;s what to expect throughout the year:
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              <div className="bg-green-50 border border-green-200 rounded-lg p-6">
                <h3 className="text-xl font-bold mb-2">Spring (March-May)</h3>
                <p className="text-gray-700 text-sm mb-2"><strong>Best For:</strong> Experienced paddlers seeking solitude, anglers, photographers</p>
                <p className="text-gray-700 text-sm"><strong>Mid-October Sweet Spot:</strong> Peak color, comfortable weather, and near-total solitude.</p>
              </div>
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
                <h3 className="text-xl font-bold mb-2">Summer (June-August)</h3>
                <p className="text-gray-700 text-sm mb-2"><strong>Best For:</strong> Families, beginners, tubers, anyone seeking a classic Ozark float experience</p>
                <p className="text-gray-700 text-sm"><strong>Pro Tip:</strong> Float Tuesday or Wednesday for the best experience. Avoid the 4th of July weekend if you value solitude.</p>
              </div>
              <div className="bg-orange-50 border border-orange-200 rounded-lg p-6">
                <h3 className="text-xl font-bold mb-2">Fall (September-November)</h3>
                <p className="text-gray-700 text-sm mb-2"><strong>Best For:</strong> Photographers, couples seeking romantic getaways, experienced paddlers, anyone who values solitude over swimming</p>
                <p className="text-gray-700 text-sm"><strong>Peak Season:</strong> Mid-October (October 10-25) is the sweet spot—peak color, comfortable weather, and near-total solitude.</p>
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
                <h3 className="text-xl font-bold mb-2">Winter (December-February)</h3>
                <p className="text-gray-700 text-sm mb-2"><strong>Best For:</strong> Experienced cold-weather paddlers, wildlife photographers (eagles!), adventurers seeking a unique challenge</p>
                <p className="text-gray-700 text-sm"><strong>Pro Tip:</strong> January and February offer the best eagle viewing. Bring binoculars and watch for them fishing near Big Spring.</p>
              </div>
            </div>

            <h3 className="text-2xl font-bold mb-3">Water Level Considerations</h3>
            <p className="text-gray-700 mb-4">
              <strong>Check Real-Time Data:</strong> Before any float, check the USGS gage at Van Buren (Station 07067000): 
              <a href="https://waterdata.usgs.gov/nwis/uv?site_no=07067000" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline ml-1">USGS Current River at Van Buren</a>
            </p>

            <div className="bg-gray-50 border border-gray-200 rounded-lg p-6 mb-6">
              <h4 className="text-xl font-bold mb-2">Ideal Water Levels</h4>
              <ul className="list-disc pl-6 space-y-1 text-gray-700">
                <li><strong>Below 3 feet:</strong> Low but floatable (more walking/dragging in upper sections)</li>
                <li><strong>3-5 feet:</strong> Perfect (good flow, easy paddling, gravel bars exposed)</li>
                <li><strong>5-7 feet:</strong> High (faster current, fewer gravel bars, more challenging)</li>
                <li><strong>Above 7 feet:</strong> Flood stage (dangerous; avoid floating)</li>
              </ul>
            </div>

            <p className="text-gray-700 mb-4">
              <strong>Spring-Fed Stability:</strong> Unlike rain-fed rivers, the Current rarely experiences extreme 
              fluctuations. Even after heavy rain, the river typically stays within safe floating range within 24-48 hours.
            </p>
          </section>

          {/* Section 7: What to Bring */}
          <section id="gear" className="mb-12">
            <h2 className="text-3xl font-bold mb-4">7. What to Bring: Essential Gear Checklist</h2>

            <h3 className="text-2xl font-bold mb-3">Required Safety Equipment</h3>
            <ul className="list-disc pl-6 space-y-2 text-gray-700 mb-6">
              <li><strong>Personal Flotation Device (PFD):</strong> Missouri law requires one USCG-approved PFD per person. Must be accessible (wearing it is smarter). Kids under 7 must wear PFDs at all times.</li>
              <li><strong>Whistle:</strong> Attach to PFD for emergencies</li>
              <li><strong>Dry Bag (Waterproof):</strong> Essential for phone, wallet, car keys, first aid. Bring two: one for essentials, one for food/clothing</li>
              <li><strong>First Aid Kit:</strong> Bandages, antibiotic ointment, pain relievers, tweezers (for splinters), moleskin for blisters, antihistamine (bee stings, allergic reactions)</li>
              <li><strong>Headlamp or Flashlight:</strong> If there&apos;s any chance you&apos;ll be on the river past dusk</li>
            </ul>

            <h3 className="text-2xl font-bold mb-3">Sun & Weather Protection</h3>
            <ul className="list-disc pl-6 space-y-2 text-gray-700 mb-6">
              <li><strong>Sunscreen (SPF 50+):</strong> Reapply every 2 hours; water-resistant formula; don&apos;t forget back of neck, ears, tops of feet</li>
              <li><strong>Hat with Brim:</strong> Wide-brim or baseball cap; consider hat leash (so it doesn&apos;t blow away)</li>
              <li><strong>Sunglasses with Strap:</strong> Polarized lenses help spot rocks underwater; strap prevents loss if you flip</li>
              <li><strong>Long-Sleeve Shirt (UPF-Rated):</strong> Better sun protection than sunscreen alone; lightweight, quick-dry material</li>
              <li><strong>Rain Jacket:</strong> Afternoon thunderstorms are common in summer; pack in dry bag</li>
            </ul>

            <h3 className="text-2xl font-bold mb-3">Clothing & Footwear</h3>
            <ul className="list-disc pl-6 space-y-2 text-gray-700 mb-6">
              <li><strong>Water Shoes or Sandals with Straps:</strong> Gravel and rocks are sharp—no bare feet or flip-flops. Closed-toe water shoes (Chacos, Keens, Tevas) are ideal</li>
              <li><strong>Quick-Dry Shorts/Swimsuit:</strong> Cotton takes forever to dry; choose synthetic fabrics</li>
              <li><strong>Spare Dry Clothes:</strong> Pack in dry bag for after the float or overnight camping</li>
              <li><strong>Wetsuit (Spring/Fall):</strong> If water temps are below 60°F and air temps below 70°F</li>
            </ul>

            <h3 className="text-2xl font-bold mb-3">Food & Hydration</h3>
            <ul className="list-disc pl-6 space-y-2 text-gray-700 mb-6">
              <li><strong>Water (1+ gallon per person per day):</strong> The Current River is pure, but bring your own drinking water. Hydration is critical on hot summer days</li>
              <li><strong>Snacks & Lunch:</strong> Sandwiches, trail mix, fruit, energy bars. Pack in waterproof container or cooler</li>
              <li><strong>No Glass Containers:</strong> Missouri law prohibits glass on rivers. Use cans or plastic bottles</li>
              <li><strong>Cooler (Optional):</strong> Small soft-sided cooler straps into canoe; great for keeping lunch and drinks cold</li>
            </ul>

            <h3 className="text-2xl font-bold mb-3">Camping Gear (for Overnight Trips)</h3>
            <ul className="list-disc pl-6 space-y-2 text-gray-700 mb-6">
              <li><strong>Tent:</strong> Lightweight backpacking tent; stake well (gravel bars can be windy)</li>
              <li><strong>Sleeping Bag & Pad:</strong> Summer: 40-50°F rated bag; Spring/Fall: 20-30°F rated bag</li>
              <li><strong>Camp Stove & Fuel:</strong> Backpacking stove for cooking; respect fire bans if in effect</li>
              <li><strong>Cookware & Utensils:</strong> Lightweight pot, eating utensils, biodegradable soap</li>
              <li><strong>Bear Bag/Dry Bag for Food:</strong> Hang food away from tent (raccoons are common)</li>
              <li><strong>Headlamp:</strong> Essential for nighttime camp tasks</li>
              <li><strong>Trowel (for human waste):</strong> Dig cat-hole 6-8 inches deep, 200 feet from water; pack out toilet paper in Ziploc bag</li>
            </ul>

            <h3 className="text-2xl font-bold mb-3">Optional but Recommended</h3>
            <ul className="list-disc pl-6 space-y-2 text-gray-700 mb-6">
              <li><strong>Camera (Waterproof or in Dry Bag):</strong> Cave Spring and Blue Spring are photo gold</li>
              <li><strong>Fishing Gear:</strong> Smallmouth bass, trout (upper river); Missouri fishing license required</li>
              <li><strong>Waterproof Map:</strong> NPS provides free maps at campgrounds; laminated maps available at outfitters</li>
              <li><strong>Binoculars:</strong> Great for birdwatching and spotting wildlife</li>
              <li><strong>Portable Phone Charger:</strong> Cell service is spotty; keep phone in airplane mode to save battery</li>
              <li><strong>Trash Bags:</strong> Pack it in, pack it out—leave no trace</li>
            </ul>

            <div className="bg-red-50 border-l-4 border-red-500 p-6 mb-6">
              <h3 className="text-xl font-bold mb-2">What NOT to Bring</h3>
              <ul className="list-disc pl-6 space-y-1 text-gray-700">
                <li><strong>Glass Containers:</strong> Illegal and dangerous (broken glass on gravel bars ruins the experience for everyone)</li>
                <li><strong>Disposable Plastic Water Bottles:</strong> Bring a reusable bottle; reduce waste</li>
                <li><strong>Expensive Jewelry:</strong> It will get lost</li>
                <li><strong>Cotton Clothing:</strong> Takes forever to dry; choose synthetics</li>
                <li><strong>Firewood from Home:</strong> Emerald Ash Borer regulations prohibit transporting firewood into Missouri</li>
              </ul>
            </div>
          </section>

          {/* Section 8: Nearby Attractions */}
          <section id="attractions" className="mb-12">
            <h2 className="text-3xl font-bold mb-4">8. Nearby Attractions: Beyond the River</h2>

            <h3 className="text-2xl font-bold mb-3">Towns & Communities</h3>

            <div className="bg-blue-50 border-l-4 border-blue-500 p-6 mb-6">
              <h4 className="text-xl font-bold mb-2">Van Buren (Carter County)</h4>
              <p className="text-gray-700 mb-3">
                <strong>Why Visit:</strong> Gateway to the Ozark National Scenic Riverways; charming small town with lodging, restaurants, and supplies.
              </p>
              <p className="text-gray-700 mb-2"><strong>Lodging Options:</strong></p>
              <ul className="list-disc pl-6 space-y-1 text-gray-700">
                <li><strong>Current River Inn:</strong> Small, nostalgic roadside motel in downtown Van Buren (<a href="https://currentriverinnvb.com" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">currentriverinnvb.com</a>)</li>
                <li><strong>Stay Current River (Lodge on the Current):</strong> Full-service family resort with lodging, campground, and The Gravel Bar and Grill (<a href="https://www.staycurrentriver.com" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">staycurrentriver.com</a>)</li>
                <li><strong>The Landing – Current River:</strong> Eat, sleep, float all in one place (<a href="https://www.thelandingcurrentriver.com" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">thelandingcurrentriver.com</a>)</li>
              </ul>
            </div>

            <div className="bg-green-50 border-l-4 border-green-500 p-6 mb-6">
              <h4 className="text-xl font-bold mb-2">Eminence (Shannon County)</h4>
              <p className="text-gray-700 mb-3">
                <strong>Why Visit:</strong> Heart of the Ozark National Scenic Riverways; serves both Current River and Jacks Fork.
              </p>
              <p className="text-gray-700 mb-2"><strong>Lodging Options:</strong></p>
              <ul className="list-disc pl-6 space-y-1 text-gray-700">
                <li><strong>Shady Lane Cabins:</strong> Beautiful cabins in the heart of ONSR (<a href="https://shadylanecabins.com" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">shadylanecabins.com</a>)</li>
                <li><strong>Jack&apos;s Fork River Resort:</strong> Cabins along Jacks Fork</li>
                <li><strong>Eminence Cottages & Camp:</strong> Family-friendly lodging and camping</li>
              </ul>
            </div>

            <h3 className="text-2xl font-bold mb-3">Camping Options</h3>
            <p className="text-gray-700 mb-4">
              <strong>Front Country Campgrounds (Reservable at Recreation.gov):</strong>
            </p>
            <ul className="list-disc pl-6 space-y-2 text-gray-700 mb-6">
              <li><strong>Akers Ferry:</strong> $16-19/night; electric/non-electric; near car ferry</li>
              <li><strong>Alley Spring (Jacks Fork):</strong> $16-19/night; near historic mill</li>
              <li><strong>Big Spring:</strong> $16-19/night; near massive spring and CCC structures</li>
              <li><strong>Pulltite:</strong> $16-19/night; central location for floats</li>
              <li><strong>Round Spring:</strong> $16-19/night; near Round Spring Caverns</li>
              <li><strong>Two Rivers:</strong> $16-19/night; at Jacks Fork/Current confluence</li>
            </ul>

            <p className="text-gray-700 mb-4">
              <strong>Primitive Gravel Bar Camping:</strong> Free camping on gravel bars (with permit from NPS). Must be 200 feet from water source for human waste. Pack out all trash. No fires during fire bans.
            </p>

            <h3 className="text-2xl font-bold mb-3">Must-See Natural Attractions</h3>
            <ul className="list-disc pl-6 space-y-2 text-gray-700 mb-6">
              <li><strong>Rocky Falls:</strong> Stunning waterfall cascading over smooth dolomite bedrock; 3 miles southwest of Roberts Field; short hike from parking area off Highway 103</li>
              <li><strong>Blue Spring:</strong> 0.25-mile hike up branch near Powder Mill; deepest blue color of any Missouri spring</li>
              <li><strong>Round Spring Caverns:</strong> Ranger-led cave tours in summer at Round Spring Campground (check NPS schedule)</li>
              <li><strong>Devil&apos;s Well:</strong> Collapsed sinkhole with underground lake near Akers; NPS offers limited access tours</li>
            </ul>

            <h3 className="text-2xl font-bold mb-3">Nearby State Parks</h3>
            <ul className="list-disc pl-6 space-y-2 text-gray-700 mb-6">
              <li><strong>Montauk State Park:</strong> Headwaters of Current River; trophy trout fishing, historic lodge, cabins, restaurant</li>
              <li><strong>Echo Bluff State Park:</strong> Near Eminence; modern lodge, cabins, equestrian trails</li>
              <li><strong>Current River State Park:</strong> Near Van Buren</li>
            </ul>
          </section>

          {/* Section 9: Tips from Locals */}
          <section id="local-tips" className="mb-12">
            <h2 className="text-3xl font-bold mb-4">9. Tips from Locals: Insider Knowledge</h2>

            <h3 className="text-2xl font-bold mb-3">Hidden Gems</h3>

            <div className="bg-yellow-50 border-l-4 border-yellow-500 p-6 mb-6">
              <h4 className="text-xl font-bold mb-2">Float Tuesday or Wednesday</h4>
              <p className="text-gray-700">
                Reddit locals consistently recommend mid-week floats. One commenter said: &quot;The BEST days to 
                float this stretch with the fewest floaters are Tuesdays and Wednesdays. Avoid Saturdays between 
                Memorial Day and Labor Day like the plague.&quot;
              </p>
            </div>

            <div className="bg-blue-50 border-l-4 border-blue-500 p-6 mb-6">
              <h4 className="text-xl font-bold mb-2">Akers to Pulltite is the gold standard</h4>
              <p className="text-gray-700">
                Multiple local sources call the 10-mile Akers to Pulltite stretch &quot;the best overall single-day 
                float in the Missouri Scenic Rivers region.&quot; You get Cave Spring (the centerpiece), gravel bars, 
                minor rapids, and no road noise. As one local put it: &quot;It has just about everything you could want.&quot;
              </p>
            </div>

            <div className="bg-green-50 border-l-4 border-green-500 p-6 mb-6">
              <h4 className="text-xl font-bold mb-2">Cave Spring is worth the stop</h4>
              <p className="text-gray-700">
                Don&apos;t rush past Cave Spring. Locals recommend spending 30-60 minutes here. Paddle into the cave 
                entrance, swim in the brilliant blue pool, take photos, and soak in the magic. One local tip: &quot;If 
                you like to stop a lot and for longer periods to explore and enjoy the river, this 10-mile trip can 
                be turned into an 8-hour trip.&quot;
              </p>
            </div>

            <h3 className="text-2xl font-bold mb-3">What to Avoid</h3>
            <ul className="list-disc pl-6 space-y-2 text-gray-700 mb-6">
              <li><strong>Saturdays in summer:</strong> Universally despised by locals. &quot;Saturday&apos;s are the absolute worst day to float due to crowds,&quot; says a regular. If you must float on a weekend, choose Sunday—it&apos;s less hectic.</li>
              <li><strong>Don&apos;t bring firewood from home:</strong> Emerald Ash Borer regulations prohibit transporting firewood into Missouri. Gather dead wood on-site or buy locally.</li>
              <li><strong>Stay out of motorboat zones if you want peace:</strong> Below Big Spring, motorboats are unrestricted. If you want a quiet paddle, stay above Round Spring on the Current or above Alley Spring on the Jacks Fork.</li>
              <li><strong>Glass is illegal and dangerous:</strong> Missouri law bans glass containers on state waterways. Broken glass on gravel bars is a safety hazard and ruins the experience for everyone. Use cans or plastic.</li>
            </ul>

            <h3 className="text-2xl font-bold mb-3">Fishing Tips</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h4 className="font-bold mb-2">Trophy Trout (Baptist to Cedar Grove)</h4>
                <ul className="list-disc pl-6 space-y-1 text-gray-700 text-sm">
                  <li>Blue ribbon section: 18-inch minimum, 1 fish daily limit, hard lures only</li>
                  <li>Best times: Early morning, late evening</li>
                  <li>Target pools below springs</li>
                </ul>
              </div>
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <h4 className="font-bold mb-2">Smallmouth Bass</h4>
                <ul className="list-disc pl-6 space-y-1 text-gray-700 text-sm">
                  <li>Throughout the river; best below Akers</li>
                  <li>Use topwater lures at dawn and dusk</li>
                  <li>Clear water means finesse presentations work best</li>
                </ul>
              </div>
            </div>

            <h3 className="text-2xl font-bold mb-3">Photography Tips</h3>
            <p className="text-gray-700 mb-3"><strong>Best Light:</strong></p>
            <ul className="list-disc pl-6 space-y-1 text-gray-700 mb-4">
              <li>Early morning (6-8am): Fog rising from water, soft golden light</li>
              <li>Late afternoon (5-7pm): Warm light on bluffs</li>
            </ul>
            <p className="text-gray-700 mb-3"><strong>Must-Shoot Locations:</strong></p>
            <ul className="list-disc pl-6 space-y-1 text-gray-700 mb-4">
              <li>Cave Spring (brilliant blue pool, cave entrance)</li>
              <li>Blue Spring (deepest blue color)</li>
              <li>Welch Spring and historic hospital ruins</li>
              <li>Big Spring (massive pool, CCC structures)</li>
              <li>Akers Ferry (historic hand-pulled ferry in action)</li>
            </ul>
          </section>

          {/* Section 10: Plan Your Trip */}
          <section id="plan-trip" className="mb-12">
            <h2 className="text-3xl font-bold mb-4">10. Plan Your Trip: Start Your Current River Adventure</h2>

            <h3 className="text-2xl font-bold mb-3">Your Action Plan</h3>

            <div className="space-y-6 mb-8">
              <div className="bg-gray-50 border-l-4 border-gray-400 p-4">
                <h4 className="font-bold mb-2">Step 1: Choose Your Float</h4>
                <ul className="list-disc pl-6 space-y-1 text-gray-700 text-sm">
                  <li><strong>First-timers/Families:</strong> Akers to Pulltite (12 miles / 4-6 hours)—the classic Current River experience with Cave Spring</li>
                  <li><strong>Tubers:</strong> Welch to Akers (2.5 miles / 2-3 hours) or Sinking Creek to Round Spring (1.5 miles / 1-2 hours)</li>
                  <li><strong>Multi-day adventurers:</strong> Cedar Grove to Two Rivers (50 miles / 3 days)—the ultimate wilderness experience</li>
                  <li><strong>Anglers:</strong> Baptist to Cedar Grove (8 miles / 3-5 hours)—trophy trout water</li>
                </ul>
              </div>

              <div className="bg-gray-50 border-l-4 border-gray-400 p-4">
                <h4 className="font-bold mb-2">Step 2: Book Your Outfitter</h4>
                <p className="text-gray-700 text-sm mb-2">Contact outfitters early (especially for summer weekends)</p>
              </div>

              <div className="bg-gray-50 border-l-4 border-gray-400 p-4">
                <h4 className="font-bold mb-2">Step 3: Reserve Your Campsite (if Camping)</h4>
                <p className="text-gray-700 text-sm">Front country sites (Akers, Pulltite, Round Spring, Big Spring): Reserve at <a href="https://www.recreation.gov" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Recreation.gov</a></p>
              </div>

              <div className="bg-gray-50 border-l-4 border-gray-400 p-4">
                <h4 className="font-bold mb-2">Step 4: Check Water Levels</h4>
                <p className="text-gray-700 text-sm">USGS gage at Van Buren (ideal range: 3-5 feet)</p>
              </div>

              <div className="bg-gray-50 border-l-4 border-gray-400 p-4">
                <h4 className="font-bold mb-2">Step 5: Pack Your Gear</h4>
                <p className="text-gray-700 text-sm">Use checklist in Section 7</p>
              </div>

              <div className="bg-gray-50 border-l-4 border-gray-400 p-4">
                <h4 className="font-bold mb-2">Step 6: Float, Explore, and Enjoy!</h4>
                <p className="text-gray-700 text-sm">Stop at Cave Spring, swim in the brilliant blue springs, photograph the bluffs, camp on gravel bars under Ozark stars, and respect Leave No Trace principles</p>
              </div>
            </div>

            <div className="bg-blue-100 border border-blue-300 rounded-lg p-8 mb-8 text-center">
              <h3 className="text-2xl font-bold mb-4">Start Planning with eddy.guide</h3>
              <p className="text-gray-700 mb-6">
                Ready to experience Missouri&apos;s crown jewel of float trips? The Current River awaits with its 
                spring-fed clarity, towering bluffs, hidden springs, and endless adventure.
              </p>
              <Link 
                href="/"
                className="inline-block bg-blue-600 text-white font-semibold px-8 py-4 rounded-lg hover:bg-blue-700 transition-colors text-lg"
              >
                Plan Your Float Trip on eddy.guide →
              </Link>
            </div>

            <p className="text-gray-700 mb-4">
              Whether you&apos;re planning your first float or your fiftieth, the Current River never disappoints. 
              Its combination of accessibility, natural beauty, and rich history makes it the perfect destination for 
              families, solo paddlers, anglers, photographers, and anyone seeking to reconnect with nature in the 
              heart of the Missouri Ozarks.
            </p>

            <p className="text-gray-700 text-xl font-semibold text-center mb-4">
              The river is calling. Answer it. 🚣‍♂️🏞️
            </p>
          </section>

          {/* Additional Resources */}
          <section className="border-t border-gray-200 pt-8 mb-12">
            <h2 className="text-2xl font-bold mb-4">Additional Resources</h2>
            
            <h3 className="text-xl font-bold mb-3">Official Resources</h3>
            <ul className="space-y-2 mb-6">
              <li>
                <a href="https://www.nps.gov/ozar/" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                  Ozark National Scenic Riverways (NPS)
                </a> — Official park website with maps, regulations, camping info
              </li>
              <li>
                <a href="https://dnr.mo.gov/" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                  Missouri Department of Natural Resources
                </a> — State parks, water resources, environmental data
              </li>
              <li>
                <a href="https://waterdata.usgs.gov/nwis/uv?site_no=07067000" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                  USGS Water Data: Current River at Van Buren
                </a> — Real-time water level monitoring
              </li>
              <li>
                <a href="https://www.recreation.gov" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                  Recreation.gov
                </a> — Reserve front country campsites
              </li>
            </ul>

            <h3 className="text-xl font-bold mb-3">Related Articles</h3>
            <ul className="space-y-2">
              <li>
                <Link href="/blog/planning-first-missouri-float-trip" className="text-blue-600 hover:underline">
                  Planning Your First Missouri Float Trip: Complete Guide
                </Link>
              </li>
            </ul>
          </section>

        </div>
      </div>
    </article>
  );
}
