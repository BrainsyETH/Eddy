/** Text-first reading timeline; never truncates the report to meet a fixed runtime. */
export const READ_FPS = 30;
export const READ_CTA_FRAMES = 150;
export function readingPages(text: string): string[] {
  const pages: string[] = [];
  for (const paragraph of text.trim().split(/\n\s*\n/)) {
    let page = '';
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      if (page && (page + ' ' + word).length > 210) { pages.push(page); page = ''; }
      // Long unbroken tokens still wrap in the composition, without losing characters.
      page += (page ? ' ' : '') + word;
    }
    if (page) pages.push(page);
  }
  return pages;
}
export function readingTimeline(text: string) {
  let start = 0;
  return readingPages(text).map(text => {
    const frames = Math.ceil(Math.max(5, text.split(/\s+/).length / 155 * 60 + 1.2) * READ_FPS);
    const page = { text, start, frames }; start += frames; return page;
  });
}
export function readingDuration(text: string) {
  return readingTimeline(text).reduce((sum, page) => sum + page.frames, READ_CTA_FRAMES);
}
/** eddy_read is usable only if the live overlay retained the generated prose. */
export function publishableReading(prose: { eddy_read?: string | null; quote_text?: string | null; summary_text?: string | null }): string | null {
  if (!prose.quote_text?.trim() && !prose.summary_text?.trim()) return null;
  const full = prose.quote_text?.trim() || prose.summary_text?.trim() || '';
  const lead = prose.eddy_read?.trim();
  return lead && !full.includes(lead) ? `${lead}\n\n${full}` : full;
}
