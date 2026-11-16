'use client';

// The wall's small Eddy badge, bottom right: the otter and wordmark, a QR code
// to Eddy's download page, and the site address underneath — so a guest who
// likes the display knows where it comes from and can get the app.
//
// Legend and Story presentations only: Map only stays free of any words or
// logos (ADR 0018). The QR code is rendered on the server (src/lib/app-qr.ts)
// and sits on a white tile in both themes — a dark-on-light code is what
// phone cameras read reliably.

import Image from 'next/image';
import styles from './national-map.module.css';

export const EDDY_MARK = 'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy_favicon.png';

export function WallBrand({ qr, bottom, inline = false }: { qr: { href: string; src: string } | null; bottom?: number; inline?: boolean }) {
  return (
    <aside
      className={inline ? `${styles.wallBrand} ${styles.wallBrandInline}` : styles.wallBrand}
      aria-label="Get the Eddy app"
      style={!inline && bottom ? { bottom } : undefined}
    >
      <p className={styles.wallBrandName}>
        <Image src={EDDY_MARK} alt="" width={64} height={64} className={styles.wallBrandMark} />
        <span>Eddy</span>
      </p>
      {qr && (
        <span className={styles.wallBrandQr}>
          <Image src={qr.src} alt="QR code: get the Eddy app" width={160} height={160} unoptimized />
        </span>
      )}
      <p className={styles.wallBrandUrl}>eddy.guide</p>
    </aside>
  );
}
