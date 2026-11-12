import type { DamScheduleShare } from '@shared/dam-schedule-share';
import { EMBED_LIGHT_TOKENS as t } from '@/lib/embed/options';

/** A dated export of the widget's published-MW packet, with its fixed capacity scale. */
export function DamScheduleImage({ model, damIcon, otter }: {
  model: DamScheduleShare; damIcon: string; otter: string;
}) {
  const plotHeight = 198;
  return (
    <div style={{ display: 'flex', width: '100%', height: '100%', padding: 28, background: t.surface, fontFamily: 'Geist', color: t.text }}>
      <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%', padding: '32px 40px', background: t.bg, border: `3px solid ${t.frame}`, borderRadius: 24, boxShadow: `7px 7px 0 ${t.frameShadow}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={damIcon} width={76} height={76} alt="" />
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
            <div style={{ display: 'flex', fontFamily: 'Fredoka', fontSize: model.name.length > 36 ? 34 : 44, color: t.frame }}>{model.name}</div>
            <div style={{ display: 'flex', fontSize: 23, color: t.muted, marginTop: 5 }}>{model.location}</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 26 }}>
          <div style={{ display: 'flex', fontSize: 30 }}>{model.dateLabel}</div>
          <div style={{ display: 'flex', fontSize: 21, color: t.muted }}>Central Time · at the dam</div>
        </div>
        <div style={{ display: 'flex', marginTop: 14, padding: '12px 18px', borderLeft: `5px solid ${t.accent}`, background: t.surface, borderRadius: 8, fontSize: 25, color: t.frame, height: 78, alignItems: 'center', overflow: 'hidden' }}>
          {model.summary.length > 150 ? `${model.summary.slice(0, 147)}…` : model.summary}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 20, fontSize: 19, color: t.muted }}>
          <span>Scheduled generation</span>
          <span>{model.day.capacityMw ? `0–${model.day.capacityMw} MW` : 'MW · scale unavailable'}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: plotHeight, marginTop: 8, borderBottom: `1px solid ${t.border}` }}>
          {model.day.hours.map(hour => {
            const missing = hour.megawatts === null;
            const on = (hour.megawatts ?? 0) > 0 && !hour.minimumFlow;
            const height = missing ? 18 : on ? Math.max(3, plotHeight * (hour.fraction ?? 0.12)) : 3;
            return <div key={hour.hourEnding} style={{ display: 'flex', flex: 1, height, borderRadius: '4px 4px 0 0', background: missing ? t.bg : on ? t.data : t.border, ...(missing ? { border: `2px solid ${t.muted}` } : {}) }} />;
          })}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 20, color: t.muted, marginTop: 8 }}>
          <span>12a</span><span>6a</span><span>12p</span><span>6p</span><span>12a</span>
        </div>
        <div style={{ display: 'flex', fontSize: 18, color: t.muted, minHeight: 24, marginTop: 6 }}>
          {model.missing ? 'Outlined bars: hours unavailable' : model.minimumFlow ? 'Low baseline: minimum flow or no generation' : 'Posted plan · not measured water release'}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', marginTop: 'auto', borderTop: `1px solid ${t.border}`, paddingTop: 15, fontSize: 18, color: t.muted }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <span>{model.checked}</span>
              <span>Source: {model.source}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontFamily: 'Fredoka', color: t.frame, fontSize: 27 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={otter} width={47} height={54} alt="" />
              <span>eddy.guide</span>
            </div>
          </div>
          {model.warning && <div style={{ display: 'flex', marginTop: 8, color: t.rise }}>{model.warning}</div>}
          <div style={{ display: 'flex', marginTop: 8 }}>Schedules can change. No generation does not mean no water release.</div>
        </div>
      </div>
    </div>
  );
}
