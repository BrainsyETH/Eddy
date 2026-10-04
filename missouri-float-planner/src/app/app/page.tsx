import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, BellRing, MapPin, Signal, Waves } from 'lucide-react';
import SiteFooter from '@/components/ui/SiteFooter';
import styles from './page.module.css';
import AppLink from '@/components/AppLink';
import { appBannerMetadata, campaignToken } from '@/lib/app-discovery';

type Props = { searchParams: Promise<{ ct?: string | string[] }> };

const pageMetadata: Metadata = {
  title: 'Eddy for iPhone — Find Floatable Water',
  description:
    'Get live river conditions, float plans, access-point details, gauge trends, and alerts with Eddy for iPhone.',
  alternates: { canonical: '/app' },
  openGraph: {
    type: 'website',
    url: '/app',
    siteName: 'Eddy',
    title: 'Eddy for iPhone — Find Floatable Water',
    description: 'Know what’s running well before you make the drive.',
    images: [
      {
        url: '/og/eddy-app-store.png',
        width: 1200,
        height: 630,
        alt: 'Eddy for iPhone — find floatable water with live river conditions',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Eddy for iPhone — Find Floatable Water',
    description: 'Know what’s running well before you make the drive.',
    images: ['/og/eddy-app-store.png'],
  },
};

const features = [
  {
    icon: Waves,
    title: 'Conditions you can use',
    copy: 'Live readings become a clear Eddy rating, so you can decide whether the river is worth the drive.',
  },
  {
    icon: MapPin,
    title: 'Plan the whole float',
    copy: 'Compare put-ins, take-outs, mileage, estimated float time, access details, and shuttle routes.',
  },
  {
    icon: BellRing,
    title: 'Let the river tell you',
    copy: 'Create alerts for the conditions you care about and keep your favorite water one tap away.',
  },
  // The landing page had no answer to "does this work where I am going", which
  // is the question an Ozark float raises before any other. It is also the one
  // thing here that is easy to overpromise, so it says exactly what survives
  // losing signal and what does not.
  {
    icon: Signal,
    title: 'Works where the bars run out',
    copy: 'Access points, hazards, and the river\u2019s course stay on your phone, so a put-in with no signal still tells you where you are and what is downstream.',
  },
] as const;

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const campaign = campaignToken((await searchParams).ct);
  return { ...pageMetadata, ...appBannerMetadata('/reports', campaign) };
}

export default async function AppLandingPage({ searchParams }: Props) {
  const campaign = campaignToken((await searchParams).ct);
  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.contours} aria-hidden="true" />
        <div className={styles.heroInner}>
          <div className={styles.copy}>
            <p className={styles.eyebrow}>EDDY FOR IPHONE</p>
            <h1>Find floatable water.</h1>
            <p className={styles.lede}>
              Live river conditions, complete float plans, access-point details,
              gauge trends, and alerts—built for the water you actually paddle.
            </p>

            <div className={styles.actions}>
              <AppLink
                store
                campaign={campaign}
                className={styles.appStoreBadge}
                target="_blank"
                rel="noopener noreferrer"
                data-ga-event="app_store_click"
                data-ga-label="app_landing_hero"
              >
                <Image
                  src="/app-store/download-on-app-store.svg"
                  alt="Download Eddy on the App Store"
                  width={180}
                  height={60}
                />
              </AppLink>

              <Link className={styles.secondaryButton} href="/rivers">
                Explore Eddy now <ArrowRight aria-hidden="true" />
              </Link>
            </div>

            <div className={styles.qrPrompt}>
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
            </div>

            <p className={styles.microcopy}>
              Designed for Missouri and Ozarks float rivers. More water is on the way.
            </p>
          </div>

          <div className={styles.preview} aria-label="Eddy iPhone app preview">
            <Image
              className={`${styles.phoneShot} ${styles.phoneShotBackLeft}`}
              src="/app-store/03-plan-put-in-to-take-out.png"
              alt="Plan a float from put-in to take-out in Eddy"
              width={1320}
              height={2868}
              sizes="(min-width: 900px) 260px, 34vw"
            />
            <Image
              className={`${styles.phoneShot} ${styles.phoneShotBackRight}`}
              src="/app-store/06-watch-the-water-for-you.png"
              alt="Configure a river-condition alert in Eddy"
              width={1320}
              height={2868}
              sizes="(min-width: 900px) 260px, 34vw"
            />
            <Image
              className={`${styles.phoneShot} ${styles.phoneShotFront}`}
              src="/app-store/01-find-floatable-water.png"
              alt="Search live river conditions in Eddy"
              width={1320}
              height={2868}
              sizes="(min-width: 900px) 320px, 54vw"
              priority
            />
          </div>
        </div>
      </section>

      <section className={styles.features} aria-labelledby="app-features-title">
        <div className={styles.sectionHeading}>
          <p className={styles.eyebrow}>KNOW BEFORE YOU GO</p>
          <h2 id="app-features-title">One river guide from couch to take-out.</h2>
        </div>

        <div className={styles.featureGrid}>
          {features.map(({ icon: Icon, title, copy }) => (
            <article className={styles.featureCard} key={title}>
              <span className={styles.featureIcon}><Icon aria-hidden="true" /></span>
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
        <AppLink
          store
          campaign={campaign}
          className={styles.bottomBadge}
          target="_blank"
          rel="noopener noreferrer"
          data-ga-event="app_store_click"
          data-ga-label="app_landing_footer"
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
