import Image from 'next/image';
import Link from 'next/link';
import AppCta from './AppCta';
import AppPromotion from './AppPromotion';
import SiteFooter from './ui/SiteFooter';
import type { AppDestination } from '@/lib/app-destination';

export default function ContextAppLanding({ destination, campaign }: { destination: AppDestination; campaign: string | null }) {
  const plan = destination.kind === 'plan';
  const access = destination.kind === 'access';
  const title = plan ? 'Your float, in Eddy.' : access ? 'Get ready before you head out.' : 'Keep your river close.';
  const detail = plan ? 'Open your saved route, then start River Mode when you’re ready.'
    : access ? 'Plan your float in Eddy and download the map before you lose signal.'
    : 'Open this river or gauge in Eddy. Add a Home Screen widget and choose the water you follow.';
  const screenshot = plan ? '03-estimate-your-day' : access ? '05-find-your-river-access' : '08-your-rivers-at-a-glance';
  return <>
    <main className="mx-auto grid max-w-4xl items-center gap-8 px-4 py-10 sm:grid-cols-[1fr_220px] sm:py-16">
      <div>
        <h1 className="font-display text-3xl font-semibold text-primary-800">{title}</h1>
        <p className="mb-6 mt-3 text-neutral-600">{detail}</p>
        <AppCta destination={destination} campaign={campaign} landing title="Eddy for iPhone" label="app_landing_context" />
        <AppPromotion><p className="mt-3 text-sm text-neutral-600">After installing Eddy, return to this page on your iPhone and choose Open.</p></AppPromotion>
        {plan && <Link className="app-cta__link mt-3" href={`/plan/${encodeURIComponent(destination.id)}`}>View your saved plan on the web</Link>}
        <Link href="/app" className="app-cta__link mt-3">See what’s in Eddy</Link>
      </div>
      <figure className="mx-auto w-44 sm:w-full">
        <Image src={`/app-store/${screenshot}.webp`} width={1206} height={2622} alt="Eddy iPhone app screenshot" sizes="220px" priority />
        <figcaption className="mt-2 text-center text-xs text-neutral-500">Example from the iPhone app</figcaption>
      </figure>
    </main>
    <SiteFooter />
  </>;
}
