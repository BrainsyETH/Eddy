import React, { useEffect, useState } from 'react';
import { AbsoluteFill, Img, cancelRender, continueRender, delayRender, staticFile, useCurrentFrame } from 'remotion';
import { colors, videoSafeInsets } from '../../../../shared/social-brand';
import { damStoryWindows, type DamStoryProps } from '../../../../shared/social-dam-schedule';
import { scheduleDayLabel } from '../../../../shared/dam-schedule-copy';
import { fontFamilies, loadFonts } from '../../design-tokens/fonts';
import { DamStoryScene } from './DamStoryScene';

const ink = colors.primary[900];
/** All schedule copy holds for 12 seconds. Only the labelled illustration moves. */
export const DamScheduleStory: React.FC<DamStoryProps> = ({ snapshot, platform, sample = false }) => {
  const frame = useCurrentFrame();
  const [fonts] = useState(() => delayRender('Loading Eddy fonts'));
  useEffect(() => { loadFonts().then(() => continueRender(fonts)).catch(cancelRender); }, [fonts]);
  const safe = videoSafeInsets(platform, platform === 'instagram' ? 'story' : 'reel');
  const width = 1080 - safe.left - safe.right - 16; // includes the hard shadow
  const windows = damStoryWindows(snapshot.hours);
  const count = snapshot.hours.filter(Boolean).length;
  const many = windows.length > 4;
  const checked = new Date(snapshot.checkedAt).toLocaleString('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
  return <AbsoluteFill style={{ background: colors.secondary[50], color: ink, fontFamily: fontFamilies.body }}>
    <svg width="1080" height="1920" style={{ position: 'absolute' }} aria-hidden="true"><path d="M-70 70 Q150 -5 320 70 T720 70 T1160 70" stroke={colors.secondary[200]} strokeWidth="32" fill="none" /><path d="M-100 1790 Q100 1720 300 1790 T700 1790 T1160 1790" stroke={colors.primary[100]} strokeWidth="74" fill="none" /><path d="M-100 1850 Q100 1780 300 1850 T700 1850 T1160 1850" stroke={colors.primary[200]} strokeWidth="30" fill="none" /></svg>
    <main data-dam-safe style={{ position: 'absolute', left: safe.left, top: safe.top, width, display: 'flex', flexDirection: 'column', gap: 18 }}>
      <header data-dam-region="header">
        <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginBottom: 16 }}>
          <Img src={staticFile('eddy/eddy-favicon.png')} style={{ width: 64, height: 64 }} />
          <span style={{ color: colors.accent[600], fontFamily: fontFamilies.display, fontSize: 58, fontWeight: 600 }}>Eddy</span>
          <span style={{ marginLeft: 'auto', fontSize: 24, fontWeight: 700 }}>DAILY DAM UPDATE</span>
        </div>
        <div data-dam-text style={{ fontSize: 27, fontWeight: 650, marginBottom: 8 }}>{scheduleDayLabel(snapshot.scheduleDate).toUpperCase()} · CENTRAL TIME{sample ? ' · SAMPLE' : ''}</div>
        <h1 data-dam-text style={{ fontFamily: fontFamilies.display, fontSize: 78, fontWeight: 600, lineHeight: 1.1, margin: 0 }}>Table Rock Dam</h1>
      </header>
      <section data-dam-region="schedule" style={{ height: many ? 362 : 324, boxSizing: 'border-box', border: `5px solid ${ink}`, borderRadius: 22, background: 'white', boxShadow: `8px 8px 0 ${ink}`, padding: '22px 24px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
        <div data-dam-text style={{ fontSize: 29, fontWeight: 700 }}>Scheduled generation</div>
        <div data-dam-windows style={{ display: 'grid', gridTemplateColumns: many ? '1fr 1fr' : '1fr', columnGap: 18, rowGap: 1, fontFamily: fontFamilies.display, fontWeight: 600, fontSize: many ? 37 : windows.length > 2 ? 47 : windows.length === 2 ? 65 : 92, lineHeight: 1.08 }}>
          {windows.length ? windows.map(window => <span data-dam-text key={window} style={{ whiteSpace: 'nowrap' }}>{window}</span>) : <span data-dam-text style={{ fontSize: 60 }}>No generation<br />scheduled</span>}
        </div>
        <div data-dam-text style={{ fontSize: 25, color: colors.neutral[700] }}>{count} {count === 1 ? 'hour' : 'hours'} posted{snapshot.minimumFlow ? ' · Minimum flow also scheduled' : ' · At the dam'}</div>
      </section>
      <div data-dam-region="illustration" style={{ height: 270 }}>
        <div style={{ height: 240 }}><DamStoryScene frame={frame} active={count > 0} /></div>
        <div data-dam-text style={{ textAlign: 'center', fontSize: 24, color: colors.neutral[600] }}>Illustration · not live</div>
      </div>
      <section data-dam-region="timeline" style={{ height: 130 }}>
        <div data-dam-text style={{ fontSize: 29, fontWeight: 700, marginBottom: 14 }}>Posted generation hours</div>
        <div style={{ display: 'flex', gap: 4, height: 48 }}>{snapshot.hours.map((active, hour) => <div data-dam-hour={hour} key={hour} style={{ flex: 1, borderRadius: 5, background: active ? colors.accent[500] : colors.secondary[200] }} />)}</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 9, fontSize: 23, color: colors.neutral[700] }}>{['12 AM', '6 AM', 'noon', '6 PM', '12 AM'].map((label, i) => <span data-dam-text key={i}>{label}</span>)}</div>
      </section>
      <footer data-dam-region="footer" style={{ borderTop: `2px solid ${colors.neutral[300]}`, paddingTop: 14 }}>
        <div data-dam-text style={{ fontSize: 26 }}>Schedule can change. Check before you go.</div>
        <div data-dam-text style={{ fontSize: 23, marginTop: 8, color: colors.neutral[600] }}>SWPA schedule · Eddy checked {checked}</div>
        <div data-dam-text style={{ fontSize: 23, marginTop: 5, color: colors.neutral[600] }}>Not a downstream water-level forecast.</div>
        <div data-dam-text style={{ fontFamily: fontFamilies.display, fontSize: 44, fontWeight: 600, color: colors.accent[600], marginTop: 8 }}>eddy.guide</div>
        {sample && <div data-dam-text style={{ fontSize: 22, fontWeight: 700 }}>DESIGN PREVIEW · EXAMPLE TIMES</div>}
      </footer>
    </main>
  </AbsoluteFill>;
};
