import Image from 'next/image';
import type { ReactNode } from 'react';

// Existing, attributed iOS photography, copied into the web deployment root.
// Attribution lives on /photo-credits, linked from the shared site footer.
const PHOTOS: Record<string, { src: string; alt: string }> = {
  'table-rock': {
    src: '/lakes/table-rock.jpg', alt: 'Table Rock Dam with Table Rock Lake behind it',
  },
  truman: {
    src: '/lakes/nwk-truman-dam.jpg', alt: 'Harry S. Truman Dam and Truman Lake',
  },
};

/** Compact imagery keeps the operational chart close to the page title. */
export default function PlaceHeader({ lakeSlug, title, children, actions }: {
  lakeSlug: string;
  title: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  const photo = PHOTOS[lakeSlug];
  return (
    <header className="mb-5 flex items-start justify-between gap-4 sm:gap-6">
      <div className="min-w-0 self-center">
        <h1 className="text-3xl font-semibold tracking-tight text-primary-800 sm:text-5xl" style={{ fontFamily: 'var(--font-display)' }}>{title}</h1>
        <div className="mt-2 text-sm text-neutral-600">{children}</div>
        {actions && <div className="mt-2">{actions}</div>}
      </div>
      {photo && (
        <div className="w-28 shrink-0 sm:w-48">
          <Image src={photo.src} alt={photo.alt} width={640} height={400} sizes="(min-width: 640px) 192px, 112px" loading="eager" className="h-24 w-full rounded-xl border border-primary-200 object-cover sm:h-28" />
        </div>
      )}
    </header>
  );
}
