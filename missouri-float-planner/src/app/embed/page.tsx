'use client';

// src/app/embed/page.tsx
// Beginner-friendly guide for adding Eddy river conditions to external websites

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Copy, Check, ExternalLink, ChevronDown } from 'lucide-react';

const EDDY_IMAGE = 'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy_the_Otter.png';
const EDDY_CANOE_IMAGE = 'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy%20the%20otter%20in%20a%20cool%20canoe.png';

const RIVER_OPTIONS = [
  { slug: 'meramec-river', name: 'Meramec River' },
  { slug: 'current-river', name: 'Current River' },
  { slug: 'eleven-point-river', name: 'Eleven Point River' },
  { slug: 'jacks-fork', name: 'Jacks Fork' },
  { slug: 'niangua-river', name: 'Niangua River' },
  { slug: 'big-piney-river', name: 'Big Piney River' },
  { slug: 'huzzah-creek', name: 'Huzzah Creek' },
  { slug: 'courtois-creek', name: 'Courtois Creek' },
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
  const [selectedRiver, setSelectedRiver] = useState('current-river');
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'https://eddy.guide';
  const selectedRiverName = RIVER_OPTIONS.find(r => r.slug === selectedRiver)?.name || '';

  const widgetCode = `<iframe
  src="${baseUrl}/embed/widget/${selectedRiver}?theme=${theme}"
  width="100%"
  height="180"
  style="border: none; border-radius: 12px; max-width: 400px;"
  title="${selectedRiverName} - River Conditions from Eddy"
  loading="lazy"
></iframe>`;

  const linkCode = `<a href="${baseUrl}/rivers/${selectedRiver}" target="_blank" rel="noopener noreferrer" style="display:inline-flex;align-items:center;gap:8px;padding:10px 20px;background:#0F2D35;color:white;border-radius:8px;text-decoration:none;font-family:system-ui,sans-serif;font-size:14px;font-weight:600;">
  <img src="${EDDY_IMAGE}" alt="Eddy" width="24" height="24" style="border-radius:50%;" />
  Check ${selectedRiverName} Conditions
</a>`;

  return (
    <div className="min-h-screen bg-neutral-50">
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
        </div>
      </section>

      <div className="max-w-3xl mx-auto px-4 py-10 space-y-10">

        {/* How it works intro */}
        <section className="bg-white border-2 border-neutral-200 rounded-2xl p-6 md:p-8">
          <h2 className="text-xl font-bold text-neutral-900 mb-3">How It Works</h2>
          <p className="text-neutral-600 leading-relaxed mb-4">
            You can add a small box to your website that shows the current river conditions
            from Eddy. It updates automatically — your visitors will always see the latest
            water levels without you having to do anything.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-neutral-50 rounded-xl p-4 text-center">
              <div className="text-2xl mb-2">1</div>
              <p className="text-sm font-semibold text-neutral-900">Pick your river</p>
              <p className="text-xs text-neutral-500 mt-1">Choose from the dropdown below</p>
            </div>
            <div className="bg-neutral-50 rounded-xl p-4 text-center">
              <div className="text-2xl mb-2">2</div>
              <p className="text-sm font-semibold text-neutral-900">Copy the code</p>
              <p className="text-xs text-neutral-500 mt-1">Click the copy button</p>
            </div>
            <div className="bg-neutral-50 rounded-xl p-4 text-center">
              <div className="text-2xl mb-2">3</div>
              <p className="text-sm font-semibold text-neutral-900">Paste it in</p>
              <p className="text-xs text-neutral-500 mt-1">Add it to any page on your site</p>
            </div>
          </div>
        </section>

        {/* Step 1: Pick your river */}
        <section>
          <div className="flex items-center gap-3 mb-4">
            <div className="flex items-center justify-center w-8 h-8 rounded-full text-white text-sm font-bold" style={{ backgroundColor: '#F07052' }}>
              1
            </div>
            <h2 className="text-2xl font-bold text-neutral-900">Pick Your River</h2>
          </div>

          <div className="bg-white border-2 border-neutral-200 rounded-2xl p-6">
            <label className="block text-sm font-semibold text-neutral-700 mb-2">
              Which river do you want to show conditions for?
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
        </section>

        {/* Step 2: Choose style */}
        <section>
          <div className="flex items-center gap-3 mb-4">
            <div className="flex items-center justify-center w-8 h-8 rounded-full text-white text-sm font-bold" style={{ backgroundColor: '#F07052' }}>
              2
            </div>
            <h2 className="text-2xl font-bold text-neutral-900">Choose a Style</h2>
          </div>

          <p className="text-neutral-600 mb-6">
            We offer two options. Pick the one that works best for you.
          </p>

          {/* === OPTION A: Live Widget === */}
          <div className="bg-white border-2 border-primary-200 rounded-2xl overflow-hidden mb-6">
            <div className="px-6 py-4 border-b-2 border-primary-100" style={{ backgroundColor: '#2D788910' }}>
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 bg-primary-600 text-white text-xs font-bold rounded-full">Recommended</span>
                <h3 className="text-lg font-bold text-neutral-900">Live Conditions Widget</h3>
              </div>
              <p className="text-sm text-neutral-600 mt-1">
                A small box that shows the current river status. Updates automatically.
              </p>
            </div>

            <div className="p-6">
              {/* Theme toggle */}
              <div className="mb-4">
                <p className="text-sm font-semibold text-neutral-700 mb-2">Background color:</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setTheme('light')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border-2 transition-all ${
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
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border-2 transition-all ${
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

              {/* Live Preview */}
              <div className="mb-4">
                <p className="text-xs text-neutral-400 mb-2 uppercase tracking-wide font-semibold">Preview</p>
                <div className={`rounded-xl border-2 ${theme === 'dark' ? 'border-neutral-700 bg-neutral-800' : 'border-neutral-200 bg-neutral-50'} overflow-hidden`}>
                  <iframe
                    src={`${baseUrl}/embed/widget/${selectedRiver}?theme=${theme}`}
                    width="100%"
                    height="180"
                    style={{ border: 'none', borderRadius: '12px', maxWidth: '400px' }}
                    title="Widget preview"
                  />
                </div>
              </div>

              {/* Code block */}
              <div className="bg-neutral-900 rounded-xl overflow-hidden mb-3">
                <div className="flex items-center justify-between px-4 py-2 border-b border-neutral-700">
                  <span className="text-xs text-neutral-400 font-medium">HTML code</span>
                  <CopyButton text={widgetCode} />
                </div>
                <pre className="p-4 text-xs text-neutral-300 overflow-x-auto">
                  <code>{widgetCode}</code>
                </pre>
              </div>

              <CopyButton text={widgetCode} large />
            </div>
          </div>

          {/* === OPTION B: Simple Link Button === */}
          <div className="bg-white border-2 border-neutral-200 rounded-2xl overflow-hidden">
            <div className="px-6 py-4 border-b-2 border-neutral-100">
              <h3 className="text-lg font-bold text-neutral-900">Simple Link Button</h3>
              <p className="text-sm text-neutral-600 mt-1">
                A button that sends visitors to Eddy to check conditions. The simplest option.
              </p>
            </div>

            <div className="p-6">
              {/* Preview */}
              <div className="mb-4">
                <p className="text-xs text-neutral-400 mb-2 uppercase tracking-wide font-semibold">Preview</p>
                <div className="bg-neutral-50 rounded-xl border-2 border-neutral-200 p-6">
                  <a
                    href={`/rivers/${selectedRiver}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-white text-sm font-semibold no-underline"
                    style={{ backgroundColor: '#0F2D35' }}
                  >
                    <Image src={EDDY_IMAGE} alt="Eddy" width={24} height={24} className="w-6 h-6 rounded-full" />
                    Check {selectedRiverName} Conditions
                    <ExternalLink className="w-3.5 h-3.5 opacity-60" />
                  </a>
                </div>
              </div>

              {/* Code block */}
              <div className="bg-neutral-900 rounded-xl overflow-hidden mb-3">
                <div className="flex items-center justify-between px-4 py-2 border-b border-neutral-700">
                  <span className="text-xs text-neutral-400 font-medium">HTML code</span>
                  <CopyButton text={linkCode} />
                </div>
                <pre className="p-4 text-xs text-neutral-300 overflow-x-auto whitespace-pre-wrap">
                  <code>{linkCode}</code>
                </pre>
              </div>

              <CopyButton text={linkCode} large />
            </div>
          </div>
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
                (currently 180) to make it taller or shorter. The <code className="bg-neutral-100 px-1 py-0.5 rounded text-xs">max-width</code> value
                (currently 400px) controls how wide it gets. Feel free to adjust these numbers until it looks right on your page.
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
              <div className="bg-neutral-900 rounded-xl overflow-hidden mb-3">
                <div className="flex items-center justify-between px-4 py-2 border-b border-neutral-700">
                  <span className="text-xs text-neutral-400 font-medium">GET request</span>
                  <CopyButton text={`${baseUrl}/api/rivers`} />
                </div>
                <pre className="p-4 text-xs text-neutral-300 overflow-x-auto">
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

        <div className="text-center">
          <Link
            href="/"
            className="text-primary-600 hover:text-primary-700 font-medium text-sm"
          >
            &larr; Back to Eddy
          </Link>
        </div>
      </div>

      {/* Footer */}
      <footer className="bg-primary-800 border-t-2 border-neutral-900 px-4 py-8 mt-16">
        <div className="max-w-3xl mx-auto text-center">
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
