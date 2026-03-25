'use client';

// src/app/embed/page.tsx
// API docs-style guide for adding Eddy river widgets to external websites.
// Left sidebar navigation with structured widget documentation.

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Copy, Check, ExternalLink, ChevronDown, X, Search } from 'lucide-react';
import SiteFooter from '@/components/ui/SiteFooter';
import FeedbackModal from '@/components/ui/FeedbackModal';

const EDDY_CANOE_IMAGE = 'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy%20the%20otter%20in%20a%20cool%20canoe.png';

const RIVER_OPTIONS = [
  { slug: 'meramec', name: 'Meramec River' },
  { slug: 'current', name: 'Current River' },
  { slug: 'eleven-point', name: 'Eleven Point River' },
  { slug: 'jacks-fork', name: 'Jacks Fork' },
  { slug: 'niangua', name: 'Niangua River' },
  { slug: 'big-piney', name: 'Big Piney River' },
  { slug: 'huzzah', name: 'Huzzah Creek' },
  { slug: 'courtois', name: 'Courtois Creek' },
];

// Navigation structure
const NAV_SECTIONS = [
  {
    title: 'Getting Started',
    items: [
      { id: 'configuration', label: 'Configuration' },
      { id: 'installation', label: 'Installation' },
    ],
  },
  {
    title: 'Widgets',
    items: [
      { id: 'live-conditions', label: 'Live Conditions' },
      { id: 'eddy-quote', label: 'Eddy\'s Daily Quote' },
      { id: 'float-planner', label: 'Float Trip Planner' },
      { id: 'services-directory', label: 'Services Directory' },
      { id: 'gauge-report', label: 'Gauge Report' },
      { id: 'condition-badge', label: 'Condition Badge' },
    ],
  },
  {
    title: 'Advanced',
    items: [
      { id: 'parameters', label: 'Parameters Reference' },
      { id: 'api', label: 'API Access' },
    ],
  },
];

function CopyButton({ text, large = false }: { text: string; large?: boolean }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  if (large) {
    return (
      <button
        onClick={handleCopy}
        className={`flex items-center justify-center gap-2 w-full px-4 py-3 font-semibold rounded-xl transition-all text-sm ${
          copied
            ? 'bg-green-500 text-white'
            : 'bg-primary-600 hover:bg-primary-700 text-white'
        }`}
      >
        {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
        {copied ? 'Copied to clipboard!' : 'Copy Code to Clipboard'}
      </button>
    );
  }

  return (
    <button
      onClick={handleCopy}
      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-neutral-700 hover:bg-neutral-600 text-neutral-200 transition-colors"
    >
      {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
      {copied ? 'Copied!' : 'Copy'}
    </button>
  );
}

function CodeBlock({ code, label = 'HTML' }: { code: string; label?: string }) {
  return (
    <div className="bg-neutral-900 rounded-xl overflow-hidden mb-3 min-w-0">
      <div className="flex items-center justify-between px-4 py-2 border-b border-neutral-700">
        <span className="text-xs text-neutral-400 font-medium">{label}</span>
        <CopyButton text={code} />
      </div>
      <pre className="p-4 text-xs text-neutral-300 overflow-x-auto max-w-full">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function WidgetPreview({ src, height, theme }: { src: string; height: number; theme: string }) {
  return (
    <div className="mb-4">
      <p className="text-xs text-neutral-400 mb-2 uppercase tracking-wide font-semibold">Live Preview</p>
      <div className={`rounded-xl border-2 p-4 flex justify-center ${theme === 'dark' ? 'border-neutral-700 bg-neutral-800' : 'border-neutral-200 bg-neutral-50'}`}>
        <div className="w-full" style={{ maxWidth: 540 }}>
          <iframe
            src={src}
            width="100%"
            height={height}
            style={{ border: 'none', borderRadius: '12px' }}
            title="Widget preview"
          />
        </div>
      </div>
    </div>
  );
}

function ParamRow({ name, values, description }: { name: string; values: string; description: string }) {
  return (
    <tr className="border-b border-neutral-100 last:border-b-0">
      <td className="py-2 pr-3 align-top">
        <code className="text-xs bg-neutral-100 px-1.5 py-0.5 rounded font-semibold text-primary-700">{name}</code>
      </td>
      <td className="py-2 pr-3 align-top text-xs text-neutral-500">{values}</td>
      <td className="py-2 align-top text-xs text-neutral-600">{description}</td>
    </tr>
  );
}

// All section IDs for scroll tracking
const ALL_SECTION_IDS = NAV_SECTIONS.flatMap(s => s.items.map(i => i.id));

export default function EmbedPage() {
  const [selectedRiver, setSelectedRiver] = useState('current');
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [activeSection, setActiveSection] = useState('configuration');
  const [serviceFilter, setServiceFilter] = useState<'all' | 'outfitter' | 'campground' | 'cabin_lodge'>('all');
  const [highlightSlugs, setHighlightSlugs] = useState<string[]>([]);
  const [servicesList, setServicesList] = useState<{ slug: string; name: string; type: string }[]>([]);
  const [highlightSearch, setHighlightSearch] = useState('');
  const [highlightDropdownOpen, setHighlightDropdownOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const highlightRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);

  // Scroll-spy: track which section is in view
  const setupObserver = useCallback(() => {
    observerRef.current?.disconnect();
    const observer = new IntersectionObserver(
      (entries) => {
        // Find the topmost visible section
        const visible = entries
          .filter(e => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible.length > 0) {
          setActiveSection(visible[0].target.id);
        }
      },
      { rootMargin: '-80px 0px -60% 0px', threshold: 0 }
    );
    ALL_SECTION_IDS.forEach(id => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
    observerRef.current = observer;
  }, []);

  useEffect(() => {
    setupObserver();
    return () => observerRef.current?.disconnect();
  }, [setupObserver]);

  // Fetch services list for the selected river
  useEffect(() => {
    fetch(`/api/rivers/${selectedRiver}/services`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.services) {
          setServicesList(
            data.services
              .filter((s: { status: string }) => s.status === 'active' || s.status === 'seasonal')
              .map((s: { slug: string; name: string; type: string }) => ({ slug: s.slug, name: s.name, type: s.type }))
          );
        }
      })
      .catch(() => {});
    setHighlightSlugs([]);
  }, [selectedRiver]);

  // Close highlight dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (highlightRef.current && !highlightRef.current.contains(e.target as Node)) {
        setHighlightDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'https://eddy.guide';
  const selectedRiverName = RIVER_OPTIONS.find(r => r.slug === selectedRiver)?.name || '';

  // Embed codes
  const widgetCode = `<iframe
  src="${baseUrl}/embed/widget/${selectedRiver}?theme=${theme}"
  width="100%" height="480"
  style="border:none; border-radius:12px; max-width:600px;"
  title="${selectedRiverName} - River Conditions from Eddy"
  loading="lazy"
></iframe>`;

  const eddyQuoteCode = `<iframe
  src="${baseUrl}/embed/eddy-quote/${selectedRiver}?theme=${theme}"
  width="100%" height="300"
  style="border:none; border-radius:12px; max-width:600px;"
  title="${selectedRiverName} - Eddy's Take"
  loading="lazy"
></iframe>`;

  const plannerCode = `<iframe
  src="${baseUrl}/embed/planner?river=${selectedRiver}&theme=${theme}"
  width="100%" height="420"
  style="border:none; border-radius:12px; max-width:600px;"
  title="Plan Your Float - Eddy"
  loading="lazy"
></iframe>`;

  const servicesParams = new URLSearchParams({ theme });
  if (serviceFilter !== 'all') servicesParams.set('type', serviceFilter);
  if (highlightSlugs.length > 0) servicesParams.set('highlight', highlightSlugs.join(','));
  const servicesQueryString = servicesParams.toString();

  const servicesCode = `<iframe
  src="${baseUrl}/embed/services/${selectedRiver}?${servicesQueryString}"
  width="100%" height="400"
  style="border:none; border-radius:12px; max-width:600px;"
  title="${selectedRiverName} - Outfitters & Services from Eddy"
  loading="lazy"
></iframe>`;

  const gaugeReportCode = `<iframe
  src="${baseUrl}/embed/gauge-report/${selectedRiver}?theme=${theme}"
  width="100%" height="480"
  style="border:none; border-radius:12px; max-width:600px;"
  title="${selectedRiverName} - Gauge Report from Eddy"
  loading="lazy"
></iframe>`;

  const badgeCode = `<iframe
  src="${baseUrl}/embed/badge/${selectedRiver}?theme=${theme}"
  width="280" height="44"
  style="border:none; overflow:hidden;"
  title="${selectedRiverName} - Condition Badge from Eddy"
  loading="lazy"
></iframe>`;

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="min-h-screen bg-neutral-50 overflow-x-hidden">
      {/* Header */}
      <section
        className="relative py-10 md:py-14 text-white"
        style={{ background: 'linear-gradient(to bottom right, #0F2D35, #163F4A, #0F2D35)' }}
      >
        <div className="max-w-6xl mx-auto px-4 flex items-center gap-6">
          <Image
            src={EDDY_CANOE_IMAGE}
            alt="Eddy the Otter"
            width={200}
            height={200}
            className="h-20 md:h-28 w-auto drop-shadow-[0_4px_24px_rgba(240,112,82,0.3)] hidden md:block"
            priority
          />
          <div>
            <h1
              className="text-3xl md:text-4xl font-bold mb-2"
              style={{ fontFamily: 'var(--font-display)', color: '#F07052' }}
            >
              Embed Widgets
            </h1>
            <p className="text-base text-white/80 max-w-xl">
              Add live river conditions, trip planning, and outfitter directories
              to your website. Free for outfitters, campgrounds, and tourism sites.
            </p>
          </div>
        </div>
      </section>

      {/* Main layout: sidebar + content */}
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex gap-8">
          {/* Left sidebar nav */}
          <nav className="hidden lg:block w-56 flex-shrink-0 sticky top-[4.5rem] self-start max-h-[calc(100vh-5rem)] overflow-y-auto">
            <div className="space-y-6">
              {NAV_SECTIONS.map(section => (
                <div key={section.title}>
                  <h4 className="text-xs font-bold text-neutral-400 uppercase tracking-wider mb-2">
                    {section.title}
                  </h4>
                  <ul className="space-y-1">
                    {section.items.map(item => (
                      <li key={item.id}>
                        <button
                          onClick={() => scrollTo(item.id)}
                          className={`block w-full text-left text-sm px-3 py-1.5 rounded-lg transition-colors ${
                            activeSection === item.id
                              ? 'text-primary-700 bg-primary-50 font-semibold'
                              : 'text-neutral-600 hover:text-primary-700 hover:bg-primary-50'
                          }`}
                        >
                          {item.label}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}

              {/* Outfitter CTA in sidebar */}
              <div className="border-t border-neutral-200 pt-4">
                <p className="text-xs text-neutral-500 mb-2">Running an outfitter?</p>
                <button
                  onClick={() => setFeedbackOpen(true)}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-white px-3 py-2 rounded-lg cursor-pointer"
                  style={{ backgroundColor: '#F07052' }}
                >
                  Contact Us
                </button>
              </div>
            </div>
          </nav>

          {/* Main content */}
          <main className="flex-1 min-w-0 space-y-12">

            {/* ===== CONFIGURATION ===== */}
            <section id="configuration">
              <h2 className="text-2xl font-bold text-neutral-900 mb-4">Configuration</h2>
              <p className="text-sm text-neutral-600 mb-6">
                Select your river and theme. All widget codes on this page will update automatically.
              </p>

              <div className="bg-white border border-neutral-200 rounded-xl p-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-semibold text-neutral-700 mb-2">River</label>
                    <div className="relative">
                      <select
                        value={selectedRiver}
                        onChange={(e) => setSelectedRiver(e.target.value)}
                        className="w-full px-4 py-2.5 border border-neutral-200 rounded-lg text-sm bg-white appearance-none cursor-pointer focus:ring-2 focus:ring-primary-400 focus:border-primary-400"
                      >
                        {RIVER_OPTIONS.map((r) => (
                          <option key={r.slug} value={r.slug}>{r.name}</option>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400 pointer-events-none" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-neutral-700 mb-2">Theme</label>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setTheme('light')}
                        className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium border transition-all flex-1 ${
                          theme === 'light'
                            ? 'border-primary-500 bg-primary-50 text-primary-700'
                            : 'border-neutral-200 bg-white text-neutral-600 hover:border-neutral-300'
                        }`}
                      >
                        <div className="w-3.5 h-3.5 rounded-full bg-white border border-neutral-300" />
                        Light
                      </button>
                      <button
                        onClick={() => setTheme('dark')}
                        className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium border transition-all flex-1 ${
                          theme === 'dark'
                            ? 'border-primary-500 bg-primary-50 text-primary-700'
                            : 'border-neutral-200 bg-white text-neutral-600 hover:border-neutral-300'
                        }`}
                      >
                        <div className="w-3.5 h-3.5 rounded-full bg-neutral-800 border border-neutral-600" />
                        Dark
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* ===== INSTALLATION ===== */}
            <section id="installation">
              <h2 className="text-2xl font-bold text-neutral-900 mb-4">Installation</h2>
              <p className="text-sm text-neutral-600 mb-4">
                Copy any widget code below and paste it into your website. All widgets are free and update automatically.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {[
                  { name: 'WordPress', steps: 'Add a Custom HTML block, paste the code, and publish.' },
                  { name: 'Squarespace', steps: 'Add a Code block (under "More"), paste, and publish.' },
                  { name: 'Wix', steps: 'Add Elements \u2192 Embed Code \u2192 Embed HTML, paste the code.' },
                  { name: 'Other', steps: 'Look for "Custom HTML" or "Embed Code" in your page editor.' },
                ].map(platform => (
                  <div key={platform.name} className="bg-white border border-neutral-200 rounded-xl p-4">
                    <h3 className="font-semibold text-neutral-900 text-sm mb-1">{platform.name}</h3>
                    <p className="text-xs text-neutral-500">{platform.steps}</p>
                  </div>
                ))}
              </div>
            </section>

            <hr className="border-neutral-200" />

            {/* ===== LIVE CONDITIONS ===== */}
            <section id="live-conditions">
              <div className="flex items-center gap-2 mb-1">
                <h2 className="text-xl font-bold text-neutral-900">Live Conditions Widget</h2>
                <span className="px-2 py-0.5 bg-primary-600 text-white text-xs font-bold rounded-full">Recommended</span>
              </div>
              <p className="text-sm text-neutral-600 mb-4">
                Gauge readings, weather, condition badges, and trend arrows. Updates automatically.
              </p>

              <WidgetPreview
                src={`${baseUrl}/embed/widget/${selectedRiver}?theme=${theme}`}
                height={480}
                theme={theme}
              />
              <CodeBlock code={widgetCode} />
              <CopyButton text={widgetCode} large />

              <p className="text-xs text-neutral-500 mt-3">
                Includes a 14-day trend chart for the primary gauge. Rivers with 3+ gauges may need <code className="bg-neutral-100 px-1 py-0.5 rounded">height=&quot;540&quot;</code>.
                Add <code className="bg-neutral-100 px-1 py-0.5 rounded">&amp;partner=YourBusiness</code> for branding.
              </p>
            </section>

            <hr className="border-neutral-200" />

            {/* ===== EDDY QUOTE ===== */}
            <section id="eddy-quote">
              <div className="flex items-center gap-2 mb-1">
                <h2 className="text-xl font-bold text-neutral-900">Eddy&apos;s Daily Quote</h2>
              </div>
              <p className="text-sm text-neutral-600 mb-4">
                AI-generated condition summary with a clear float/no-float recommendation.
                Updates throughout the day.
              </p>

              <WidgetPreview
                src={`${baseUrl}/embed/eddy-quote/${selectedRiver}?theme=${theme}`}
                height={300}
                theme={theme}
              />
              <CodeBlock code={eddyQuoteCode} />
              <CopyButton text={eddyQuoteCode} large />
            </section>

            <hr className="border-neutral-200" />

            {/* ===== FLOAT PLANNER ===== */}
            <section id="float-planner">
              <div className="flex items-center gap-2 mb-1">
                <h2 className="text-xl font-bold text-neutral-900">Float Trip Planner</h2>
                <span className="px-2 py-0.5 text-white text-xs font-bold rounded-full" style={{ backgroundColor: '#F07052' }}>Best for Outfitters</span>
              </div>
              <p className="text-sm text-neutral-600 mb-4">
                Visitors pick a river, put-in, and take-out. Shows distance, estimated float time,
                conditions, and nearby outfitters with contact info.
                The shuttle route between access points is shown on the full trip details page.
              </p>

              <WidgetPreview
                src={`${baseUrl}/embed/planner?river=${selectedRiver}&theme=${theme}`}
                height={420}
                theme={theme}
              />
              <CodeBlock code={plannerCode} />
              <CopyButton text={plannerCode} large />

              <p className="text-xs text-neutral-500 mt-3">
                Add <code className="bg-neutral-100 px-1 py-0.5 rounded">&amp;partner=YourBusiness</code> for
                branding. The selected river is pre-selected but visitors can change it.
              </p>
            </section>

            <hr className="border-neutral-200" />

            {/* ===== SERVICES DIRECTORY ===== */}
            <section id="services-directory">
              <div className="flex items-center gap-2 mb-1">
                <h2 className="text-xl font-bold text-neutral-900">Services Directory</h2>
                <span className="px-2 py-0.5 bg-emerald-600 text-white text-xs font-bold rounded-full">New</span>
              </div>
              <p className="text-sm text-neutral-600 mb-4">
                Outfitters, campgrounds (including NPS primitive campgrounds reservable through recreation.gov),
                and lodging with click-to-call phone numbers, website links, reservation links, and Google Maps.
              </p>

              {/* Filter controls */}
              <div className="bg-white border border-neutral-200 rounded-xl p-4 mb-4">
                <h4 className="text-sm font-semibold text-neutral-800 mb-3">Filter by Category</h4>
                <div className="flex flex-wrap gap-2 mb-4">
                  {([
                    { value: 'all', label: 'All Services' },
                    { value: 'outfitter', label: 'Outfitters' },
                    { value: 'campground', label: 'Campgrounds' },
                    { value: 'cabin_lodge', label: 'Cabins & Lodges' },
                  ] as const).map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => setServiceFilter(opt.value)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-all ${
                        serviceFilter === opt.value
                          ? 'border-primary-500 bg-primary-50 text-primary-700'
                          : 'border-neutral-200 bg-white text-neutral-600 hover:border-neutral-300'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-neutral-600 mb-1">
                    Show specific listings (optional)
                  </label>
                  {/* Selected chips */}
                  {highlightSlugs.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {highlightSlugs.map(slug => {
                        const svc = servicesList.find(s => s.slug === slug);
                        return (
                          <span
                            key={slug}
                            className="inline-flex items-center gap-1 px-2 py-0.5 bg-primary-50 border border-primary-200 text-primary-700 text-xs font-medium rounded-md"
                          >
                            {svc?.name || slug}
                            <button
                              onClick={() => setHighlightSlugs(prev => prev.filter(s => s !== slug))}
                              className="hover:text-primary-900 transition-colors"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </span>
                        );
                      })}
                    </div>
                  )}
                  {/* Searchable dropdown */}
                  <div className="relative" ref={highlightRef}>
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-neutral-400" />
                      <input
                        type="text"
                        value={highlightSearch}
                        onChange={e => { setHighlightSearch(e.target.value); setHighlightDropdownOpen(true); }}
                        onFocus={() => setHighlightDropdownOpen(true)}
                        placeholder="Search listings..."
                        className="w-full max-w-xs pl-8 pr-3 py-1.5 border border-neutral-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-primary-400 focus:border-primary-400"
                      />
                    </div>
                    {highlightDropdownOpen && (
                      <div className="absolute z-10 mt-1 w-full max-w-xs bg-white border border-neutral-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                        {servicesList
                          .filter(s => !highlightSlugs.includes(s.slug))
                          .filter(s =>
                            !highlightSearch ||
                            s.name.toLowerCase().includes(highlightSearch.toLowerCase()) ||
                            s.slug.toLowerCase().includes(highlightSearch.toLowerCase())
                          )
                          .map(s => (
                            <button
                              key={s.slug}
                              onClick={() => {
                                setHighlightSlugs(prev => [...prev, s.slug]);
                                setHighlightSearch('');
                                setHighlightDropdownOpen(false);
                              }}
                              className="w-full text-left px-3 py-1.5 text-sm hover:bg-primary-50 transition-colors flex items-center justify-between"
                            >
                              <span className="truncate">{s.name}</span>
                              <span className="text-[10px] text-neutral-400 ml-2 flex-shrink-0">{s.type === 'outfitter' ? 'Outfitter' : s.type === 'campground' ? 'Campground' : 'Cabin & Lodge'}</span>
                            </button>
                          ))}
                        {servicesList.filter(s => !highlightSlugs.includes(s.slug)).filter(s => !highlightSearch || s.name.toLowerCase().includes(highlightSearch.toLowerCase()) || s.slug.toLowerCase().includes(highlightSearch.toLowerCase())).length === 0 && (
                          <div className="px-3 py-2 text-xs text-neutral-400">No matching listings</div>
                        )}
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-neutral-400 mt-1">Only selected listings will be shown in the widget.</p>
                </div>
              </div>

              <WidgetPreview
                src={`${baseUrl}/embed/services/${selectedRiver}?${servicesQueryString}`}
                height={400}
                theme={theme}
              />
              <CodeBlock code={servicesCode} />
              <CopyButton text={servicesCode} large />
            </section>

            <hr className="border-neutral-200" />

            {/* ===== GAUGE REPORT ===== */}
            <section id="gauge-report">
              <h2 className="text-xl font-bold text-neutral-900 mb-1">Gauge Report</h2>
              <p className="text-sm text-neutral-600 mb-4">
                Shows a 7/14/30-day gauge height chart, current reading, and the AI-powered
                &ldquo;Eddy Says&rdquo; condition report. Great for giving visitors a quick
                visual sense of river conditions over time.
              </p>

              <WidgetPreview
                src={`${baseUrl}/embed/gauge-report/${selectedRiver}?theme=${theme}`}
                height={480}
                theme={theme}
              />

              <CodeBlock code={gaugeReportCode} />
              <CopyButton text={gaugeReportCode} large />

              <div className="mt-4">
                <h4 className="text-sm font-semibold text-neutral-700 mb-2">Parameters</h4>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div className="bg-neutral-50 rounded-lg px-3 py-2">
                    <code className="font-mono text-primary-600">theme</code>
                    <p className="text-neutral-500 mt-0.5">light / dark</p>
                  </div>
                  <div className="bg-neutral-50 rounded-lg px-3 py-2">
                    <code className="font-mono text-primary-600">days</code>
                    <p className="text-neutral-500 mt-0.5">7 / 14 / 30 (default chart period)</p>
                  </div>
                  <div className="bg-neutral-50 rounded-lg px-3 py-2">
                    <code className="font-mono text-primary-600">partner</code>
                    <p className="text-neutral-500 mt-0.5">Your business name</p>
                  </div>
                </div>
              </div>
            </section>

            <hr className="border-neutral-200" />

            {/* ===== CONDITION BADGE ===== */}
            <section id="condition-badge">
              <h2 className="text-xl font-bold text-neutral-900 mb-1">Condition Badge</h2>
              <p className="text-sm text-neutral-600 mb-4">
                Compact inline badge with river name and live condition dot.
                Great for sidebars and blog posts.
              </p>

              <div className="mb-4">
                <p className="text-xs text-neutral-400 mb-2 uppercase tracking-wide font-semibold">Live Preview</p>
                <div className={`rounded-xl border-2 p-6 flex justify-center ${theme === 'dark' ? 'border-neutral-700 bg-neutral-800' : 'border-neutral-200 bg-neutral-50'}`}>
                  <iframe
                    src={`${baseUrl}/embed/badge/${selectedRiver}?theme=${theme}`}
                    width="280"
                    height="44"
                    style={{ border: 'none', overflow: 'hidden' }}
                    title="Badge preview"
                  />
                </div>
              </div>

              <CodeBlock code={badgeCode} />
              <CopyButton text={badgeCode} large />
            </section>

            <hr className="border-neutral-200" />

            {/* ===== PARAMETERS REFERENCE ===== */}
            <section id="parameters">
              <h2 className="text-xl font-bold text-neutral-900 mb-1">Parameters Reference</h2>
              <p className="text-sm text-neutral-600 mb-4">
                All widgets accept URL query parameters to customize behavior.
                Add these to the <code className="bg-neutral-100 px-1 py-0.5 rounded text-xs">src</code> URL in the iframe.
              </p>

              <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-neutral-100 bg-neutral-50">
                  <h4 className="text-sm font-semibold text-neutral-800">All Widgets</h4>
                </div>
                <div className="px-4 py-2">
                  <table className="w-full">
                    <tbody>
                      <ParamRow name="theme" values="light | dark" description="Widget color scheme. Defaults to light." />
                      <ParamRow name="partner" values="string" description='Shows "via YourBusiness" in the widget footer.' />
                    </tbody>
                  </table>
                </div>

                <div className="px-4 py-3 border-b border-t border-neutral-100 bg-neutral-50">
                  <h4 className="text-sm font-semibold text-neutral-800">Float Trip Planner</h4>
                </div>
                <div className="px-4 py-2">
                  <table className="w-full">
                    <tbody>
                      <ParamRow name="river" values="slug" description="Pre-select a river (e.g. current, meramec)." />
                    </tbody>
                  </table>
                </div>

                <div className="px-4 py-3 border-b border-t border-neutral-100 bg-neutral-50">
                  <h4 className="text-sm font-semibold text-neutral-800">Services Directory</h4>
                </div>
                <div className="px-4 py-2">
                  <table className="w-full">
                    <tbody>
                      <ParamRow name="type" values="outfitter | campground | cabin_lodge" description="Show only one service type. Use the filter buttons above to set this." />
                      <ParamRow name="highlight" values="slug,slug,..." description="Show only specific listings. Comma-separated slugs." />
                    </tbody>
                  </table>
                </div>
              </div>
            </section>

            <hr className="border-neutral-200" />

            {/* ===== API ACCESS ===== */}
            <section id="api">
              <h2 className="text-xl font-bold text-neutral-900 mb-1">API Access</h2>
              <p className="text-sm text-neutral-600 mb-4">
                Fetch data directly and build your own display.
              </p>

              <div className="space-y-4">
                <div>
                  <CodeBlock code={`GET ${baseUrl}/api/rivers`} label="Rivers — conditions, lengths, access point counts" />
                </div>
                <div>
                  <CodeBlock code={`GET ${baseUrl}/api/rivers/{slug}/services`} label="Services — outfitters, campgrounds, lodging for a river" />
                </div>
                <div>
                  <CodeBlock code={`GET ${baseUrl}/api/gauges`} label="Gauges — all gauge stations with latest readings and thresholds" />
                </div>
              </div>

              <div className="mt-4 bg-amber-50 border border-amber-200 rounded-xl p-4">
                <h4 className="text-sm font-semibold text-amber-800 mb-1">Rate Limits</h4>
                <p className="text-xs text-amber-700">
                  API endpoints are rate limited per IP. The rivers and gauges endpoints allow
                  60 requests per minute. The services endpoint allows 60 requests per minute.
                  The plan endpoint allows 30 requests per minute.
                  Exceeding the limit returns a <code className="bg-amber-100 px-1 py-0.5 rounded">429</code> response
                  with a <code className="bg-amber-100 px-1 py-0.5 rounded">Retry-After</code> header.
                  Embed widgets handle caching automatically.
                </p>
              </div>
            </section>

            {/* CTA */}
            <section className="bg-white border-2 border-primary-200 rounded-xl p-6 text-center">
              <h3 className="font-bold text-neutral-900 mb-2">Running an Outfitter or Campground?</h3>
              <p className="text-sm text-neutral-600 mb-4 max-w-md mx-auto">
                We&apos;d love to partner with you. Get custom widgets, priority support,
                and help driving visitors to your business.
              </p>
              <button
                onClick={() => setFeedbackOpen(true)}
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-white text-sm font-semibold transition-colors cursor-pointer"
                style={{ backgroundColor: '#F07052' }}
              >
                Contact Us
              </button>
            </section>

            <div className="text-center">
              <Link
                href="/"
                className="text-primary-600 hover:text-primary-700 font-medium text-sm"
              >
                &larr; Back to Eddy
              </Link>
              <SiteFooter maxWidth="max-w-full" className="mt-16" />
            </div>
          </main>
        </div>
      </div>

      <FeedbackModal
        isOpen={feedbackOpen}
        onClose={() => setFeedbackOpen(false)}
      />
    </div>
  );
}
