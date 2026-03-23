// src/app/about/page.tsx
// About page explaining how Eddy works and condition codes

import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { Droplets, MapPin, Clock, Gauge, TrendingUp, AlertTriangle, Info, Database, Waves, Code2 } from 'lucide-react';
import { CONDITION_COLORS } from '@/constants';
import type { ConditionCode } from '@/types/api';
import AboutCollapsibleSection from '@/components/ui/AboutCollapsibleSection';
import SiteFooter from '@/components/ui/SiteFooter';

export const metadata: Metadata = {
  title: 'How Eddy Works',
  description: 'Learn how Eddy uses real-time USGS gauge data to provide live river conditions, float time estimates, and access point information for planning your float trip.',
};

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
    case 'flowing':
    case 'good': // "Good - Floatable"
      return EDDY_IMAGES.green;
    case 'high':
    case 'dangerous': // Flood
      return EDDY_IMAGES.red;
    case 'low': // "Low - Scraping Likely"
      return EDDY_IMAGES.yellow;
    case 'too_low':
    case 'unknown':
    default:
      return EDDY_IMAGES.flag;
  }
};

const conditionCodes: ConditionCode[] = ['too_low', 'low', 'good', 'flowing', 'high', 'dangerous', 'unknown'];

// Condition descriptions ordered: Too Low → Low → Good → Flowing → High → Flood
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
  low: {
    title: 'Low - Scraping Likely',
    description: 'Water levels are below normal for most sections. Expect shallow areas, frequent scraping, and possible portaging — though conditions can differ between upper and lower stretches of the same river. Float times will likely be longer than estimated.',
    recommendation: 'Not ideal for beginners or large groups. Some river sections may float better than others — consider checking with local outfitters for section-specific advice.',
    icon: '⚠️',
  },
  good: {
    title: 'Good - Floatable',
    description: 'Water levels are below optimal but generally floatable across most sections. You may encounter some shallow spots, especially in wider or upper sections, but most of the river should have enough water. Float times may run a bit longer than estimates.',
    recommendation: 'Suitable for most paddlers. Be prepared for occasional shallow spots — conditions can vary by section.',
    icon: '✓',
  },
  flowing: {
    title: 'Flowing - Ideal Conditions',
    description: 'Water levels are in the ideal range for floating. Most river sections will have good depth without dangerously fast currents. This is generally the best time to be on the water, though conditions may still vary somewhat between sections.',
    recommendation: 'Great conditions for floating. Always check local conditions before heading out.',
    icon: '🎯',
  },
  high: {
    title: 'High Water - Use Caution',
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
        <AboutCollapsibleSection
          title="What is Eddy?"
          icon={<Info className="w-6 h-6 text-white" />}
          defaultExpanded={true}
        >
          <div className="bg-white border-2 border-neutral-200 rounded-xl p-6 shadow-sm">
            <p className="text-neutral-700 leading-relaxed mb-4">
              Eddy is a river float trip planner that combines real-time water conditions,
              access point information, and float time estimates to help you plan the perfect river trip.
              Unlike static guides, Eddy pulls live data from USGS gauges every hour to give you accurate,
              up-to-date conditions.
            </p>
            <p className="text-neutral-700 leading-relaxed">
              We currently support multiple rivers with dozens of access points, covering popular
              floating destinations with real-time gauge data, float time estimates, and detailed
              access point information.
            </p>
          </div>
        </AboutCollapsibleSection>

        {/* How It Works */}
        <AboutCollapsibleSection
          title="How It Works"
          icon={<Gauge className="w-6 h-6 text-white" />}
          defaultExpanded={false}
        >
          <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden shadow-sm">
            {[
              {
                num: '01',
                icon: <Droplets className="w-5 h-5" />,
                title: 'Live gauge data',
                body: 'Eddy pulls readings from USGS gauges every hour — gauge height (ft), discharge (cfs), and temperature when available.',
              },
              {
                num: '02',
                icon: <TrendingUp className="w-5 h-5" />,
                title: 'Condition thresholds',
                body: 'Each river has researched thresholds based on outfitter experience and NPS guidance. Readings are compared against these to produce a condition code.',
              },
              {
                num: '03',
                icon: <MapPin className="w-5 h-5" />,
                title: 'Segment-aware accuracy',
                body: 'When you pick a put-in, Eddy uses the nearest gauge so your conditions reflect the actual section you\'re floating, not just the river as a whole.',
              },
              {
                num: '04',
                icon: <Clock className="w-5 h-5" />,
                title: 'Float time estimates',
                body: 'Times factor in river miles, vessel type (kayak, canoe, raft, tube), and current water levels — higher water means faster floats.',
              },
            ].map((step, i, arr) => (
              <div key={step.num} className={`flex items-start gap-4 px-5 py-5 sm:px-6 ${i < arr.length - 1 ? 'border-b border-neutral-100' : ''}`}>
                <span className="flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center text-xs font-bold text-white" style={{ backgroundColor: '#163F4A' }}>
                  {step.num}
                </span>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-bold text-neutral-900 mb-0.5">{step.title}</h3>
                  <p className="text-sm text-neutral-600 leading-relaxed">{step.body}</p>
                </div>
                <span className="flex-shrink-0 text-neutral-300 mt-0.5">{step.icon}</span>
              </div>
            ))}
          </div>
          <p className="text-xs text-neutral-500 mt-3 text-center">
            Thresholds vary by river and gauge. Visit the <Link href="/gauges" className="text-primary-600 hover:text-primary-700 font-semibold">Gauges page</Link> to see specifics for each station.
          </p>
        </AboutCollapsibleSection>

        {/* Condition Codes Explained */}
        <AboutCollapsibleSection
          title="Understanding Condition Codes"
          icon={<AlertTriangle className="w-6 h-6 text-white" />}
          defaultExpanded={false}
        >
          <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden shadow-sm divide-y divide-neutral-100">
            {conditionCodes.map((code) => {
              const info = conditionDescriptions[code];
              const eddyImage = getEddyImageForCondition(code);
              return (
                <div key={code} className="px-5 py-4 sm:px-6">
                  <div className="flex items-center gap-3 mb-2">
                    <Image
                      src={eddyImage}
                      alt={`Eddy for ${info.title}`}
                      width={36}
                      height={36}
                      className="w-9 h-9 object-contain flex-shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-sm font-bold text-neutral-900">{info.title}</h3>
                        <span
                          className="px-2 py-0.5 rounded-md text-[10px] font-bold text-white uppercase tracking-wide"
                          style={{ backgroundColor: CONDITION_COLORS[code] }}
                        >
                          {code.replace('_', ' ')}
                        </span>
                      </div>
                    </div>
                  </div>
                  <p className="text-sm text-neutral-600 leading-relaxed mb-1.5">{info.description}</p>
                  <p className="text-sm text-neutral-900 font-medium leading-relaxed">{info.recommendation}</p>
                </div>
              );
            })}
          </div>
        </AboutCollapsibleSection>

        {/* Data Sources */}
        <AboutCollapsibleSection
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
        </AboutCollapsibleSection>

        {/* Developers */}
        <AboutCollapsibleSection
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
        </AboutCollapsibleSection>

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
        <AboutCollapsibleSection
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
        </AboutCollapsibleSection>

      </div>

      <SiteFooter maxWidth="max-w-4xl" className="mt-16" />
    </div>
  );
}
