'use client';

// src/app/embed/page.tsx
// Beginner-friendly guide for adding Eddy river conditions to external websites

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Copy, Check, ExternalLink, ChevronDown } from 'lucide-react';
import SiteFooter from '@/components/ui/SiteFooter';

const EDDY_IMAGE = 'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy_the_Otter.png';
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

function FAQ({ question, children }: { question: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-neutral-200 last:border-b-0">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between py-4 text-left"
      >
        <span className="font-semibold text-neutral-900 text-sm">{question}</span>
        <ChevronDown className={`w-4 h-4 text-neutral-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="pb-4 text-sm text-neutral-600 leading-relaxed">
          {children}
        </div>
      )}
    </div>
  );
}

export default function EmbedPage() {
  const [selectedRiver, setSelectedRiver] = useState('current');
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'https://eddy.guide';
  const selectedRiverName = RIVER_OPTIONS.find(r => r.slug === selectedRiver)?.name || '';

  const widgetCode = `<iframe
  src="${baseUrl}/embed/widget/${selectedRiver}?theme=${theme}"
  width="100%"
  height="380"
  style="border: none; border-radius: 12px; max-width: 600px;"
  title="${selectedRiverName} - River Conditions from Eddy"
  loading="lazy"
></iframe>`;

  // (#15) Condition Badge instead of plain link button
  const badgeCode = `<a href="${baseUrl}/rivers/${selectedRiver}" target="_blank" rel="noopener noreferrer" style="display:inline-flex;align-items:center;gap:8px;padding:8px 16px;background:${theme === 'dark' ? '#1a1a1a' : '#ffffff'};color:${theme === 'dark' ? '#e5e5e5' : '#1a1a1a'};border:1.5px solid ${theme === 'dark' ? '#333' : '#e5e5e5'};border-radius:8px;text-decoration:none;font-family:system-ui,sans-serif;font-size:13px;font-weight:600;">
  <img src="${EDDY_IMAGE}" alt="Eddy" width="20" height="20" style="border-radius:50%;" />
  ${selectedRiverName} Conditions
  <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#059669;"></span>
</a>`;

  const plannerCode = `<iframe
  src="${baseUrl}/embed/planner?river=${selectedRiver}&theme=${theme}"
  width="100%"
  height="380"
  style="border: none; border-radius: 12px; max-width: 600px;"
  title="Plan Your Float - Eddy"
  loading="lazy"
></iframe>`;

  const eddyQuoteCode = `<iframe
  src="${baseUrl}/embed/eddy-quote/${selectedRiver}?theme=${theme}"
  width="100%"
  height="260"
  style="border: none; border-radius: 12px; max-width: 600px;"
  title="${selectedRiverName} - Eddy's Take"
  loading="lazy"
></iframe>`;

  return (
    <div className="min-h-screen bg-neutral-50 overflow-x-hidden">
      {/* Header */}
      <section
        className="relative py-12 md:py-16 text-white"
        style={{ background: 'linear-gradient(to bottom right, #0F2D35, #163F4A, #0F2D35)' }}
      >
        <div className="max-w-3xl mx-auto px-4 text-center">
          <div className="-mb-1">
            <Image
              src={EDDY_CANOE_IMAGE}
              alt="Eddy the Otter"
              width={300}
              height={300}
              className="mx-auto h-28 md:h-36 w-auto drop-shadow-[0_4px_24px_rgba(240,112,82,0.3)]"
              priority
            />
          </div>
          <h1
            className="text-4xl md:text-5xl font-bold mb-3"
            style={{ fontFamily: 'var(--font-display)', color: '#F07052' }}
          >
            Add Eddy to Your Website
          </h1>
          <p className="text-lg text-white/80 max-w-xl mx-auto">
            Show your visitors live river conditions right on your site.
            No coding experience needed.
          </p>
          {/* (#5) Value proposition for outfitters */}
          <p className="text-sm text-white/50 mt-3 max-w-md mx-auto">
            Perfect for outfitters, campgrounds, tourism sites, and fishing guides — give
            your visitors the info they&apos;re already looking for.
          </p>
        </div>
      </section>

      <div className="max-w-3xl mx-auto px-4 py-10 space-y-10">

        {/* (#1) REMOVED duplicate "How It Works" section — the numbered steps below communicate the flow */}

        {/* Step 1: Pick your river + global theme toggle (#3) */}
        <section>
          <div className="flex items-center gap-3 mb-4">
            <div className="flex items-center justify-center w-8 h-8 rounded-full text-white text-sm font-bold" style={{ backgroundColor: '#F07052' }}>
              1
            </div>
            <h2 className="text-2xl font-bold text-neutral-900">Pick Your River &amp; Theme</h2>
          </div>

          <div className="bg-white border-2 border-neutral-200 rounded-2xl p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* River selector */}
              <div>
                <label className="block text-sm font-semibold text-neutral-700 mb-2">
                  Which river do you want to show?
                </label>
                <div className="relative">
                  <select
                    value={selectedRiver}
                    onChange={(e) => setSelectedRiver(e.target.value)}
                    className="w-full px-4 py-3 border-2 border-neutral-200 rounded-xl text-base bg-white appearance-none cursor-pointer focus:ring-2 focus:ring-primary-400 focus:border-primary-400"
                  >
                    {RIVER_OPTIONS.map((r) => (
                      <option key={r.slug} value={r.slug}>{r.name}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-400 pointer-events-none" />
                </div>
              </div>

              {/* (#3) Global theme toggle */}
              <div>
                <p className="text-sm font-semibold text-neutral-700 mb-2">Widget theme:</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setTheme('light')}
                    className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium border-2 transition-all flex-1 ${
                      theme === 'light'
                        ? 'border-primary-500 bg-primary-50 text-primary-700'
                        : 'border-neutral-200 bg-white text-neutral-600 hover:border-neutral-300'
                    }`}
                  >
                    <div className="w-4 h-4 rounded-full bg-white border border-neutral-300" />
                    Light
                  </button>
                  <button
                    onClick={() => setTheme('dark')}
                    className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium border-2 transition-all flex-1 ${
                      theme === 'dark'
                        ? 'border-primary-500 bg-primary-50 text-primary-700'
                        : 'border-neutral-200 bg-white text-neutral-600 hover:border-neutral-300'
                    }`}
                  >
                    <div className="w-4 h-4 rounded-full bg-neutral-800 border border-neutral-600" />
                    Dark
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Step 2: Choose a widget (#2 fixed copy — 4 options in 2 categories) */}
        <section>
          <div className="flex items-center gap-3 mb-4">
            <div className="flex items-center justify-center w-8 h-8 rounded-full text-white text-sm font-bold" style={{ backgroundColor: '#F07052' }}>
              2
            </div>
            <h2 className="text-2xl font-bold text-neutral-900">Choose a Widget</h2>
          </div>

          <p className="text-neutral-600 mb-6">
            We offer four widgets in two categories. Pick what works best for your site.
          </p>

          {/* Category: Data Widgets */}
          <div className="mb-4">
            <h3 className="text-xs font-bold text-neutral-400 uppercase tracking-wider mb-3">Data Widgets — Show Live Conditions</h3>
          </div>

          {/* === OPTION A: Live Widget === */}
          <div className="bg-white border-2 border-primary-200 rounded-2xl overflow-hidden mb-6">
            <div className="px-6 py-4 border-b-2 border-primary-100" style={{ backgroundColor: '#2D788910' }}>
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 bg-primary-600 text-white text-xs font-bold rounded-full">Recommended</span>
                <h3 className="text-lg font-bold text-neutral-900">Live Conditions Widget</h3>
              </div>
              <p className="text-sm text-neutral-600 mt-1">
                Shows current river status with gauge readings, weather, and trend arrows. Updates automatically.
              </p>
            </div>

            <div className="p-6">
              {/* Live Preview */}
              <div className="mb-4">
                <p className="text-xs text-neutral-400 mb-2 uppercase tracking-wide font-semibold">Preview</p>
                <div className={`rounded-xl border-2 p-4 ${theme === 'dark' ? 'border-neutral-700 bg-neutral-800' : 'border-neutral-200 bg-neutral-50'}`}>
                  <div style={{ maxWidth: 480 }}>
                    <iframe
                      src={`${baseUrl}/embed/widget/${selectedRiver}?theme=${theme}`}
                      width="100%"
                      height="380"
                      style={{ border: 'none', borderRadius: '12px' }}
                      title="Widget preview"
                    />
                  </div>
                </div>
              </div>

              {/* Code block */}
              <div className="bg-neutral-900 rounded-xl overflow-hidden mb-3 min-w-0">
                <div className="flex items-center justify-between px-4 py-2 border-b border-neutral-700">
                  <span className="text-xs text-neutral-400 font-medium">HTML code</span>
                  <CopyButton text={widgetCode} />
                </div>
                <pre className="p-4 text-xs text-neutral-300 overflow-x-auto max-w-full">
                  <code>{widgetCode}</code>
                </pre>
              </div>

              <CopyButton text={widgetCode} large />

              {/* (#11) Height adjustment note */}
              <p className="text-xs text-neutral-500 mt-3">
                Adjust the <code className="bg-neutral-100 px-1 py-0.5 rounded text-xs">height</code> value
                if your river has more gauge stations. Rivers with 3+ gauges may need 400-450px.
              </p>
            </div>
          </div>

          {/* === OPTION B: Eddy Quote === */}
          <div className="bg-white border-2 border-neutral-200 rounded-2xl overflow-hidden mb-6">
            <div className="px-6 py-4 border-b-2 border-neutral-100">
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 bg-emerald-600 text-white text-xs font-bold rounded-full">New</span>
                <h3 className="text-lg font-bold text-neutral-900">Eddy&apos;s Daily Quote</h3>
              </div>
              <p className="text-sm text-neutral-600 mt-1">
                AI-generated condition summary in Eddy&apos;s voice with a clear float/no-float recommendation.
                Updates throughout the day with gauge readings, weather, and local knowledge.
              </p>
            </div>

            <div className="p-6">
              {/* Live Preview */}
              <div className="mb-4">
                <p className="text-xs text-neutral-400 mb-2 uppercase tracking-wide font-semibold">Preview</p>
                <div className={`rounded-xl border-2 p-4 ${theme === 'dark' ? 'border-neutral-700 bg-neutral-800' : 'border-neutral-200 bg-neutral-50'}`}>
                  <div style={{ maxWidth: 480 }}>
                    <iframe
                      src={`${baseUrl}/embed/eddy-quote/${selectedRiver}?theme=${theme}`}
                      width="100%"
                      height="260"
                      style={{ border: 'none', borderRadius: '12px' }}
                      title="Eddy quote preview"
                    />
                  </div>
                </div>
              </div>

              {/* Code block */}
              <div className="bg-neutral-900 rounded-xl overflow-hidden mb-3 min-w-0">
                <div className="flex items-center justify-between px-4 py-2 border-b border-neutral-700">
                  <span className="text-xs text-neutral-400 font-medium">HTML code</span>
                  <CopyButton text={eddyQuoteCode} />
                </div>
                <pre className="p-4 text-xs text-neutral-300 overflow-x-auto max-w-full">
                  <code>{eddyQuoteCode}</code>
                </pre>
              </div>

              <CopyButton text={eddyQuoteCode} large />
            </div>
          </div>

          {/* Category: Action Widgets */}
          <div className="mb-4 mt-10">
            <h3 className="text-xs font-bold text-neutral-400 uppercase tracking-wider mb-3">Action Widgets — Help Visitors Plan</h3>
          </div>

          {/* === OPTION C: Float Planner (#16 moved up) === */}
          <div className="bg-white border-2 border-primary-200 rounded-2xl overflow-hidden mb-6">
            <div className="px-6 py-4 border-b-2 border-primary-100" style={{ backgroundColor: '#F0705210' }}>
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 text-white text-xs font-bold rounded-full" style={{ backgroundColor: '#F07052' }}>Best for Outfitters</span>
                <h3 className="text-lg font-bold text-neutral-900">Float Trip Planner</h3>
              </div>
              <p className="text-sm text-neutral-600 mt-1">
                Let visitors pick a river, put-in, and take-out right from your site. Shows distance,
                float time estimate, and current conditions before sending them to Eddy for full details.
              </p>
            </div>

            <div className="p-6">
              {/* Preview */}
              <div className="mb-4">
                <p className="text-xs text-neutral-400 mb-2 uppercase tracking-wide font-semibold">Preview</p>
                <div className={`rounded-xl border-2 p-4 ${theme === 'dark' ? 'border-neutral-700 bg-neutral-800' : 'border-neutral-200 bg-neutral-50'}`}>
                  <div style={{ maxWidth: 480 }}>
                    <iframe
                      src={`${baseUrl}/embed/planner?river=${selectedRiver}&theme=${theme}`}
                      width="100%"
                      height="380"
                      style={{ border: 'none', borderRadius: '12px' }}
                      title="Float planner preview"
                    />
                  </div>
                </div>
              </div>

              {/* Code block */}
              <div className="bg-neutral-900 rounded-xl overflow-hidden mb-3 min-w-0">
                <div className="flex items-center justify-between px-4 py-2 border-b border-neutral-700">
                  <span className="text-xs text-neutral-400 font-medium">HTML code</span>
                  <CopyButton text={plannerCode} />
                </div>
                <pre className="p-4 text-xs text-neutral-300 overflow-x-auto max-w-full">
                  <code>{plannerCode}</code>
                </pre>
              </div>

              <CopyButton text={plannerCode} large />

              <p className="text-xs text-neutral-500 mt-3">
                The selected river will be pre-selected. Visitors can still change rivers.
                Add <code className="bg-neutral-100 px-1 py-0.5 rounded text-xs">&amp;partner=YourBusiness</code> to
                the src URL to show your business name in the widget footer.
              </p>
            </div>
          </div>

          {/* === OPTION D: Condition Badge (#15 evolved from Simple Link Button) === */}
          <div className="bg-white border-2 border-neutral-200 rounded-2xl overflow-hidden">
            <div className="px-6 py-4 border-b-2 border-neutral-100">
              <h3 className="text-lg font-bold text-neutral-900">Condition Badge</h3>
              <p className="text-sm text-neutral-600 mt-1">
                A compact inline badge showing the river name and live condition dot.
                Great for blog posts, sidebars, or anywhere a full widget is too heavy.
              </p>
            </div>

            <div className="p-6">
              {/* Preview (#4 theme-aware) */}
              <div className="mb-4">
                <p className="text-xs text-neutral-400 mb-2 uppercase tracking-wide font-semibold">Preview</p>
                <div className={`rounded-xl border-2 p-6 ${theme === 'dark' ? 'border-neutral-700 bg-neutral-800' : 'border-neutral-200 bg-neutral-50'}`}>
                  <a
                    href={`/rivers/${selectedRiver}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold no-underline"
                    style={{
                      backgroundColor: theme === 'dark' ? '#1a1a1a' : '#ffffff',
                      color: theme === 'dark' ? '#e5e5e5' : '#1a1a1a',
                      border: theme === 'dark' ? '1.5px solid #333' : '1.5px solid #e5e5e5',
                    }}
                  >
                    <Image src={EDDY_IMAGE} alt="Eddy" width={20} height={20} className="w-5 h-5 rounded-full" />
                    {selectedRiverName} Conditions
                    <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" />
                  </a>
                </div>
              </div>

              {/* Code block */}
              <div className="bg-neutral-900 rounded-xl overflow-hidden mb-3 min-w-0">
                <div className="flex items-center justify-between px-4 py-2 border-b border-neutral-700">
                  <span className="text-xs text-neutral-400 font-medium">HTML code</span>
                  <CopyButton text={badgeCode} />
                </div>
                <pre className="p-4 text-xs text-neutral-300 overflow-x-auto whitespace-pre-wrap max-w-full">
                  <code>{badgeCode}</code>
                </pre>
              </div>

              <CopyButton text={badgeCode} large />

              <p className="text-xs text-neutral-500 mt-3">
                The condition dot is static in the code snippet. For a live-updating dot,
                use the Live Conditions Widget or Eddy&apos;s Daily Quote instead.
              </p>
            </div>
          </div>
        </section>

        {/* (#6) Combination guidance */}
        <section className="bg-primary-50 border-2 border-primary-200 rounded-2xl p-6">
          <h3 className="font-bold text-neutral-900 mb-2">Pro Tip: Pair Widgets Together</h3>
          <p className="text-sm text-neutral-700 leading-relaxed">
            For the best experience, combine the <strong>Live Conditions Widget</strong> with the{' '}
            <strong>Float Trip Planner</strong> on your site. Visitors see current conditions first,
            then plan their trip — all without leaving your page. Just copy both code snippets
            and paste them where you want them to appear.
          </p>
        </section>

        {/* Step 3: Paste into your site */}
        <section>
          <div className="flex items-center gap-3 mb-4">
            <div className="flex items-center justify-center w-8 h-8 rounded-full text-white text-sm font-bold" style={{ backgroundColor: '#F07052' }}>
              3
            </div>
            <h2 className="text-2xl font-bold text-neutral-900">Paste Into Your Website</h2>
          </div>

          <div className="space-y-4">
            {/* WordPress */}
            <div className="bg-white border-2 border-neutral-200 rounded-2xl p-5">
              <h3 className="font-bold text-neutral-900 mb-2">WordPress</h3>
              <ol className="list-decimal list-inside space-y-1.5 text-sm text-neutral-700 leading-relaxed">
                <li>Open the page or post where you want the widget to appear.</li>
                <li>Add a <strong>Custom HTML</strong> block (click the <strong>+</strong> button and search for &quot;HTML&quot;).</li>
                <li>Paste the code you copied above into the block.</li>
                <li>Click <strong>Preview</strong> to see it, then <strong>Publish</strong> or <strong>Update</strong>.</li>
              </ol>
            </div>

            {/* Squarespace */}
            <div className="bg-white border-2 border-neutral-200 rounded-2xl p-5">
              <h3 className="font-bold text-neutral-900 mb-2">Squarespace</h3>
              <ol className="list-decimal list-inside space-y-1.5 text-sm text-neutral-700 leading-relaxed">
                <li>Edit the page where you want the widget.</li>
                <li>Click <strong>Add Block</strong> and choose <strong>Code</strong> (under &quot;More&quot;).</li>
                <li>Paste the code into the code block. Make sure <strong>Display Source</strong> is unchecked.</li>
                <li>Click outside the block to save, then publish your changes.</li>
              </ol>
            </div>

            {/* Wix */}
            <div className="bg-white border-2 border-neutral-200 rounded-2xl p-5">
              <h3 className="font-bold text-neutral-900 mb-2">Wix</h3>
              <ol className="list-decimal list-inside space-y-1.5 text-sm text-neutral-700 leading-relaxed">
                <li>Open the Wix Editor for your page.</li>
                <li>Click <strong>Add Elements</strong> &rarr; <strong>Embed Code</strong> &rarr; <strong>Embed HTML</strong>.</li>
                <li>Choose <strong>Code</strong> mode and paste the copied code.</li>
                <li>Resize the box as needed and publish your site.</li>
              </ol>
            </div>

            {/* Other / General */}
            <div className="bg-white border-2 border-neutral-200 rounded-2xl p-5">
              <h3 className="font-bold text-neutral-900 mb-2">Other Website Builders</h3>
              <p className="text-sm text-neutral-700 leading-relaxed">
                Most website builders (Weebly, GoDaddy, Shopify, etc.) have an option to add
                &quot;custom HTML&quot; or &quot;embed code.&quot; Look for that in your page editor,
                paste the code in, and save. If you&apos;re not sure where to find it,
                search your platform&apos;s help docs for <strong>&quot;add HTML code&quot;</strong> or <strong>&quot;embed code.&quot;</strong>
              </p>
            </div>
          </div>
        </section>

        {/* FAQ Section */}
        <section>
          <h2 className="text-2xl font-bold text-neutral-900 mb-4">Common Questions</h2>
          <div className="bg-white border-2 border-neutral-200 rounded-2xl px-6">
            <FAQ question="Do I need to update the widget myself?">
              <p>
                No. The widget pulls live data from Eddy automatically. Once you paste the code
                into your site, the river conditions will always be up to date — you never need
                to touch it again.
              </p>
            </FAQ>
            <FAQ question="Is this free to use?">
              <p>
                Yes, it&apos;s completely free. We want paddlers to have easy access to river conditions
                no matter where they find information.
              </p>
            </FAQ>
            <FAQ question="Can I show more than one river?">
              <p>
                Absolutely. Just come back to this page, select a different river, copy the new code,
                and paste it wherever you&apos;d like. You can add as many rivers as you want.
              </p>
            </FAQ>
            <FAQ question="Will it slow down my website?">
              <p>
                No. The widget loads separately from the rest of your page, so it won&apos;t affect
                your site&apos;s speed. It also loads lazily, meaning it only activates when a
                visitor scrolls to it.
              </p>
            </FAQ>
            <FAQ question="Can I change the size of the widget?">
              <p>
                Yes. In the code you copied, you can change the <code className="bg-neutral-100 px-1 py-0.5 rounded text-xs">height</code> number
                to make it taller or shorter. The <code className="bg-neutral-100 px-1 py-0.5 rounded text-xs">max-width</code> value
                (currently 600px) controls how wide it gets. Feel free to adjust these numbers until it looks right on your page.
              </p>
            </FAQ>
            <FAQ question="Can I add my business name to the widget?">
              <p>
                Yes! For the Float Trip Planner, add <code className="bg-neutral-100 px-1 py-0.5 rounded text-xs">&amp;partner=YourBusiness</code> to
                the iframe src URL. Your business name will appear in the widget footer.
              </p>
            </FAQ>
            <FAQ question="What if I need help?">
              <p>
                Reach out to us through{' '}
                <Link href="/" className="text-primary-600 hover:text-primary-700 font-medium">
                  eddy.guide
                </Link>{' '}
                and we&apos;ll help you get set up.
              </p>
            </FAQ>
          </div>
        </section>

        {/* For Developers (collapsed) */}
        <section>
          <details className="bg-white border-2 border-neutral-200 rounded-2xl overflow-hidden">
            <summary className="px-6 py-4 cursor-pointer text-sm font-semibold text-neutral-500 hover:text-neutral-700 transition-colors">
              For developers: API access
            </summary>
            <div className="px-6 pb-6 pt-2">
              <p className="text-sm text-neutral-600 mb-3">
                You can fetch river condition data directly from our API and build your own display.
              </p>
              <div className="bg-neutral-900 rounded-xl overflow-hidden mb-3 min-w-0">
                <div className="flex items-center justify-between px-4 py-2 border-b border-neutral-700">
                  <span className="text-xs text-neutral-400 font-medium">GET request</span>
                  <CopyButton text={`${baseUrl}/api/rivers`} />
                </div>
                <pre className="p-4 text-xs text-neutral-300 overflow-x-auto max-w-full">
                  <code>{`GET ${baseUrl}/api/rivers`}</code>
                </pre>
              </div>
              <p className="text-xs text-neutral-500 leading-relaxed">
                Returns JSON with all rivers including <code className="bg-neutral-100 px-1 py-0.5 rounded">name</code>,{' '}
                <code className="bg-neutral-100 px-1 py-0.5 rounded">slug</code>,{' '}
                <code className="bg-neutral-100 px-1 py-0.5 rounded">lengthMiles</code>,{' '}
                <code className="bg-neutral-100 px-1 py-0.5 rounded">accessPointCount</code>, and{' '}
                <code className="bg-neutral-100 px-1 py-0.5 rounded">currentCondition</code> (code + label).
                Please keep requests reasonable — if you plan heavy usage, reach out first.
              </p>
            </div>
          </details>
        </section>

        {/* (#7) Outfitter contact CTA */}
        <section className="bg-white border-2 border-primary-200 rounded-2xl p-6 text-center">
          <h3 className="font-bold text-neutral-900 mb-2">Running an Outfitter or Campground?</h3>
          <p className="text-sm text-neutral-600 mb-4 max-w-md mx-auto">
            We&apos;d love to partner with you. Get custom widgets, priority support,
            and help driving visitors to your business.
          </p>
          <a
            href="mailto:hello@eddy.guide"
            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-white text-sm font-semibold no-underline transition-colors"
            style={{ backgroundColor: '#F07052' }}
          >
            Get in Touch
            <ExternalLink className="w-3.5 h-3.5 opacity-60" />
          </a>
        </section>

        <div className="text-center">
          <Link
            href="/"
            className="text-primary-600 hover:text-primary-700 font-medium text-sm"
          >
            &larr; Back to Eddy
          </Link>
        </div>
      </div>

      <SiteFooter maxWidth="max-w-3xl" className="mt-16" />
    </div>
  );
}
