import type { Metadata } from 'next';
import { ArrowDown, ArrowRight } from 'lucide-react';
import AdminLayout from '@/components/admin/AdminLayout';
import { EDDY_IMAGES } from '@/constants';
import { GUIDE_GROUPS, START_HERE, VISUAL_GUIDES } from '@/lib/admin/visual-guides';
import styles from './visuals.module.css';

export const metadata: Metadata = { title: 'Visual guides | Admin' };

// These protected links return standalone HTML, not RSC navigation payloads.
export default function VisualGuidesPage() {
  return (
    <AdminLayout title="Visual guides" description="Explore Eddy" hideHeader>
      <div className={styles.page}>
        <header className={styles.hero}>
          <div className={styles.heroText}>
            <span className={styles.eyebrow}>Get to know Eddy</span>
            <h1>Visual guides</h1>
            <p>River conditions, float planning, and what happens behind the scenes.</p>
            <a className={styles.start} href={`/admin/visuals/${START_HERE}`}>
              Explore river conditions <ArrowRight aria-hidden="true" size={18} />
            </a>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={EDDY_IMAGES.canoe} alt="" width={112} height={112} />
        </header>

        <nav className={styles.topics} aria-label="Guide topics">
          {GUIDE_GROUPS.map(group => <a key={group.id} href={`#${group.id}`}>
            {group.title}<ArrowDown size={14} aria-hidden="true" />
          </a>)}
        </nav>

        {GUIDE_GROUPS.map(group => <section key={group.id} id={group.id} className={styles.group} aria-labelledby={`${group.id}-title`}>
          <h2 id={`${group.id}-title`}>{group.title}</h2>
          <div className={`${styles.grid} ${group.id !== 'river' ? styles.gridCompact : ''}`}>
            {VISUAL_GUIDES.filter(guide => guide.group === group.id).map(guide => <a
              key={guide.file} href={`/admin/visuals/${guide.file}`} className={styles.card}
              aria-labelledby={`title-${guide.file}`} aria-describedby={`try-${guide.file}`}
            >
              <div className={styles.cardTop}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/icons/${guide.icon}.png`} alt="" width={64} height={64} loading="lazy" />
                {guide.file === START_HERE ? <span className={styles.startLabel}>Start here</span> : null}
              </div>
              <h3 id={`title-${guide.file}`}>{guide.title}</h3>
              <p id={`try-${guide.file}`}>{guide.tryIt}</p>
              <span className={styles.open}>Explore <ArrowRight size={18} aria-hidden="true" /></span>
            </a>)}
          </div>
        </section>)}
        <p className={styles.example}>These are interactive examples with sample data.</p>
      </div>
    </AdminLayout>
  );
}
