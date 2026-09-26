import type { Metadata } from 'next';
import Link from 'next/link';
import SiteFooter from '@/components/ui/SiteFooter';
import { AGENT_TOOLS } from '@/lib/agent-tools/catalog';
import { AGENT_VERSION } from '@/lib/agent-tools/contracts';
import { getCuratedRivers, curatedStates } from '@/lib/coverage';

export const revalidate = 300;
export const metadata: Metadata = {
  title: 'River Conditions MCP & Developer API | Eddy',
  description: 'Connect an AI assistant to Eddy for curated river conditions, public access points, hazards, weather and float planning. Free remote MCP with explicit source freshness.',
  alternates: { canonical: '/developers' },
};
const code = 'overflow-x-auto rounded-lg bg-primary-800 text-primary-100 p-4 text-sm';
export default async function DevelopersPage() {
  const rivers = await getCuratedRivers();
  const states = curatedStates(rivers);
  return <div className="min-h-screen bg-neutral-50 text-neutral-900">
    <section className="bg-primary-800 px-4 py-14 text-white">
      <div className="mx-auto max-w-4xl">
        <p className="text-primary-200 text-sm font-semibold mb-3">EDDY FOR DEVELOPERS · MCP {AGENT_VERSION}</p>
        <h1 className="text-4xl md:text-5xl font-bold mb-5">Give your agent a river guide.</h1>
        <p className="text-lg text-primary-100 max-w-2xl">Current conditions, downstream access points and useful float plans—with the sources and limits behind each answer.</p>
        <a href="#connect" className="inline-block mt-7 rounded-lg bg-accent-500 px-5 py-3 font-bold text-neutral-900">Connect to Eddy</a>
      </div>
    </section>
    <main className="max-w-4xl mx-auto px-4 py-10 space-y-10">
      <section id="connect" className="space-y-4">
        <h2 className="text-2xl font-bold">Connect in your MCP client</h2>
        <p>Use a remote server connection with Streamable HTTP. No account or payment is required for the public MCP tools.</p>
        <pre className={code}><code>https://eddy.guide/api/mcp</code></pre>
        <p className="text-sm text-neutral-600">In clients that support a custom remote MCP server, enter this URL. Client plan and administrator restrictions may apply. A connection does not require Eddy’s own chat feature.</p>
        <p className="font-semibold">Claude Code</p>
        <pre className={code}><code>claude mcp add --transport http eddy https://eddy.guide/api/mcp</code></pre>
        <p className="font-semibold">Try these questions</p>
        <ul className="list-disc pl-5 space-y-2">
          <li>What rivers does Eddy cover?</li>
          <li>Compare roughly three-hour canoe floats on the Current River tomorrow. Show what is observed and what is forecast.</li>
          <li>Which public launches are downstream of Akers, and what advisories should I check?</li>
        </ul>
      </section>
      <section className="space-y-4">
        <h2 className="text-2xl font-bold">Coverage with a clear boundary</h2>
        <p>{rivers.length ? `Curated planning currently covers ${rivers.length} rivers across ${states.join(', ')}.` : 'Use list_rivers for the current curated planning roster.'} National reference gauges elsewhere on Eddy do not imply researched float recommendations.</p>
        <div className="flex flex-wrap gap-2">{rivers.map(r => <Link key={r.slug} href={r.path} className="rounded-full border border-neutral-300 bg-white px-3 py-1 text-sm hover:border-primary-600">{r.name}</Link>)}</div>
        <Link href="/coverage" className="text-primary-700 underline">Read the full coverage explanation</Link>
      </section>
      <section className="space-y-4">
        <h2 className="text-2xl font-bold">Tools</h2>
        <div className="grid gap-3 md:grid-cols-2">{AGENT_TOOLS.map(t => <article key={t.name} className="rounded-xl border border-neutral-200 bg-white p-5">
          <h3 className="font-bold">{t.title}</h3><code className="text-xs text-primary-700">{t.name}</code>
          <p className="mt-2 text-sm text-neutral-600 leading-relaxed">{t.description}</p>
        </article>)}</div>
      </section>
      <section className="space-y-4">
        <h2 className="text-2xl font-bold">Use the answer responsibly</h2>
        <p>Responses contain a status, data, warnings and a short safety note. Each live component names its source and available observation or issue time. Missing information stays missing.</p>
        <ul className="list-disc pl-5 space-y-2">
          <li>Current readings are not tomorrow’s forecast. Future-trip durations remain based on current conditions.</li>
          <li>A route assessment may change because of a downstream gauge; the anchor reading remains separately identified.</li>
          <li>No recorded alerts does not confirm open access. Source failures are reported explicitly.</li>
          <li>Recommendations cover a bounded shortlist, with up to six detailed calculations and three returned options.</li>
          <li>Shuttle driving estimates and outfitter listings do not establish transport or booking availability.</li>
        </ul>
      </section>
      <section className="space-y-4">
        <h2 className="text-2xl font-bold">Free access and request limits</h2>
        <p>MCP access is free: up to 120 requests per minute per network address, including up to 12 planning/search/drive requests. A shared service limit also protects expensive tools. Hosted clients may share network addresses. If Eddy returns 429, wait for the Retry-After interval.</p>
        <p>REST endpoints have a separate, deployment-dependent x402 policy. Check the <a href="/.well-known/x402" className="underline text-primary-700">payment manifest</a>; it does not apply to this MCP endpoint.</p>
        <p className="text-sm text-neutral-600">Operational monitoring records aggregate tool counts, latency and error outcomes when configured. Optional diagnostic logging adds the reported client software name; it does not establish a user identity. Tool arguments and response bodies are excluded from these logs. Network addresses are used for abuse limits. See our <Link href="/privacy" className="underline">privacy policy</Link>.</p>
        <div className="flex flex-wrap gap-4 text-primary-700 underline"><a href="/api/openapi.json">REST specification</a><a href="/llms.txt">Agent documentation</a><Link href="/support">Integration support</Link><Link href="/terms">Terms</Link></div>
      </section>
    </main>
    <SiteFooter />
  </div>;
}
