import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { GUIDE_GROUPS, VISUAL_GUIDES } from '../src/lib/admin/visual-guides';

const directory = resolve('content/admin-visuals');
const css = readFileSync(resolve(directory, 'shared.css'), 'utf8');
const escape = (text: string) => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
let stale = false;
for (const [index, guide] of VISUAL_GUIDES.entries()) {
  const file = resolve(directory, guide.file);
  const original = readFileSync(file, 'utf8');
  let html = original;
  const group = GUIDE_GROUPS.find(group => group.id === guide.group)!;
  const next = VISUAL_GUIDES[(index + 1) % VISUAL_GUIDES.length];
  const nav = `<nav class="vx-nav" aria-label="Visual guides"><!-- ADMIN_LINKS --><label for="vx-page">Visual guides</label><select id="vx-page" aria-label="Choose a guide">${GUIDE_GROUPS.map(group => `<optgroup label="${group.title}">${VISUAL_GUIDES.filter(item => item.group === group.id).map(item => `<option value="${item.file}"${item.file === guide.file ? ' selected' : ''}>${escape(item.navTitle)}</option>`).join('')}</optgroup>`).join('')}</select></nav>`;
  html = html.replace(/<nav class="vx-nav"[\s\S]*?<\/nav>/, nav);
  html = html.replace(/<header class="site-header">[\s\S]*?<\/header>/, '');
  html = html.replace(/<div class="brand">[\s\S]*?<\/div>/, '');
  html = html.replace(/(?:<div class="vx-kicker">[^<]*<\/div>)?<h1[^>]*>[^<]*<\/h1>\s*<p>[\s\S]*?<\/p>/, `<div class="vx-kicker">${group.title}</div><h1>${escape(guide.title)}</h1><p>${escape(guide.summary)}</p>`);
  html = html.replace(/<aside class="vx-guide">[\s\S]*?<\/aside>/, `<aside class="vx-guide"><p>${escape(guide.tryIt)}</p><span class="vx-badge">${guide.kind === 'tour' ? 'Illustrated tour' : 'Example data'}</span></aside>`);
  html = html.replace(/<title>[^<]*<\/title>/, `<title>${escape(guide.title)} · Eddy visual guides</title>`);
  html = html.replace(/<!-- SHARED_STYLE -->[\s\S]*?<!-- END_SHARED_STYLE -->\s*/g, '');
  html = html.replace('</style>', `</style>\n<!-- SHARED_STYLE --><style>\n${css}</style><!-- END_SHARED_STYLE -->\n`);
  html = html.replace(/<!-- NEXT_GUIDE -->[\s\S]*?<!-- END_NEXT_GUIDE -->\s*/g, '');
  html = html.replace('</main>', `<!-- NEXT_GUIDE --><a class="vx-next" href="${next.file}"><span><small>Explore next</small><strong>${escape(next.title)}</strong></span><span aria-hidden="true">→</span></a><!-- END_NEXT_GUIDE -->\n</main>`);
  if (html !== original) {
    if (process.argv.includes('--check')) { console.error(`Out of date: ${guide.file}`); stale = true; }
    else writeFileSync(file, html);
  }
}
if (stale) process.exitCode = 1;
