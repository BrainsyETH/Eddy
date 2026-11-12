/** Presentation only: never creates new claims or changes entitlement. */
export function readPreview(text: string, limit = 320, sentenceLimit = 2): string {
  const clean = text.trim().replace(/\s+/g, ' ');
  const sentences = clean.match(/.*?[.!?](?=\s+[A-Z“"']|$)|.+$/g) ?? [clean];
  const preview = sentences.slice(0, sentenceLimit).map(sentence => sentence.trim()).join(' ').trim();
  if (preview.length <= limit) return preview;
  const boundary = preview.lastIndexOf(' ', limit - 1);
  return `${preview.slice(0, boundary > limit / 2 ? boundary : limit - 1).trimEnd()}…`;
}
export function distinctReadContext(read: string, context: string | null | undefined): string | null {
  const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const text = context?.trim();
  return text && !normalize(read).includes(normalize(text)) ? text : null;
}
