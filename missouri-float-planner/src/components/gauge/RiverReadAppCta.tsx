import Image from 'next/image';
import { ArrowRight, Lock } from 'lucide-react';
import ReadAppLink from '@/components/ReadAppLink';

/** The directory's single app invitation, with the river retained in the handoff. */
export default function RiverReadAppCta({ slug, name }: { slug: string; name: string }) {
  return <div data-river-app-cta className="flex items-center gap-2 rounded-lg bg-secondary-50 px-3 py-1">
    <Image src="/icons/eddy-wave.png" alt="" width={24} height={28} className="h-7 w-auto shrink-0" />
    <ReadAppLink destination={{ kind: 'river', id: slug }} label="river_card_eddy_read"
      aria-label={`Eddy’s Read for ${name} in the app with Eddy Premium`}
      className="inline-flex min-h-11 items-center gap-1.5 rounded text-sm font-semibold text-primary-800 underline underline-offset-2 hover:text-primary-600 focus-visible:outline-2 focus-visible:outline-primary-600">
      <Lock className="size-3.5 shrink-0" aria-hidden="true" />
      Eddy’s Read in the app<ArrowRight className="size-4 shrink-0" aria-hidden="true" />
    </ReadAppLink>
  </div>;
}
