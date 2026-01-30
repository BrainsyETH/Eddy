import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Best Float Rivers in Missouri: Complete Guide 2026',
  description: 'Discover the top 8 float rivers in Missouri for kayaking and canoeing. Compare difficulty levels, scenic beauty, access points, and water conditions on Meramec, Current, Huzzah, and more Ozark waterways.',
  keywords: [
    'best float rivers Missouri',
    'Missouri float trips',
    'kayaking Missouri',
    'canoeing Ozarks',
    'Meramec River',
    'Current River',
    'Huzzah Creek',
    'Missouri river guide',
  ],
  openGraph: {
    title: 'Best Float Rivers in Missouri: Complete Guide 2026',
    description: 'Compare the top 8 float rivers in Missouri - from beginner-friendly creeks to scenic Ozark waterways',
    type: 'article',
  },
};

export default function BestFloatRiversPage() {
  return (
    <article className="min-h-screen bg-white">
      <div className="max-w-4xl mx-auto px-4 py-16">
        {/* Header */}
        <header className="mb-12">
          <div className="flex items-center gap-4 text-sm text-gray-500 mb-4">
            <Link href="/blog" className="hover:text-blue-600">← Back to Blog</Link>
            <span>•</span>
            <time dateTime="2026-01-29">January 29, 2026</time>
            <span>•</span>
            <span>12 min read</span>
          </div>

          <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-6">
            Best Float Rivers in Missouri: Complete Guide 2026
          </h1>

          <p className="text-xl text-gray-600 leading-relaxed">
            Missouri is home to some of the most beautiful float rivers in the United States. 
            From the family-friendly Meramec River near St. Louis to the pristine waters of 
            the Current River in the Ozarks, there&apos;s a perfect float for every skill level.
          </p>
        </header>

        {/* Table of Contents */}
        <nav className="bg-blue-50 rounded-lg p-6 mb-12 border border-blue-100">
          <h2 className="font-bold text-lg mb-4">Quick Navigation</h2>
          <ul className="space-y-2">
            <li><a href="#meramec" className="text-blue-600 hover:underline">1. Meramec River</a></li>
            <li><a href="#current" className="text-blue-600 hover:underline">2. Current River</a></li>
            <li><a href="#huzzah" className="text-blue-600 hover:underline">3. Huzzah Creek</a></li>
            <li><a href="#jacks-fork" className="text-blue-600 hover:underline">4. Jacks Fork River</a></li>
            <li><a href="#eleven-point" className="text-blue-600 hover:underline">5. Eleven Point River</a></li>
            <li><a href="#niangua" className="text-blue-600 hover:underline">6. Niangua River</a></li>
            <li><a href="#big-piney" className="text-blue-600 hover:underline">7. Big Piney River</a></li>
            <li><a href="#courtois" className="text-blue-600 hover:underline">8. Courtois Creek</a></li>
            <li><a href="#comparison" className="text-blue-600 hover:underline">Quick Comparison Table</a></li>
          </ul>
        </nav>

        {/* Main Content */}
        <div className="prose prose-lg max-w-none">
          
          {/* Meramec River */}
          <section id="meramec" className="mb-12">
            <h2 className="text-3xl font-bold mb-4">1. Meramec River - Best for Families & Beginners</h2>
            
            <div className="bg-green-50 border-l-4 border-green-500 p-6 mb-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <div className="font-bold text-green-800">Difficulty</div>
                  <div className="text-green-700">Easy</div>
                </div>
                <div>
                  <div className="font-bold text-green-800">Length</div>
                  <div className="text-green-700">~220 miles</div>
                </div>
                <div>
                  <div className="font-bold text-green-800">Best For</div>
                  <div className="text-green-700">Families, First-timers</div>
                </div>
                <div>
                  <div className="font-bold text-green-800">From St. Louis</div>
                  <div className="text-green-700">60-90 min</div>
                </div>
              </div>
            </div>

            <p className="text-gray-700 mb-4">
              The <strong>Meramec River</strong> is Missouri&apos;s most accessible float river, making it perfect 
              for families, beginners, and anyone looking for a relaxing day on the water without venturing 
              deep into the Ozarks.
            </p>

            <h3 className="text-2xl font-bold mb-3">Why Float the Meramec?</h3>
            <ul className="list-disc pl-6 space-y-2 text-gray-700 mb-4">
              <li><strong>Close to St. Louis:</strong> Just 60-90 minutes from the metro area</li>
              <li><strong>Gentle current:</strong> Perfect for first-time floaters and families with kids</li>
              <li><strong>Excellent facilities:</strong> Plenty of outfitters with rentals and shuttles</li>
              <li><strong>Scenic beauty:</strong> Limestone bluffs, caves, and clear spring-fed tributaries</li>
              <li><strong>Year-round floatable:</strong> Good water levels even in late summer</li>
            </ul>

            <h3 className="text-2xl font-bold mb-3">Popular Sections</h3>
            <ul className="list-disc pl-6 space-y-2 text-gray-700 mb-6">
              <li><strong>Meramec State Park to Sullivan (12 miles):</strong> Most popular family float, 4-5 hours</li>
              <li><strong>Onondaga Cave to Meramec State Park (9 miles):</strong> Scenic caves, 3-4 hours</li>
              <li><strong>Steelville to Cuba (18 miles):</strong> Full-day adventure with camping</li>
            </ul>
          </section>

          {/* Current River */}
          <section id="current" className="mb-12">
            <h2 className="text-3xl font-bold mb-4">2. Current River - Most Scenic & Pristine</h2>
            
            <div className="bg-blue-50 border-l-4 border-blue-500 p-6 mb-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <div className="font-bold text-blue-800">Difficulty</div>
                  <div className="text-blue-700">Easy-Moderate</div>
                </div>
                <div>
                  <div className="font-bold text-blue-800">Length</div>
                  <div className="text-blue-700">~184 miles</div>
                </div>
                <div>
                  <div className="font-bold text-blue-800">Best For</div>
                  <div className="text-blue-700">Scenery, Camping</div>
                </div>
                <div>
                  <div className="font-bold text-blue-800">From St. Louis</div>
                  <div className="text-blue-700">3-4 hours</div>
                </div>
              </div>
            </div>

            <p className="text-gray-700 mb-4">
              Part of the <strong>Ozark National Scenic Riverways</strong>, the Current River is often 
              considered the most beautiful float river in Missouri. Crystal-clear water fed by massive 
              springs, towering bluffs, and untouched wilderness make this a bucket-list float.
            </p>

            <h3 className="text-2xl font-bold mb-3">Why Float the Current?</h3>
            <ul className="list-disc pl-6 space-y-2 text-gray-700 mb-4">
              <li><strong>Incredible clarity:</strong> See fish swimming 10+ feet below your canoe</li>
              <li><strong>Big Blue Spring:</strong> One of the largest springs in the country (290 million gallons/day)</li>
              <li><strong>Protected wilderness:</strong> National Park Service keeps it pristine</li>
              <li><strong>Excellent camping:</strong> Gravel bars perfect for overnight trips</li>
              <li><strong>Consistent water:</strong> Spring-fed means good levels even in drought</li>
            </ul>

            <h3 className="text-2xl font-bold mb-3">Popular Sections</h3>
            <ul className="list-disc pl-6 space-y-2 text-gray-700 mb-4">
              <li><strong>Akers to Pulltite (8 miles):</strong> Classic day float, 3-4 hours</li>
              <li><strong>Round Spring to Two Rivers (13 miles):</strong> Spring viewing, 5-6 hours</li>
              <li><strong>Multi-day trips:</strong> Van Buren to Big Spring (35+ miles over 2-3 days)</li>
            </ul>

            <div className="bg-yellow-50 border-l-4 border-yellow-500 p-4 mb-6">
              <p className="text-sm text-yellow-800">
                <strong>⚠️ Crowding Alert:</strong> The Current River can get very busy on summer weekends, 
                especially July 4th. Consider visiting mid-week or exploring less-crowded alternatives 
                like Eleven Point River.
              </p>
            </div>
          </section>

          {/* Huzzah Creek */}
          <section id="huzzah" className="mb-12">
            <h2 className="text-3xl font-bold mb-4">3. Huzzah Creek - Best Party Float</h2>
            
            <div className="bg-purple-50 border-l-4 border-purple-500 p-6 mb-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <div className="font-bold text-purple-800">Difficulty</div>
                  <div className="text-purple-700">Moderate</div>
                </div>
                <div>
                  <div className="font-bold text-purple-800">Length</div>
                  <div className="text-purple-700">~25 miles</div>
                </div>
                <div>
                  <div className="font-bold text-purple-800">Best For</div>
                  <div className="text-purple-700">Groups, Fun</div>
                </div>
                <div>
                  <div className="font-bold text-purple-800">From St. Louis</div>
                  <div className="text-purple-700">90 min</div>
                </div>
              </div>
            </div>

            <p className="text-gray-700 mb-4">
              <strong>Huzzah Creek</strong> is Missouri&apos;s ultimate party float - smaller than a river, 
              faster current, and a social atmosphere. Perfect for groups of friends looking for adventure.
            </p>

            <h3 className="text-2xl font-bold mb-3">Why Float Huzzah Creek?</h3>
            <ul className="list-disc pl-6 space-y-2 text-gray-700 mb-6">
              <li><strong>Fast & fun:</strong> Quick current keeps you moving, more exciting than Meramec</li>
              <li><strong>Social scene:</strong> Popular with college groups and 20-30 somethings</li>
              <li><strong>Easy access:</strong> Close to St. Louis, great for day trips</li>
              <li><strong>Beautiful scenery:</strong> Gravel bars, bluffs, and clear water</li>
              <li><strong>Good outfitters:</strong> Huzzah Valley Resort and others nearby</li>
            </ul>
          </section>

          {/* Jacks Fork */}
          <section id="jacks-fork" className="mb-12">
            <h2 className="text-3xl font-bold mb-4">4. Jacks Fork River - Best for Solitude</h2>
            
            <div className="bg-teal-50 border-l-4 border-teal-500 p-6 mb-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <div className="font-bold text-teal-800">Difficulty</div>
                  <div className="text-teal-700">Easy-Moderate</div>
                </div>
                <div>
                  <div className="font-bold text-teal-800">Length</div>
                  <div className="text-teal-700">~43 miles</div>
                </div>
                <div>
                  <div className="font-bold text-teal-800">Best For</div>
                  <div className="text-teal-700">Solitude, Nature</div>
                </div>
                <div>
                  <div className="font-bold text-teal-800">From St. Louis</div>
                  <div className="text-teal-700">3.5 hours</div>
                </div>
              </div>
            </div>

            <p className="text-gray-700 mb-4">
              Also part of the Ozark National Scenic Riverways, <strong>Jacks Fork</strong> is the 
              Current River&apos;s quieter cousin - same pristine beauty, fewer crowds.
            </p>

            <h3 className="text-2xl font-bold mb-3">Why Float Jacks Fork?</h3>
            <ul className="list-disc pl-6 space-y-2 text-gray-700 mb-6">
              <li><strong>Less crowded than Current:</strong> More wilderness feel, fewer people</li>
              <li><strong>Alley Spring:</strong> Stunning blue spring with historic mill (187 million gallons/day)</li>
              <li><strong>Wild and scenic:</strong> Protected National Park Service river</li>
              <li><strong>Great camping:</strong> Primitive gravel bar camping allowed</li>
              <li><strong>Clear water:</strong> Spring-fed like the Current River</li>
            </ul>
          </section>

          {/* Eleven Point */}
          <section id="eleven-point" className="mb-12">
            <h2 className="text-3xl font-bold mb-4">5. Eleven Point River - Hidden Gem</h2>
            
            <div className="bg-indigo-50 border-l-4 border-indigo-500 p-6 mb-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <div className="font-bold text-indigo-800">Difficulty</div>
                  <div className="text-indigo-700">Easy-Moderate</div>
                </div>
                <div>
                  <div className="font-bold text-indigo-800">Length</div>
                  <div className="text-indigo-700">~44 miles (MO)</div>
                </div>
                <div>
                  <div className="font-bold text-indigo-800">Best For</div>
                  <div className="text-indigo-700">Wilderness, Fishing</div>
                </div>
                <div>
                  <div className="font-bold text-indigo-800">From St. Louis</div>
                  <div className="text-indigo-700">4 hours</div>
                </div>
              </div>
            </div>

            <p className="text-gray-700 mb-4">
              The <strong>Eleven Point River</strong> is one of Missouri&apos;s best-kept secrets - a federally 
              designated Wild & Scenic River with incredible natural beauty and minimal development.
            </p>

            <h3 className="text-2xl font-bold mb-3">Why Float Eleven Point?</h3>
            <ul className="list-disc pl-6 space-y-2 text-gray-700 mb-6">
              <li><strong>True wilderness:</strong> Very few people know about it</li>
              <li><strong>Greer Spring:</strong> 2nd largest spring in Missouri (214 million gallons/day)</li>
              <li><strong>Excellent fishing:</strong> Smallmouth bass and rainbow trout</li>
              <li><strong>Varied terrain:</strong> From gentle floats to Class I-II rapids</li>
              <li><strong>Wild & Scenic designation:</strong> Protected from development</li>
            </ul>
          </section>

          {/* Niangua River */}
          <section id="niangua" className="mb-12">
            <h2 className="text-3xl font-bold mb-4">6. Niangua River - Best Whitewater</h2>
            
            <div className="bg-red-50 border-l-4 border-red-500 p-6 mb-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <div className="font-bold text-red-800">Difficulty</div>
                  <div className="text-red-700">Moderate-Hard</div>
                </div>
                <div>
                  <div className="font-bold text-red-800">Length</div>
                  <div className="text-red-700">~125 miles</div>
                </div>
                <div>
                  <div className="font-bold text-red-800">Best For</div>
                  <div className="text-red-700">Whitewater, Thrill</div>
                </div>
                <div>
                  <div className="font-bold text-red-800">From St. Louis</div>
                  <div className="text-red-700">3 hours</div>
                </div>
              </div>
            </div>

            <p className="text-gray-700 mb-4">
              The <strong>Niangua River</strong> offers Missouri&apos;s best whitewater experience, with 
              Class I-II rapids (Class III+ during high water) near Bennett Spring.
            </p>

            <h3 className="text-2xl font-bold mb-3">Why Float the Niangua?</h3>
            <ul className="list-disc pl-6 space-y-2 text-gray-700 mb-6">
              <li><strong>Real rapids:</strong> Most exciting whitewater in Missouri</li>
              <li><strong>Bennett Spring:</strong> 3rd largest spring in Missouri (100 million gallons/day)</li>
              <li><strong>Rainbow trout fishing:</strong> Stocked year-round below the spring</li>
              <li><strong>Varied experience:</strong> Calm water and rapids in one trip</li>
              <li><strong>Dam-controlled flow:</strong> More predictable water levels</li>
            </ul>

            <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-6">
              <p className="text-sm text-red-800">
                <strong>⚠️ Skill Required:</strong> The Niangua&apos;s whitewater sections require intermediate 
                paddling skills. Beginners should stick to sections below Bennett Spring.
              </p>
            </div>
          </section>

          {/* Big Piney */}
          <section id="big-piney" className="mb-12">
            <h2 className="text-3xl font-bold mb-4">7. Big Piney River - Underrated Beauty</h2>
            
            <div className="bg-orange-50 border-l-4 border-orange-500 p-6 mb-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <div className="font-bold text-orange-800">Difficulty</div>
                  <div className="text-orange-700">Easy-Moderate</div>
                </div>
                <div>
                  <div className="font-bold text-orange-800">Length</div>
                  <div className="text-orange-700">~40 miles</div>
                </div>
                <div>
                  <div className="font-bold text-orange-800">Best For</div>
                  <div className="text-orange-700">Seclusion, Scenery</div>
                </div>
                <div>
                  <div className="font-bold text-orange-800">From St. Louis</div>
                  <div className="text-orange-700">2.5 hours</div>
                </div>
              </div>
            </div>

            <p className="text-gray-700 mb-4">
              The <strong>Big Piney River</strong> flows through Mark Twain National Forest, offering 
              beautiful scenery and fewer crowds than more famous Missouri float rivers.
            </p>

            <h3 className="text-2xl font-bold mb-3">Why Float Big Piney?</h3>
            <ul className="list-disc pl-6 space-y-2 text-gray-700 mb-6">
              <li><strong>Uncrowded:</strong> Often have the river to yourself on weekdays</li>
              <li><strong>Piney Creek Spring:</strong> Beautiful turquoise spring feeds the river</li>
              <li><strong>Forest scenery:</strong> Dense Ozark forest and limestone bluffs</li>
              <li><strong>Smallmouth bass:</strong> Excellent fishing opportunities</li>
              <li><strong>Mix of calm and mild rapids:</strong> Good variety for intermediate paddlers</li>
            </ul>
          </section>

          {/* Courtois Creek */}
          <section id="courtois" className="mb-12">
            <h2 className="text-3xl font-bold mb-4">8. Courtois Creek - Intimate & Scenic</h2>
            
            <div className="bg-pink-50 border-l-4 border-pink-500 p-6 mb-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <div className="font-bold text-pink-800">Difficulty</div>
                  <div className="text-pink-700">Easy-Moderate</div>
                </div>
                <div>
                  <div className="font-bold text-pink-800">Length</div>
                  <div className="text-pink-700">~30 miles</div>
                </div>
                <div>
                  <div className="font-bold text-pink-800">Best For</div>
                  <div className="text-pink-700">Small groups</div>
                </div>
                <div>
                  <div className="font-bold text-pink-800">From St. Louis</div>
                  <div className="text-pink-700">90 min</div>
                </div>
              </div>
            </div>

            <p className="text-gray-700 mb-4">
              <strong>Courtois Creek</strong> (pronounced &quot;Curt-a-way&quot;) is a smaller, intimate creek 
              similar to Huzzah, offering a more secluded experience close to St. Louis.
            </p>

            <h3 className="text-2xl font-bold mb-3">Why Float Courtois Creek?</h3>
            <ul className="list-disc pl-6 space-y-2 text-gray-700 mb-6">
              <li><strong>Intimate scale:</strong> Narrow creek feels adventurous</li>
              <li><strong>Less crowded than Huzzah:</strong> Quieter alternative</li>
              <li><strong>Beautiful bluffs:</strong> Towering limestone formations</li>
              <li><strong>Clear water:</strong> Fed by springs and groundwater</li>
              <li><strong>Close to St. Louis:</strong> Easy day trip</li>
            </ul>
          </section>

          {/* Comparison Table */}
          <section id="comparison" className="mb-12">
            <h2 className="text-3xl font-bold mb-6">Quick Comparison: Which River is Right for You?</h2>
            
            <div className="overflow-x-auto">
              <table className="min-w-full bg-white border border-gray-300">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="px-4 py-3 text-left border-b">River</th>
                    <th className="px-4 py-3 text-left border-b">Difficulty</th>
                    <th className="px-4 py-3 text-left border-b">Distance from STL</th>
                    <th className="px-4 py-3 text-left border-b">Best For</th>
                    <th className="px-4 py-3 text-left border-b">Crowds</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b">
                    <td className="px-4 py-3 font-semibold">Meramec</td>
                    <td className="px-4 py-3">Easy</td>
                    <td className="px-4 py-3">60-90 min</td>
                    <td className="px-4 py-3">Families, Beginners</td>
                    <td className="px-4 py-3">Moderate</td>
                  </tr>
                  <tr className="border-b">
                    <td className="px-4 py-3 font-semibold">Current</td>
                    <td className="px-4 py-3">Easy-Mod</td>
                    <td className="px-4 py-3">3-4 hours</td>
                    <td className="px-4 py-3">Scenery, Camping</td>
                    <td className="px-4 py-3">Heavy</td>
                  </tr>
                  <tr className="border-b">
                    <td className="px-4 py-3 font-semibold">Huzzah</td>
                    <td className="px-4 py-3">Moderate</td>
                    <td className="px-4 py-3">90 min</td>
                    <td className="px-4 py-3">Groups, Fun</td>
                    <td className="px-4 py-3">Heavy</td>
                  </tr>
                  <tr className="border-b">
                    <td className="px-4 py-3 font-semibold">Jacks Fork</td>
                    <td className="px-4 py-3">Easy-Mod</td>
                    <td className="px-4 py-3">3.5 hours</td>
                    <td className="px-4 py-3">Solitude, Nature</td>
                    <td className="px-4 py-3">Light</td>
                  </tr>
                  <tr className="border-b">
                    <td className="px-4 py-3 font-semibold">Eleven Point</td>
                    <td className="px-4 py-3">Easy-Mod</td>
                    <td className="px-4 py-3">4 hours</td>
                    <td className="px-4 py-3">Wilderness, Fishing</td>
                    <td className="px-4 py-3">Very Light</td>
                  </tr>
                  <tr className="border-b">
                    <td className="px-4 py-3 font-semibold">Niangua</td>
                    <td className="px-4 py-3">Mod-Hard</td>
                    <td className="px-4 py-3">3 hours</td>
                    <td className="px-4 py-3">Whitewater, Thrill</td>
                    <td className="px-4 py-3">Moderate</td>
                  </tr>
                  <tr className="border-b">
                    <td className="px-4 py-3 font-semibold">Big Piney</td>
                    <td className="px-4 py-3">Easy-Mod</td>
                    <td className="px-4 py-3">2.5 hours</td>
                    <td className="px-4 py-3">Seclusion, Scenery</td>
                    <td className="px-4 py-3">Light</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 font-semibold">Courtois</td>
                    <td className="px-4 py-3">Easy-Mod</td>
                    <td className="px-4 py-3">90 min</td>
                    <td className="px-4 py-3">Small groups</td>
                    <td className="px-4 py-3">Light-Mod</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          {/* Planning Tips */}
          <section className="mb-12">
            <h2 className="text-3xl font-bold mb-4">Essential Float Planning Tips</h2>
            
            <h3 className="text-2xl font-bold mb-3">Check Water Levels Before You Go</h3>
            <p className="text-gray-700 mb-4">
              Water conditions make or break a float trip. Use <Link href="/" className="text-blue-600 hover:underline font-semibold">Eddy&apos;s live USGS data</Link> to 
              check current water levels and floatability ratings for all 8 rivers. We show real-time gauge 
              readings updated every 15 minutes.
            </p>

            <h3 className="text-2xl font-bold mb-3">Best Time of Year to Float</h3>
            <ul className="list-disc pl-6 space-y-2 text-gray-700 mb-4">
              <li><strong>Spring (April-May):</strong> Highest water, fastest current, cooler temps</li>
              <li><strong>Summer (June-August):</strong> Peak season, warm weather, perfect for swimming</li>
              <li><strong>Fall (September-October):</strong> Beautiful colors, fewer crowds, cooler weather</li>
              <li><strong>Avoid:</strong> Late summer/early fall drought periods (check water levels first)</li>
            </ul>

            <h3 className="text-2xl font-bold mb-3">What to Bring</h3>
            <ul className="list-disc pl-6 space-y-2 text-gray-700 mb-6">
              <li>Waterproof bag or dry box for phones/keys</li>
              <li>Sunscreen (reef-safe to protect rivers)</li>
              <li>Water shoes or sandals with straps</li>
              <li>Cooler with drinks and snacks</li>
              <li>Life jacket (required in Missouri for kids under 7)</li>
              <li>Hat and sunglasses with retainers</li>
              <li>First aid kit</li>
            </ul>
          </section>

          {/* CTA Section */}
          <section className="bg-gradient-to-r from-blue-500 to-teal-500 rounded-lg p-8 text-white text-center mb-12">
            <h2 className="text-3xl font-bold mb-4">Ready to Plan Your Float Trip?</h2>
            <p className="text-xl mb-6">
              Use Eddy to compare water conditions, find access points, and calculate float times 
              on all 8 Missouri rivers - all in one place.
            </p>
            <Link 
              href="/"
              className="inline-block bg-white text-blue-600 font-bold px-8 py-3 rounded-lg hover:bg-blue-50 transition-colors"
            >
              Plan Your Float Now →
            </Link>
          </section>

          {/* FAQ */}
          <section className="mb-12">
            <h2 className="text-3xl font-bold mb-6">Frequently Asked Questions</h2>
            
            <div className="space-y-6">
              <div>
                <h3 className="text-xl font-bold mb-2">What&apos;s the best float river in Missouri for beginners?</h3>
                <p className="text-gray-700">
                  The <strong>Meramec River</strong> is perfect for beginners. It has a gentle current, 
                  plenty of outfitters with rentals, and it&apos;s close to St. Louis. The section from 
                  Meramec State Park to Sullivan (12 miles) is especially family-friendly.
                </p>
              </div>

              <div>
                <h3 className="text-xl font-bold mb-2">Which Missouri river has the clearest water?</h3>
                <p className="text-gray-700">
                  The <strong>Current River</strong> and <strong>Jacks Fork</strong> have the clearest 
                  water in Missouri because they&apos;re fed by massive underground springs. You can see 
                  fish swimming 10+ feet below your canoe.
                </p>
              </div>

              <div>
                <h3 className="text-xl font-bold mb-2">What&apos;s the closest float river to St. Louis?</h3>
                <p className="text-gray-700">
                  The <strong>Meramec River</strong> is the closest major float river, just 60-90 minutes 
                  from St. Louis. <strong>Huzzah Creek</strong> and <strong>Courtois Creek</strong> are 
                  also within 90 minutes.
                </p>
              </div>

              <div>
                <h3 className="text-xl font-bold mb-2">Can you float Missouri rivers in July and August?</h3>
                <p className="text-gray-700">
                  Yes! Spring-fed rivers like the <strong>Current</strong>, <strong>Jacks Fork</strong>, 
                  and <strong>Eleven Point</strong> maintain good water levels year-round. Check USGS 
                  gauge data on Eddy before your trip - we show real-time floatability ratings.
                </p>
              </div>

              <div>
                <h3 className="text-xl font-bold mb-2">Do I need a permit to float Missouri rivers?</h3>
                <p className="text-gray-700">
                  No permits are required for floating Missouri rivers. However, camping permits may be 
                  required in some National Park Service areas (Current River, Jacks Fork). Check with 
                  the Ozark National Scenic Riverways office.
                </p>
              </div>

              <div>
                <h3 className="text-xl font-bold mb-2">What&apos;s the best river for avoiding crowds?</h3>
                <p className="text-gray-700">
                  The <strong>Eleven Point River</strong> and <strong>Big Piney River</strong> are the 
                  least crowded. For a more popular river with fewer people, try <strong>Jacks Fork</strong> 
                  instead of the Current River.
                </p>
              </div>
            </div>
          </section>

          {/* Final CTA */}
          <section className="border-t border-gray-200 pt-8 text-center">
            <p className="text-gray-600 mb-4">
              Written by the Eddy team • Last updated January 29, 2026
            </p>
            <Link href="/" className="text-blue-600 hover:underline font-semibold">
              ← Back to Float Planner
            </Link>
          </section>

        </div>
      </div>
    </article>
  );
}
