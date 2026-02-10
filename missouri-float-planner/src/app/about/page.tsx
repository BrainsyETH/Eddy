'use client';

// src/app/about/page.tsx
// About page explaining how Eddy works and condition codes

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Droplets, MapPin, Clock, Gauge, TrendingUp, AlertTriangle, Info, ChevronDown, Database, Waves, Code2 } from 'lucide-react';
import { CONDITION_COLORS, CONDITION_LABELS } from '@/constants';
import type { ConditionCode } from '@/types/api';

// Eddy otter images for different conditions
const EDDY_IMAGES: Record<string, string> = {
  green: 'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy_the_Otter_green.png',
  red: 'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy_the_Otter_red.png',
  yellow: 'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy_the_Otter_yellow.png',
  flag: 'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy%20the%20otter%20with%20a%20flag.png',
};

// Map condition codes to Eddy images
const getEddyImageForCondition = (code: ConditionCode): string => {
  switch (code) {
    case 'optimal':
    case 'low': // "Okay - Floatable"
      return EDDY_IMAGES.green;
    case 'high':
    case 'dangerous': // Flood
      return EDDY_IMAGES.red;
    case 'very_low': // "Low - Scraping Likely"
      return EDDY_IMAGES.yellow;
    case 'too_low':
    case 'unknown':
    default:
      return EDDY_IMAGES.flag;
  }
};

// Collapsible section component
function CollapsibleSection({
  title,
  icon,
  children,
  defaultExpanded = false,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  defaultExpanded?: boolean;
}) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  return (
    <section>
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-3 mb-6 w-full text-left group"
      >
        <div className="p-3 rounded-lg" style={{ backgroundColor: '#2D7889' }}>
          {icon}
        </div>
        <h2 className="text-3xl font-bold text-neutral-900 flex-1">{title}</h2>
        <ChevronDown
          className={`w-6 h-6 text-neutral-500 transition-transform duration-200 ${
            isExpanded ? 'rotate-180' : ''
          }`}
        />
      </button>
      <div
        className={`overflow-hidden transition-all duration-300 ease-in-out ${
          isExpanded ? 'max-h-[5000px] opacity-100' : 'max-h-0 opacity-0'
        }`}
      >
        {children}
      </div>
    </section>
  );
}

const conditionCodes: ConditionCode[] = ['too_low', 'very_low', 'low', 'optimal', 'high', 'dangerous', 'unknown'];

// Condition descriptions ordered: Too Low → Low → Okay → Optimal → High → Flood
const conditionDescriptions: Record<ConditionCode, {
  title: string;
  description: string;
  recommendation: string;
  icon: string;
}> = {
  too_low: {
    title: 'Too Low - Not Recommended',
    description: 'Water levels are well below what\'s generally needed for floating. Depending on the river section, you may encounter long stretches of exposed gravel bars, shallow riffles, and areas where floating simply isn\'t practical. Upper and lower sections of a river may vary.',
    recommendation: 'Generally not recommended. Wait for rain or try a different river. Some deeper sections may still be passable — check with local outfitters.',
    icon: '🚫',
  },
  very_low: {
    title: 'Low - Scraping Likely',
    description: 'Water levels are below normal for most sections. Expect shallow areas, frequent scraping, and possible portaging — though conditions can differ between upper and lower stretches of the same river. Float times will likely be longer than estimated.',
    recommendation: 'Not ideal for beginners or large groups. Some river sections may float better than others — consider checking with local outfitters for section-specific advice.',
    icon: '⚠️',
  },
  low: {
    title: 'Okay - Floatable',
    description: 'Water levels are below optimal but generally floatable across most sections. You may encounter some shallow spots, especially in wider or upper sections, but most of the river should have enough water. Float times may run a bit longer than estimates.',
    recommendation: 'Suitable for most paddlers. Be prepared for occasional shallow spots — conditions can vary by section.',
    icon: '✓',
  },
  optimal: {
    title: 'Optimal Conditions',
    description: 'Water levels are in the ideal range for floating. Most river sections will have good depth without dangerously fast currents. This is generally the best time to be on the water, though conditions may still vary somewhat between sections.',
    recommendation: 'Great conditions for floating. Always check local conditions before heading out.',
    icon: '🎯',
  },
  high: {
    title: 'High Water - Experienced Only',
    description: 'Water levels are elevated across most sections with faster currents and increased hazards. Strainers, sweepers, and hydraulics pose greater risks. Some sections may be more affected than others depending on the river\'s geography.',
    recommendation: 'It is recommended to try another day. If you do go out, know your skill level and check section-specific conditions.',
    icon: '🌊',
  },
  dangerous: {
    title: 'Flood - Do Not Float',
    description: 'Water levels are at or near flood stage. Currents are extremely swift with severe hazards including debris, submerged obstacles, and powerful hydraulics. All river sections should be considered dangerous.',
    recommendation: 'DO NOT FLOAT under any circumstances. Stay off the water until levels drop significantly.',
    icon: '🛑',
  },
  unknown: {
    title: 'Unknown',
    description: 'Current conditions cannot be determined due to gauge issues, missing data, or lack of recent readings. This may affect some sections more than others if multiple gauges are involved.',
    recommendation: 'Exercise caution. Check alternate gauges, contact local outfitters, or wait until data becomes available.',
    icon: '❓',
  },
};

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-neutral-50">
      {/* Hero */}
      <section
        className="relative py-16 md:py-24 text-white"
        style={{ background: 'linear-gradient(to bottom right, #0F2D35, #163F4A, #0F2D35)' }}
      >
        <div className="max-w-4xl mx-auto px-4 text-center">
          <div className="-mb-1">
            <Image
              src="https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy%20the%20otter%20in%20a%20floatie.png"
              alt="Eddy the Otter in a floatie"
              width={400}
              height={400}
              className="mx-auto h-40 md:h-48 w-auto drop-shadow-[0_4px_24px_rgba(240,112,82,0.3)]"
              priority
            />
          </div>
          <h1
            className="text-5xl md:text-6xl font-bold mb-4"
            style={{ fontFamily: 'var(--font-display)', color: '#F07052' }}
          >
            How Eddy Works
          </h1>
          <p className="text-lg text-white/80 max-w-2xl mx-auto">
            Real-time river conditions and float planning powered by live USGS gauge data.
            Learn how we help you find the perfect time to float.
          </p>
        </div>
      </section>

      {/* Main content */}
      <div className="max-w-4xl mx-auto px-4 py-12 space-y-16">

        {/* What is Eddy */}
        <CollapsibleSection
          title="What is Eddy?"
          icon={<Info className="w-6 h-6 text-white" />}
          defaultExpanded={true}
        >
          <div className="bg-white border-2 border-neutral-200 rounded-xl p-6 shadow-sm">
            <p className="text-neutral-700 leading-relaxed mb-4">
              Eddy is a Missouri River float trip planner that combines real-time water conditions,
              access point information, and float time estimates to help you plan the perfect river trip.
              Unlike static guides, Eddy pulls live data from USGS gauges every hour to give you accurate,
              up-to-date conditions.
            </p>
            <p className="text-neutral-700 leading-relaxed">
              We currently support 8 rivers in the Missouri Ozarks with over 30 access points, covering
              some of the region&apos;s most popular floating destinations including the Meramec, Current,
              Eleven Point, Jacks Fork, Niangua, Big Piney, Huzzah, and Courtois rivers.
            </p>
          </div>
        </CollapsibleSection>

        {/* How It Works */}
        <CollapsibleSection
          title="How It Works"
          icon={<Gauge className="w-6 h-6 text-white" />}
          defaultExpanded={false}
        >
          <div className="space-y-4">
            {/* Live USGS Data */}
            <div className="bg-white border-2 border-neutral-200 rounded-xl p-6 shadow-sm">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center text-2xl"
                     style={{ backgroundColor: '#F07052' }}>
                  <Droplets className="w-6 h-6 text-white" />
                </div>
                <div className="flex-1">
                  <h3 className="text-xl font-bold text-neutral-900 mb-2">Live USGS Gauge Data</h3>
                  <p className="text-neutral-700 leading-relaxed mb-3">
                    Eddy connects directly to the United States Geological Survey (USGS) Water Services API
                    to fetch real-time gauge readings every hour. Each gauge measures:
                  </p>
                  <ul className="list-disc list-inside space-y-1 text-neutral-700 ml-4">
                    <li><strong>Gauge Height</strong> - Water level in feet above gauge datum</li>
                    <li><strong>Discharge</strong> - Flow rate in cubic feet per second (CFS)</li>
                    <li><strong>Temperature</strong> - Water temperature when available</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Condition Calculation */}
            <div className="bg-white border-2 border-neutral-200 rounded-xl p-6 shadow-sm">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center text-2xl"
                     style={{ backgroundColor: '#4EB86B' }}>
                  <TrendingUp className="w-6 h-6 text-white" />
                </div>
                <div className="flex-1">
                  <h3 className="text-xl font-bold text-neutral-900 mb-2">Condition Calculation</h3>
                  <p className="text-neutral-700 leading-relaxed mb-3">
                    Each river has carefully researched gauge height thresholds based on local outfitter
                    experience, National Park Service guidance, and historical data. For example,
                    the Current River at Akers gauge uses these thresholds:
                  </p>
                  <div className="bg-neutral-50 border border-neutral-200 rounded-lg p-4 font-mono text-sm space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-red-600 flex-shrink-0"></span>
                      <span><span className="font-semibold">Flood:</span> ≥ 4.5 ft - River closed by NPS</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-orange-500 flex-shrink-0"></span>
                      <span><span className="font-semibold">High:</span> 4.0 - 4.49 ft - Fast current, experienced only</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-600 flex-shrink-0"></span>
                      <span><span className="font-semibold">Optimal:</span> 2.0 - 3.5 ft - Ideal conditions</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-lime-500 flex-shrink-0"></span>
                      <span><span className="font-semibold">Okay:</span> 1.5 - 1.99 ft - Floatable, some dragging</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-yellow-500 flex-shrink-0"></span>
                      <span><span className="font-semibold">Low:</span> 1.0 - 1.49 ft - Frequent dragging</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-neutral-400 flex-shrink-0"></span>
                      <span><span className="font-semibold">Too Low:</span> &lt; 1.0 ft - Not recommended</span>
                    </div>
                  </div>
                  <p className="text-neutral-600 text-sm mt-3 italic">
                    Thresholds vary by river and gauge location. Visit the <Link href="/gauges" className="text-primary-600 hover:text-primary-700 font-semibold">Gauges page</Link> to
                    see specific thresholds for each gauge station.
                  </p>
                </div>
              </div>
            </div>

            {/* Float Time Estimates */}
            <div className="bg-white border-2 border-neutral-200 rounded-xl p-6 shadow-sm">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center text-2xl"
                     style={{ backgroundColor: '#B89D72' }}>
                  <Clock className="w-6 h-6 text-white" />
                </div>
                <div className="flex-1">
                  <h3 className="text-xl font-bold text-neutral-900 mb-2">Float Time Estimates</h3>
                  <p className="text-neutral-700 leading-relaxed mb-3">
                    Float times are calculated based on:
                  </p>
                  <ul className="list-disc list-inside space-y-1 text-neutral-700 ml-4">
                    <li><strong>Distance</strong> - River miles between access points</li>
                    <li><strong>Vessel Type</strong> - Different speeds for rafts, canoes, kayaks, and tubes</li>
                    <li><strong>Current Conditions</strong> - Higher water means faster float times, lower water means slower</li>
                    <li><strong>Typical Speed Ranges</strong> - Raft: 1.5-2.5 mph, Canoe: 2.0-3.5 mph, Kayak: 2.5-4.0 mph, Tube: 1.0-2.0 mph</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Segment-Aware */}
            <div className="bg-white border-2 border-neutral-200 rounded-xl p-6 shadow-sm">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center text-2xl"
                     style={{ backgroundColor: '#2D7889' }}>
                  <MapPin className="w-6 h-6 text-white" />
                </div>
                <div className="flex-1">
                  <h3 className="text-xl font-bold text-neutral-900 mb-2">Segment-Aware Conditions</h3>
                  <p className="text-neutral-700 leading-relaxed">
                    When you select a put-in point, Eddy uses the gauge nearest to your starting location
                    to provide the most accurate conditions for your specific float segment. This is especially
                    important on longer rivers where conditions can vary significantly between upstream and
                    downstream sections.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </CollapsibleSection>

        {/* Condition Codes Explained */}
        <CollapsibleSection
          title="Understanding Condition Codes"
          icon={<AlertTriangle className="w-6 h-6 text-white" />}
          defaultExpanded={false}
        >
          <p className="text-neutral-700 mb-6 leading-relaxed">
            Eddy uses seven condition codes to communicate water levels and safety. Here&apos;s what each
            condition means and when you should (or shouldn&apos;t) float:
          </p>

          <div className="space-y-4">
            {conditionCodes.map((code) => {
              const info = conditionDescriptions[code];
              const eddyImage = getEddyImageForCondition(code);
              return (
                <div
                  key={code}
                  className="bg-white border-2 rounded-xl shadow-sm overflow-hidden"
                  style={{ borderColor: CONDITION_COLORS[code] }}
                >
                  <div
                    className="px-6 py-4 border-b-2"
                    style={{
                      borderColor: CONDITION_COLORS[code],
                      backgroundColor: `${CONDITION_COLORS[code]}15`
                    }}
                  >
                    <div className="flex items-center gap-3">
                      <Image
                        src={eddyImage}
                        alt={`Eddy for ${info.title}`}
                        width={48}
                        height={48}
                        className="w-12 h-12 object-contain"
                      />
                      <div className="flex-1">
                        <h3 className="text-xl font-bold text-neutral-900">{info.title}</h3>
                        <p className="text-sm text-neutral-600">{CONDITION_LABELS[code]}</p>
                      </div>
                      <div
                        className="px-4 py-2 rounded-full text-white font-semibold text-sm"
                        style={{ backgroundColor: CONDITION_COLORS[code] }}
                      >
                        {code.toUpperCase().replace('_', ' ')}
                      </div>
                    </div>
                  </div>
                  <div className="px-6 py-5 space-y-3">
                    <div>
                      <h4 className="text-sm font-semibold text-neutral-500 uppercase tracking-wide mb-1">
                        Description
                      </h4>
                      <p className="text-neutral-700 leading-relaxed">
                        {info.description}
                      </p>
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold text-neutral-500 uppercase tracking-wide mb-1">
                        Recommendation
                      </h4>
                      <p className="text-neutral-900 font-medium leading-relaxed">
                        {info.recommendation}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </CollapsibleSection>

        {/* Data Sources */}
        <CollapsibleSection
          title="Data Sources"
          icon={<Database className="w-6 h-6 text-white" />}
          defaultExpanded={false}
        >
          <div className="bg-white border-2 border-neutral-200 rounded-xl p-6 shadow-sm">
            <div className="space-y-4">
              <div>
                <h3 className="font-bold text-neutral-900 mb-1">USGS Water Services</h3>
                <p className="text-neutral-700 mb-1">
                  Real-time and historical gauge data from the United States Geological Survey&apos;s
                  National Water Information System.
                </p>
                <a href="https://waterservices.usgs.gov/" target="_blank" rel="noopener noreferrer" className="text-sm text-primary-600 hover:text-primary-700 font-medium">
                  waterservices.usgs.gov &rarr;
                </a>
              </div>
              <div>
                <h3 className="font-bold text-neutral-900 mb-1">National Hydrography Dataset (NHD)</h3>
                <p className="text-neutral-700 mb-1">
                  River geometry and hydrological network data from USGS.
                </p>
                <a href="https://www.usgs.gov/national-hydrography/national-hydrography-dataset" target="_blank" rel="noopener noreferrer" className="text-sm text-primary-600 hover:text-primary-700 font-medium">
                  usgs.gov/national-hydrography &rarr;
                </a>
              </div>
              <div>
                <h3 className="font-bold text-neutral-900 mb-1">Missouri Department of Conservation</h3>
                <p className="text-neutral-700 mb-1">
                  Access point information, facility details, and river management data.
                </p>
                <a href="https://mdc.mo.gov/" target="_blank" rel="noopener noreferrer" className="text-sm text-primary-600 hover:text-primary-700 font-medium">
                  mdc.mo.gov &rarr;
                </a>
              </div>
              <div>
                <h3 className="font-bold text-neutral-900 mb-1">National Park Service</h3>
                <p className="text-neutral-700 mb-1">
                  Data for rivers within National Scenic Riverways (Current, Jacks Fork, Eleven Point).
                </p>
                <a href="https://www.nps.gov/ozar/index.htm" target="_blank" rel="noopener noreferrer" className="text-sm text-primary-600 hover:text-primary-700 font-medium">
                  nps.gov/ozar &rarr;
                </a>
              </div>
              <div>
                <h3 className="font-bold text-neutral-900 mb-1">Recreation.gov</h3>
                <p className="text-neutral-700 mb-1">
                  Campground reservations and recreation area information for NPS sites.
                </p>
                <a href="https://www.recreation.gov/" target="_blank" rel="noopener noreferrer" className="text-sm text-primary-600 hover:text-primary-700 font-medium">
                  recreation.gov &rarr;
                </a>
              </div>
            </div>
          </div>
        </CollapsibleSection>

        {/* Developers */}
        <CollapsibleSection
          title="Developers"
          icon={<Code2 className="w-6 h-6 text-white" />}
          defaultExpanded={false}
        >
          <div className="bg-white border-2 border-neutral-200 rounded-xl p-6 shadow-sm">
            <p className="text-neutral-700 leading-relaxed mb-4">
              Want to show live river conditions on your own website? Eddy offers free embeddable
              widgets and a simple API that you can add to any site in minutes — no coding
              experience required.
            </p>
            <div className="space-y-3">
              <div>
                <h3 className="font-bold text-neutral-900 mb-1">Embeddable Widgets</h3>
                <p className="text-neutral-700 mb-2">
                  Drop a live conditions widget, a link button, or a full float trip planner onto
                  your site with a simple copy-paste. Supports light and dark themes.
                </p>
              </div>
              <div>
                <h3 className="font-bold text-neutral-900 mb-1">API Access</h3>
                <p className="text-neutral-700 mb-2">
                  Fetch river condition data directly as JSON to build your own custom displays.
                </p>
              </div>
            </div>
            <Link
              href="/embed"
              className="inline-flex items-center gap-2 mt-4 px-5 py-2.5 rounded-lg text-white text-sm font-semibold no-underline transition-colors"
              style={{ backgroundColor: '#2D7889' }}
            >
              <Code2 className="w-4 h-4" />
              View Embed Guide & API Docs
            </Link>
          </div>
        </CollapsibleSection>

        {/* Safety Notice */}
        <section>
          <h2 className="text-3xl font-bold text-neutral-900 mb-6">Safety & Disclaimer</h2>
          <div className="bg-red-50 border-2 border-red-300 rounded-xl p-6">
            <div className="flex gap-4">
              <AlertTriangle className="w-6 h-6 text-red-600 flex-shrink-0 mt-1" />
              <div className="space-y-3 text-neutral-800">
                <p className="font-semibold text-red-900">
                  Always verify conditions before floating and use your own judgment.
                </p>
                <ul className="list-disc list-inside space-y-2 text-sm leading-relaxed ml-4">
                  <li>Gauge data can have delays or inaccuracies</li>
                  <li>Conditions can change rapidly, especially during storms</li>
                  <li>Local factors (obstacles, weather, group experience) affect safety</li>
                  <li>Float time estimates are approximate and vary by paddler skill</li>
                  <li>Always wear a life jacket and never float alone</li>
                  <li>Check weather forecasts and be prepared for rain</li>
                  <li>Let someone know your float plan and expected return time</li>
                </ul>
                <p className="text-sm italic">
                  Eddy is a planning tool. You are responsible for your own safety on the river.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Rivers Covered */}
        <CollapsibleSection
          title="Rivers We Cover"
          icon={<Waves className="w-6 h-6 text-white" />}
          defaultExpanded={false}
        >
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              'Meramec River',
              'Current River',
              'Eleven Point River',
              'Jacks Fork',
              'Niangua River',
              'Big Piney River',
              'Huzzah Creek',
              'Courtois Creek'
            ].map((river) => (
              <div
                key={river}
                className="bg-white border-2 border-neutral-200 rounded-lg px-4 py-3 text-center font-semibold text-neutral-900 shadow-sm hover:shadow-md transition-shadow"
              >
                {river}
              </div>
            ))}
          </div>
        </CollapsibleSection>

      </div>

      {/* Footer */}
      <footer className="bg-primary-800 border-t-2 border-neutral-900 px-4 py-8 mt-16">
        <div className="max-w-4xl mx-auto text-center">
          <p className="text-primary-200 mb-2">
            Eddy &middot; Missouri River Float Trip Planner
          </p>
          <p className="text-sm text-primary-300">
            Water data from USGS &middot; Always check local conditions before floating
          </p>
        </div>
      </footer>
    </div>
  );
}
