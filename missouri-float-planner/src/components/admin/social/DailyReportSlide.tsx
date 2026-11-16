import RiverEmbed from '@/components/embed/v2/RiverEmbed';
import DamEmbed from '@/components/embed/v2/DamEmbed';
import { parseEmbedOptions } from '@/lib/embed/options';
import { dailyReportStamp, type DailyReport } from '@/lib/social/daily-report';
import './daily-report.css';

/** The real widgets, with a dated export frame. No second chart renderer. */
export default function DailyReportSlide({ report, index }: { report: DailyReport; index: number }) {
  const slide = report.slides[index];
  const options = parseEmbedOptions({ size: 'full', theme: 'light', days: '7' });
  const props = { options, branding: null, origin: 'https://eddy.guide', now: Date.parse(report.capturedAt), report: true };
  return (
    <article className="daily-report-slide" data-report-slide data-report-kind={slide.kind} data-slide-count={report.slides.length} data-captured-at={report.capturedAt}>
      <header className="daily-report-heading">
        <span>Daily Report</span><span className="daily-report-count">{index + 1} / {report.slides.length}</span>
      </header>
      <p className="daily-report-stamp">Captured {dailyReportStamp(report.capturedAt)}</p>
      <div className="daily-report-widget">
        {slide.kind === 'river' ? <RiverEmbed {...props} data={slide.data} /> : <DamEmbed {...props} data={slide.data} />}
      </div>
      <p className="daily-report-takeaway">{slide.takeaway}</p>
      <footer className="daily-report-footer"><strong>eddy.guide</strong><span>Check the latest before you go.</span></footer>
    </article>
  );
}
