// src/components/blog/EddySaysCallout.tsx
// Tone-colored callout with the Eddy otter mascot. Two modes:
//   - static: { tone, quote } — hardcoded text
//   - live:   { live_quote: true, slug } — embeds /embed/eddy-quote/{slug}
//             so the callout reflects current river conditions.

import type { CalloutContent } from '@/types/blog';

const OTTER_URL =
  'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy_the_Otter.png';

const TONE_MAP = {
  good: {
    bg: 'var(--color-support-50)',
    border: 'var(--color-support-500)',
    chipFg: 'var(--color-support-700)',
    label: 'Eddy says — float!',
  },
  note: {
    bg: 'var(--color-secondary-50)',
    border: 'var(--color-secondary-500)',
    chipFg: 'var(--color-secondary-800)',
    label: 'Eddy says',
  },
  warn: {
    bg: '#FFF7ED',
    border: '#F48E76',
    chipFg: '#A33122',
    label: 'Eddy says — heads up',
  },
} as const;

interface Props {
  callout: CalloutContent;
  riverSlug: string;
}

export default function EddySaysCallout({ callout, riverSlug }: Props) {
  const tone: keyof typeof TONE_MAP = callout.tone;
  const c = TONE_MAP[tone];

  return (
    <aside
      style={{
        display: 'grid',
        gridTemplateColumns: '72px 1fr',
        gap: 18,
        alignItems: 'center',
        padding: '20px 24px',
        background: c.bg,
        border: `2px solid ${c.border}`,
        borderLeft: `4px solid ${c.border}`,
        borderRadius: 8,
        boxShadow: '2px 2px 0 var(--color-neutral-300)',
        margin: '28px 0',
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={OTTER_URL}
        alt=""
        style={{
          width: 72,
          height: 72,
          objectFit: 'contain',
          filter: 'drop-shadow(0 4px 12px rgba(240,112,82,.25))',
        }}
      />
      <div>
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '.1em',
            color: c.chipFg,
            textTransform: 'uppercase',
            marginBottom: 6,
          }}
        >
          {c.label}
        </div>
        {callout.live_quote ? (
          <iframe
            data-eddy-embed
            src={`/embed/eddy-quote/${riverSlug}?theme=light`}
            width="100%"
            loading="lazy"
            title={`${riverSlug} live conditions quote`}
            style={{
              border: 0,
              display: 'block',
              width: '100%',
              maxWidth: '100%',
              height: 120,
              background: 'transparent',
            }}
          />
        ) : (
          <p
            style={{
              fontSize: 17,
              lineHeight: 1.55,
              color: 'var(--color-neutral-900)',
              margin: 0,
            }}
          >
            {callout.quote}
          </p>
        )}
      </div>
    </aside>
  );
}
