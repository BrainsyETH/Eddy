export function premiumExcerpt(fullRead: string): string {
  const text = fullRead.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^[#>\s*_-]+/gm, '').replace(/[*_\x60]/g, '').replace(/\s+/g, ' ').trim();
  if (text.length <= 320) return text;
  return text.slice(0, 320).replace(/\s+\S*$/, '') + '…';
}

