import sanitizeHtml from 'sanitize-html';

/** Use complete, published points. Never invent advice or cut off qualifiers. */
export function blogHighlights(data: unknown): string[] {
  if (!data || typeof data !== 'object') return [];
  const guide = data as Record<string, unknown>;
  const plain = (value: unknown) => typeof value === 'string'
    ? sanitizeHtml(value, { allowedTags: [], allowedAttributes: {} }).replace(/\s+/g, ' ').trim()
    : '';
  const bullet = (value: unknown) => {
    if (!value || typeof value !== 'object') return '';
    const row = value as Record<string, unknown>;
    return [plain(row.strong), plain(row.body)].filter(Boolean).join(' ');
  };
  const rows = (key: string) => Array.isArray(guide[key]) ? guide[key] as unknown[] : [];
  const local = rows('why_different').map(bullet);
  const tips = rows('pro_tips').map(bullet);
  const launch = rows('pre_launch_notes').map(bullet);
  const candidates = [local[0], tips[0], launch[0], ...local.slice(1), ...tips.slice(1), ...launch.slice(1)];
  if (guide.kind === 'article') {
    for (const block of rows('blocks')) {
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
  }).slice(0, 3);
}
