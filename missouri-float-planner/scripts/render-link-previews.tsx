// Run from the web directory: npm run share:render-previews
// Commit inputs and output together. Bump the filename version for design changes.
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { ImageResponse } from 'next/og';
import sharp from 'sharp';
import { loadFredokaFont } from '../src/lib/og/fonts';
import { LINK_PREVIEW_SIZE, linkPreviewFile, type LinkPreviewKind } from '../src/lib/og/link-preview';

const TEAL = '#123f46';
const CREAM = '#f7f3e9';
const CORAL = '#f07052';
const INPUT = 'scripts/assets/link-previews';

async function dataUri(file: string) {
  // Normalize archival photos once; no remote image fetch at request time.
  const bytes = await sharp(await readFile(`${INPUT}/${file}`))
    .resize(1200, 850, { fit: 'inside', withoutEnlargement: true }).png().toBuffer();
  return `data:image/png;base64,${bytes.toString('base64')}`;
}

async function render(kind: LinkPreviewKind, slug?: string) {
  const photo = slug ? await dataUri(kind === 'dam' ? 'bagnell.jpg' : 'current.jpg') : null;
  const iconFile = {
    plan: 'eddy-route-planning.png', gauge: 'eddy-checking-gauge.png',
    river: 'eddy-river.png', dam: 'eddy-dam.png', access: 'eddy-boat-ramp.png',
  }[kind];
  const icon = await dataUri(photo ? 'eddy-favicon.png' : iconFile);
  const response = new ImageResponse(
    <div style={{ display: 'flex', width: '100%', height: '100%', position: 'relative', overflow: 'hidden', background: CREAM }}>
      {photo ? <>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={photo} alt="" width={1200} height={630} style={{ objectFit: 'cover', objectPosition: kind === 'river' ? '50% 55%' : '50% 52%' }} />
        <div style={{ position: 'absolute', left: 0, top: 0, width: 1200, height: 630, background: 'linear-gradient(0deg, rgba(9,45,50,0.58), transparent 55%)' }} />
      </> : <>
        <div style={{ position: 'absolute', left: -336, top: -202, width: 828, height: 788, borderRadius: '48%', border: '32px solid #dce9e3', transform: 'rotate(-29deg)' }} />
        <div style={{ position: 'absolute', right: -384, bottom: -390, width: 876, height: 668, borderRadius: '50%', border: '32px solid #e5e8d8' }} />
        <svg width="1200" height="630" viewBox="0 0 1200 630" style={{ position: 'absolute', inset: 0 }}>
          <path d="M-40 405 C140 495 160 116 372 215 S742 570 860 264 S1160 244 1270 85" fill="none" stroke="#bedcd8" strokeWidth="42" />
          <path d="M-40 405 C140 495 160 116 372 215 S742 570 860 264 S1160 244 1270 85" fill="none" stroke="#337e84" strokeWidth="4" strokeDasharray="12 14" />
          <circle cx="331" cy="201" r="18" fill={CORAL} stroke={TEAL} strokeWidth="5" />
          <circle cx="866" cy="248" r="18" fill={CREAM} stroke={TEAL} strokeWidth="5" />
        </svg>
        {/* Focal artwork fits inside the central 630px square and 64px inset. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={icon} alt="" width={420} height={480} style={{ position: 'absolute', left: 390, top: 64, objectFit: 'contain' }} />
      </>}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, position: 'absolute', left: 64, bottom: 64, color: photo ? CREAM : TEAL, fontFamily: 'Fredoka', fontWeight: 600, fontSize: photo ? 60 : 65, lineHeight: 1 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {photo && <img src={icon} alt="" width={64} height={64} style={{ objectFit: 'contain' }} />}
        <span>eddy</span>
      </div>
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 10, background: CORAL }} />
    </div>,
    { ...LINK_PREVIEW_SIZE, fonts: loadFredokaFont() },
  );
  const png = await sharp(Buffer.from(await response.arrayBuffer())).png({ palette: true, quality: 90, effort: 10 }).toBuffer();
  await writeFile(`public/share/${linkPreviewFile(kind, slug)}`, png);
}

async function main() {
  await mkdir('public/share', { recursive: true });
  for (const kind of ['river', 'gauge', 'dam', 'access', 'plan'] as const) await render(kind);
  await render('river', 'current');
  await render('dam', 'ameren-bagnell-dam');
}
void main();
