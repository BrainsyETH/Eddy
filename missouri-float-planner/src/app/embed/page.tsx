'use client';

// src/app/embed/page.tsx
// Documentation page for embedding Eddy river conditions on other sites

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Code, Copy, Check, ExternalLink } from 'lucide-react';

const EDDY_IMAGE = 'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy_the_Otter.png';

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

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

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

export default function EmbedPage() {
  const [selectedRiver, setSelectedRiver] = useState('current-river');
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'https://eddy.guide';

  const iframeCode = `<iframe
  src="${baseUrl}/embed/widget/${selectedRiver}?theme=${theme}"
  width="100%"
  height="180"
  style="border: none; border-radius: 12px; max-width: 400px;"
  title="Eddy - River Conditions"
  loading="lazy"
></iframe>`;

  const linkBadgeCode = `<a href="${baseUrl}/rivers/${selectedRiver}" target="_blank" rel="noopener noreferrer" style="display:inline-flex;align-items:center;gap:8px;padding:8px 16px;background:#0F2D35;color:white;border-radius:8px;text-decoration:none;font-family:system-ui,sans-serif;font-size:14px;">
  <img src="${EDDY_IMAGE}" alt="Eddy" width="24" height="24" style="border-radius:50%;" />
  Check conditions on Eddy
</a>`;

  const apiExample = `// Fetch river conditions from the Eddy API
const response = await fetch('${baseUrl}/api/rivers');
const data = await response.json();

// Each river includes:
// - name, slug, lengthMiles
// - currentCondition: { code, label }
// - accessPointCount
console.log(data.rivers);`;

  return (
    <div className="min-h-screen bg-neutral-50">
      {/* Header */}
      <section
        className="relative py-12 md:py-16 text-white"
        style={{ background: 'linear-gradient(to bottom right, #0F2D35, #163F4A, #0F2D35)' }}
      >
        <div className="max-w-3xl mx-auto px-4 text-center">
          <div className="flex items-center justify-center gap-3 mb-4">
            <Code className="w-8 h-8" style={{ color: '#F07052' }} />
            <h1
              className="text-4xl md:text-5xl font-bold"
              style={{ fontFamily: 'var(--font-display)', color: '#F07052' }}
            >
              Embed Eddy
            </h1>
          </div>
          <p className="text-lg text-white/80 max-w-xl mx-auto">
            Add live river conditions to your website, outfitter page, or campground site.
          </p>
        </div>
      </section>

      {/* Content */}
      <div className="max-w-3xl mx-auto px-4 py-10 space-y-10">

        {/* Option 1: Iframe Widget */}
        <section>
          <h2 className="text-2xl font-bold text-neutral-900 mb-2">Option 1: Embed Widget</h2>
          <p className="text-neutral-600 mb-4">
            Drop an iframe into your site to show live conditions for a specific river.
            The widget auto-updates and links back to the full Eddy planner.
          </p>

          {/* Config */}
          <div className="flex flex-wrap gap-3 mb-4">
            <div>
              <label className="block text-xs font-semibold text-neutral-500 mb-1 uppercase tracking-wide">River</label>
              <select
                value={selectedRiver}
                onChange={(e) => setSelectedRiver(e.target.value)}
                className="px-3 py-2 border-2 border-neutral-200 rounded-lg text-sm bg-white"
              >
                {RIVER_OPTIONS.map((r) => (
                  <option key={r.slug} value={r.slug}>{r.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-neutral-500 mb-1 uppercase tracking-wide">Theme</label>
              <div className="flex rounded-lg border-2 border-neutral-200 overflow-hidden">
                <button
                  onClick={() => setTheme('light')}
                  className={`px-3 py-2 text-sm font-medium ${theme === 'light' ? 'bg-primary-600 text-white' : 'bg-white text-neutral-600'}`}
                >
                  Light
                </button>
                <button
                  onClick={() => setTheme('dark')}
                  className={`px-3 py-2 text-sm font-medium ${theme === 'dark' ? 'bg-primary-600 text-white' : 'bg-white text-neutral-600'}`}
                >
                  Dark
                </button>
              </div>
            </div>
          </div>

          {/* Preview */}
          <div className={`rounded-xl border-2 border-neutral-200 p-6 mb-4 ${theme === 'dark' ? 'bg-neutral-800' : 'bg-white'}`}>
            <p className="text-xs text-neutral-400 mb-3 uppercase tracking-wide font-semibold">Preview</p>
            <div className="flex items-center gap-3 mb-3">
              <Image src={EDDY_IMAGE} alt="Eddy" width={40} height={40} className="w-10 h-10 object-contain" />
              <div>
                <p className={`font-bold ${theme === 'dark' ? 'text-white' : 'text-neutral-900'}`}>
                  {RIVER_OPTIONS.find(r => r.slug === selectedRiver)?.name}
                </p>
                <p className={`text-sm ${theme === 'dark' ? 'text-neutral-400' : 'text-neutral-500'}`}>
                  Live conditions from Eddy
                </p>
              </div>
            </div>
            <div className={`text-xs ${theme === 'dark' ? 'text-neutral-500' : 'text-neutral-400'}`}>
              Widget will display current condition, gauge height, and a link to full details.
            </div>
          </div>

          {/* Code */}
          <div className="bg-neutral-900 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2 border-b border-neutral-700">
              <span className="text-xs text-neutral-400 font-medium">HTML</span>
              <CopyButton text={iframeCode} />
            </div>
            <pre className="p-4 text-sm text-neutral-300 overflow-x-auto">
              <code>{iframeCode}</code>
            </pre>
          </div>
        </section>

        {/* Option 2: Link Badge */}
        <section>
          <h2 className="text-2xl font-bold text-neutral-900 mb-2">Option 2: Link Badge</h2>
          <p className="text-neutral-600 mb-4">
            A simple branded link button that directs visitors to check conditions on Eddy. No iframe needed.
          </p>

          {/* Preview */}
          <div className="bg-white rounded-xl border-2 border-neutral-200 p-6 mb-4">
            <p className="text-xs text-neutral-400 mb-3 uppercase tracking-wide font-semibold">Preview</p>
            <a
              href={`/rivers/${selectedRiver}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-medium no-underline"
              style={{ backgroundColor: '#0F2D35' }}
            >
              <Image src={EDDY_IMAGE} alt="Eddy" width={24} height={24} className="w-6 h-6 rounded-full" />
              Check conditions on Eddy
              <ExternalLink className="w-3.5 h-3.5 opacity-60" />
            </a>
          </div>

          {/* Code */}
          <div className="bg-neutral-900 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2 border-b border-neutral-700">
              <span className="text-xs text-neutral-400 font-medium">HTML</span>
              <CopyButton text={linkBadgeCode} />
            </div>
            <pre className="p-4 text-sm text-neutral-300 overflow-x-auto whitespace-pre-wrap">
              <code>{linkBadgeCode}</code>
            </pre>
          </div>
        </section>

        {/* Option 3: API */}
        <section>
          <h2 className="text-2xl font-bold text-neutral-900 mb-2">Option 3: API Access</h2>
          <p className="text-neutral-600 mb-4">
            Fetch river data directly from the Eddy API and build your own display.
            The API returns JSON with current conditions for all supported rivers.
          </p>

          <div className="bg-neutral-900 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2 border-b border-neutral-700">
              <span className="text-xs text-neutral-400 font-medium">JavaScript</span>
              <CopyButton text={apiExample} />
            </div>
            <pre className="p-4 text-sm text-neutral-300 overflow-x-auto">
              <code>{apiExample}</code>
            </pre>
          </div>

          <div className="mt-4 bg-amber-50 border-2 border-amber-200 rounded-lg p-4">
            <p className="text-sm text-amber-800">
              <strong>Note:</strong> The API is open for reasonable use. If you plan to make frequent requests
              or build a high-traffic integration, please reach out first.
            </p>
          </div>
        </section>

        {/* Instructions */}
        <section className="bg-white border-2 border-neutral-200 rounded-xl p-6">
          <h2 className="text-xl font-bold text-neutral-900 mb-3">Setup Instructions</h2>
          <ol className="list-decimal list-inside space-y-2 text-neutral-700 text-sm leading-relaxed">
            <li>Choose the embed option that works best for your site.</li>
            <li>Select the river you want to feature using the dropdown above.</li>
            <li>Copy the code snippet and paste it into your website&apos;s HTML.</li>
            <li>The widget/badge will automatically show the latest conditions from Eddy.</li>
            <li>For the iframe widget, you can adjust the <code className="bg-neutral-100 px-1 py-0.5 rounded text-xs">width</code>, <code className="bg-neutral-100 px-1 py-0.5 rounded text-xs">height</code>, and <code className="bg-neutral-100 px-1 py-0.5 rounded text-xs">max-width</code> CSS properties to fit your layout.</li>
          </ol>
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
