import sanitizeHtml from 'sanitize-html';

// sanitize-html strips tags but leaves the text HTML-escaped ("Wild &amp;
// Scenic"), which a caption would carry verbatim. Decode the entities guide
// prose actually uses.
const ENTITIES: Record<string, string> = {
  '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&apos;': "'", '&nbsp;': ' ',
};
const plain = (value: unknown) => typeof value === 'string'
  ? sanitizeHtml(value, { allowedTags: [], allowedAttributes: {} })
      .replace(/&(amp|lt|gt|quot|#39|apos|nbsp);/g, (m) => ENTITIES[m] ?? m)
      .replace(/\s+/g, ' ')
      .trim()
  : '';

const bullet = (value: unknown) => {
  if (!value || typeof value !== 'object') return '';
  const row = value as Record<string, unknown>;
  return [plain(row.strong), plain(row.body)].filter(Boolean).join(' ');
};

const rows = (guide: Record<string, unknown>, key: string) =>
  Array.isArray(guide[key]) ? guide[key] as unknown[] : [];

/** Use complete, published points. Never invent advice or cut off qualifiers.
 *  This is the template caption's material: three advice points as paragraphs. */
export function blogHighlights(data: unknown, limit = 3): string[] {
  if (!data || typeof data !== 'object') return [];
  const guide = data as Record<string, unknown>;
  const local = rows(guide, 'why_different').map(bullet);
  const tips = rows(guide, 'pro_tips').map(bullet);
  const launch = rows(guide, 'pre_launch_notes').map(bullet);
  const candidates = [local[0], tips[0], launch[0], ...local.slice(1), ...tips.slice(1), ...launch.slice(1)];
  if (guide.kind === 'article') {
    for (const block of rows(guide, 'blocks')) {
      if (!block || typeof block !== 'object') continue;
      const b = block as Record<string, unknown>;
      if (b.type === 'bullets' && Array.isArray(b.bullets)) candidates.push(...b.bullets.map(bullet));
      if (b.type === 'steps' && Array.isArray(b.steps)) {
        for (const step of b.steps) {
          if (step && typeof step === 'object') {
            const s = step as Record<string, unknown>;
            candidates.push([plain(s.name), plain(s.body)].filter(Boolean).join(': '));
          }
        }
      }
    }
  }
  const seen = new Set<string>();
  return candidates.filter((text): text is string => {
    if (!text || text.length < 30 || text.length > 420) return false;
    const key = text.split(/(?<=[.!?])\s/)[0].toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, limit);
}

/**
 * The parts of a guide a person would find interesting, for the caption
 * model: the lede and intro, the springs and places worth a stop, the "why
 * this river is different" notes, and any nearby attractions. Deliberately
 * NOT the pro tips or pre-launch notes: those are advice, and a post built
 * from advice reads like a safety briefing. Each entry is complete, plain
 * text from the published guide; the model picks one thing to talk about.
 */
export function guideMaterial(data: unknown): string[] {
  if (!data || typeof data !== 'object') return [];
  const guide = data as Record<string, unknown>;
  const out: string[] = [];
  const hero = guide.hero && typeof guide.hero === 'object' ? guide.hero as Record<string, unknown> : null;
  const lede = plain(hero?.lede);
  if (lede) out.push(lede);
  const intro = plain(guide.intro_html);
  if (intro) out.push(intro.length > 700 ? intro.slice(0, intro.lastIndexOf('. ', 700) + 1) : intro);
  const named = (key: string) => rows(guide, key).map((row) => {
    if (!row || typeof row !== 'object') return '';
    const r = row as Record<string, unknown>;
    const extras = [plain(r.rank), plain(r.flow)].filter(Boolean).join(', ');
    const head = [plain(r.name), extras && `(${extras})`].filter(Boolean).join(' ');
    return [head, plain(r.note)].filter(Boolean).join(': ');
  });
  out.push(...named('springs'), ...named('nearby_attractions'));
  out.push(...rows(guide, 'why_different').map(bullet));
  const seen = new Set<string>();
  return out.filter((text) => {
    if (!text || text.length < 20) return false;
    const key = text.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 12);
}
