'use client';

// src/components/access-point/AccessPointPhoto.tsx
// Renders an access-point photo. These images are hot-linked from arbitrary
// external hosts (mdc.mo.gov, cdn.recreation.gov, fs.usda.gov, mostateparks.com,
// private outfitter domains, www.nps.gov) that are NOT — and cannot all be —
// whitelisted for next/image. Some (e.g. MDC) also sit behind a WAF that blocks
// Next's server-side image optimizer. So we render a plain <img>: the browser
// fetches the origin directly, which is exactly what works. On load failure
// (link rot / hotlink block) we swap to the Eddy-otter placeholder.

import { useState } from 'react';

const EDDY_OTTER_FALLBACK =
  'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy_the_Otter.png';

interface AccessPointPhotoProps {
  src: string;
  alt: string;
  /** Defaults to a fill layout (absolutely positioned, covers its parent). */
  className?: string;
  /** Eager-load + high fetch priority for above-the-fold hero images. */
  priority?: boolean;
}

export default function AccessPointPhoto({
  src,
  alt,
  className = 'absolute inset-0 w-full h-full object-cover',
  priority = false,
}: AccessPointPhotoProps) {
  const [failed, setFailed] = useState(false);
  const finalSrc = failed ? EDDY_OTTER_FALLBACK : src;

  return (
    // A plain <img> (not next/image) is intentional: these come from external,
    // non-whitelisted hosts, and MDC's WAF blocks Next's server-side optimizer.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={finalSrc}
      alt={alt}
      loading={priority ? 'eager' : 'lazy'}
      // fetchpriority is valid HTML; cast for React's typings.
      {...(priority ? ({ fetchpriority: 'high' } as Record<string, string>) : {})}
      className={failed ? `${className} opacity-40` : className}
      onError={failed ? undefined : () => setFailed(true)}
    />
  );
}
