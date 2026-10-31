import type { Metadata } from 'next';
import {
  ArrowRight,
  Clock,
  Gauge,
  Map as MapIcon,
  PenLine,
  Sailboat,
  Share2,
  Smartphone,
  Waves,
  WifiOff,
  type LucideIcon,
} from 'lucide-react';
import AdminLayout from '@/components/admin/AdminLayout';
import { EDDY_IMAGES } from '@/constants';
import { START_HERE, VISUAL_GUIDES, type VisualGuide } from '@/lib/admin/visual-guides';
import styles from './visuals.module.css';

export const metadata: Metadata = { title: 'Visual guides | Admin' };

const groups = [...new Set(VISUAL_GUIDES.map((guide) => guide.group))];
const ICONS: Record<VisualGuide['icon'], LucideIcon> = {
  map: MapIcon,
  clock: Clock,
  share: Share2,
  gauge: Gauge,
  pen: PenLine,
  waves: Waves,
  phone: Smartphone,
  signal: WifiOff,
  route: Sailboat,
};
const KIND = { demo: 'Hands-on demo', tour: 'Picture tour' } as const;
const start = VISUAL_GUIDES.find((guide) => guide.file === START_HERE)!;
const demos = VISUAL_GUIDES.filter((guide) => guide.kind === 'demo').length;

// Native <a> navigation throughout: these protected routes return standalone
// HTML documents, not React Server Component payloads.
const href = (guide: VisualGuide) => `/admin/visuals/${guide.file}`;

export default function VisualGuidesPage() {
  return (
    <AdminLayout title="Visual guides" description="Learn how Eddy works" hideHeader>
      <div className={styles.page}>
        <section className={styles.hero}>
          {/* Brand art lives on the Vercel Blob CDN, as elsewhere in admin. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={EDDY_IMAGES.canoe} alt="Eddy the Otter in a canoe" width={120} height={120} />
          <div className={styles.heroText}>
            <h1>Learn how Eddy works.</h1>
            <p>
              Pick a question. Each guide is a small example you can play with.
              It uses made-up data and never changes anything live.
            </p>
            <a className={styles.start} href={href(start)}>
              New here? Start with “{start.question}”
              <ArrowRight aria-hidden="true" />
            </a>
          </div>
          <dl className={styles.facts}>
            <div>
              <dt>Guides</dt>
              <dd>{VISUAL_GUIDES.length}</dd>
            </div>
            <div>
              <dt>Hands-on demos</dt>
              <dd>{demos}</dd>
            </div>
            <div>
              <dt>Topics</dt>
              <dd>{groups.length}</dd>
            </div>
          </dl>
        </section>

        {groups.map((group, index) => {
          const guides = VISUAL_GUIDES.filter((guide) => guide.group === group);
          return (
            <section key={group} aria-labelledby={`guide-group-${index}`}>
              <h2 id={`guide-group-${index}`} className={styles.groupTitle}>
                {group}
                <span>{guides.length} guides</span>
              </h2>
              <div className={styles.grid}>
                {guides.map((guide) => {
                  const Icon = ICONS[guide.icon];
                  return (
                    <a key={guide.file} href={href(guide)} className={styles.card}>
                      <span className={styles.cardTop}>
                        <span className={styles.icon}>
                          <Icon aria-hidden="true" />
                        </span>
                        <span className={styles.kind} data-kind={guide.kind}>
                          {KIND[guide.kind]}
                        </span>
                      </span>
                      <h3>{guide.question}</h3>
                      <p className={styles.try}>
                        <b>Try it:</b> {guide.tryIt}
                      </p>
                      <span className={styles.open}>
                        Open “{guide.title}”
                        <ArrowRight aria-hidden="true" />
                      </span>
                    </a>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </AdminLayout>
  );
}
