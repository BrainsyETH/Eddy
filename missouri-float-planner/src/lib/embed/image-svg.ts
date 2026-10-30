// src/lib/embed/image-svg.ts
// Hand-built SVG for the badge and strip images. No fonts are embedded (a
// Fredoka data URI would make a 36px pill weigh 90 KB), so the text asks for
// Fredoka and falls back to the host's rounded/system sans; textLength pins
// each run to the width the layout reserved, the same trick shields.io uses,
// so a wider fallback font never overflows the pill.

import { badgeLayout, STRIP_HEIGHT, STRIP_WIDTH, estimateTextWidth, type EmbedImageModel } from './image-model';

const FONT = "Fredoka, 'SF Pro Rounded', 'Segoe UI', system-ui, -apple-system, sans-serif";
const MONO = "'Geist Mono', ui-monospace, SFMono-Regular, Menlo, monospace";

function esc(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Eddy's mark as a small inline glyph: a teal rounded tile with a white "e". */
function markSvg(x: number, y: number, size: number, tokens: EmbedImageModel['tokens']): string {
  const r = size / 2;
  return `<circle cx="${x + r}" cy="${y + r}" r="${r}" fill="${tokens.link}"/>` +
    `<text x="${x + r}" y="${y + r + size * 0.32}" text-anchor="middle" font-family="${FONT}" font-weight="700" font-size="${Math.round(size * 0.78)}" fill="#FFFFFF">e</text>`;
}

export function badgeSvg(model: EmbedImageModel, transparent = false): string {
  const L = badgeLayout(model);
  const t = model.tokens;
  const h = L.height;
  const nameX = L.padX + L.mark + L.gap;
  const pillX = nameX + L.nameW + L.gap;
  const pillH = 20;
  const pillY = (h - pillH) / 2;
  const dotX = pillX + 8;
  const statusTextX = dotX + 8 + 5;
  const statusTextW = L.statusW - 8 - 5 - 16;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${L.width}" height="${h}" viewBox="0 0 ${L.width} ${h}" role="img" aria-label="${esc(model.alt)}">` +
    `<title>${esc(model.alt)}</title>` +
    `<rect x="0.75" y="0.75" width="${L.width - 1.5}" height="${h - 1.5}" rx="${h / 2}" fill="${transparent ? 'none' : t.bg}" stroke="${t.border}" stroke-width="1.5"/>` +
    markSvg(L.padX, (h - L.mark) / 2, L.mark, t) +
    `<text x="${nameX}" y="${h / 2 + 5}" font-family="${FONT}" font-weight="700" font-size="14" fill="${t.text}" textLength="${L.nameW}" lengthAdjust="spacingAndGlyphs">${esc(model.title)}</text>` +
    `<rect x="${pillX}" y="${pillY}" width="${L.statusW}" height="${pillH}" rx="${pillH / 2}" fill="${model.statusBg}" stroke="${model.statusBorder}" stroke-width="1"/>` +
    `<circle cx="${dotX + 4}" cy="${h / 2}" r="4" fill="${model.dot}"/>` +
    `<text x="${statusTextX}" y="${h / 2 + 4}" font-family="${FONT}" font-weight="700" font-size="11" fill="${model.statusInk}" textLength="${statusTextW}" lengthAdjust="spacingAndGlyphs">${esc(model.status)}</text>` +
    `</svg>`;
}

export function stripSvg(model: EmbedImageModel, transparent = false): string {
  const w = STRIP_WIDTH;
  const h = STRIP_HEIGHT;
  const t = model.tokens;
  const padX = 14;
  const mark = 28;
  const nameX = padX + mark + 12;
  const rightPad = padX;
  // Right-aligned cluster: [reading unit] [pill] [age]
  const ageW = model.age ? estimateTextWidth(model.age, 11, 0.62) : 0;
  const pillH = 22;
  const pillW = estimateTextWidth(model.status, 11, 0.62) + 18;
  const readingText = model.reading ?? '—';
  const readingW = estimateTextWidth(readingText, 22, 0.6);
  const unitW = model.unit ? estimateTextWidth(model.unit, 11, 0.6) : 0;
  const trendW = model.trend ? 14 : 0;
  let x = w - rightPad;
  const ageX = x - ageW;
  x = ageX - (model.age ? 10 : 0);
  const pillX = x - pillW;
  x = pillX - 10;
  const readingEnd = x;
  const readingX = readingEnd - readingW - unitW - trendW - (model.unit ? 4 : 0);
  const nameW = Math.max(40, readingX - 12 - nameX);
  const titleW = Math.min(nameW, estimateTextWidth(model.title, 16));
  const subW = model.subtitle ? Math.min(nameW, estimateTextWidth(model.subtitle, 11, 0.52)) : 0;
  const subtitle = model.subtitle && subW === nameW
    ? model.subtitle.slice(0, Math.max(0, Math.floor(nameW / (11 * 0.52)) - 1)) + '…'
    : model.subtitle;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(model.alt)}">` +
    `<title>${esc(model.alt)}</title>` +
    `<rect x="0.75" y="0.75" width="${w - 1.5}" height="${h - 1.5}" rx="12" fill="${transparent ? 'none' : t.bg}" stroke="${t.border}" stroke-width="1.5"/>` +
    markSvg(padX, (h - mark) / 2, mark, t) +
    `<text x="${nameX}" y="${subtitle ? 27 : h / 2 + 6}" font-family="${FONT}" font-weight="700" font-size="16" fill="${t.text}" textLength="${titleW}" lengthAdjust="spacingAndGlyphs">${esc(model.title)}</text>` +
    (subtitle ? `<text x="${nameX}" y="44" font-family="${FONT}" font-weight="500" font-size="11" fill="${t.muted}" textLength="${subW}" lengthAdjust="spacingAndGlyphs">${esc(subtitle)}</text>` : '') +
    `<text x="${readingX}" y="${h / 2 + 8}" font-family="${MONO}" font-weight="700" font-size="22" fill="${t.text}" textLength="${readingW}" lengthAdjust="spacingAndGlyphs">${esc(readingText)}</text>` +
    (model.unit ? `<text x="${readingX + readingW + 4}" y="${h / 2 + 8}" font-family="${FONT}" font-weight="600" font-size="11" fill="${t.muted}">${esc(model.unit)}</text>` : '') +
    (model.trend ? `<text x="${readingX + readingW + unitW + 8}" y="${h / 2 + 6}" font-family="${FONT}" font-weight="700" font-size="13" fill="${t.muted}">${esc(model.trend)}</text>` : '') +
    `<rect x="${pillX}" y="${(h - pillH) / 2}" width="${pillW}" height="${pillH}" rx="6" fill="${model.statusBg}" stroke="${model.statusBorder}" stroke-width="1"/>` +
    `<text x="${pillX + pillW / 2}" y="${h / 2 + 4}" text-anchor="middle" font-family="${FONT}" font-weight="700" font-size="11" fill="${model.statusInk}">${esc(model.status)}</text>` +
    (model.age ? `<text x="${ageX}" y="${h / 2 + 4}" font-family="${FONT}" font-weight="600" font-size="11" fill="${t.muted}">${esc(model.age)}</text>` : '') +
    `</svg>`;
}
