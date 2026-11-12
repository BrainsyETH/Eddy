import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { EddyIcon, type EddyIconName } from '@/components/ui/EddyIcon';
import SiteFooter from '@/components/ui/SiteFooter';
import styles from './page.module.css';
import AppLink from '@/components/AppLink';
import { appBannerMetadata, appLandingContext } from '@/lib/app-discovery';
import { damWidgetHeadline } from '@/lib/dam-app-promotion';
import { getUsaceDam } from '@/lib/flow-providers/usace-registry';
import { appQrImage } from '@/lib/app-qr';
import AppQrPrompt from '@/components/AppQrPrompt';
import ContextAppLanding from '@/components/ContextAppLanding';
import AppAvailability from '@/components/AppAvailability';
import AppPromotion from '@/components/AppPromotion';
import { nativeDestination, type AppDestinationQuery } from '@/lib/app-destination';

type Props = { searchParams: Promise<{ ct?: string | string[]; dam?: string | string[] } & AppDestinationQuery> };

const pageTitle = 'Eddy River Guide for iPhone — Know the River Before You Go';
const pageDescription =
  'Live river conditions, gauge trends, float plans, river access, campground availability, dam schedules, widgets, and alerts for Ozarks float rivers.';

const pageMetadata: Metadata = {
  title: pageTitle,
  description: pageDescription,
  alternates: { canonical: '/app' },
  openGraph: {
    type: 'website',
    url: '/app',
    siteName: 'Eddy',
    title: pageTitle,
    description: pageDescription,
    images: [
      {
        url: '/og/eddy-app-store.png',
        width: 1200,
        height: 630,
        alt: 'Eddy River Guide for iPhone — know the river before you go',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: pageTitle,
    description: pageDescription,
    images: ['/og/eddy-app-store.png'],
  },
};

// The App Store screenshot set, in the order the listing shows it. Source of
// truth is App Store Connect; these are its 1206 × 2622 exports as WebP.
const screenshots = [
  { src: '/app-store/01-daily-river-report.webp', alt: 'Daily river report: Eddy’s Read and today’s river conditions' },
  { src: '/app-store/02-plan-put-in-to-take-out.webp', alt: 'Plan put-in to take-out: a Current River float from Cedar Grove to Akers Ferry' },
  { src: '/app-store/03-estimate-your-day.webp', alt: 'Estimate your day on the river: follow your route in River Mode' },
  { src: '/app-store/04-camp-along-the-way.webp', alt: 'Camp along the way: campground availability on saved rivers' },
  { src: '/app-store/05-find-your-river-access.webp', alt: 'Find your river access: put-ins, take-outs, and places to explore on the map' },
  { src: '/app-store/06-read-the-rivers-trend.webp', alt: 'Read the river’s trend: gauge level and recent history' },
  { src: '/app-store/07-know-the-dam-schedule.webp', alt: 'Know the dam schedule: Bull Shoals generation, releases, and tailwater' },
  { src: '/app-store/08-your-rivers-at-a-glance.webp', alt: 'Your rivers at a glance: Home Screen widgets and river alerts' },
] as const;

const SCREENSHOT_WIDTH = 1206;
const SCREENSHOT_HEIGHT = 2622;

const features = [
  // Eddy's Read is the one thing a subscription buys (premium-copy.test.ts);
  // it leads the screenshot set, so the page says plainly that it is Premium
  // and that everything else here is free.
  {
    icon: 'ai',
    title: 'A daily read on every river',
    copy: 'With Eddy Premium, a written report every morning on what the water is doing and what the weather will do to it. Everything else here is free.',
  },
  {
    icon: 'gauge',
    title: 'Conditions you can use',
    copy: 'Live gauge readings become a clear Eddy rating, with recent history and dam generation schedules alongside.',
  },
  {
    icon: 'river',
    title: 'Plan the whole float',
    copy: 'Pick a put-in and take-out for mileage, estimated float time, and the shuttle, then follow the route in River Mode.',
  },
  {
    icon: 'campground',
    title: 'Access and camping',
    copy: 'Put-ins, take-outs, and places to explore, plus which campgrounds along your river have openings.',
  },
  {
    icon: 'today',
    title: 'Your rivers, at a glance',
    copy: 'Home Screen widgets keep your favorite water in view, and alerts tell you when it reaches the conditions you want.',
  },
  // The landing page had no answer to "does this work where I am going", which
  // is the question an Ozark float raises before any other. It is also the one
  // thing here that is easy to overpromise, so it says exactly what survives
  // losing signal and what does not.
  {
    icon: 'accessPoint',
    title: 'Works where the bars run out',
    copy: 'Access points, hazards, and the river\u2019s course stay on your phone, so a put-in with no signal still tells you where you are and what is downstream.',
  },
] as const satisfies readonly { icon: EddyIconName; title: string; copy: string }[];

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const { campaign, dam, destination } = appLandingContext(await searchParams);
  return { ...pageMetadata, ...appBannerMetadata(destination ? nativeDestination(destination) : dam?.nativePath ?? '/reports', campaign) };
}

export default async function AppLandingPage({ searchParams }: Props) {
  const { campaign, dam: promotion, destination } = appLandingContext(await searchParams);
  if (destination) return <ContextAppLanding destination={destination} campaign={campaign} />;
  const dam = promotion ? getUsaceDam(promotion.id) : undefined;
  const qr = dam ? await appQrImage(campaign, dam.id) : null;
  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.contours} aria-hidden="true" />
        <div className={styles.heroInner}>
          <div className={styles.copy}>
            {!dam && <p className={styles.eyebrow}>EDDY RIVER GUIDE FOR IPHONE</p>}
            <h1 className={dam ? styles.damHeading : undefined}>{dam ? damWidgetHeadline(dam.name) : 'Know the river before you go.'}</h1>
            <p className={styles.lede}>
              {dam ? 'Today’s generation schedule, at a glance.' :
                'Live conditions, gauge trends, float plans from put-in to take-out, river access, camping, and dam schedules—built for the Ozarks water you actually paddle.'}
            </p>

            <div className={styles.actions}>
              <AppLink trackView
                store
                campaign={campaign}
                className={styles.appStoreBadge}
                target="_blank"
                rel="noopener noreferrer"
                data-ga-label="app_landing_hero"
                data-ga-dam-id={dam?.id}
              >
                <Image
                  src="/app-store/download-on-app-store.svg"
                  alt="Download Eddy on the App Store"
                  width={180}
                  height={60}
                />
              </AppLink>

              {!dam && <Link className={styles.secondaryButton} href="/rivers">
                Explore Eddy now <ArrowRight aria-hidden="true" />
              </Link>}
            </div>

            <AppAvailability />
            <AppPromotion>{qr ? <AppQrPrompt {...qr} className={styles.qrPrompt} frameClassName={styles.qrFrame} /> : <div className={styles.qrPrompt}>
              <span className={styles.qrFrame}>
                <Image
                  src="/app-store/eddy-guide-qr.svg"
                  alt="QR code for eddy.guide/app"
                  width={92}
                  height={92}
                />
              </span>
              <span>
                <strong>Open Eddy on your iPhone</strong>
                Scan to visit eddy.guide/app
              </span>
            </div>}</AppPromotion>

            {!dam && <p className={styles.microcopy}>
              Designed for Missouri and Ozarks float rivers. More water is on the way.
            </p>}
          </div>

          {dam ? <figure className={styles.widgetPreview}>
            <Image
              src="/app-store/dam-widget.jpg"
              alt="Eddy’s Bull Shoals Dam widget showing turbine flow and today’s generation schedule"
              width={1113}
              height={523}
              sizes="(min-width: 960px) 540px, 95vw"
              priority
            />
            <figcaption>Example: Bull Shoals Dam.</figcaption>
          </figure> : <div className={styles.preview} aria-label="Eddy iPhone app preview">
            <Image
              className={`${styles.phoneShot} ${styles.phoneShotBackLeft}`}
              src={screenshots[1].src}
              alt={screenshots[1].alt}
              width={SCREENSHOT_WIDTH}
              height={SCREENSHOT_HEIGHT}
              sizes="(min-width: 900px) 260px, 34vw"
            />
            <Image
              className={`${styles.phoneShot} ${styles.phoneShotBackRight}`}
              src={screenshots[7].src}
              alt={screenshots[7].alt}
              width={SCREENSHOT_WIDTH}
              height={SCREENSHOT_HEIGHT}
              sizes="(min-width: 900px) 260px, 34vw"
            />
            <Image
              className={`${styles.phoneShot} ${styles.phoneShotFront}`}
              src={screenshots[0].src}
              alt={screenshots[0].alt}
              width={SCREENSHOT_WIDTH}
              height={SCREENSHOT_HEIGHT}
              sizes="(min-width: 900px) 320px, 54vw"
              priority
            />
          </div>}
        </div>
      </section>

      <section className={styles.gallery} aria-labelledby="app-gallery-title">
        <div className={styles.sectionHeading}>
          <p className={styles.eyebrow}>INSIDE THE APP</p>
          <h2 id="app-gallery-title">Everything for the float, in one place.</h2>
        </div>

        {/* Focusable so keyboard users can scroll the strip. */}
        <ul className={styles.galleryStrip} tabIndex={0} aria-label="Eddy app screenshots">
          {screenshots.map(({ src, alt }) => (
            <li className={styles.galleryItem} key={src}>
              <Image
                src={src}
                alt={alt}
                width={SCREENSHOT_WIDTH}
                height={SCREENSHOT_HEIGHT}
                sizes="(min-width: 620px) 250px, 62vw"
              />
            </li>
          ))}
        </ul>
      </section>

      <section className={styles.features} aria-labelledby="app-features-title">
        <div className={styles.sectionHeading}>
          <p className={styles.eyebrow}>WHAT EDDY DOES</p>
          <h2 id="app-features-title">Built for the whole float day.</h2>
        </div>

        <div className={styles.featureGrid}>
          {features.map(({ icon, title, copy }) => (
            <article className={styles.featureCard} key={title}>
              <span className={styles.featureIcon}><EddyIcon name={icon} size={34} /></span>
              <h3>{title}</h3>
              <p>{copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.bottomCta}>
        <div>
          <p className={styles.eyebrow}>YOUR RIVER GUIDE, IN YOUR POCKET</p>
          <h2>Check the water. Make the plan. Go float.</h2>
        </div>
        <AppLink trackView
          store
          campaign={campaign}
          className={styles.bottomBadge}
          target="_blank"
          rel="noopener noreferrer"
          data-ga-label="app_landing_footer"
          data-ga-dam-id={dam?.id}
        >
          <Image
            src="/app-store/download-on-app-store.svg"
            alt="Download Eddy on the App Store"
            width={180}
            height={60}
          />
        </AppLink>
      </section>

      <SiteFooter />
    </div>
  );
}
