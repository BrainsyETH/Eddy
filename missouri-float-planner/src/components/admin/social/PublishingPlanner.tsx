'use client';

import { useState } from 'react';
import { ArrowRight, CalendarDays, Pencil, Plus } from 'lucide-react';
import { adminFetch } from '@/hooks/useAdminAuth';
import { defaultDelivery, deliveryLabels, formatNames, planRules, weekdays, type Delivery, type PlanConfig, type PlanFormat, type PlanRule, type Weekday } from '@/lib/social/publishing-plan';
import styles from './publishing.module.css';

type Config = PlanConfig & { updated_at: string; posting_enabled: boolean; daily_report_auto_publish_enabled?: boolean; meta_accounts?: { facebook: boolean; instagram: boolean }; timezone?: string };

export function displayTime(time: string) {
  const [hour, minute] = time.split(':').map(Number);
  return `${hour % 12 || 12}:${String(minute).padStart(2, '0')} ${hour < 12 ? 'AM' : 'PM'}`;
}

export function DestinationFields({ value, onChange, story, carousel, image, tiktok = true }: {
  value: Delivery; onChange: (next: Delivery) => void; story?: boolean; carousel?: boolean; image?: boolean; tiktok?: boolean;
}) {
  return <fieldset className={styles.destinations}><legend>Destinations</legend>
    {(['instagram', 'facebook'] as const).map(platform => {
      const regular = carousel ? 'Carousel' : image ? 'Feed post' : platform === 'instagram' ? 'Reel' : 'Page video';
      return <label key={platform}>{platform === 'instagram' ? 'Instagram' : 'Facebook'}
        <select aria-label={platform === 'instagram' ? 'Instagram' : 'Facebook'} value={value[platform]} onChange={e => onChange({ ...value, [platform]: e.target.value })}>
          <option value="off">Off</option><option value="regular">{regular}</option>
          {story && <><option value="story">Story</option><option value="both">{regular} + Story</option></>}
        </select>
      </label>;
    })}
    {tiktok && <label>TikTok<select aria-label="TikTok" value={value.tiktok ? 'video' : 'off'} onChange={e => onChange({ ...value, tiktok: e.target.value === 'video' })}><option value="off">Off</option><option value="video">Video</option></select></label>}
  </fieldset>;
}

export function PublishingPlanner({ config, edit, create, preview, owner, settings, draft, tiktokConnected }: {
  config: Config; tiktokConnected?: boolean; draft: (rule: PlanRule) => void; edit: (rule: PlanRule) => void; create: (day?: Weekday) => void; preview: () => void; owner: boolean; settings: () => void;
}) {
  const [day, setDay] = useState<Weekday | 'week'>('week');
  const rules = planRules(config);
  const visible = rules.filter(rule => day === 'week' || rule.days.includes(day));
  const zone = config.timezone || 'America/Chicago';
  return <section aria-labelledby="planner-heading">
    <div className={styles.sectionHead}><div><h2 id="planner-heading">Publishing schedule</h2><p>{zone === 'America/Chicago' ? 'Central time' : zone} · {config.posting_enabled ? 'Automatic posting on' : 'Automatic posting paused'}</p></div>
      <div className={styles.actions}><button className="admin-secondary" onClick={preview}>Preview today</button>
      {owner && <button className="admin-secondary" onClick={() => create(day === 'week' ? undefined : day)}><Plus size={16}/> New schedule</button>}</div>
    </div>
    <div className={styles.week} role="group" aria-label="Filter schedule by weekday">
      {(['week', ...weekdays] as const).map(d => <button key={d} aria-pressed={day === d} onClick={() => setDay(d)}>{d === 'week' ? <><span className={styles.desktopWeek}>Full week</span><span className={styles.mobileWeek}>Week</span></> : d}</button>)}
    </div>
    <div className={styles.agenda}>
      {visible.length === 0 && <p className={styles.empty}>No recurring posts scheduled {day === 'week' ? 'yet' : 'for this day'}.</p>}
      {visible.map(rule => <article key={rule.format + rule.days.join('-')} className={styles.rule}>
        <div className={styles.when}><strong>{displayTime(rule.delivery.time)}</strong><span>{(day === 'week' ? rule.days : [day]).join(' · ')}</span></div>
        <div className={styles.what}><h3>{formatNames[rule.format]}</h3><p>{deliveryLabels(rule.format, rule.delivery).join(' · ')}</p>
          {rule.delivery.tiktok && tiktokConnected === false && <small>TikTok disconnected</small>}
          {rule.format === 'daily_digest' && config.daily_report_auto_publish_enabled === false && <small>Automatic Daily Reports paused</small>}
        </div>
        <div className={styles.ruleActions}><button className={styles.inline} aria-label={'Create ' + formatNames[rule.format] + ' draft'} onClick={() => draft(rule)}>Create draft</button>
        {owner && <button className={styles.edit} aria-label={'Edit ' + formatNames[rule.format] + ' schedule'} onClick={() => edit(day === 'week' ? rule : { ...rule, days: [day] })}><Pencil size={15}/> Edit</button>}</div>
      </article>)}
    </div>
    {owner && !config.posting_enabled && <button className={styles.inline} onClick={settings}>Manage automatic posting <ArrowRight size={15}/></button>}
  </section>;
}

export function RuleEditor({ config, format, original, initialDay, onSave, cancel, reload }: {
  config: Config; format: PlanFormat; original?: PlanRule; initialDay?: Weekday; onSave: (config: Config) => void; cancel: () => void; reload: () => void;
}) {
  const [days, setDays] = useState<Weekday[]>(original?.days ?? (initialDay && !config.media_schedule[format]?.[initialDay] && (format !== 'river_highlight' || initialDay === 'thu') ? [initialDay] : []));
  const [delivery, setDelivery] = useState(original?.delivery ?? defaultDelivery(config, format));
  const [version] = useState(config.updated_at);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState(false);
  const previous = original?.days ?? [];
  const read = format === 'river_highlight';
  async function save(chosen: Weekday[]) {
    setError(''); setBusy(true);
    try {
      const res = await adminFetch('/api/admin/social/config', { method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save_rule', version, format, previousDays: previous, days: chosen, delivery }) });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Could not save the schedule.'); setConflict(res.status === 409); return; }
      onSave(data);
    } catch { setError('Could not confirm the change. Check the planner before trying again.'); }
    finally { setBusy(false); }
  }
  return <fieldset className={styles.formBody} disabled={busy}>
    <fieldset><legend>Repeat on</legend><div className={styles.week}>
      {weekdays.map(day => {
        const taken = Boolean(config.media_schedule[format]?.[day]) && !previous.includes(day);
        return <button key={day} type="button" disabled={(read && day !== 'thu') || taken} title={taken ? 'Already scheduled' : undefined} aria-pressed={days.includes(day)}
          onClick={() => setDays(weekdays.filter(d => d === day ? !days.includes(d) : days.includes(d)))}>{day}</button>;
      })}
    </div></fieldset>
    {weekdays.some(day => (!read || day === 'thu') && config.media_schedule[format]?.[day] && !previous.includes(day)) &&
      <p className={styles.note}>Days already on another schedule can be edited in the planner.</p>}
    <label className={styles.field}>Time ({config.timezone && config.timezone !== 'America/Chicago' ? config.timezone : 'Central'})
      <input type="time" step="1800" disabled={read} value={delivery.time} onChange={e => setDelivery({ ...delivery, time: e.target.value })}/></label>
    {!read && <p className={styles.note}>Choose an hour or half hour.</p>}
    {read && <p className={styles.note}>Eddy’s Read runs Thursdays at 5 PM.</p>}
    {format === 'weekly_forecast' && <p className={styles.note}>Holiday weekends also get a Tuesday forecast.</p>}
    <DestinationFields value={delivery} onChange={setDelivery} story={format === 'section_guide'} carousel={format === 'daily_digest'} tiktok={format !== 'daily_digest'}/>
    {format === 'daily_digest' && config.daily_report_auto_publish_enabled === false && <p className={styles.note}>Automatic Daily Reports are paused. You can save the schedule now.</p>}
    {error && <p role="alert">{error} {conflict && <button className={styles.inline} onClick={reload}>Reload planner</button>}</p>}
    <div className={styles.actions}><button className="admin-primary" disabled={conflict || !days.length || !delivery.time || !deliveryLabels(format, delivery).length} onClick={() => save(days)}><CalendarDays size={16}/>{busy ? 'Saving…' : 'Save schedule'}</button>
      <button className="admin-secondary" onClick={cancel}>Cancel</button>
      {original && <button className={styles.inline} disabled={conflict} onClick={() => save([])}>Turn off these days</button>}
    </div>
  </fieldset>;
}
