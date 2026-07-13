'use client';

// src/components/embed/EmbedWorkbench.tsx
// "Workbench" UI for adding Eddy river widgets to external websites.
// Top bar + left rail (Configure + widget picker) + right workspace with
// Preview / Code / Install tabs. One widget is configured and shown at a time.
// The current configuration is synced to the URL so a setup can be bookmarked
// or shared. The Docs / API top-bar links open a Reference view (params + API).

import { useState, useEffect, useRef, type KeyboardEvent } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Copy, Check, ChevronDown, X, Search, ArrowLeft } from 'lucide-react';
import PartnerModal from '@/components/embed/PartnerModal';
import { EDDY_IMAGES } from '@/constants';

// Production origin for the copy-paste snippet + API examples, so code copied
// from a preview/staging deploy still points at the live site (not the preview).
const EMBED_BASE = process.env.NEXT_PUBLIC_SITE_URL || 'https://eddy.guide';

// Static fallback shown until /api/rivers loads (and if it fails). The live
// list is DB-driven so new rivers/states appear here without a code change.
const FALLBACK_RIVER_OPTIONS = [
  { slug: 'meramec', name: 'Meramec River' },
  { slug: 'current', name: 'Current River' },
  { slug: 'eleven-point', name: 'Eleven Point River' },
  { slug: 'jacks-fork', name: 'Jacks Fork' },
  { slug: 'niangua', name: 'Niangua River' },
  { slug: 'big-piney', name: 'Big Piney River' },
  { slug: 'huzzah', name: 'Huzzah Creek' },
  { slug: 'courtois', name: 'Courtois Creek' },
];

// Audience presets — shortcuts, not gates: picking one jumps to the widget
// that fits that business best, but every widget stays available to everyone.
const AUDIENCES: { key: string; label: string; widget: string; blurb: string }[] = [
  {
    key: 'outfitter',
    label: 'Outfitter',
    widget: 'planner',
    blurb: 'Turn lookers into bookings — visitors plan their float right on your site, with your co-branding.',
  },
  {
    key: 'campground',
    label: 'Campground',
    widget: 'card',
    blurb: 'Show guests the river is floatable from your campground, with your nearest launch and a real drive time.',
  },
  {
    key: 'rental',
    label: 'Airbnb / Cabin',
    widget: 'card',
    blurb: 'Answer every guest’s first question — "can we float today?" — right on your listing page.',
  },
  {
    key: 'blogger',
    label: 'Blogger / News',
    widget: 'badge',
    blurb: 'Drop a live condition badge or a gauge chart into any post — always current, zero maintenance.',
  },
];

const SERVICE_CATEGORIES = [
  { value: 'all', label: 'All Services' },
  { value: 'outfitter', label: 'Outfitters' },
  { value: 'campground', label: 'Campgrounds' },
  { value: 'cabin_lodge', label: 'Cabins & Lodges' },
] as const;

const INSTALL_GUIDES = [
  { name: 'WordPress', steps: 'Edit a page → add a Custom HTML block → paste the code → Update.' },
  { name: 'Squarespace', steps: 'Add a block → under "More" choose Code → paste → Save.' },
  { name: 'Wix', steps: 'Add → Embed Code → Embed HTML → paste → Apply.' },
  { name: 'Anything else', steps: 'Look for a "Custom HTML" / "Embed Code" option. The iframe works anywhere.' },
];

// Internal links so the workbench isn't a navigation dead-end (mirrors SiteHeader).
const SITE_LINKS = [
  { href: '/plan', label: 'Plan a Float' },
  { href: '/rivers', label: 'River Reports' },
  { href: '/blog', label: 'Guides' },
  { href: '/about', label: 'About' },
];

type ThemeMode = 'light' | 'dark';
type ServiceFilter = 'all' | 'outfitter' | 'campground' | 'cabin_lodge';
type WidgetTab = 'preview' | 'code' | 'install';
const TABS: WidgetTab[] = ['preview', 'code', 'install'];

interface WidgetCtx {
  baseUrl: string;     // current origin — used for the live preview iframe
  embedBase: string;   // production origin — used for the copied snippet
  selectedRiver: string;
  selectedRiverName: string;
  theme: ThemeMode;
  serviceFilter: ServiceFilter;
  highlightSlugs: string[];
  gaugeDays: number;
  resizeScript: string;
  cardEmbedId: string | null; // set once the location-pinned card is created
  brandingId: string | null;  // set once "Add your branding" has been completed
  multiRivers: string[];      // rivers shown by the multi-river overview
}

// Append the co-branding registration (?e=emb_xxxxxxxx) to a widget URL.
// Card URLs are already keyed by their own embed id, so they never use this.
function withBrandingId(url: string, c: WidgetCtx): string {
  if (!c.brandingId) return url;
  return `${url}${url.includes('?') ? '&' : '?'}e=${c.brandingId}`;
}

interface WidgetParam {
  name: string;
  values: string;
  note?: string;
}

// Shape returned by POST /api/embed/resolve (see src/lib/embed/cards.ts)
interface CardResolveResult {
  lat: number;
  lng: number;
  rivers: { riverId: string; slug: string; name: string; state: string; distanceMiles: number }[];
  accessPoints: {
    accessPointId: string;
    name: string;
    riverId: string;
    riverSlug: string;
    riverName: string;
    distanceMiles: number;
  }[];
}

interface WidgetDef {
  key: string;
  title: string;
  badge?: string;
  badgeBg?: string;
  desc: string;
  previewHeight: number;
  buildSrc: (c: WidgetCtx) => string;
  buildCode: (c: WidgetCtx) => string;
  params: WidgetParam[];
  hasFilters?: boolean;
  hasDays?: boolean;
  isBadge?: boolean;
  hasCardSetup?: boolean; // location-pinned card: onboarding form instead of river picker
  hasMultiRivers?: boolean; // multi-river overview: picks several rivers instead of one
}

// Standard responsive iframe snippet (auto-resizes, no hardcoded height).
function standardIframe(src: string, title: string, resizeScript: string) {
  return `<iframe
  src="${src}"
  data-eddy-embed
  width="100%"
  style="border:none; border-radius:12px; max-width:600px; width:100%; display:block; margin:0 auto;"
  title="${title}"
  loading="lazy"
></iframe>
${resizeScript}`;
}

// Fixed-width inline snippet for the compact condition badge.
function badgeIframe(src: string, title: string, resizeScript: string) {
  return `<iframe
  src="${src}"
  data-eddy-embed
  width="280"
  style="border:none; overflow:hidden; display:inline-block; vertical-align:middle; max-width:100%;"
  title="${title}"
  loading="lazy"
></iframe>
${resizeScript}`;
}

// Services accepts theme + optional type + optional highlight slugs.
function servicesQuery(c: WidgetCtx) {
  const p = new URLSearchParams({ theme: c.theme });
  if (c.serviceFilter !== 'all') p.set('type', c.serviceFilter);
  if (c.highlightSlugs.length > 0) p.set('highlight', c.highlightSlugs.join(','));
  return p.toString();
}

// Multi-river overview accepts theme + an ordered rivers list.
function riversQuery(c: WidgetCtx) {
  const p = new URLSearchParams({ theme: c.theme });
  if (c.multiRivers.length > 0) p.set('rivers', c.multiRivers.join(','));
  return p.toString();
}

const WIDGETS: WidgetDef[] = [
  {
    key: 'card',
    title: 'Floatable From Here',
    badge: 'NEW',
    badgeBg: '#F07052',
    desc: 'Pin your business location once. The card answers "is the water floatable from here right now?", shows how far your nearest launch is with real drive time, and puts YOUR booking button front and center.',
    previewHeight: 300,
    buildSrc: (c) => (c.cardEmbedId ? `${c.baseUrl}/embed/card/${c.cardEmbedId}?theme=${c.theme}` : ''),
    buildCode: (c) =>
      c.cardEmbedId
        ? standardIframe(`${c.embedBase}/embed/card/${c.cardEmbedId}?theme=${c.theme}`, 'Floatable From Here - Live River Conditions', c.resizeScript)
        : '<!-- Enter your business address on the Preview tab to generate your card\'s embed code. -->',
    params: [
      { name: 'theme', values: 'light | dark', note: 'Card color scheme.' },
    ],
    hasCardSetup: true,
  },
  {
    key: 'current',
    title: 'Live Conditions',
    badge: 'REC',
    badgeBg: '#256574',
    desc: 'Gauge readings, weather, condition badge and a 14-day trend chart. Updates automatically.',
    previewHeight: 480,
    buildSrc: (c) => withBrandingId(`${c.baseUrl}/embed/widget/${c.selectedRiver}?theme=${c.theme}`, c),
    buildCode: (c) => standardIframe(withBrandingId(`${c.embedBase}/embed/widget/${c.selectedRiver}?theme=${c.theme}`, c), `${c.selectedRiverName} - River Conditions from Eddy`, c.resizeScript),
    params: [
      { name: 'theme', values: 'light / dark' },
      { name: 'partner', values: 'your business name', note: 'Shows "via YourBusiness" credit in the widget footer.' },
    ],
  },
  {
    key: 'quote',
    title: "Eddy's Daily Quote",
    desc: "Eddy's plain-language read on the river, the current gauge reading, today's weather, and a clear float / no-float verdict. Great for lodging and outfitter sites. Updates throughout the day.",
    previewHeight: 300,
    buildSrc: (c) => withBrandingId(`${c.baseUrl}/embed/eddy-quote/${c.selectedRiver}?theme=${c.theme}`, c),
    buildCode: (c) => standardIframe(withBrandingId(`${c.embedBase}/embed/eddy-quote/${c.selectedRiver}?theme=${c.theme}`, c), `${c.selectedRiverName} - Eddy's Take`, c.resizeScript),
    params: [
      { name: 'theme', values: 'light / dark' },
      { name: 'partner', values: 'your business name', note: 'Shows "via YourBusiness" credit in the widget footer.' },
    ],
  },
  {
    key: 'planner',
    title: 'Float Trip Planner',
    badge: 'OUTFITTERS',
    badgeBg: '#F07052',
    desc: 'Visitors pick a put-in and take-out and get shuttle distance, float time, conditions, and the outfitters on that stretch. The selected river is pre-selected but visitors can change it.',
    previewHeight: 420,
    buildSrc: (c) => withBrandingId(`${c.baseUrl}/embed/planner?river=${c.selectedRiver}&theme=${c.theme}`, c),
    buildCode: (c) => standardIframe(withBrandingId(`${c.embedBase}/embed/planner?river=${c.selectedRiver}&theme=${c.theme}`, c), 'Plan Your Float - Eddy', c.resizeScript),
    params: [
      { name: 'theme', values: 'light / dark' },
      { name: 'river', values: 'slug', note: 'Pre-select a river (e.g. current, meramec).' },
      { name: 'partner', values: 'your business name', note: 'Shows "via YourBusiness" credit in the widget footer.' },
    ],
  },
  {
    key: 'services',
    title: 'Services Directory',
    badge: 'NEW',
    badgeBg: '#419959',
    desc: 'Nearby outfitters, campgrounds (including NPS sites reservable via recreation.gov) and lodging with one-tap click-to-call, website, and reservation links.',
    previewHeight: 400,
    hasFilters: true,
    buildSrc: (c) => withBrandingId(`${c.baseUrl}/embed/services/${c.selectedRiver}?${servicesQuery(c)}`, c),
    buildCode: (c) => standardIframe(withBrandingId(`${c.embedBase}/embed/services/${c.selectedRiver}?${servicesQuery(c)}`, c), `${c.selectedRiverName} - Outfitters & Services from Eddy`, c.resizeScript),
    params: [
      { name: 'theme', values: 'light / dark' },
      { name: 'type', values: 'outfitter / campground / cabin_lodge', note: 'Set with the category filter above.' },
      { name: 'highlight', values: 'slug,slug,...', note: 'Show only specific listings (set above).' },
      { name: 'exclude', values: 'outfitter / campground / cabin_lodge', note: 'Hide service types (comma-separated; ignored when type is set).' },
      { name: 'partner', values: 'your business name' },
    ],
  },
  {
    key: 'gauge',
    title: 'Gauge Report',
    desc: 'A 7 / 14 / 30-day gauge height chart, current reading, and the "Eddy Says" weekly read. Great for a quick visual sense of conditions over time.',
    previewHeight: 480,
    hasDays: true,
    buildSrc: (c) => withBrandingId(`${c.baseUrl}/embed/gauge-report/${c.selectedRiver}?theme=${c.theme}&days=${c.gaugeDays}`, c),
    buildCode: (c) => standardIframe(withBrandingId(`${c.embedBase}/embed/gauge-report/${c.selectedRiver}?theme=${c.theme}&days=${c.gaugeDays}`, c), `${c.selectedRiverName} - Gauge Report from Eddy`, c.resizeScript),
    params: [
      { name: 'theme', values: 'light / dark' },
      { name: 'days', values: '7 / 14 / 30', note: 'Default chart period.' },
      { name: 'partner', values: 'your business name' },
    ],
  },
  {
    key: 'rivers',
    title: 'Multi-River Overview',
    badge: 'NEW',
    badgeBg: '#419959',
    desc: 'Live condition rows for several rivers at once — for outfitters serving more than one river and regional tourism pages. Pick which rivers to show below.',
    previewHeight: 340,
    hasMultiRivers: true,
    buildSrc: (c) => withBrandingId(`${c.baseUrl}/embed/rivers?${riversQuery(c)}`, c),
    buildCode: (c) => standardIframe(withBrandingId(`${c.embedBase}/embed/rivers?${riversQuery(c)}`, c), 'River Conditions from Eddy', c.resizeScript),
    params: [
      { name: 'theme', values: 'light / dark' },
      { name: 'rivers', values: 'slug,slug,...', note: 'Which rivers to show, in order (max 8). Omit for all rivers.' },
      { name: 'partner', values: 'your business name' },
    ],
  },
  {
    key: 'badge',
    title: 'Condition Badge',
    desc: 'Compact inline status badge with the river name and a live condition dot. Perfect for sidebars, blog posts and footers.',
    previewHeight: 52,
    isBadge: true,
    buildSrc: (c) => `${c.baseUrl}/embed/badge/${c.selectedRiver}?theme=${c.theme}`,
    buildCode: (c) => badgeIframe(`${c.embedBase}/embed/badge/${c.selectedRiver}?theme=${c.theme}`, `${c.selectedRiverName} - Condition Badge from Eddy`, c.resizeScript),
    params: [
      { name: 'theme', values: 'light / dark' },
    ],
  },
];

function CopyButton({ text, large = false }: { text: string; large?: boolean }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (large) {
    return (
      <button
        onClick={handleCopy}
        className={`flex items-center justify-center gap-2 w-full px-4 py-3 font-semibold rounded-lg text-sm text-white transition-colors ${
          copied ? 'bg-support-600' : 'bg-accent-500 hover:bg-accent-600'
        }`}
      >
        {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
        {copied ? 'Copied to clipboard!' : 'Copy code'}
      </button>
    );
  }

  return (
    <button
      onClick={handleCopy}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md text-white transition-colors ${
        copied ? 'bg-support-600' : 'bg-accent-500 hover:bg-accent-600'
      }`}
    >
      {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
      {copied ? 'Copied' : 'Copy code'}
    </button>
  );
}

function CodeBlock({ code, label = 'HTML' }: { code: string; label?: string }) {
  return (
    <div className="rounded-lg overflow-hidden border-2 border-neutral-900 shadow-md min-w-0" style={{ background: '#0F2D35' }}>
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-primary-700 gap-3">
        <span className="text-xs font-mono text-primary-300 truncate">{label}</span>
        <CopyButton text={code} />
      </div>
      <pre className="m-0 p-4 text-xs leading-relaxed font-mono overflow-x-auto max-w-full" style={{ color: '#D4EAEF', whiteSpace: 'pre' }}>
        <code>{code}</code>
      </pre>
    </div>
  );
}

function WidgetPreview({ src, height, theme, maxWidth = 540 }: { src: string; height?: number; theme: ThemeMode; maxWidth?: number }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [measuredHeight, setMeasuredHeight] = useState<number | undefined>(height);
  const [measuredWidth, setMeasuredWidth] = useState<number | undefined>(undefined);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      const data = e.data as { type?: string; height?: number; width?: number } | null;
      if (!data || data.type !== 'eddy-embed:resize' || typeof data.height !== 'number') return;
      if (ref.current && ref.current.contentWindow === e.source) {
        setMeasuredHeight(data.height);
        // Shrink-to-fit widgets (badge) report a width so the preview hugs them.
        if (typeof data.width === 'number') setMeasuredWidth(data.width);
      }
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  // Reset height + loading state when the src changes so we don't show a stale
  // frame (or a stale height) while the new widget loads.
  useEffect(() => {
    setMeasuredHeight(height);
    setMeasuredWidth(undefined);
    setLoaded(false);
  }, [src, height]);

  const dark = theme === 'dark';
  return (
    <div
      className="rounded-xl border-2 border-dashed flex justify-center p-6 md:p-9"
      style={{ background: dark ? '#0F2D35' : '#EDEBE6', borderColor: dark ? '#2D5660' : '#C2BAAC' }}
    >
      <div className="relative w-full" style={{ maxWidth }}>
        {!loaded && (
          <div className="absolute inset-0 flex items-center justify-center" style={{ minHeight: 64 }}>
            <span
              className="inline-block w-6 h-6 rounded-full border-2 border-primary-200 border-t-primary-600 animate-spin"
              role="status"
              aria-label="Loading preview"
            />
          </div>
        )}
        <iframe
          ref={ref}
          src={src}
          width={measuredWidth ?? '100%'}
          height={measuredHeight}
          onLoad={() => setLoaded(true)}
          style={{ border: 'none', borderRadius: '12px', display: 'block', margin: '0 auto', opacity: loaded ? 1 : 0, transition: 'opacity 150ms ease' }}
          title="Widget preview"
        />
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

export default function EmbedWorkbench() {
  const [riverOptions, setRiverOptions] = useState(FALLBACK_RIVER_OPTIONS);
  const [selectedRiver, setSelectedRiver] = useState('current');
  const [theme, setTheme] = useState<ThemeMode>('light');
  const [activeWidget, setActiveWidget] = useState('current');
  const [activeTab, setActiveTab] = useState<WidgetTab>('preview');
  const [showReference, setShowReference] = useState(false);
  const [refAnchor, setRefAnchor] = useState<'params' | 'api' | null>(null);
  const [gaugeDays, setGaugeDays] = useState(14);
  const [serviceFilter, setServiceFilter] = useState<ServiceFilter>('all');
  const [highlightSlugs, setHighlightSlugs] = useState<string[]>([]);
  const [servicesList, setServicesList] = useState<{ slug: string; name: string; type: string }[]>([]);
  const [servicesError, setServicesError] = useState(false);
  const [highlightSearch, setHighlightSearch] = useState('');
  const [highlightDropdownOpen, setHighlightDropdownOpen] = useState(false);
  const [partnerOpen, setPartnerOpen] = useState(false);
  const [preset, setPreset] = useState<string | null>(null);
  const [multiRivers, setMultiRivers] = useState<string[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const highlightRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<Partial<Record<WidgetTab, HTMLButtonElement | null>>>({});

  // --- "Floatable From Here" card onboarding state ---
  const [cardForm, setCardForm] = useState({
    address: '',
    businessName: '',
    logoUrl: '',
    accentColor: '#2D7889',
    ctaUrl: '',
    ctaLabel: 'Book your trip',
  });
  const [cardResolve, setCardResolve] = useState<CardResolveResult | null>(null);
  const [cardAccessPointId, setCardAccessPointId] = useState('');
  const [cardBusy, setCardBusy] = useState(false);
  const [cardError, setCardError] = useState<string | null>(null);
  const [cardEmbedId, setCardEmbedId] = useState<string | null>(null);

  // --- "Add your branding" (co-branding for any widget) state ---
  const [brandingId, setBrandingId] = useState<string | null>(null);
  const [brandingOpen, setBrandingOpen] = useState(false);
  const [brandingForm, setBrandingForm] = useState({
    businessName: '',
    siteUrl: '',
    logoUrl: '',
    accentColor: '#2D7889',
  });
  const [brandingBusy, setBrandingBusy] = useState(false);
  const [brandingError, setBrandingError] = useState<string | null>(null);

  const registerBranding = async () => {
    if (!brandingForm.businessName.trim() || brandingBusy) return;
    setBrandingBusy(true);
    setBrandingError(null);
    try {
      const res = await fetch('/api/embed/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessName: brandingForm.businessName.trim(),
          siteUrl: brandingForm.siteUrl.trim() || undefined,
          logoUrl: brandingForm.logoUrl.trim() || undefined,
          accentColor: brandingForm.accentColor,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.branding?.embedId) {
        setBrandingError(data?.error || 'Could not save your branding. Try again.');
        return;
      }
      setBrandingId(data.branding.embedId);
    } catch {
      setBrandingError('Something went wrong saving your branding. Try again.');
    } finally {
      setBrandingBusy(false);
    }
  };

  const resolveCardLocation = async () => {
    if (!cardForm.address.trim() || cardBusy) return;
    setCardBusy(true);
    setCardError(null);
    setCardResolve(null);
    setCardEmbedId(null);
    try {
      const res = await fetch('/api/embed/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: cardForm.address.trim() }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.accessPoints?.length) {
        setCardError(data?.error || 'Could not find a float river near that address.');
        return;
      }
      setCardResolve(data as CardResolveResult);
      setCardAccessPointId((data as CardResolveResult).accessPoints[0].accessPointId);
    } catch {
      setCardError('Something went wrong looking up that address. Try again.');
    } finally {
      setCardBusy(false);
    }
  };

  const createCard = async () => {
    if (!cardResolve || !cardAccessPointId || cardBusy) return;
    const launch = cardResolve.accessPoints.find(a => a.accessPointId === cardAccessPointId);
    if (!launch) return;
    setCardBusy(true);
    setCardError(null);
    try {
      const res = await fetch('/api/embed/cards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lat: cardResolve.lat,
          lng: cardResolve.lng,
          address: cardForm.address.trim(),
          businessName: cardForm.businessName.trim() || undefined,
          riverId: launch.riverId,
          accessPointId: launch.accessPointId,
          logoUrl: cardForm.logoUrl.trim() || undefined,
          accentColor: cardForm.accentColor,
          ctaUrl: cardForm.ctaUrl.trim() || undefined,
          ctaLabel: cardForm.ctaLabel.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.card?.embedId) {
        setCardError(data?.error || 'Could not create your card. Try again.');
        return;
      }
      setCardEmbedId(data.card.embedId);
    } catch {
      setCardError('Something went wrong creating your card. Try again.');
    } finally {
      setCardBusy(false);
    }
  };

  // Hydrate state from the URL once on mount so a shared/bookmarked config
  // (and a refresh) restores the same widget, river, theme and tab.
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const w = sp.get('widget');
    if (w && WIDGETS.some(x => x.key === w)) setActiveWidget(w);
    // Accept any slug-shaped value: the live river list loads async, so a
    // shared link to a river outside the static fallback must still hydrate.
    const r = sp.get('river');
    if (r && /^[a-z0-9-]+$/.test(r)) setSelectedRiver(r);
    const t = sp.get('theme');
    if (t === 'light' || t === 'dark') setTheme(t);
    const tab = sp.get('tab');
    if (tab === 'preview' || tab === 'code' || tab === 'install') setActiveTab(tab);
    const f = sp.get('type');
    if (f === 'outfitter' || f === 'campground' || f === 'cabin_lodge') setServiceFilter(f);
    const d = sp.get('days');
    if (d === '7' || d === '14' || d === '30') setGaugeDays(Number(d));
    const pr = sp.get('preset');
    if (pr && AUDIENCES.some(a => a.key === pr)) setPreset(pr);
    const mr = sp.get('rivers');
    if (mr) setMultiRivers(mr.split(',').map(s => s.trim()).filter(s => /^[a-z0-9-]+$/.test(s)).slice(0, 8));
    const e = sp.get('e');
    if (e && /^emb_[0-9a-f]{8}$/.test(e)) setBrandingId(e);
    if (sp.get('view') === 'reference') setShowReference(true);
    setHydrated(true);
  }, []);

  // Mirror the current config back into the URL (replaceState — no history spam).
  // Gated on `hydrated` so the initial read isn't clobbered by default values.
  useEffect(() => {
    if (!hydrated) return;
    const sp = new URLSearchParams();
    if (activeWidget !== 'current') sp.set('widget', activeWidget);
    if (selectedRiver !== 'current') sp.set('river', selectedRiver);
    if (theme !== 'light') sp.set('theme', theme);
    if (activeTab !== 'preview') sp.set('tab', activeTab);
    if (serviceFilter !== 'all') sp.set('type', serviceFilter);
    if (gaugeDays !== 14) sp.set('days', String(gaugeDays));
    if (preset) sp.set('preset', preset);
    if (brandingId) sp.set('e', brandingId);
    if (multiRivers.length > 0) sp.set('rivers', multiRivers.join(','));
    if (showReference) sp.set('view', 'reference');
    const qs = sp.toString();
    window.history.replaceState(null, '', qs ? `?${qs}` : window.location.pathname);
  }, [hydrated, activeWidget, selectedRiver, theme, activeTab, serviceFilter, gaugeDays, preset, brandingId, multiRivers, showReference]);

  // Load the live river list (DB-driven) so new rivers show up without a deploy.
  useEffect(() => {
    let cancelled = false;
    fetch('/api/rivers')
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (cancelled || !data?.rivers?.length) return;
        setRiverOptions(
          data.rivers.map((r: { slug: string; name: string }) => ({ slug: r.slug, name: r.name }))
        );
      })
      .catch(() => {}); // keep the static fallback
    return () => { cancelled = true; };
  }, []);

  // Fetch the services list for the selected river (powers the highlight picker).
  useEffect(() => {
    let cancelled = false;
    setServicesError(false);
    fetch(`/api/rivers/${selectedRiver}/services`)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(data => {
        if (cancelled) return;
        setServicesList(
          (data?.services ?? [])
            .filter((s: { status: string }) => s.status === 'active' || s.status === 'seasonal')
            .map((s: { slug: string; name: string; type: string }) => ({ slug: s.slug, name: s.name, type: s.type }))
        );
      })
      .catch(() => {
        if (!cancelled) { setServicesList([]); setServicesError(true); }
      });
    setHighlightSlugs([]);
    return () => { cancelled = true; };
  }, [selectedRiver]);

  // Close the highlight dropdown on outside click.
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (highlightRef.current && !highlightRef.current.contains(e.target as Node)) {
        setHighlightDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Scroll the Reference view to the requested section once it has rendered.
  useEffect(() => {
    if (showReference && refAnchor) {
      document.getElementById(`ref-${refAnchor}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setRefAnchor(null);
    }
  }, [showReference, refAnchor]);

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : EMBED_BASE;
  const selectedRiverName = riverOptions.find(r => r.slug === selectedRiver)?.name || selectedRiver;

  // Tiny self-resize listener appended to every snippet. Installs once on the
  // host page; matches iframes by event.source so multiple Eddy widgets coexist.
  const resizeScript = `<script>(function(){if(window.__eddyEmbedResizer)return;window.__eddyEmbedResizer=1;window.addEventListener("message",function(e){var d=e&&e.data;if(!d||d.type!=="eddy-embed:resize"||typeof d.height!=="number")return;var f=document.querySelectorAll("iframe[data-eddy-embed]");for(var i=0;i<f.length;i++){if(f[i].contentWindow===e.source){f[i].style.height=d.height+"px";if(typeof d.width==="number"){f[i].style.width=d.width+"px";}break;}}});})();</script>`;

  const ctx: WidgetCtx = {
    baseUrl, embedBase: EMBED_BASE, selectedRiver, selectedRiverName, theme,
    serviceFilter, highlightSlugs, gaugeDays, resizeScript, cardEmbedId, brandingId, multiRivers,
  };

  const active = WIDGETS.find(w => w.key === activeWidget) ?? WIDGETS[0];
  const themeLabel = theme === 'dark' ? 'Dark' : 'Light';
  const previewRoute = active.buildSrc(ctx).replace(baseUrl, '');

  const selectWidget = (key: string) => {
    setActiveWidget(key);
    setActiveTab('preview');
    setShowReference(false);
  };

  const selectPreset = (key: string) => {
    if (preset === key) {
      setPreset(null);
      return;
    }
    setPreset(key);
    const audience = AUDIENCES.find(a => a.key === key);
    if (audience) selectWidget(audience.widget);
  };

  const openReference = (anchor: 'params' | 'api') => {
    setShowReference(true);
    setRefAnchor(anchor);
  };

  const onTabKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const i = TABS.indexOf(activeTab);
    const next = e.key === 'ArrowRight' ? TABS[(i + 1) % TABS.length] : TABS[(i - 1 + TABS.length) % TABS.length];
    setActiveTab(next);
    tabRefs.current[next]?.focus();
  };

  // Per-widget interactive controls, rendered atop the Preview and Code tabs so
  // the preview and the generated snippet stay in sync from one piece of state.
  const renderWidgetOptions = () => {
    if (active.hasCardSetup) {
      const inputCls = 'w-full text-sm text-neutral-800 bg-white rounded-md border-2 border-neutral-200 px-3 py-2 focus:outline-none focus:border-primary-400';
      const labelCls = 'block text-xs font-semibold text-neutral-600 mb-1';
      return (
        <div className="mb-5 bg-white border-2 border-neutral-200 rounded-lg p-4">
          {cardEmbedId ? (
            <div className="flex items-start justify-between gap-3">
              <div>
                <h4 className="text-sm font-semibold text-neutral-800 mb-1">Your card is live</h4>
                <p className="text-xs text-neutral-500 leading-relaxed">
                  Card ID <code className="bg-neutral-100 px-1 py-0.5 rounded">{cardEmbedId}</code> — the preview below is
                  your card. Grab the snippet from the Code tab. Save this page&apos;s URL to find it again.
                </p>
              </div>
              <button
                onClick={() => { setCardEmbedId(null); setCardResolve(null); setCardError(null); }}
                className="flex-none text-xs font-semibold text-neutral-500 hover:text-primary-700 border-2 border-neutral-200 rounded-md px-3 py-1.5"
              >
                Start over
              </button>
            </div>
          ) : (
            <>
              <h4 className="text-sm font-semibold text-neutral-800 mb-1">Set up your card</h4>
              <p className="text-xs text-neutral-500 mb-3 leading-relaxed">
                Enter your business address once. We find your nearest float river and launch point,
                and compute the real drive time from your door.
              </p>
              <div className="flex gap-2 mb-3">
                <input
                  type="text"
                  value={cardForm.address}
                  onChange={e => setCardForm(f => ({ ...f, address: e.target.value }))}
                  onKeyDown={e => { if (e.key === 'Enter') resolveCardLocation(); }}
                  placeholder="123 River Rd, Steelville, MO"
                  aria-label="Business address"
                  className={inputCls}
                />
                <button
                  onClick={resolveCardLocation}
                  disabled={cardBusy || !cardForm.address.trim()}
                  className="flex-none text-sm font-semibold text-white px-4 py-2 rounded-md disabled:opacity-50"
                  style={{ background: '#2D7889' }}
                >
                  {cardBusy && !cardResolve ? 'Looking…' : 'Find my river'}
                </button>
              </div>

              {cardError && (
                <p className="text-xs font-medium text-red-600 mb-3" role="alert">{cardError}</p>
              )}

              {cardResolve && (
                <>
                  <div className="bg-primary-50 border border-primary-200 rounded-md px-3 py-2 mb-3 text-xs text-primary-700 leading-relaxed">
                    Nearest river: <strong>{cardResolve.rivers[0]?.name}</strong>
                    {' '}({cardResolve.rivers[0]?.distanceMiles} mi away)
                    {cardResolve.rivers[1] && (
                      <> &middot; also nearby: {cardResolve.rivers[1].name} ({cardResolve.rivers[1].distanceMiles} mi)</>
                    )}
                    {' — '}confirm your launch below; picking a launch on a different river switches the card to that river.
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                    <div className="sm:col-span-2">
                      <label className={labelCls} htmlFor="card-launch">Your launch (nearest access points)</label>
                      <select
                        id="card-launch"
                        value={cardAccessPointId}
                        onChange={e => setCardAccessPointId(e.target.value)}
                        className={inputCls}
                      >
                        {cardResolve.accessPoints.map(a => (
                          <option key={a.accessPointId} value={a.accessPointId}>
                            {a.name} — {a.riverName} · {a.distanceMiles} mi
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className={labelCls} htmlFor="card-business">Business name</label>
                      <input id="card-business" type="text" value={cardForm.businessName}
                        onChange={e => setCardForm(f => ({ ...f, businessName: e.target.value }))}
                        placeholder="Pine Valley Cabins" className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls} htmlFor="card-logo">Logo URL (optional)</label>
                      <input id="card-logo" type="url" value={cardForm.logoUrl}
                        onChange={e => setCardForm(f => ({ ...f, logoUrl: e.target.value }))}
                        placeholder="https://yoursite.com/logo.png" className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls} htmlFor="card-cta-url">Booking link (your site)</label>
                      <input id="card-cta-url" type="url" value={cardForm.ctaUrl}
                        onChange={e => setCardForm(f => ({ ...f, ctaUrl: e.target.value }))}
                        placeholder="https://yoursite.com/book" className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls} htmlFor="card-cta-label">Button text</label>
                      <input id="card-cta-label" type="text" value={cardForm.ctaLabel}
                        onChange={e => setCardForm(f => ({ ...f, ctaLabel: e.target.value }))}
                        placeholder="Book your trip" className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls} htmlFor="card-accent">Accent color</label>
                      <input id="card-accent" type="color" value={cardForm.accentColor}
                        onChange={e => setCardForm(f => ({ ...f, accentColor: e.target.value }))}
                        className="h-9 w-16 bg-white border-2 border-neutral-200 rounded-md cursor-pointer" />
                    </div>
                  </div>
                  <button
                    onClick={createCard}
                    disabled={cardBusy || !cardAccessPointId}
                    className="text-sm font-semibold text-white px-5 py-2.5 rounded-md disabled:opacity-50"
                    style={{ background: '#F07052', boxShadow: '2px 2px 0 #A33122' }}
                  >
                    {cardBusy ? 'Creating…' : 'Create my card'}
                  </button>
                </>
              )}
            </>
          )}
        </div>
      );
    }

    if (active.hasMultiRivers) {
      return (
        <div className="mb-5 bg-white border-2 border-neutral-200 rounded-lg p-4">
          <h4 className="text-sm font-semibold text-neutral-800 mb-1">Which rivers?</h4>
          <p className="text-xs text-neutral-500 mb-3 leading-relaxed">
            Toggle up to 8 rivers, in the order you want them shown. Leave all off to show every river.
          </p>
          <div className="flex flex-wrap gap-2">
            {riverOptions.map(r => {
              const idx = multiRivers.indexOf(r.slug);
              const isOn = idx !== -1;
              return (
                <button
                  key={r.slug}
                  onClick={() => {
                    setMultiRivers(prev => isOn
                      ? prev.filter(s => s !== r.slug)
                      : prev.length >= 8 ? prev : [...prev, r.slug]);
                  }}
                  aria-pressed={isOn}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium border-2 transition-all ${
                    isOn
                      ? 'border-primary-500 bg-primary-50 text-primary-700'
                      : 'border-neutral-200 bg-white text-neutral-600 hover:border-neutral-300'
                  }`}
                >
                  {isOn && <span className="text-[10px] font-bold mr-1.5 text-primary-500">{idx + 1}</span>}
                  {r.name}
                </button>
              );
            })}
          </div>
        </div>
      );
    }

    if (active.hasDays) {
      return (
        <div className="mb-5">
          <label className="block text-xs font-bold uppercase tracking-wide text-neutral-500 mb-2">Default chart period</label>
          <div className="inline-flex rounded-md border-2 border-neutral-200 overflow-hidden" role="group" aria-label="Default chart period">
            {[7, 14, 30].map(d => (
              <button
                key={d}
                onClick={() => setGaugeDays(d)}
                aria-pressed={gaugeDays === d}
                className={`px-4 py-2 text-sm font-semibold transition-colors ${
                  gaugeDays === d ? 'bg-primary-600 text-white' : 'bg-white text-neutral-600 hover:bg-neutral-50'
                }`}
              >
                {d}d
              </button>
            ))}
          </div>
        </div>
      );
    }

    if (active.hasFilters) {
      const visibleServices = servicesList
        .filter(s => !highlightSlugs.includes(s.slug))
        .filter(s =>
          !highlightSearch ||
          s.name.toLowerCase().includes(highlightSearch.toLowerCase()) ||
          s.slug.toLowerCase().includes(highlightSearch.toLowerCase())
        );

      return (
        <div className="mb-5 bg-white border-2 border-neutral-200 rounded-lg p-4">
          <h4 className="text-sm font-semibold text-neutral-800 mb-3">Filter by category</h4>
          <div className="flex flex-wrap gap-2 mb-4">
            {SERVICE_CATEGORIES.map(opt => (
              <button
                key={opt.value}
                onClick={() => setServiceFilter(opt.value)}
                aria-pressed={serviceFilter === opt.value}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium border-2 transition-all ${
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
            <label className="block text-xs font-semibold text-neutral-600 mb-1">Show specific listings (optional)</label>
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
                        aria-label={`Remove ${svc?.name || slug}`}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  );
                })}
              </div>
            )}
            <div className="relative" ref={highlightRef}>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-neutral-400" />
                <input
                  type="text"
                  value={highlightSearch}
                  onChange={e => { setHighlightSearch(e.target.value); setHighlightDropdownOpen(true); }}
                  onFocus={() => setHighlightDropdownOpen(true)}
                  onKeyDown={e => { if (e.key === 'Escape') setHighlightDropdownOpen(false); }}
                  placeholder="Search listings..."
                  className="w-full max-w-xs pl-8 pr-3 py-1.5 border border-neutral-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-primary-400 focus:border-primary-400"
                />
              </div>
              {highlightDropdownOpen && (
                <div className="absolute z-10 mt-1 w-full max-w-xs bg-white border border-neutral-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                  {visibleServices.map(s => (
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
                      <span className="text-[10px] text-neutral-400 ml-2 flex-shrink-0">
                        {s.type === 'outfitter' ? 'Outfitter' : s.type === 'campground' ? 'Campground' : 'Cabin & Lodge'}
                      </span>
                    </button>
                  ))}
                  {visibleServices.length === 0 && (
                    <div className="px-3 py-2 text-xs text-neutral-400">No matching listings</div>
                  )}
                </div>
              )}
            </div>
            {servicesError ? (
              <p className="text-xs text-accent-700 mt-1">Couldn&apos;t load listings for this river — the code still works without specific listings.</p>
            ) : (
              <p className="text-xs text-neutral-400 mt-1">Only selected listings will be shown in the widget.</p>
            )}
          </div>
        </div>
      );
    }

    return null;
  };

  return (
    <div className="h-screen flex flex-col bg-neutral-50 overflow-x-hidden" style={{ color: '#2D2A24' }}>
      {/* ===================== TOP BAR ===================== */}
      <header
        className="flex items-center gap-3.5 h-[60px] px-4 md:px-7 border-b-2 border-neutral-900 flex-none"
        style={{ background: '#163F4A' }}
      >
        <Link href="/" className="flex items-center gap-3">
          <Image src={EDDY_IMAGES.favicon} alt="Eddy" width={32} height={32} className="w-8 h-8 rounded-md" />
          <span className="font-bold text-xl text-white" style={{ fontFamily: 'var(--font-display)' }}>Eddy</span>
        </Link>
        <span
          className="hidden sm:inline-block text-[11px] font-semibold uppercase tracking-wider text-primary-300 border-l border-primary-600 pl-3.5"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          Widgets
        </span>
        <div className="ml-auto flex items-center gap-3 md:gap-5">
          <button onClick={() => openReference('params')} className="hidden sm:inline text-sm font-medium text-primary-200 hover:text-white transition-colors">Docs</button>
          <button onClick={() => openReference('api')} className="hidden sm:inline text-sm font-medium text-primary-200 hover:text-white transition-colors">API</button>
          <button
            onClick={() => setPartnerOpen(true)}
            className="inline-flex items-center gap-2 text-white text-sm font-semibold px-4 py-2 rounded-md"
            style={{ background: '#F07052', boxShadow: '2px 2px 0 #A33122' }}
          >
            Partner with Eddy
          </button>
        </div>
      </header>

      {/* ===================== BODY ===================== */}
      <div className="flex flex-col lg:flex-row flex-1 min-h-0 lg:h-[calc(100vh-60px)] lg:overflow-hidden">

        {/* =============== LEFT RAIL =============== */}
        <aside className="w-full lg:w-[336px] lg:flex-none bg-secondary-50 border-b-2 lg:border-b-0 lg:border-r-2 border-neutral-900 p-6 lg:overflow-y-auto flex flex-col">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500 mb-3.5" style={{ fontFamily: 'var(--font-mono)' }}>1 &middot; Who are you?</div>

          {/* Audience presets — shortcuts to the best-fit widget, never gates */}
          <div className="flex flex-wrap gap-2 mb-2" role="group" aria-label="Audience presets">
            {AUDIENCES.map(a => {
              const isOn = preset === a.key;
              return (
                <button
                  key={a.key}
                  onClick={() => selectPreset(a.key)}
                  aria-pressed={isOn}
                  className={`px-3 py-1.5 rounded-full text-[13px] font-semibold border-2 transition-all ${
                    isOn
                      ? 'border-accent-500 bg-accent-500 text-white'
                      : 'border-neutral-300 bg-white text-neutral-600 hover:border-neutral-400'
                  }`}
                  style={isOn ? { boxShadow: '2px 2px 0 #A33122' } : undefined}
                >
                  {a.label}
                </button>
              );
            })}
          </div>
          <p className="text-[11px] text-neutral-400 mb-6 leading-relaxed min-h-[2.5em]">
            {preset
              ? AUDIENCES.find(a => a.key === preset)?.blurb
              : 'Pick your business type for a suggested setup — every widget stays available.'}
          </p>

          <div className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500 mb-4" style={{ fontFamily: 'var(--font-mono)' }}>2 &middot; Configure</div>

          {/* River (the location-pinned card resolves its river from your address;
              the multi-river overview picks several rivers in its own control) */}
          {!active.hasCardSetup && !active.hasMultiRivers ? (
            <>
              <label htmlFor="embed-river" className="block text-[13px] font-bold text-neutral-700 mb-2">River</label>
              <div className="relative mb-5">
                <select
                  id="embed-river"
                  value={selectedRiver}
                  onChange={e => setSelectedRiver(e.target.value)}
                  className="w-full appearance-none text-sm font-semibold text-primary-800 bg-white rounded-md border-2 border-primary-700 pl-3.5 pr-9 py-2.5 cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary-400"
                  style={{ boxShadow: '2px 2px 0 #C2BAAC' }}
                >
                  {riverOptions.map(r => (
                    <option key={r.slug} value={r.slug}>{r.name}</option>
                  ))}
                  {!riverOptions.some(r => r.slug === selectedRiver) && (
                    <option value={selectedRiver}>{selectedRiver}</option>
                  )}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary-600 pointer-events-none" />
              </div>
            </>
          ) : (
            <div className="mb-5 text-[13px] text-neutral-500 bg-white border-2 border-neutral-200 rounded-md px-3.5 py-2.5">
              <span className="font-bold text-neutral-700">River{active.hasMultiRivers ? 's' : ''}:</span>{' '}
              {active.hasMultiRivers
                ? 'picked with the river toggles next to the preview.'
                : 'resolved from your business address in the setup form.'}
            </div>
          )}

          {/* Theme */}
          <span className="block text-[13px] font-bold text-neutral-700 mb-2">Theme</span>
          <div className="flex rounded-md overflow-hidden border-2 border-primary-700" style={{ boxShadow: '2px 2px 0 #C2BAAC' }} role="group" aria-label="Widget theme">
            <button
              onClick={() => setTheme('light')}
              aria-pressed={theme === 'light'}
              className={`flex-1 text-sm font-semibold py-2.5 transition-colors ${theme === 'light' ? 'bg-primary-800 text-white' : 'bg-white text-neutral-600'}`}
            >
              Light
            </button>
            <button
              onClick={() => setTheme('dark')}
              aria-pressed={theme === 'dark'}
              className={`flex-1 text-sm font-semibold py-2.5 transition-colors ${theme === 'dark' ? 'bg-primary-800 text-white' : 'bg-white text-neutral-600'}`}
            >
              Dark
            </button>
          </div>
          <p className="text-[11px] text-neutral-400 mt-1.5 mb-7">Sets the embedded widget&apos;s appearance — not this page.</p>

          <div className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500 mb-3.5" style={{ fontFamily: 'var(--font-mono)' }}>3 &middot; Pick a widget</div>

          <div className="flex flex-col gap-2.5" role="list" aria-label="Widgets">
            {WIDGETS.map(w => {
              const isOn = w.key === activeWidget && !showReference;
              return (
                <button
                  key={w.key}
                  onClick={() => selectWidget(w.key)}
                  aria-current={isOn ? 'true' : undefined}
                  className="flex items-center gap-2.5 w-full text-left rounded-lg px-3.5 py-3 bg-white transition-all"
                  style={{
                    border: `2px solid ${isOn ? '#F07052' : '#DBD5CA'}`,
                    boxShadow: `3px 3px 0 ${isOn ? '#E5573F' : '#C2BAAC'}`,
                  }}
                >
                  <span className="w-2 h-2 rounded-full flex-none" style={{ background: isOn ? '#4EB86B' : '#C2BAAC' }} />
                  <span className={`text-sm ${isOn ? 'font-bold text-neutral-900' : 'font-semibold text-neutral-700'}`}>{w.title}</span>
                  {w.badge && (
                    <span className="ml-auto text-[9px] font-bold tracking-wide text-white px-1.5 py-0.5 rounded-full" style={{ background: w.badgeBg }}>{w.badge}</span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="mt-auto pt-6">
            <div className="bg-primary-50 border-2 border-primary-200 rounded-lg px-3.5 py-3">
              <div className="text-xs font-bold text-primary-700 mb-1">All widgets are free</div>
              <div className="text-xs text-primary-600 leading-relaxed">
                No account, no API key. Businesses get co-branding — your logo, color and
                booking link — via the Floatable From Here card.
              </div>
            </div>
            <nav aria-label="Site" className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 text-xs">
              {SITE_LINKS.map(l => (
                <Link key={l.href} href={l.href} className="text-neutral-500 hover:text-primary-700 font-medium transition-colors">{l.label}</Link>
              ))}
            </nav>
          </div>
        </aside>

        {/* =============== RIGHT WORKSPACE =============== */}
        <main className="flex-1 min-w-0 flex flex-col bg-neutral-50 lg:overflow-hidden">

          {showReference ? (
            /* ============ REFERENCE VIEW (Docs / API) ============ */
            <div className="flex-1 lg:overflow-y-auto px-5 md:px-9 py-7">
              <div className="max-w-3xl">
                <button
                  onClick={() => setShowReference(false)}
                  className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary-700 hover:text-primary-800 mb-6"
                >
                  <ArrowLeft className="w-4 h-4" /> Back to widgets
                </button>

                {/* Parameters Reference */}
                <section id="ref-params" className="scroll-mt-6 mb-10">
                  <h2 className="text-2xl font-bold text-primary-800 mb-1" style={{ fontFamily: 'var(--font-display)' }}>Parameters Reference</h2>
                  <p className="text-sm text-neutral-600 mb-4">
                    All widgets accept URL query parameters to customize behavior. Add these to the{' '}
                    <code className="bg-neutral-100 px-1 py-0.5 rounded text-xs">src</code> URL in the iframe.
                  </p>
                  <div className="bg-white border-2 border-neutral-200 rounded-xl overflow-hidden">
                    <div className="px-4 py-3 border-b border-neutral-100 bg-neutral-50">
                      <h3 className="text-sm font-semibold text-neutral-800">All Widgets</h3>
                    </div>
                    <div className="px-4 py-2">
                      <table className="w-full">
                        <tbody>
                          <ParamRow name="theme" values="light | dark" description="Widget color scheme. Defaults to light." />
                          <ParamRow name="partner" values="string" description='Shows "via YourBusiness" in the widget footer.' />
                          <ParamRow name="e" values="emb_xxxxxxxx" description='Co-branding ID from the free "Add your branding" setup — your logo and business name, linked to your site.' />
                        </tbody>
                      </table>
                    </div>
                    <div className="px-4 py-3 border-b border-t border-neutral-100 bg-neutral-50">
                      <h3 className="text-sm font-semibold text-neutral-800">Float Trip Planner</h3>
                    </div>
                    <div className="px-4 py-2">
                      <table className="w-full">
                        <tbody>
                          <ParamRow name="river" values="slug" description="Pre-select a river (e.g. current, meramec)." />
                        </tbody>
                      </table>
                    </div>
                    <div className="px-4 py-3 border-b border-t border-neutral-100 bg-neutral-50">
                      <h3 className="text-sm font-semibold text-neutral-800">Gauge Report</h3>
                    </div>
                    <div className="px-4 py-2">
                      <table className="w-full">
                        <tbody>
                          <ParamRow name="days" values="7 | 14 | 30" description="Default chart period shown on load." />
                        </tbody>
                      </table>
                    </div>
                    <div className="px-4 py-3 border-b border-t border-neutral-100 bg-neutral-50">
                      <h3 className="text-sm font-semibold text-neutral-800">Multi-River Overview</h3>
                    </div>
                    <div className="px-4 py-2">
                      <table className="w-full">
                        <tbody>
                          <ParamRow name="rivers" values="slug,slug,..." description="Which rivers to show, in order (max 8). Omit to show all rivers." />
                        </tbody>
                      </table>
                    </div>
                    <div className="px-4 py-3 border-b border-t border-neutral-100 bg-neutral-50">
                      <h3 className="text-sm font-semibold text-neutral-800">Services Directory</h3>
                    </div>
                    <div className="px-4 py-2">
                      <table className="w-full">
                        <tbody>
                          <ParamRow name="type" values="outfitter | campground | cabin_lodge" description="Show only one service type." />
                          <ParamRow name="highlight" values="slug,slug,..." description="Show only specific listings. Comma-separated slugs." />
                          <ParamRow name="exclude" values="type,type,..." description="Hide service types. Comma-separated; ignored when type is set." />
                        </tbody>
                      </table>
                    </div>
                  </div>
                </section>

                {/* API Access */}
                <section id="ref-api" className="scroll-mt-6">
                  <h2 className="text-2xl font-bold text-primary-800 mb-1" style={{ fontFamily: 'var(--font-display)' }}>API Access</h2>
                  <p className="text-sm text-neutral-600 mb-4">Fetch data directly and build your own display.</p>
                  <div className="space-y-3">
                    <CodeBlock code={`GET ${EMBED_BASE}/api/rivers`} label="Rivers — conditions, lengths, access point counts" />
                    <CodeBlock code={`GET ${EMBED_BASE}/api/rivers/{slug}/services`} label="Services — outfitters, campgrounds, lodging for a river" />
                    <CodeBlock code={`GET ${EMBED_BASE}/api/gauges`} label="Gauges — all gauge stations with latest readings and thresholds" />
                  </div>
                  <div className="mt-4 bg-amber-50 border border-amber-200 rounded-xl p-4">
                    <h3 className="text-sm font-semibold text-amber-800 mb-1">Rate Limits</h3>
                    <p className="text-xs text-amber-700">
                      API endpoints are rate limited per IP. The rivers, gauges and services endpoints allow
                      60 requests per minute; the plan endpoint allows 30. Exceeding the limit returns a{' '}
                      <code className="bg-amber-100 px-1 py-0.5 rounded">429</code> response with a{' '}
                      <code className="bg-amber-100 px-1 py-0.5 rounded">Retry-After</code> header.
                      Widgets handle caching automatically.
                    </p>
                  </div>
                </section>
              </div>
            </div>
          ) : (
            <>
              {/* workspace header + tabs */}
              <div className="bg-white border-b-2 border-neutral-200 px-5 md:px-9 pt-6 flex-none">
                <div className="flex items-center gap-3 mb-1.5">
                  <h1 className="text-2xl md:text-[28px] font-semibold text-primary-800 m-0" style={{ fontFamily: 'var(--font-display)', letterSpacing: '-0.01em' }}>{active.title}</h1>
                  {active.badge && (
                    <span className="text-[10px] font-bold tracking-wide text-white px-2 py-1 rounded-full" style={{ background: active.badgeBg }}>{active.badge}</span>
                  )}
                </div>
                <p className="text-[15px] text-neutral-600 leading-relaxed max-w-2xl mb-4">{active.desc}</p>
                <div className="flex gap-1" role="tablist" aria-label="Widget views" onKeyDown={onTabKeyDown}>
                  {TABS.map(t => (
                    <button
                      key={t}
                      role="tab"
                      id={`tab-${t}`}
                      aria-selected={activeTab === t}
                      aria-controls={`panel-${t}`}
                      tabIndex={activeTab === t ? 0 : -1}
                      ref={el => { tabRefs.current[t] = el; }}
                      onClick={() => setActiveTab(t)}
                      className={`text-sm font-semibold px-4 py-2.5 border-b-2 -mb-0.5 transition-colors capitalize ${
                        activeTab === t ? 'text-primary-800 border-accent-500' : 'text-neutral-500 border-transparent hover:text-primary-700'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              {/* workspace body */}
              <div
                role="tabpanel"
                id={`panel-${activeTab}`}
                aria-labelledby={`tab-${activeTab}`}
                tabIndex={0}
                className="flex-1 lg:overflow-y-auto px-5 md:px-9 py-7 focus:outline-none"
              >

                {/* ============ PREVIEW TAB ============ */}
                {activeTab === 'preview' && (
                  <div>
                    <div className="flex items-center justify-between gap-3 mb-3.5">
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500" style={{ fontFamily: 'var(--font-mono)' }}>Live preview &middot; {themeLabel}</div>
                      <div className="text-xs text-neutral-400 truncate" style={{ fontFamily: 'var(--font-mono)' }}>{previewRoute}</div>
                    </div>
                    {renderWidgetOptions()}
                    {active.buildSrc(ctx) ? (
                      <>
                        <WidgetPreview
                          src={active.buildSrc(ctx)}
                          height={active.previewHeight}
                          theme={theme}
                          maxWidth={active.isBadge ? 320 : 540}
                        />
                        <p className="text-xs text-neutral-500 mt-3.5 leading-relaxed">
                          Live preview — real USGS gauge data for the selected river. The embedded widget auto-resizes to its content.
                        </p>
                      </>
                    ) : (
                      <div
                        className="flex items-center justify-center rounded-xl border-2 border-dashed border-neutral-300 bg-white text-sm text-neutral-400"
                        style={{ height: active.previewHeight, maxWidth: 540 }}
                      >
                        Enter your address above to generate your card
                      </div>
                    )}
                  </div>
                )}

                {/* ============ CODE TAB ============ */}
                {activeTab === 'code' && (
                  <div className="grid grid-cols-1 lg:grid-cols-[1.5fr_1fr] gap-6 max-w-5xl items-start">
                    <div className="min-w-0">
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500 mb-3" style={{ fontFamily: 'var(--font-mono)' }}>{'Copy & paste this'}</div>
                      {renderWidgetOptions()}

                      {/* Optional co-branding step — mints an embed_id the widget
                          footer resolves to logo + linked business name. */}
                      {!active.hasCardSetup && !active.isBadge && (
                        <div className="mb-4 bg-white border-2 border-neutral-200 rounded-lg p-4">
                          {brandingId ? (
                            <div className="flex items-start justify-between gap-3">
                              <p className="text-xs text-neutral-600 leading-relaxed m-0">
                                <span className="font-semibold text-support-700">Branding on.</span>{' '}
                                The snippet below now shows your logo and business name in the widget footer
                                (ID <code className="bg-neutral-100 px-1 py-0.5 rounded">{brandingId}</code> —
                                save this page&apos;s URL to keep it).
                              </p>
                              <button
                                onClick={() => { setBrandingId(null); setBrandingOpen(false); }}
                                className="flex-none text-xs font-semibold text-neutral-500 hover:text-primary-700 border-2 border-neutral-200 rounded-md px-3 py-1.5"
                              >
                                Remove
                              </button>
                            </div>
                          ) : brandingOpen ? (
                            <>
                              <h4 className="text-sm font-semibold text-neutral-800 mb-1">Add your branding</h4>
                              <p className="text-xs text-neutral-500 mb-3 leading-relaxed">
                                Free, no account. Your logo and business name appear in the widget footer,
                                linked to your site.
                              </p>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                                <div>
                                  <label className="block text-xs font-semibold text-neutral-600 mb-1" htmlFor="branding-name">Business name</label>
                                  <input id="branding-name" type="text" value={brandingForm.businessName}
                                    onChange={e => setBrandingForm(f => ({ ...f, businessName: e.target.value }))}
                                    placeholder="Pine Valley Cabins"
                                    className="w-full text-sm text-neutral-800 bg-white rounded-md border-2 border-neutral-200 px-3 py-2 focus:outline-none focus:border-primary-400" />
                                </div>
                                <div>
                                  <label className="block text-xs font-semibold text-neutral-600 mb-1" htmlFor="branding-site">Your website</label>
                                  <input id="branding-site" type="url" value={brandingForm.siteUrl}
                                    onChange={e => setBrandingForm(f => ({ ...f, siteUrl: e.target.value }))}
                                    placeholder="https://yoursite.com"
                                    className="w-full text-sm text-neutral-800 bg-white rounded-md border-2 border-neutral-200 px-3 py-2 focus:outline-none focus:border-primary-400" />
                                </div>
                                <div>
                                  <label className="block text-xs font-semibold text-neutral-600 mb-1" htmlFor="branding-logo">Logo URL (optional)</label>
                                  <input id="branding-logo" type="url" value={brandingForm.logoUrl}
                                    onChange={e => setBrandingForm(f => ({ ...f, logoUrl: e.target.value }))}
                                    placeholder="https://yoursite.com/logo.png"
                                    className="w-full text-sm text-neutral-800 bg-white rounded-md border-2 border-neutral-200 px-3 py-2 focus:outline-none focus:border-primary-400" />
                                </div>
                                <div>
                                  <label className="block text-xs font-semibold text-neutral-600 mb-1" htmlFor="branding-accent">Accent color</label>
                                  <input id="branding-accent" type="color" value={brandingForm.accentColor}
                                    onChange={e => setBrandingForm(f => ({ ...f, accentColor: e.target.value }))}
                                    className="h-9 w-16 bg-white border-2 border-neutral-200 rounded-md cursor-pointer" />
                                </div>
                              </div>
                              {brandingError && (
                                <p className="text-xs font-medium text-red-600 mb-3" role="alert">{brandingError}</p>
                              )}
                              <div className="flex gap-2">
                                <button
                                  onClick={registerBranding}
                                  disabled={brandingBusy || !brandingForm.businessName.trim()}
                                  className="text-sm font-semibold text-white px-4 py-2 rounded-md disabled:opacity-50"
                                  style={{ background: '#2D7889' }}
                                >
                                  {brandingBusy ? 'Saving…' : 'Save branding'}
                                </button>
                                <button
                                  onClick={() => setBrandingOpen(false)}
                                  className="text-sm font-semibold text-neutral-500 px-3 py-2 rounded-md hover:text-primary-700"
                                >
                                  Cancel
                                </button>
                              </div>
                            </>
                          ) : (
                            <div className="flex items-center justify-between gap-3">
                              <p className="text-xs text-neutral-600 leading-relaxed m-0">
                                <span className="font-semibold">Add your branding (free):</span> your logo and
                                business name in the widget footer, linked to your site.
                              </p>
                              <button
                                onClick={() => setBrandingOpen(true)}
                                className="flex-none text-xs font-semibold text-primary-700 border-2 border-primary-300 rounded-md px-3 py-1.5 hover:border-primary-500"
                              >
                                Set up
                              </button>
                            </div>
                          )}
                        </div>
                      )}

                      <CodeBlock code={active.buildCode(ctx)} label={`HTML · ${active.key} · ${themeLabel}`} />
                      <div className="mt-3">
                        <CopyButton text={active.buildCode(ctx)} large />
                      </div>
                      <div className="mt-3.5 bg-primary-50 border-2 border-primary-200 rounded-lg px-4 py-3 text-[13px] text-primary-700 leading-relaxed">
                        The widget <strong>auto-resizes</strong> to its content — no need to set a{' '}
                        <span style={{ fontFamily: 'var(--font-mono)' }}>height</span>. The included snippet handles it.
                      </div>
                    </div>
                    <div>
                      <div className="text-sm font-bold text-neutral-700 mb-3">Optional parameters</div>
                      <div className="flex flex-col gap-2.5">
                        {active.params.map(p => (
                          <div key={p.name} className="bg-white border-2 border-neutral-200 rounded-md px-3 py-2.5">
                            <code className="font-mono text-[13px] font-semibold text-primary-600">{p.name}</code>
                            <span className="text-xs text-neutral-500 ml-1.5">{p.values}</span>
                            {p.note && <div className="text-[11px] text-neutral-400 mt-1">{p.note}</div>}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* ============ INSTALL TAB ============ */}
                {activeTab === 'install' && (
                  <div className="max-w-4xl">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500 mb-4" style={{ fontFamily: 'var(--font-mono)' }}>Where do I paste it?</div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                      {INSTALL_GUIDES.map(g => (
                        <div key={g.name} className="bg-white border-2 border-neutral-200 rounded-lg p-4 md:p-5" style={{ boxShadow: '2px 2px 0 #C2BAAC' }}>
                          <div className="text-[15px] font-bold text-neutral-900 mb-2">{g.name}</div>
                          <div className="text-[13px] text-neutral-600 leading-relaxed">{g.steps}</div>
                        </div>
                      ))}
                    </div>

                    {/* outfitter CTA */}
                    <div
                      className="mt-7 rounded-xl border-2 border-neutral-900 p-6 md:p-7 flex flex-col sm:flex-row items-center gap-5"
                      style={{ background: 'linear-gradient(135deg,#163F4A,#0F2D35)', boxShadow: '6px 6px 0 #C2BAAC' }}
                    >
                      <Image src={EDDY_IMAGES.canoe} alt="Eddy the Otter" width={120} height={120} className="h-20 w-auto flex-none" />
                      <div className="flex-1 text-center sm:text-left">
                        <h3 className="text-xl md:text-[22px] font-bold text-white mb-1.5" style={{ fontFamily: 'var(--font-display)' }}>Run an outfitter or campground?</h3>
                        <p className="text-sm text-white/80 max-w-md leading-relaxed">Get a co-branded planner widget, a directory listing, and priority support — free for local businesses.</p>
                      </div>
                      <button
                        onClick={() => setPartnerOpen(true)}
                        className="flex-none inline-flex items-center gap-2 text-white text-[15px] font-semibold px-5 py-3 rounded-lg"
                        style={{ background: '#F07052', boxShadow: '3px 3px 0 #A33122' }}
                      >
                        Partner with Eddy &rarr;
                      </button>
                    </div>
                  </div>
                )}

              </div>
            </>
          )}
        </main>
      </div>

      <PartnerModal
        isOpen={partnerOpen}
        onClose={() => setPartnerOpen(false)}
        onSelectCard={() => selectWidget('card')}
      />
    </div>
  );
}
