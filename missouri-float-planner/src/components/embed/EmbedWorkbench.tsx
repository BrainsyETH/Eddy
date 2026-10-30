'use client';

// src/components/embed/EmbedWorkbench.tsx
// "Workbench" UI for adding Eddy widgets to external websites and newsletters.
//
// Flow, left rail top to bottom — placement first, because WHERE a widget
// lives decides its size and format before anything else does:
//   1 · Where will this live?   sidebar / in a post / landing page / email / regional page
//   2 · What to show            a river, a dam, or one of the tools (planner, card, directory)
//   3 · Size                    badge / strip / card / full   (river + dam family)
//   4 · Style                   theme light/dark/auto, transparent background, accent, branding
// Right workspace: Preview (on a white, cream or dark host background) /
// Code (iframe, script tag, or image) / Install.
//
// The configuration is mirrored into the URL so a setup can be bookmarked or
// shared. Legacy ?widget=current|quote|gauge|badge links hydrate into the
// matching size of the river family.

import { useState, useEffect, useRef, useMemo, type KeyboardEvent } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Copy, Check, ChevronDown, X, Search, ArrowLeft } from 'lucide-react';
import PartnerModal from '@/components/embed/PartnerModal';
import EmbedPartnerBrand from '@/components/embed/EmbedPartnerBrand';
import { EDDY_IMAGES } from '@/constants';
import {
  EMBED_SIZES,
  parseAccentColor,
  type EmbedSize,
  type EmbedThemeMode,
} from '@/lib/embed/options';

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

type Format = 'iframe' | 'script' | 'image';
type HostBg = 'white' | 'cream' | 'dark';
type WidgetKey = 'river' | 'dam' | 'planner' | 'card' | 'services' | 'rivers';
type WidgetTab = 'preview' | 'code' | 'install';
type ServiceFilter = 'all' | 'outfitter' | 'campground' | 'cabin_lodge';
const TABS: WidgetTab[] = ['preview', 'code', 'install'];
const TAB_LABEL: Record<WidgetTab, string> = { preview: 'Preview', code: 'Code', install: 'Help' };

// Placements are shortcuts, never gates: picking one proposes a size and a
// format, and every control below stays editable.
const PLACEMENTS: { key: string; label: string; widget: WidgetKey; size: EmbedSize; format: Format }[] = [
  { key: 'sidebar', label: 'Sidebar', widget: 'river', size: 'card', format: 'iframe' },
  { key: 'post', label: 'In a post', widget: 'river', size: 'strip', format: 'iframe' },
  { key: 'landing', label: 'Landing page', widget: 'river', size: 'full', format: 'iframe' },
  { key: 'email', label: 'Email / newsletter', widget: 'river', size: 'badge', format: 'image' },
  { key: 'regional', label: 'Regional page', widget: 'rivers', size: 'card', format: 'iframe' },
];

const SIZE_INFO: Record<EmbedSize, { label: string; detail: string; width: number; height: number }> = {
  badge: { label: 'Badge', detail: 'Inline pill — name and live status.', width: 320, height: 44 },
  strip: { label: 'Strip', detail: 'One line — status, reading, trend, age.', width: 540, height: 64 },
  card: { label: 'Card', detail: 'Status, reading on the ladder, Eddy’s take, weather.', width: 540, height: 330 },
  full: { label: 'Full', detail: 'Card plus the trend chart and other gauges.', width: 540, height: 560 },
};
const DAM_SIZE_DETAIL: Record<EmbedSize, string> = {
  badge: 'Inline pill — dam name and generating / not.',
  strip: 'One line — status, turbine flow, next change, age.',
  card: 'Turbine flow, status, today’s hourly schedule bars.',
  full: 'Card plus tailwater, lake level, total release, tomorrow.',
};

const SERVICE_CATEGORIES = [
  { value: 'all', label: 'All Services' },
  { value: 'outfitter', label: 'Outfitters' },
  { value: 'campground', label: 'Campgrounds' },
  { value: 'cabin_lodge', label: 'Cabins & Lodges' },
] as const;

const INSTALL_GUIDES = [
  { name: 'WordPress', steps: 'Edit a page → add a Custom HTML block → paste the code → Update. If your role can’t paste scripts, use the plain iframe or an image.' },
  { name: 'Squarespace', steps: 'Add a block → under "More" choose Code → paste → Save.' },
  { name: 'Wix', steps: 'Add → Embed Code → Embed HTML → paste → Apply.' },
  { name: 'Substack / Medium / Ghost', steps: 'These strip iframes. Switch the format to Image and insert the PNG like any picture; link it to your river page.' },
  { name: 'Email newsletters', steps: 'Insert the PNG as an image. It renders the live condition each time the email is opened. Mailchimp and ConvertKit cache images for a few minutes.' },
  { name: 'Anything else', steps: 'Look for a "Custom HTML" / "Embed Code" option. The iframe works anywhere; the script tag also handles resizing for you.' },
];

const HOST_BG: Record<HostBg, { label: string; bg: string; border: string; ink: string }> = {
  white: { label: 'White', bg: '#FFFFFF', border: '#DBD5CA', ink: '#2D2A24' },
  cream: { label: 'Cream', bg: '#F4EFE7', border: '#C2BAAC', ink: '#2D2A24' },
  dark: { label: 'Dark', bg: '#1A1814', border: '#3A3630', ink: '#E8F1F2' },
};

// Internal links so the workbench isn't a navigation dead-end (mirrors SiteHeader).
const SITE_LINKS = [
  { href: '/plan', label: 'Plan a float' },
  { href: '/rivers', label: 'River Reports' },
  { href: '/dams', label: 'Dams & Lakes' },
  { href: '/blog', label: 'Guides' },
  { href: '/about', label: 'About' },
];

interface DamOption { id: string; name: string; state: string; trout: boolean }

interface WidgetCtx {
  baseUrl: string;     // current origin — used for the live preview iframe
  embedBase: string;   // production origin — used for the copied snippet
  selectedRiver: string;
  selectedRiverName: string;
  selectedDam: string;
  selectedDamName: string;
  size: EmbedSize;
  theme: EmbedThemeMode;
  transparent: boolean;
  accent: string | null;
  serviceFilter: ServiceFilter;
  highlightSlugs: string[];
  gaugeDays: number;
  resizeScript: string;
  cardEmbedId: string | null; // set once the location-pinned card is created
  brandingId: string | null;  // set once "Add your branding" has been completed
  multiRivers: string[];      // rivers shown by the multi-river overview
}

// Style params shared by every member of the family (and honoured by the tools
// where they apply: theme everywhere, the rest on the river/dam widgets).
function styleQuery(c: WidgetCtx, extra: Record<string, string | undefined> = {}) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(extra)) if (v) p.set(k, v);
  p.set('theme', c.theme);
  if (c.transparent) p.set('bg', 'transparent');
  if (c.accent) p.set('accent', c.accent);
  if (c.brandingId) p.set('e', c.brandingId);
  return p.toString();
}

function toolQuery(c: WidgetCtx, extra: Record<string, string | undefined> = {}) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(extra)) if (v) p.set(k, v);
  p.set('theme', c.theme === 'auto' ? 'light' : c.theme);
  if (c.brandingId) p.set('e', c.brandingId);
  return p.toString();
}

interface WidgetParam { name: string; values: string; note?: string }

interface WidgetDef {
  key: WidgetKey;
  title: string;
  badge?: string;
  badgeBg?: string;
  desc: string;
  /** Path (no origin) of the widget for the current config, or '' when not ready. */
  path: (c: WidgetCtx) => string;
  title_: (c: WidgetCtx) => string;
  params: WidgetParam[];
  family?: boolean;        // river / dam: has sizes, styles, image + script formats
  hasFilters?: boolean;
  hasDays?: boolean;
  hasCardSetup?: boolean;  // location-pinned card: onboarding form instead of river picker
  hasMultiRivers?: boolean;
}

const COMMON_PARAMS: WidgetParam[] = [
  { name: 'size', values: 'badge / strip / card / full' },
  { name: 'theme', values: 'light / dark / auto', note: 'auto follows the visitor’s system setting.' },
  { name: 'bg', values: 'transparent', note: 'Drop the panel background and sit on your page’s own surface.' },
  { name: 'accent', values: '#rrggbb', note: 'Recolors links and buttons. Condition colors never change.' },
  { name: 'partner', values: 'your business name', note: 'A text credit in the footer.' },
  { name: 'e', values: 'emb_xxxxxxxx', note: 'Your branding registration — logo, name, link. Free.' },
];

const WIDGETS: WidgetDef[] = [
  {
    key: 'river',
    title: 'River conditions',
    badge: 'FAMILY',
    badgeBg: '#2D7889',
    desc: 'River conditions, updated automatically.',
    family: true,
    path: (c) => `/embed/river/${c.selectedRiver}?${styleQuery(c, { size: c.size, days: c.size === 'full' && c.gaugeDays !== 14 ? String(c.gaugeDays) : undefined })}`,
    title_: (c) => `${c.selectedRiverName} — live conditions from Eddy`,
    params: [...COMMON_PARAMS, { name: 'days', values: '7 / 14 / 30', note: 'Chart window on the full size.' }],
    hasDays: true,
  },
  {
    key: 'dam',
    title: 'Dam generation',
    badge: 'NEW',
    badgeBg: '#F07052',
    desc: 'Current generation and today’s schedule.',
    family: true,
    path: (c) => (c.selectedDam ? `/embed/dam/${c.selectedDam}?${styleQuery(c, { size: c.size })}` : ''),
    title_: (c) => `${c.selectedDamName} — generation from Eddy`,
    params: COMMON_PARAMS,
  },
  {
    key: 'card',
    title: 'Floatable From Here',
    desc: 'Is it floatable from your door? Your nearest launch, the drive time, and your booking button.',
    path: (c) => (c.cardEmbedId ? `/embed/card/${c.cardEmbedId}?theme=${c.theme === 'auto' ? 'light' : c.theme}` : ''),
    title_: () => 'Floatable From Here - Live River Conditions',
    params: [{ name: 'theme', values: 'light | dark', note: 'Card color scheme.' }],
    hasCardSetup: true,
  },
  {
    key: 'planner',
    title: 'Float Trip Planner',
    desc: 'Visitors plan a float on your site: put-in, take-out, shuttle and float time.',
    path: (c) => `/embed/planner?${toolQuery(c, { river: c.selectedRiver })}`,
    title_: () => 'Plan a float · Eddy',
    params: [
      { name: 'theme', values: 'light / dark' },
      { name: 'river', values: 'slug', note: 'Pre-select a river (e.g. current, meramec).' },
      { name: 'e', values: 'emb_xxxxxxxx', note: 'Your branding — the planner button takes your accent color.' },
    ],
  },
  {
    key: 'services',
    title: 'Services Directory',
    desc: 'Outfitters, campgrounds and lodging on the river, with call and booking links.',
    hasFilters: true,
    path: (c) => {
      const extra: Record<string, string | undefined> = {};
      if (c.serviceFilter !== 'all') extra.type = c.serviceFilter;
      if (c.highlightSlugs.length > 0) extra.highlight = c.highlightSlugs.join(',');
      return `/embed/services/${c.selectedRiver}?${toolQuery(c, extra)}`;
    },
    title_: (c) => `${c.selectedRiverName} - Outfitters & Services from Eddy`,
    params: [
      { name: 'theme', values: 'light / dark' },
      { name: 'type', values: 'outfitter / campground / cabin_lodge', note: 'Set with the category filter above.' },
      { name: 'highlight', values: 'slug,slug,...', note: 'Show only specific listings (set above).' },
      { name: 'exclude', values: 'outfitter / campground / cabin_lodge', note: 'Hide service types (comma-separated; ignored when type is set).' },
    ],
  },
  {
    key: 'rivers',
    title: 'Multi-River Overview',
    desc: 'Live conditions for several rivers at once.',
    hasMultiRivers: true,
    path: (c) => `/embed/rivers?${styleQuery(c, { rivers: c.multiRivers.length > 0 ? c.multiRivers.join(',') : undefined })}`,
    title_: () => 'River Conditions from Eddy',
    params: [
      { name: 'rivers', values: 'slug,slug,...', note: 'Which rivers to show, in order (max 8). Omit for the first eight.' },
      ...COMMON_PARAMS.filter((p) => p.name !== 'size'),
    ],
  },
];

// ── Snippets ────────────────────────────────────────────────────────────────

function iframeSnippet(src: string, title: string, size: EmbedSize | null, resizeScript: string) {
  if (size === 'badge') {
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

function scriptSnippet(c: WidgetCtx, widget: WidgetKey) {
  const attrs: string[] = [];
  if (widget === 'river') attrs.push(`data-eddy-river="${c.selectedRiver}"`);
  else if (widget === 'dam') attrs.push(`data-eddy-dam="${c.selectedDam}"`);
  else attrs.push(`data-eddy-rivers="${c.multiRivers.join(',')}"`);
  if (widget !== 'rivers') attrs.push(`data-size="${c.size}"`);
  attrs.push(`data-theme="${c.theme}"`);
  if (c.transparent) attrs.push('data-bg="transparent"');
  if (c.accent) attrs.push(`data-accent="${c.accent}"`);
  if (widget === 'river' && c.size === 'full' && c.gaugeDays !== 14) attrs.push(`data-days="${c.gaugeDays}"`);
  if (c.brandingId) attrs.push(`data-embed="${c.brandingId}"`);
  return `<script async src="${c.embedBase}/embed.js"></script>
<div ${attrs.join(' ')}></div>`;
}

function imagePath(c: WidgetCtx, widget: WidgetKey, format: 'png' | 'svg') {
  const key = widget === 'dam' ? c.selectedDam : c.selectedRiver;
  const size = c.size === 'strip' ? 'strip' : 'badge';
  const q = new URLSearchParams();
  if (c.theme === 'dark') q.set('theme', 'dark');
  if (c.transparent) q.set('bg', 'transparent');
  if (c.accent) q.set('accent', c.accent);
  const qs = q.toString();
  return `/embed/img/${widget}/${key}/${size}.${format}${qs ? `?${qs}` : ''}`;
}

function imageSnippet(c: WidgetCtx, widget: WidgetKey, title: string) {
  const href = widget === 'dam' ? `${c.embedBase}/dams/${c.selectedDam}` : `${c.embedBase}/rivers/${c.selectedRiver}`;
  return `<a href="${href}?utm_source=eddy_embed&utm_medium=${widget}-${c.size === 'strip' ? 'strip' : 'badge'}-image&utm_campaign=${widget === 'dam' ? c.selectedDam : c.selectedRiver}">
  <img src="${c.embedBase}${imagePath(c, widget, 'png')}" alt="${title}" ${c.size === 'strip' ? 'width="520" height="64"' : 'height="36"'} style="max-width:100%; height:auto;">
</a>`;
}

// ── Small UI pieces ─────────────────────────────────────────────────────────

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
        className={`flex items-center justify-center gap-2 w-full px-4 py-3 font-semibold rounded-lg text-sm text-white transition-colors ${copied ? 'bg-support-600' : 'bg-accent-500 hover:bg-accent-600'}`}
      >
        {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
        {copied ? 'Copied to clipboard!' : 'Copy code'}
      </button>
    );
  }
  return (
    <button
      onClick={handleCopy}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md text-white transition-colors ${copied ? 'bg-support-600' : 'bg-accent-500 hover:bg-accent-600'}`}
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

function Segmented<T extends string>({ value, options, onChange, label }: {
  value: T;
  options: { value: T; label: string; title?: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div className="flex rounded-md overflow-hidden border-2 border-primary-700" style={{ boxShadow: '2px 2px 0 #C2BAAC' }} role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          title={o.title}
          className={`flex-1 text-[13px] font-semibold py-2 transition-colors ${value === o.value ? 'bg-primary-800 text-white' : 'bg-white text-neutral-600 hover:bg-neutral-50'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function WidgetPreview({ src, height, maxWidth = 540, host, inline = false }: {
  src: string;
  height?: number;
  maxWidth?: number;
  host: HostBg;
  inline?: boolean;
}) {
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

  const h = HOST_BG[host];
  return (
    <HostSurface host={host}>
      {inline && (
        <p className="m-0 mb-3 text-sm leading-relaxed" style={{ color: h.ink, opacity: 0.75 }}>
          …we usually launch at Akers and float to Pulltite. Check the water before you go:
        </p>
      )}
      <div className="relative" style={{ maxWidth, display: inline ? 'inline-block' : 'block', width: inline ? undefined : '100%', verticalAlign: 'middle' }}>
        {!loaded && (
          <div className="absolute inset-0 flex items-center justify-center" style={{ minHeight: 48 }}>
            <span className="inline-block w-6 h-6 rounded-full border-2 border-primary-200 border-t-primary-600 animate-spin" role="status" aria-label="Loading preview" />
          </div>
        )}
        <iframe
          ref={ref}
          src={src}
          width={measuredWidth ?? (inline ? 280 : '100%')}
          height={measuredHeight}
          onLoad={() => setLoaded(true)}
          style={{ border: 'none', borderRadius: inline ? 0 : 12, display: inline ? 'inline-block' : 'block', margin: inline ? 0 : '0 auto', verticalAlign: 'middle', opacity: loaded ? 1 : 0, transition: 'opacity var(--duration-fast) var(--ease-out)' }}
          title="Widget preview"
        />
      </div>
      {inline && (
        <p className="m-0 mt-3 text-sm leading-relaxed" style={{ color: h.ink, opacity: 0.75 }}>
          If it reads Low, bring the lighter boats.
        </p>
      )}
    </HostSurface>
  );
}

function HostSurface({ host, children }: { host: HostBg; children: React.ReactNode }) {
  const h = HOST_BG[host];
  return (
    <div className="rounded-xl border-2 border-dashed p-6 md:p-9" style={{ background: h.bg, borderColor: h.border, color: h.ink }}>
      {children}
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

// Shape returned by POST /api/embed/resolve (see src/lib/embed/cards.ts)
interface CardResolveResult {
  lat: number;
  lng: number;
  rivers: { riverId: string; slug: string; name: string; state: string; distanceMiles: number }[];
  accessPoints: { accessPointId: string; name: string; riverId: string; riverSlug: string; riverName: string; distanceMiles: number }[];
}

const RAIL_KICKER = 'text-[11px] font-semibold uppercase tracking-wider text-neutral-500 mb-3';
const RAIL_LABEL = 'block text-[13px] font-bold text-neutral-700 mb-2';
const SELECT_CLS = 'w-full appearance-none text-sm font-semibold text-primary-800 bg-white rounded-md border-2 border-primary-700 pl-3.5 pr-9 py-2.5 cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary-400';

// ── The workbench ───────────────────────────────────────────────────────────

export default function EmbedWorkbench() {
  const [riverOptions, setRiverOptions] = useState(FALLBACK_RIVER_OPTIONS);
  const [damOptions, setDamOptions] = useState<DamOption[]>([]);
  const [selectedRiver, setSelectedRiver] = useState('current');
  const [selectedDam, setSelectedDam] = useState('swl-bull-shoals-dam');
  const [activeWidget, setActiveWidget] = useState<WidgetKey>('river');
  const [size, setSize] = useState<EmbedSize>('card');
  const [format, setFormat] = useState<Format>('iframe');
  const [placement, setPlacement] = useState<string | null>(null);
  const [host, setHost] = useState<HostBg>('white');
  const [theme, setTheme] = useState<EmbedThemeMode>('light');
  const [transparent, setTransparent] = useState(false);
  const [accent, setAccent] = useState<string | null>(null);
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
  const [multiRivers, setMultiRivers] = useState<string[]>([]);
  const [hydrated, setHydrated] = useState(false);
  // The preview iframe points at THIS deploy; read the origin after mount so
  // server and client render the same src (no hydration mismatch).
  const [baseUrl, setBaseUrl] = useState(EMBED_BASE);
  const highlightRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<Partial<Record<WidgetTab, HTMLButtonElement | null>>>({});

  // --- "Floatable From Here" card onboarding state ---
  const [cardForm, setCardForm] = useState({ address: '', businessName: '', logoUrl: '', accentColor: '#2D7889', ctaUrl: '', ctaLabel: 'Book your trip' });
  const [cardResolve, setCardResolve] = useState<CardResolveResult | null>(null);
  const [cardAccessPointId, setCardAccessPointId] = useState('');
  const [cardBusy, setCardBusy] = useState(false);
  const [cardError, setCardError] = useState<string | null>(null);
  const [cardEmbedId, setCardEmbedId] = useState<string | null>(null);

  // --- "Add your branding" (co-branding for any widget) state ---
  const [brandingId, setBrandingId] = useState<string | null>(null);
  const [brandingOpen, setBrandingOpen] = useState(false);
  const [brandingForm, setBrandingForm] = useState({ businessName: '', logoUrl: '', siteUrl: '', accentColor: '#F07052' });
  const [brandingBusy, setBrandingBusy] = useState(false);
  const [brandingError, setBrandingError] = useState<string | null>(null);

  const registerBranding = async () => {
    if ((!brandingForm.businessName.trim() && !brandingForm.logoUrl.trim()) || brandingBusy) return;
    setBrandingBusy(true);
    setBrandingError(null);
    try {
      const res = await fetch('/api/embed/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessName: brandingForm.businessName.trim(),
          logoUrl: brandingForm.logoUrl.trim() || undefined,
          siteUrl: brandingForm.siteUrl.trim() || undefined,
          accentColor: brandingForm.accentColor,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.branding?.embedId) {
        setBrandingError(data?.error || 'Could not save your branding. Try again.');
        return;
      }
      setBrandingId(data.branding.embedId);
      setBrandingOpen(false);
      setActiveTab('preview');
      setShowReference(false);
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
    // Legacy widget keys land on the matching size of the river family.
    const legacy: Record<string, EmbedSize> = { current: 'full', quote: 'card', gauge: 'full', badge: 'badge' };
    if (w && legacy[w]) { setActiveWidget('river'); setSize(legacy[w]); }
    else if (w && WIDGETS.some(x => x.key === w)) setActiveWidget(w as WidgetKey);
    // Accept any slug-shaped value: the live lists load async, so a shared
    // link to a river or dam outside the static fallback must still hydrate.
    const r = sp.get('river');
    if (r && /^[a-z0-9-]+$/.test(r)) setSelectedRiver(r);
    const dam = sp.get('dam');
    if (dam && /^[a-z0-9-]+$/.test(dam)) setSelectedDam(dam);
    const s = sp.get('size');
    if (s && (EMBED_SIZES as readonly string[]).includes(s)) setSize(s as EmbedSize);
    const f = sp.get('format');
    if (f === 'iframe' || f === 'script' || f === 'image') setFormat(f);
    const t = sp.get('theme');
    if (t === 'light' || t === 'dark' || t === 'auto') setTheme(t);
    if (sp.get('bg') === 'transparent') setTransparent(true);
    const a = parseAccentColor(sp.get('accent'));
    if (a) setAccent(a);
    const hb = sp.get('host');
    if (hb === 'white' || hb === 'cream' || hb === 'dark') setHost(hb);
    const tab = sp.get('tab');
    if (tab === 'preview' || tab === 'code' || tab === 'install') setActiveTab(tab);
    const sf = sp.get('type');
    if (sf === 'outfitter' || sf === 'campground' || sf === 'cabin_lodge') setServiceFilter(sf);
    const d = sp.get('days');
    if (d === '7' || d === '14' || d === '30') setGaugeDays(Number(d));
    const pl = sp.get('placement');
    if (pl && PLACEMENTS.some(p => p.key === pl)) setPlacement(pl);
    const mr = sp.get('rivers');
    if (mr) setMultiRivers(mr.split(',').map(x => x.trim()).filter(x => /^[a-z0-9-]+$/.test(x)).slice(0, 8));
    const e = sp.get('e');
    if (e && /^emb_[0-9a-f]{8}$/.test(e)) setBrandingId(e);
    if (sp.get('view') === 'reference') setShowReference(true);
    setBaseUrl(window.location.origin);
    setHydrated(true);
  }, []);

  // Mirror the current config back into the URL (replaceState — no history spam).
  // Gated on `hydrated` so the initial read isn't clobbered by default values.
  useEffect(() => {
    if (!hydrated) return;
    const sp = new URLSearchParams();
    if (activeWidget !== 'river') sp.set('widget', activeWidget);
    if (selectedRiver !== 'current') sp.set('river', selectedRiver);
    if (activeWidget === 'dam' && selectedDam !== 'swl-bull-shoals-dam') sp.set('dam', selectedDam);
    if (size !== 'card') sp.set('size', size);
    if (format !== 'iframe') sp.set('format', format);
    if (theme !== 'light') sp.set('theme', theme);
    if (transparent) sp.set('bg', 'transparent');
    if (accent) sp.set('accent', accent);
    if (host !== 'white') sp.set('host', host);
    if (activeTab !== 'preview') sp.set('tab', activeTab);
    if (serviceFilter !== 'all') sp.set('type', serviceFilter);
    if (gaugeDays !== 14) sp.set('days', String(gaugeDays));
    if (placement) sp.set('placement', placement);
    if (brandingId) sp.set('e', brandingId);
    if (multiRivers.length > 0) sp.set('rivers', multiRivers.join(','));
    if (showReference) sp.set('view', 'reference');
    const qs = sp.toString();
    window.history.replaceState(null, '', qs ? `?${qs}` : window.location.pathname);
  }, [hydrated, activeWidget, selectedRiver, selectedDam, size, format, theme, transparent, accent, host, activeTab, serviceFilter, gaugeDays, placement, brandingId, multiRivers, showReference]);

  // Load the live river list (DB-driven) so new rivers show up without a deploy.
  useEffect(() => {
    let cancelled = false;
    fetch('/api/rivers')
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (cancelled || !data?.rivers?.length) return;
        setRiverOptions(data.rivers.map((r: { slug: string; name: string }) => ({ slug: r.slug, name: r.name })));
      })
      .catch(() => {}); // keep the static fallback
    return () => { cancelled = true; };
  }, []);

  // Dams with a powerhouse — the same filter the iPhone widget's picker uses.
  useEffect(() => {
    let cancelled = false;
    fetch('/api/dams')
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (cancelled || !data?.dams?.length) return;
        const dams: DamOption[] = (data.dams as { id: string; name: string; state: string; hasTurbines: boolean; tailwaterFishery?: string }[])
          .filter(d => d.hasTurbines)
          .map(d => ({ id: d.id, name: d.name, state: d.state, trout: d.tailwaterFishery === 'trout' }))
          .sort((a, b) => a.name.localeCompare(b.name));
        setDamOptions(dams);
      })
      .catch(() => {});
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
      .catch(() => { if (!cancelled) { setServicesList([]); setServicesError(true); } });
    setHighlightSlugs([]);
    return () => { cancelled = true; };
  }, [selectedRiver]);

  // Close the highlight dropdown on outside click.
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (highlightRef.current && !highlightRef.current.contains(e.target as Node)) setHighlightDropdownOpen(false);
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

  const selectedRiverName = riverOptions.find(r => r.slug === selectedRiver)?.name || selectedRiver;
  const selectedDamName = damOptions.find(d => d.id === selectedDam)?.name || selectedDam;

  // Tiny self-resize listener appended to every iframe snippet. Installs once
  // on the host page; matches iframes by event.source so several coexist.
  const resizeScript = `<script>(function(){if(window.__eddyEmbedResizer)return;window.__eddyEmbedResizer=1;window.addEventListener("message",function(e){var d=e&&e.data;if(!d||d.type!=="eddy-embed:resize"||typeof d.height!=="number")return;var f=document.querySelectorAll("iframe[data-eddy-embed]");for(var i=0;i<f.length;i++){if(f[i].contentWindow===e.source){f[i].style.height=d.height+"px";if(typeof d.width==="number"){f[i].style.width=d.width+"px";}break;}}});})();</script>`;

  const ctx: WidgetCtx = {
    baseUrl, embedBase: EMBED_BASE, selectedRiver, selectedRiverName, selectedDam, selectedDamName,
    size, theme, transparent, accent, serviceFilter, highlightSlugs, gaugeDays, resizeScript, cardEmbedId, brandingId, multiRivers,
  };

  const active = WIDGETS.find(w => w.key === activeWidget) ?? WIDGETS[0];
  const isFamily = Boolean(active.family);
  // Image renders exist for the badge and strip only; the script loader for the family + overview.
  const imageAvailable = isFamily && (size === 'badge' || size === 'strip');
  const scriptAvailable = isFamily || active.key === 'rivers';
  const effectiveFormat: Format = format === 'image' && !imageAvailable ? 'iframe' : format === 'script' && !scriptAvailable ? 'iframe' : format;
  const previewPath = active.path(ctx);
  // No preview until the origin is known: a first paint pointing at the
  // production origin from a preview deploy is blocked by CSP (default-src 'self').
  const previewSrc = hydrated && previewPath ? `${baseUrl}${previewPath}` : '';
  const snippetSrc = previewPath ? `${EMBED_BASE}${previewPath}` : '';
  const snippetTitle = active.title_(ctx);

  const code = useMemo(() => {
    if (!previewPath) {
      return active.hasCardSetup
        ? '<!-- Enter your business address on the Preview tab to generate your card\'s embed code. -->'
        : '<!-- Choose a dam to generate the code. -->';
    }
    if (effectiveFormat === 'image') return imageSnippet(ctx, active.key, snippetTitle);
    if (effectiveFormat === 'script') return scriptSnippet(ctx, active.key);
    return iframeSnippet(snippetSrc, snippetTitle, isFamily ? size : null, resizeScript);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewPath, effectiveFormat, snippetSrc, snippetTitle, size, isFamily, activeWidget, selectedRiver, selectedDam, theme, transparent, accent, gaugeDays, brandingId, multiRivers]);

  const selectWidget = (key: WidgetKey) => {
    setActiveWidget(key);
    setActiveTab('preview');
    setShowReference(false);
    if (key !== 'river' && key !== 'dam' && format === 'image') setFormat('iframe');
    if (key !== 'river' && key !== 'dam' && key !== 'rivers' && format === 'script') setFormat('iframe');
  };

  const selectPlacement = (key: string) => {
    if (placement === key) { setPlacement(null); return; }
    setPlacement(key);
    const p = PLACEMENTS.find(x => x.key === key);
    if (!p) return;
    selectWidget(activeWidget === 'dam' && p.widget === 'river' ? 'dam' : p.widget);
    setSize(p.size);
    setFormat(p.format);
    if (key === 'post') setHost('white');
  };

  const openReference = (anchor: 'params' | 'api') => { setShowReference(true); setRefAnchor(anchor); };

  const onTabKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const i = TABS.indexOf(activeTab);
    const next = e.key === 'ArrowRight' ? TABS[(i + 1) % TABS.length] : TABS[(i - 1 + TABS.length) % TABS.length];
    setActiveTab(next);
    tabRefs.current[next]?.focus();
  };

  const previewHeight = isFamily ? SIZE_INFO[size].height : active.key === 'card' ? 300 : active.key === 'planner' ? 420 : active.key === 'services' ? 400 : 340;
  const previewMaxWidth = isFamily && size === 'badge' ? 320 : 540;
  const themeLabel = theme === 'auto' ? 'Auto' : theme === 'dark' ? 'Dark' : 'Light';

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
              <button onClick={() => { setCardEmbedId(null); setCardResolve(null); setCardError(null); }}
                className="flex-none text-xs font-semibold text-neutral-500 hover:text-primary-700 border-2 border-neutral-200 rounded-md px-3 py-1.5">
                Start over
              </button>
            </div>
          ) : (
            <>
              <h4 className="text-sm font-semibold text-neutral-800 mb-1">Set up your card</h4>
              <p className="text-xs text-neutral-500 mb-3 leading-relaxed">
                Enter your business address once. We find your nearest float river and launch point, and compute the real drive time from your door.
              </p>
              <div className="flex gap-2 mb-3">
                <input type="text" value={cardForm.address} onChange={e => setCardForm(f => ({ ...f, address: e.target.value }))}
                  onKeyDown={e => { if (e.key === 'Enter') resolveCardLocation(); }} placeholder="123 River Rd, Steelville, MO" aria-label="Business address" className={inputCls} />
                <button onClick={resolveCardLocation} disabled={cardBusy || !cardForm.address.trim()}
                  className="flex-none text-sm font-semibold text-white px-4 py-2 rounded-md disabled:opacity-50" style={{ background: '#2D7889' }}>
                  {cardBusy && !cardResolve ? 'Looking…' : 'Find my river'}
                </button>
              </div>
              {cardError && <p className="text-xs font-medium text-red-600 mb-3" role="alert">{cardError}</p>}
              {cardResolve && (
                <>
                  <div className="bg-primary-50 border border-primary-200 rounded-md px-3 py-2 mb-3 text-xs text-primary-700 leading-relaxed">
                    Nearest river: <strong>{cardResolve.rivers[0]?.name}</strong> ({cardResolve.rivers[0]?.distanceMiles} mi away)
                    {cardResolve.rivers[1] && <> &middot; also nearby: {cardResolve.rivers[1].name} ({cardResolve.rivers[1].distanceMiles} mi)</>}
                    {' — '}confirm your launch below; picking a launch on a different river switches the card to that river.
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                    <div className="sm:col-span-2">
                      <label className={labelCls} htmlFor="card-launch">Your launch (nearest access points)</label>
                      <select id="card-launch" value={cardAccessPointId} onChange={e => setCardAccessPointId(e.target.value)} className={inputCls}>
                        {cardResolve.accessPoints.map(a => (
                          <option key={a.accessPointId} value={a.accessPointId}>{a.name} — {a.riverName} · {a.distanceMiles} mi</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className={labelCls} htmlFor="card-cta-url">Booking link (your site)</label>
                      <input id="card-cta-url" type="url" value={cardForm.ctaUrl} onChange={e => setCardForm(f => ({ ...f, ctaUrl: e.target.value }))} placeholder="https://yoursite.com/book" className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls} htmlFor="card-cta-label">Button text</label>
                      <input id="card-cta-label" type="text" value={cardForm.ctaLabel} onChange={e => setCardForm(f => ({ ...f, ctaLabel: e.target.value }))} placeholder="Book your trip" className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls} htmlFor="card-accent">Accent color</label>
                      <input id="card-accent" type="color" value={cardForm.accentColor} onChange={e => setCardForm(f => ({ ...f, accentColor: e.target.value }))} className="h-9 w-16 bg-white border-2 border-neutral-200 rounded-md cursor-pointer" />
                    </div>
                  </div>
                  <button onClick={createCard} disabled={cardBusy || !cardAccessPointId}
                    className="text-sm font-semibold text-white px-5 py-2.5 rounded-md disabled:opacity-50" style={{ background: '#F07052', boxShadow: '2px 2px 0 #A33122' }}>
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
          <p className="text-xs text-neutral-500 mb-3 leading-relaxed">Toggle up to 8 rivers, in the order you want them shown. Leave all off to show the first eight.</p>
          <div className="flex flex-wrap gap-2">
            {riverOptions.map(r => {
              const idx = multiRivers.indexOf(r.slug);
              const isOn = idx !== -1;
              return (
                <button key={r.slug} onClick={() => setMultiRivers(prev => isOn ? prev.filter(s => s !== r.slug) : prev.length >= 8 ? prev : [...prev, r.slug])}
                  aria-pressed={isOn}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium border-2 transition-all ${isOn ? 'border-primary-500 bg-primary-50 text-primary-700' : 'border-neutral-200 bg-white text-neutral-600 hover:border-neutral-300'}`}>
                  {isOn && <span className="text-[10px] font-bold mr-1.5 text-primary-500">{idx + 1}</span>}
                  {r.name}
                </button>
              );
            })}
          </div>
        </div>
      );
    }

    if (active.hasDays && size === 'full') {
      return (
        <div className="mb-5">
          <label className="block text-xs font-bold uppercase tracking-wide text-neutral-500 mb-2">Chart window</label>
          <div className="inline-flex rounded-md border-2 border-neutral-200 overflow-hidden" role="group" aria-label="Chart window">
            {[7, 14, 30].map(d => (
              <button key={d} onClick={() => setGaugeDays(d)} aria-pressed={gaugeDays === d}
                className={`px-4 py-2 text-sm font-semibold transition-colors ${gaugeDays === d ? 'bg-primary-600 text-white' : 'bg-white text-neutral-600 hover:bg-neutral-50'}`}>
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
        .filter(s => !highlightSearch || s.name.toLowerCase().includes(highlightSearch.toLowerCase()) || s.slug.toLowerCase().includes(highlightSearch.toLowerCase()));
      return (
        <div className="mb-5 bg-white border-2 border-neutral-200 rounded-lg p-4">
          <h4 className="text-sm font-semibold text-neutral-800 mb-3">Filter by category</h4>
          <div className="flex flex-wrap gap-2 mb-4">
            {SERVICE_CATEGORIES.map(opt => (
              <button key={opt.value} onClick={() => setServiceFilter(opt.value)} aria-pressed={serviceFilter === opt.value}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium border-2 transition-all ${serviceFilter === opt.value ? 'border-primary-500 bg-primary-50 text-primary-700' : 'border-neutral-200 bg-white text-neutral-600 hover:border-neutral-300'}`}>
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
                    <span key={slug} className="inline-flex items-center gap-1 px-2 py-0.5 bg-primary-50 border border-primary-200 text-primary-700 text-xs font-medium rounded-md">
                      {svc?.name || slug}
                      <button onClick={() => setHighlightSlugs(prev => prev.filter(s => s !== slug))} className="hover:text-primary-900 transition-colors" aria-label={`Remove ${svc?.name || slug}`}>
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
                <input type="text" value={highlightSearch}
                  onChange={e => { setHighlightSearch(e.target.value); setHighlightDropdownOpen(true); }}
                  onFocus={() => setHighlightDropdownOpen(true)}
                  onKeyDown={e => { if (e.key === 'Escape') setHighlightDropdownOpen(false); }}
                  placeholder="Search listings..."
                  className="w-full max-w-xs pl-8 pr-3 py-1.5 border border-neutral-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-primary-400 focus:border-primary-400" />
              </div>
              {highlightDropdownOpen && (
                <div className="absolute z-10 mt-1 w-full max-w-xs bg-white border border-neutral-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                  {visibleServices.map(s => (
                    <button key={s.slug} onClick={() => { setHighlightSlugs(prev => [...prev, s.slug]); setHighlightSearch(''); setHighlightDropdownOpen(false); }}
                      className="w-full text-left px-3 py-1.5 text-sm hover:bg-primary-50 transition-colors flex items-center justify-between">
                      <span className="truncate">{s.name}</span>
                      <span className="text-[10px] text-neutral-400 ml-2 flex-shrink-0">{s.type === 'outfitter' ? 'Outfitter' : s.type === 'campground' ? 'Campground' : 'Cabin & Lodge'}</span>
                    </button>
                  ))}
                  {visibleServices.length === 0 && <div className="px-3 py-2 text-xs text-neutral-400">No matching listings</div>}
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

  const brandingSection = (
    <section aria-labelledby="branding-title" className="mb-6 bg-white border-2 border-neutral-200 rounded-lg p-3">
      <h3 id="branding-title" className="text-sm font-bold text-neutral-800">Your branding <span className="text-xs font-medium text-neutral-500">· Optional & free</span></h3>
      {brandingId ? (
        <>
          <p className="text-xs text-support-700 my-2" role="status">Branding is included in your preview and embed code.</p>
          <button type="button" onClick={() => { setBrandingId(null); setBrandingOpen(false); setBrandingError(null); }} className="text-xs font-semibold text-primary-700 underline">Remove branding</button>
        </>
      ) : brandingOpen ? (
        <form onSubmit={e => { e.preventDefault(); void registerBranding(); }} className="mt-3">
          <fieldset disabled={brandingBusy} className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-neutral-600 mb-1" htmlFor="branding-name">Business name (optional)</label>
              <input id="branding-name" type="text" maxLength={120} value={brandingForm.businessName} onChange={e => setBrandingForm(f => ({ ...f, businessName: e.target.value }))} placeholder="Pine Valley Cabins"
                className="w-full text-sm text-neutral-800 bg-white rounded-md border-2 border-neutral-200 px-3 py-2 focus:outline-none focus:border-primary-400" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-neutral-600 mb-1" htmlFor="branding-logo">Logo URL (optional)</label>
              <input id="branding-logo" type="url" value={brandingForm.logoUrl} onChange={e => setBrandingForm(f => ({ ...f, logoUrl: e.target.value }))} placeholder="https://yoursite.com/logo.png" aria-describedby="branding-logo-help"
                className="w-full text-sm text-neutral-800 bg-white rounded-md border-2 border-neutral-200 px-3 py-2 focus:outline-none focus:border-primary-400" />
              <p id="branding-logo-help" className="text-xs text-neutral-500 mt-1">Use a direct image link. Your full logo stays visible without cropping.</p>
            </div>
            <div>
              <label className="block text-xs font-semibold text-neutral-600 mb-1" htmlFor="branding-site">Your website (optional)</label>
              <input id="branding-site" type="url" value={brandingForm.siteUrl} onChange={e => setBrandingForm(f => ({ ...f, siteUrl: e.target.value }))} placeholder="https://yoursite.com"
                className="w-full text-sm text-neutral-800 bg-white rounded-md border-2 border-neutral-200 px-3 py-2 focus:outline-none focus:border-primary-400" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-neutral-600 mb-1" htmlFor="branding-accent">Planner button color (optional)</label>
              <input id="branding-accent" type="color" value={brandingForm.accentColor} onChange={e => setBrandingForm(f => ({ ...f, accentColor: e.target.value }))} aria-describedby="branding-accent-help"
                className="h-9 w-16 bg-white border-2 border-neutral-200 rounded-md cursor-pointer" />
              <p id="branding-accent-help" className="text-xs text-neutral-500 mt-1">Used by the Float Trip Planner. The river and dam widgets take the accent from Style above.</p>
            </div>
            {(brandingForm.businessName.trim() || /^https?:\/\//i.test(brandingForm.logoUrl.trim())) && (
              <div className="rounded-md p-3" style={{ background: theme === 'dark' ? '#0F2D35' : '#F7F6F3' }}>
                <EmbedPartnerBrand businessName={brandingForm.businessName.trim()} logoUrl={/^https?:\/\//i.test(brandingForm.logoUrl.trim()) ? brandingForm.logoUrl.trim() : null} isDark={theme === 'dark'} compact showLogoError />
              </div>
            )}
            {brandingError && <p className="text-xs font-medium text-red-600" role="alert">{brandingError}</p>}
            <div className="flex flex-wrap gap-2">
              <button type="submit" disabled={brandingBusy || (!brandingForm.businessName.trim() && !brandingForm.logoUrl.trim())} className="text-xs font-semibold text-white bg-primary-600 px-3 py-2 rounded-md disabled:opacity-50">
                {brandingBusy ? 'Applying…' : 'Apply branding'}
              </button>
              <button type="button" onClick={() => { setBrandingOpen(false); setBrandingError(null); }} className="text-xs font-semibold text-neutral-500 px-2 py-2">Cancel</button>
            </div>
          </fieldset>
        </form>
      ) : (
        <>
          <p className="text-xs text-neutral-600 my-2">Add your logo, name, and an optional link to your site. Free, with Powered by Eddy visible.</p>
          <button type="button" onClick={() => setBrandingOpen(true)} className="text-xs font-semibold text-primary-700 border-2 border-primary-300 rounded-md px-3 py-2">Add branding</button>
        </>
      )}
    </section>
  );

  return (
    <div className="min-h-screen lg:h-screen flex flex-col bg-neutral-50 overflow-x-hidden" style={{ color: '#2D2A24' }}>
      {/* ===================== TOP BAR ===================== */}
      <header className="flex items-center gap-3.5 h-[60px] px-4 md:px-7 border-b-2 border-neutral-900 flex-none" style={{ background: '#163F4A' }}>
        <Link href="/" className="flex items-center gap-3">
          <Image src={EDDY_IMAGES.favicon} alt="Eddy" width={32} height={32} className="w-8 h-8 rounded-md" />
          <span className="font-bold text-xl text-white" style={{ fontFamily: 'var(--font-display)' }}>Eddy</span>
        </Link>
        <span className="hidden sm:inline-block text-[11px] font-semibold uppercase tracking-wider text-primary-300 border-l border-primary-600 pl-3.5" style={{ fontFamily: 'var(--font-mono)' }}>Widgets</span>
        <div className="ml-auto flex items-center gap-3 md:gap-5">
          <button onClick={() => openReference('params')} className="hidden sm:inline text-sm font-medium text-primary-200 hover:text-white transition-colors">Docs</button>
          <button onClick={() => openReference('api')} className="hidden sm:inline text-sm font-medium text-primary-200 hover:text-white transition-colors">API</button>
          <button onClick={() => setPartnerOpen(true)} className="inline-flex items-center gap-2 text-white text-sm font-semibold px-4 py-2 rounded-md" style={{ background: '#F07052', boxShadow: '2px 2px 0 #A33122' }}>
            Partner with Eddy
          </button>
        </div>
      </header>

      {/* ===================== BODY ===================== */}
      <div className="flex flex-col lg:flex-row flex-1 min-h-0 lg:h-[calc(100vh-60px)] lg:overflow-hidden">

        {/* =============== LEFT RAIL =============== */}
        {/* On phones the rail dissolves (display: contents) so the preview can
            sit between the choices that shape it and the appearance options.
            On desktop it is one scrolling column beside the workspace. */}
        <aside className="contents lg:flex lg:flex-col lg:order-1 lg:w-[352px] lg:flex-none bg-secondary-50 lg:border-r-2 border-neutral-900 lg:overflow-y-auto">
         <div className="order-1 lg:order-none bg-secondary-50 px-6 pt-6 pb-2 lg:pb-0">

          {/* Quick start — optional shortcuts that set size and format */}
          <div className={RAIL_KICKER} style={{ fontFamily: 'var(--font-mono)' }}>Quick start</div>
          <div className="flex flex-wrap gap-2 mb-6" role="group" aria-label="Placement shortcuts">
            {PLACEMENTS.map(p => {
              const isOn = placement === p.key;
              return (
                <button key={p.key} onClick={() => selectPlacement(p.key)} aria-pressed={isOn}
                  className={`px-3 py-1.5 rounded-full text-[13px] font-semibold border-2 transition-all ${isOn ? 'border-accent-500 bg-accent-500 text-white' : 'border-neutral-300 bg-white text-neutral-600 hover:border-neutral-400'}`}
                  style={isOn ? { boxShadow: '2px 2px 0 #A33122' } : undefined}>
                  {p.label}
                </button>
              );
            })}
          </div>
          {/* Widget */}
          <div className={RAIL_KICKER} style={{ fontFamily: 'var(--font-mono)' }}>Widget</div>
          <div className="flex flex-col gap-2 mb-4" role="list" aria-label="Widgets">
            {WIDGETS.map(w => {
              const isOn = w.key === activeWidget && !showReference;
              return (
                <button key={w.key} onClick={() => selectWidget(w.key)} aria-current={isOn ? 'true' : undefined}
                  className="flex items-center gap-2.5 w-full text-left rounded-lg px-3.5 py-2.5 bg-white transition-all"
                  style={{ border: `2px solid ${isOn ? '#F07052' : '#DBD5CA'}`, boxShadow: `3px 3px 0 ${isOn ? '#E5573F' : '#C2BAAC'}` }}>
                  <span className="w-2 h-2 rounded-full flex-none" style={{ background: isOn ? '#4EB86B' : '#C2BAAC' }} />
                  <span className={`text-sm ${isOn ? 'font-bold text-neutral-900' : 'font-semibold text-neutral-700'}`}>{w.title}</span>
                  {w.badge && <span className="ml-auto text-[9px] font-bold tracking-wide text-white px-1.5 py-0.5 rounded-full" style={{ background: w.badgeBg }}>{w.badge}</span>}
                </button>
              );
            })}
          </div>

          {/* River / dam picker */}
          {active.key === 'dam' ? (
            <>
              <label htmlFor="embed-dam" className={RAIL_LABEL}>Dam</label>
              <div className="relative mb-5">
                <select id="embed-dam" value={selectedDam} onChange={e => setSelectedDam(e.target.value)} className={SELECT_CLS} style={{ boxShadow: '2px 2px 0 #C2BAAC' }}>
                  {damOptions.map(d => <option key={d.id} value={d.id}>{d.name} · {d.state}{d.trout ? ' · trout' : ''}</option>)}
                  {!damOptions.some(d => d.id === selectedDam) && <option value={selectedDam}>{selectedDam}</option>}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary-600 pointer-events-none" />
              </div>
            </>
          ) : !active.hasCardSetup && !active.hasMultiRivers ? (
            <>
              <label htmlFor="embed-river" className={RAIL_LABEL}>River</label>
              <div className="relative mb-5">
                <select id="embed-river" value={selectedRiver} onChange={e => setSelectedRiver(e.target.value)} className={SELECT_CLS} style={{ boxShadow: '2px 2px 0 #C2BAAC' }}>
                  {riverOptions.map(r => <option key={r.slug} value={r.slug}>{r.name}</option>)}
                  {!riverOptions.some(r => r.slug === selectedRiver) && <option value={selectedRiver}>{selectedRiver}</option>}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary-600 pointer-events-none" />
              </div>
            </>
          ) : (
            <div className="mb-5 text-[13px] text-neutral-500 bg-white border-2 border-neutral-200 rounded-md px-3.5 py-2.5">
              <span className="font-bold text-neutral-700">River{active.hasMultiRivers ? 's' : ''}:</span>{' '}
              {active.hasMultiRivers ? 'picked with the river toggles next to the preview.' : 'resolved from your business address in the setup form.'}
            </div>
          )}

          {/* 3 · Size (family only) */}
          {isFamily && (
            <>
              <div className={RAIL_KICKER} style={{ fontFamily: 'var(--font-mono)' }}>Size</div>
              <div className="grid grid-cols-2 gap-2 mb-6" role="group" aria-label="Widget size">
                {EMBED_SIZES.map(s => {
                  const isOn = size === s;
                  return (
                    <button key={s} onClick={() => setSize(s)} aria-pressed={isOn}
                      className="text-left rounded-lg px-3 py-2 bg-white transition-all"
                      style={{ border: `2px solid ${isOn ? '#2D7889' : '#DBD5CA'}`, boxShadow: isOn ? '2px 2px 0 #1D525F' : '2px 2px 0 #C2BAAC' }}>
                      <span className={`block text-sm ${isOn ? 'font-bold text-primary-800' : 'font-semibold text-neutral-700'}`}>{SIZE_INFO[s].label}</span>
                      <span className="block text-xs text-neutral-500 leading-snug mt-0.5">{active.key === 'dam' ? DAM_SIZE_DETAIL[s] : SIZE_INFO[s].detail}</span>
                    </button>
                  );
                })}
              </div>
            </>
          )}

         </div>
         <div className="order-3 lg:order-none bg-secondary-50 px-6 pt-6 pb-6 lg:pt-0 flex flex-col lg:flex-1 border-t-2 lg:border-t-0 border-neutral-900">

          {/* Appearance */}
          <div className={RAIL_KICKER} style={{ fontFamily: 'var(--font-mono)' }}>Appearance</div>
          <span className={RAIL_LABEL}>Theme</span>
          <Segmented<EmbedThemeMode>
            label="Widget theme"
            value={theme}
            onChange={setTheme}
            options={isFamily || active.key === 'rivers'
              ? [{ value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }, { value: 'auto', label: 'Auto', title: 'Follows the visitor’s system setting' }]
              : [{ value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]}
          />
          <div className="mb-4" />

          {(isFamily || active.key === 'rivers') && (
            <div className="mb-6 space-y-3">
              <label className="flex items-center gap-2.5 text-[13px] font-semibold text-neutral-700 cursor-pointer">
                <input type="checkbox" checked={transparent} onChange={e => setTransparent(e.target.checked)} className="w-4 h-4 accent-primary-600" />
                Transparent background
              </label>
              <div className="flex items-center gap-3">
                <label htmlFor="embed-accent" className="text-[13px] font-semibold text-neutral-700">Link color</label>
                <input id="embed-accent" type="color" value={accent ?? '#256574'} onChange={e => setAccent(parseAccentColor(e.target.value))}
                  className="h-8 w-12 bg-white border-2 border-neutral-200 rounded-md cursor-pointer" />
                {accent && (
                  <button type="button" onClick={() => setAccent(null)} className="text-xs font-semibold text-primary-700 underline">Reset</button>
                )}
              </div>
            </div>
          )}

          {active.hasCardSetup && (
            <section aria-labelledby="card-branding-title" className="mb-6 bg-white border-2 border-neutral-200 rounded-lg p-3">
              <h3 id="card-branding-title" className="text-sm font-bold text-neutral-800">Your branding <span className="text-xs font-medium text-neutral-500">· Optional & free</span></h3>
              {cardEmbedId ? (
                <p className="text-xs text-neutral-600 mt-2">Your card includes your branding. Use Start over to create a new card with different details.</p>
              ) : (
                <fieldset disabled={cardBusy} className="space-y-3 mt-3">
                  <div>
                    <label className="block text-xs font-semibold text-neutral-600 mb-1" htmlFor="card-business">Business name (optional)</label>
                    <input id="card-business" type="text" maxLength={120} value={cardForm.businessName} onChange={e => setCardForm(f => ({ ...f, businessName: e.target.value }))} placeholder="Pine Valley Cabins" className="w-full text-sm text-neutral-800 bg-white rounded-md border-2 border-neutral-200 px-3 py-2" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-neutral-600 mb-1" htmlFor="card-logo">Logo URL (optional)</label>
                    <input id="card-logo" type="url" value={cardForm.logoUrl} onChange={e => setCardForm(f => ({ ...f, logoUrl: e.target.value }))} placeholder="https://yoursite.com/logo.png" className="w-full text-sm text-neutral-800 bg-white rounded-md border-2 border-neutral-200 px-3 py-2" />
                  </div>
                  {(cardForm.businessName.trim() || /^https?:\/\//i.test(cardForm.logoUrl.trim())) && (
                    <div className="rounded-md p-3" style={{ background: theme === 'dark' ? '#0F2D35' : '#F7F6F3' }}>
                      <EmbedPartnerBrand businessName={cardForm.businessName.trim()} logoUrl={/^https?:\/\//i.test(cardForm.logoUrl.trim()) ? cardForm.logoUrl.trim() : null} isDark={theme === 'dark'} showLogoError />
                    </div>
                  )}
                  <p className="text-xs text-neutral-500">Included when you create your card. No cropping, no account, no cost.</p>
                </fieldset>
              )}
            </section>
          )}
          {!active.hasCardSetup && !(isFamily && size === 'badge') && brandingSection}
          {isFamily && size === 'badge' && <p className="text-xs text-neutral-500 mb-6">The badge has no partner branding. Choose a larger size to add your logo or name.</p>}

          <div className="mt-auto pt-6">
            <nav aria-label="Site" className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs">
              {SITE_LINKS.map(l => <Link key={l.href} href={l.href} className="text-neutral-500 hover:text-primary-700 font-medium transition-colors">{l.label}</Link>)}
            </nav>
          </div>
         </div>
        </aside>

        {/* =============== RIGHT WORKSPACE =============== */}
        <main className="order-2 lg:order-2 lg:flex-1 min-w-0 flex flex-col bg-neutral-50 lg:overflow-hidden">
          {showReference ? (
            <div className="flex-1 lg:overflow-y-auto px-5 md:px-9 py-7">
              <div className="max-w-3xl">
                <button onClick={() => setShowReference(false)} className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary-700 hover:text-primary-800 mb-6">
                  <ArrowLeft className="w-4 h-4" /> Back to widgets
                </button>

                <section id="ref-params" className="scroll-mt-6 mb-10">
                  <h2 className="text-2xl font-bold text-primary-800 mb-1" style={{ fontFamily: 'var(--font-display)' }}>Parameters Reference</h2>
                  <p className="text-sm text-neutral-600 mb-4">
                    Widgets are URLs. Add these as query parameters to the iframe <code className="bg-neutral-100 px-1 py-0.5 rounded text-xs">src</code>, or as <code className="bg-neutral-100 px-1 py-0.5 rounded text-xs">data-*</code> attributes with the script loader.
                  </p>
                  <div className="bg-white border-2 border-neutral-200 rounded-xl overflow-hidden">
                    <div className="px-4 py-3 border-b border-neutral-100 bg-neutral-50"><h3 className="text-sm font-semibold text-neutral-800">River &amp; dam widgets · /embed/river/&lt;slug&gt; · /embed/dam/&lt;id&gt;</h3></div>
                    <div className="px-4 py-2"><table className="w-full"><tbody>
                      {COMMON_PARAMS.map(p => <ParamRow key={p.name} name={p.name} values={p.values} description={p.note ?? ''} />)}
                      <ParamRow name="days" values="7 | 14 | 30" description="Chart window on the full size (river)." />
                    </tbody></table></div>
                    <div className="px-4 py-3 border-b border-t border-neutral-100 bg-neutral-50"><h3 className="text-sm font-semibold text-neutral-800">Images · /embed/img/&lt;river|dam&gt;/&lt;key&gt;/&lt;badge|strip&gt;.&lt;png|svg&gt;</h3></div>
                    <div className="px-4 py-2"><table className="w-full"><tbody>
                      <ParamRow name="theme" values="light | dark" description="Images cannot follow the system setting; auto renders light." />
                      <ParamRow name="bg" values="transparent" description="Transparent PNG / SVG background." />
                      <ParamRow name="accent" values="#rrggbb" description="Mark and link color on the dam image; the river pill keeps condition colors." />
                    </tbody></table></div>
                    <div className="px-4 py-3 border-b border-t border-neutral-100 bg-neutral-50"><h3 className="text-sm font-semibold text-neutral-800">Script loader · /embed.js</h3></div>
                    <div className="px-4 py-2"><table className="w-full"><tbody>
                      <ParamRow name="data-eddy-river" values="slug" description="Mount a river widget in this element." />
                      <ParamRow name="data-eddy-dam" values="dam id" description="Mount a dam widget in this element." />
                      <ParamRow name="data-eddy-rivers" values="slug,slug,…" description="Mount the multi-river overview." />
                      <ParamRow name="data-size / data-theme / data-bg / data-accent / data-days / data-partner / data-embed" values="as above" description="Each query parameter has a data- twin." />
                    </tbody></table></div>
                    <div className="px-4 py-3 border-b border-t border-neutral-100 bg-neutral-50"><h3 className="text-sm font-semibold text-neutral-800">Float Trip Planner</h3></div>
                    <div className="px-4 py-2"><table className="w-full"><tbody>
                      <ParamRow name="river" values="slug" description="Pre-select a river (e.g. current, meramec)." />
                    </tbody></table></div>
                    <div className="px-4 py-3 border-b border-t border-neutral-100 bg-neutral-50"><h3 className="text-sm font-semibold text-neutral-800">Multi-River Overview</h3></div>
                    <div className="px-4 py-2"><table className="w-full"><tbody>
                      <ParamRow name="rivers" values="slug,slug,..." description="Which rivers to show, in order (max 8). Omit for the first eight." />
                    </tbody></table></div>
                    <div className="px-4 py-3 border-b border-t border-neutral-100 bg-neutral-50"><h3 className="text-sm font-semibold text-neutral-800">Services Directory</h3></div>
                    <div className="px-4 py-2"><table className="w-full"><tbody>
                      <ParamRow name="type" values="outfitter | campground | cabin_lodge" description="Show only one service type." />
                      <ParamRow name="highlight" values="slug,slug,..." description="Show only specific listings. Comma-separated slugs." />
                      <ParamRow name="exclude" values="type,type,..." description="Hide service types. Comma-separated; ignored when type is set." />
                    </tbody></table></div>
                    <div className="px-4 py-3 border-t border-neutral-100 bg-neutral-50"><h3 className="text-sm font-semibold text-neutral-800">Legacy URLs</h3></div>
                    <div className="px-4 py-3 text-xs text-neutral-600 leading-relaxed">
                      <code className="bg-neutral-100 px-1 py-0.5 rounded">/embed/widget/</code>, <code className="bg-neutral-100 px-1 py-0.5 rounded">/embed/eddy-quote/</code>, <code className="bg-neutral-100 px-1 py-0.5 rounded">/embed/gauge-report/</code> and <code className="bg-neutral-100 px-1 py-0.5 rounded">/embed/badge/</code> keep working as the full, card, full and badge sizes. Nothing you pasted needs to change.
                    </div>
                  </div>
                </section>

                <section id="ref-api" className="scroll-mt-6">
                  <h2 className="text-2xl font-bold text-primary-800 mb-1" style={{ fontFamily: 'var(--font-display)' }}>API Access</h2>
                  <p className="text-sm text-neutral-600 mb-4">Fetch data directly and build your own display.</p>
                  <div className="space-y-3">
                    <CodeBlock code={`GET ${EMBED_BASE}/api/rivers`} label="Rivers — conditions, lengths, access point counts" />
                    <CodeBlock code={`GET ${EMBED_BASE}/api/gauges`} label="Gauges — all gauge stations with latest readings and thresholds" />
                    <CodeBlock code={`GET ${EMBED_BASE}/api/dams\nGET ${EMBED_BASE}/api/dams/{damId}`} label="Dams — lake level, release, generation and the hourly schedule" />
                    <CodeBlock code={`GET ${EMBED_BASE}/api/rivers/{slug}/services`} label="Services — outfitters, campgrounds, lodging for a river" />
                  </div>
                  <div className="mt-4 bg-amber-50 border border-amber-200 rounded-xl p-4">
                    <h3 className="text-sm font-semibold text-amber-800 mb-1">Rate Limits</h3>
                    <p className="text-xs text-amber-700">
                      API endpoints are rate limited per IP. The rivers, gauges and services endpoints allow 60 requests per minute; the plan endpoint allows 30. Exceeding the limit returns a{' '}
                      <code className="bg-amber-100 px-1 py-0.5 rounded">429</code> response with a <code className="bg-amber-100 px-1 py-0.5 rounded">Retry-After</code> header. Widgets handle caching automatically.
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
                  <h1 className="text-2xl md:text-[28px] font-semibold text-primary-800 m-0" style={{ fontFamily: 'var(--font-display)', letterSpacing: '-0.01em' }}>
                    {active.title}{isFamily ? ` · ${SIZE_INFO[size].label}` : ''}
                  </h1>
                  {active.badge && <span className="text-[10px] font-bold tracking-wide text-white px-2 py-1 rounded-full" style={{ background: active.badgeBg }}>{active.badge}</span>}
                </div>
                <p className="text-[15px] text-neutral-600 leading-relaxed max-w-2xl mb-4">{active.desc}</p>
                <div className="flex gap-1" role="tablist" aria-label="Widget views" onKeyDown={onTabKeyDown}>
                  {TABS.map(t => (
                    <button key={t} role="tab" id={`tab-${t}`} aria-selected={activeTab === t} aria-controls={`panel-${t}`} tabIndex={activeTab === t ? 0 : -1}
                      ref={el => { tabRefs.current[t] = el; }} onClick={() => setActiveTab(t)}
                      className={`text-sm font-semibold px-4 py-2.5 border-b-2 -mb-0.5 transition-colors ${activeTab === t ? 'text-primary-800 border-accent-500' : 'text-neutral-500 border-transparent hover:text-primary-700'}`}>
                      {TAB_LABEL[t]}
                    </button>
                  ))}
                </div>
              </div>

              <div role="tabpanel" id={`panel-${activeTab}`} aria-labelledby={`tab-${activeTab}`} tabIndex={0} className="flex-1 lg:overflow-y-auto px-5 md:px-9 py-7 focus:outline-none">

                {/* ============ PREVIEW TAB ============ */}
                {activeTab === 'preview' && (
                  <div>
                    <div className="flex flex-wrap items-center justify-between gap-3 mb-3.5">
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500" style={{ fontFamily: 'var(--font-mono)' }}>Live preview &middot; {themeLabel}</div>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-semibold text-neutral-500">On a</span>
                        <div className="inline-flex rounded-md border-2 border-neutral-200 overflow-hidden" role="group" aria-label="Host page background">
                          {(Object.keys(HOST_BG) as HostBg[]).map(h => (
                            <button key={h} onClick={() => setHost(h)} aria-pressed={host === h}
                              className={`px-3 py-1.5 text-xs font-semibold transition-colors ${host === h ? 'bg-primary-600 text-white' : 'bg-white text-neutral-600 hover:bg-neutral-50'}`}>
                              {HOST_BG[h].label}
                            </button>
                          ))}
                        </div>
                        <span className="text-[11px] font-semibold text-neutral-500">page</span>
                      </div>
                    </div>
                    {renderWidgetOptions()}
                    {previewSrc ? (
                      effectiveFormat === 'image' ? (
                        <>
                          <HostSurface host={host}>
                            {/* Live PNG from the image route; a plain <img>, exactly as the host would use it. */}
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img key={`${baseUrl}${imagePath(ctx, active.key, 'png')}`} src={`${baseUrl}${imagePath(ctx, active.key, 'png')}`} alt={snippetTitle} style={{ maxWidth: '100%', height: 'auto', display: 'inline-block' }} />
                          </HostSurface>
                        </>
                      ) : (
                        <>
                          <WidgetPreview src={previewSrc} height={previewHeight} maxWidth={previewMaxWidth} host={host} inline={isFamily && size === 'badge'} />
                        </>
                      )
                    ) : (
                      <div className="flex items-center justify-center rounded-xl border-2 border-dashed border-neutral-300 bg-white text-sm text-neutral-400" style={{ height: previewHeight, maxWidth: 540 }}>
                        {!hydrated ? 'Loading preview…' : active.hasCardSetup ? 'Enter your address above to generate your card' : 'Choose a dam to preview'}
                      </div>
                    )}
                  </div>
                )}

                {/* ============ CODE TAB ============ */}
                {activeTab === 'code' && (
                  <div className="grid grid-cols-1 lg:grid-cols-[1.5fr_1fr] gap-6 max-w-5xl items-start">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500" style={{ fontFamily: 'var(--font-mono)' }}>{'Copy & paste this'}</div>
                        {(scriptAvailable || imageAvailable) && (
                          <div className="inline-flex rounded-md border-2 border-neutral-200 overflow-hidden" role="group" aria-label="Embed format">
                            {([
                              { v: 'iframe' as Format, label: 'Iframe', ok: true },
                              { v: 'script' as Format, label: 'Script tag', ok: scriptAvailable },
                              { v: 'image' as Format, label: 'Image', ok: imageAvailable },
                            ]).filter(o => o.ok).map(o => (
                              <button key={o.v} onClick={() => setFormat(o.v)} aria-pressed={effectiveFormat === o.v}
                                className={`px-3 py-1.5 text-xs font-semibold transition-colors ${effectiveFormat === o.v ? 'bg-primary-600 text-white' : 'bg-white text-neutral-600 hover:bg-neutral-50'}`}>
                                {o.label}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      {renderWidgetOptions()}
                      <CodeBlock code={code} label={`HTML · ${active.key}${isFamily ? ` · ${size}` : ''} · ${effectiveFormat} · ${themeLabel}`} />
                      <div className="mt-3"><CopyButton text={code} large /></div>
                    </div>
                    <details className="group">
                      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 text-sm font-bold text-neutral-700 [&::-webkit-details-marker]:hidden">
                        Advanced: URL parameters
                        <ChevronDown className="w-4 h-4 text-neutral-500 transition-transform group-open:rotate-180" aria-hidden="true" />
                      </summary>
                      <div className="flex flex-col gap-2.5 mt-2">
                        {active.params.map(p => (
                          <div key={p.name} className="bg-white border-2 border-neutral-200 rounded-md px-3 py-2.5">
                            <code className="font-mono text-[13px] font-semibold text-primary-600">{p.name}</code>
                            <span className="text-xs text-neutral-500 ml-1.5">{p.values}</span>
                            {p.note && <div className="text-xs text-neutral-500 mt-1">{p.note}</div>}
                          </div>
                        ))}
                      </div>
                    </details>
                  </div>
                )}

                {/* ============ HELP TAB ============ */}
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
                    <div className="mt-7 rounded-xl border-2 border-neutral-900 p-6 md:p-7 flex flex-col sm:flex-row items-center gap-5" style={{ background: 'linear-gradient(135deg,#163F4A,#0F2D35)', boxShadow: '6px 6px 0 #C2BAAC' }}>
                      <Image src={EDDY_IMAGES.canoe} alt="Eddy the Otter" width={120} height={120} className="h-20 w-auto flex-none" />
                      <div className="flex-1 text-center sm:text-left">
                        <h3 className="text-xl md:text-[22px] font-bold text-white mb-1.5" style={{ fontFamily: 'var(--font-display)' }}>Run an outfitter, fly shop, campground or marina?</h3>
                        <p className="text-sm text-white/80 max-w-md leading-relaxed">Get a co-branded widget, a directory listing, and priority support — free for local businesses.</p>
                      </div>
                      <button onClick={() => setPartnerOpen(true)} className="flex-none inline-flex items-center gap-2 text-white text-[15px] font-semibold px-5 py-3 rounded-lg" style={{ background: '#F07052', boxShadow: '3px 3px 0 #A33122' }}>
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

      <PartnerModal isOpen={partnerOpen} onClose={() => setPartnerOpen(false)} onSelectCard={() => selectWidget('card')} />
    </div>
  );
}
