import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { assembleMetrics, inboxCount, needsAttention, versionAdoption } from './model';
import { METRICS } from './catalog';
import { jobOutcome } from './jobs-model';

test('partial sources never become zero, and inbox needs all three sources',()=>{
 const metrics=assembleMetrics({feedback:{state:'ok',value:2}});
 assert.equal(inboxCount(metrics),null);
 assert.equal(metrics.find(m=>m.key==='reports')?.value,null);
 assert.equal(metrics.filter(needsAttention).length,1);
});
test('version comparison is numeric and unknown versions retain their denominator',()=>{
 assert.deepEqual(versionAdoption([{name:'1.9.0',count:2},{name:'1.10.0',count:3},{name:'Unknown',count:1}],'1.10.0','1.10.0'),{below:2,newest:3,unknown:1,total:6});
});
test('job status distinguishes partial application failures and never stores response text',()=>{
 assert.deepEqual(jobOutcome({gauge:{errors:2},message:'private'},200),{status:'partial',counters:{'gauge.errors':2}});
 assert.equal(jobOutcome({skipped:true},200).status,'skipped');
 assert.equal(jobOutcome({},500).status,'error');
});
test('SQL aggregates, source isolation, and service-only grants',async()=>{
 const db=new PGlite();
 try {
  await db.exec(readFileSync('src/lib/admin/dashboard/fixture-schema.sql','utf8'));
  await db.exec(readFileSync('supabase/migrations/20260926152722_admin_dashboard_summary.sql','utf8'));
  const now='2026-09-26T12:00:00Z';
  await db.exec(`INSERT INTO entitlements(entitlement_id,environment,expires_at,will_renew) VALUES
   ('eddy_premium','PRODUCTION','2026-10-01',false),('eddy_premium','SANDBOX','2026-10-01',false),('eddy_premium','PRODUCTION','2026-09-01',false),('other','PRODUCTION','2026-10-01',false);
   INSERT INTO feedback(status) VALUES('pending'),('pending'),('resolved');
   INSERT INTO community_reports(status) VALUES('pending');
   INSERT INTO inbound_emails(status) VALUES('unread');
   INSERT INTO gauge_alert_events(detected_at,push_attempts,push_delivered_at) VALUES('2026-09-26T11:00Z',0,NULL),('2026-09-26T11:00Z',2,NULL),('2026-09-26T11:00Z',5,NULL),('2026-09-26T11:00Z',0,'2026-09-26T11:05Z');
   INSERT INTO embed_impressions(day,count) VALUES('2026-09-26',5),('2026-08-01',50);
   INSERT INTO chat_logs(session_id,duration_ms,created_at) VALUES('one',100,'2026-09-26'),('one',300,'2026-09-26'),('two',900,'2026-09-26');`);
  const result=await db.query<{value:Record<string,{state:'ok'|'unknown';value:number}>}>('SELECT admin_dashboard_summary($1,$2) value',[now,'eddy_premium']);
  const data=result.rows[0].value;
  assert.equal(Object.keys(data).length,METRICS.length);
  for(const m of METRICS){assert.ok(data[m.key],m.key);assert.ok(!('reason' in data[m.key]),m.key+' query failed');}
  assert.equal(data.subscribers.value,1);assert.equal(data.renewal_off.value,1);
  assert.equal(inboxCount(assembleMetrics(data)),4);
  assert.equal(data.gauge_waiting.value,1);assert.equal(data.gauge_retry.value,1);assert.equal(data.gauge_exhausted.value,1);
  assert.equal(data.embeds.value,5);assert.equal(data.chat_sessions.value,2);assert.equal(data.chat_duration.value,300);
  await db.exec('DROP TABLE chat_logs');
  const missing=await db.query<{v:{state:string;value:null}}>("SELECT admin_dashboard_metric('chat_sessions',$1,$2) v",[now,'eddy_premium']);
  assert.equal(missing.rows[0].v.state,'unknown');assert.equal(missing.rows[0].v.value,null);
  await db.exec('SET ROLE anon');
  await assert.rejects(()=>db.query('SELECT admin_dashboard_summary($1,$2)',[now,'eddy_premium']),/permission denied/);
 } finally {await db.close();}
});
