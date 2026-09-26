import { jobIdentity } from './jobs-model';
import config from '../../../../vercel.json';
import { createAdminClient } from '@/lib/supabase/admin';
import type { Metric } from './model';
interface Run {job:string;started_at:string;finished_at:string|null;status:string;duration_ms:number|null;last_success_at:string|null;counters:Record<string,number>}
/** Conservative maximum interval for the schedules used by this repository. */
export function scheduleHours(schedule:string):number {
 const [minute,hour,,,weekday]=schedule.split(' ');
 if(weekday!=='*')return 168;
 if(hour!=='*')return 24;
 if(minute.startsWith('*/'))return Number(minute.slice(2))/60;
 if(minute.includes(','))return 1;
 return 1;
}
export function scheduledJobs(){
 const jobs=new Map<string,number>();
 for(const cron of config.crons){const url=new URL(cron.path,'https://eddy.guide');const name=jobIdentity(url.pathname.split('/').pop()!,url);jobs.set(name,Math.max(jobs.get(name)??0,scheduleHours(cron.schedule)));}
 return jobs;
}
export function summarizeRuns(runs:Run[],now=Date.now()):Metric[]{
 return [...scheduledJobs()].map(([job,hours])=>{
  const run=runs.find(r=>r.job===job); const overdue=!!run&&now-Date.parse(run.started_at)>hours*3600000+15*60000;
  const stuck=run?.status==='started'&&now-Date.parse(run.started_at)>10*60000;
  const bad=!!run&&(overdue||stuck||run.status==='error'||run.status==='partial');
  return {key:`job_${job}`,section:'Scheduled jobs',label:job,detail:run?`Last start: ${run.started_at}. Last successful run: ${run.last_success_at??'not recorded'}. ${run.duration_ms??'?'} ms. ${overdue?'Overdue. ':''}${stuck?'Did not finish. ':''}State: ${run.status}. Counters: ${JSON.stringify(run.counters)}`:'No run recorded yet. Monitoring begins after rollout.',href:'/admin/activity',attention:bad,state:run?'ok':'unknown',value:bad?1:run?.status??null};
 });
}
export async function jobMetrics():Promise<Metric[]>{
 try{const {data,error}=await createAdminClient().rpc('admin_dashboard_jobs').abortSignal(AbortSignal.timeout(3000));return summarizeRuns(error?[]:data??[]);}catch{return summarizeRuns([]);}
}
