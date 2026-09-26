import { createAdminClient } from '@/lib/supabase/admin';
import { decodeHash, historyDays } from './model';
import { readHash, telemetryConfig } from './redis';
export async function rollupTelemetry(){
 const db=createAdminClient();let copied=0,errors=0;
 if(telemetryConfig().enabled)for(const day of historyDays(Date.now())){
  try{
   // Timestamp BEFORE reading: out-of-order reads cannot roll the stored snapshot back.
   const collectedAt=new Date().toISOString();const hash=await readHash(day);if(!hash)continue;
   const rows=decodeHash(hash,day,telemetryConfig().environment,collectedAt);
   const {error}=await db.rpc('store_upstream_snapshot',{p_rows:rows}).abortSignal(AbortSignal.timeout(4000));
   if(error)errors++;else copied+=rows.length;
  }catch{errors++;}
 }
 // Redis expires independently after 8 days. Never delete on copy.
 // Retention runs even when collection is disabled.
 for(const [table,column,days]of [['admin_job_runs','started_at',30],['upstream_usage_daily','day',90]] as const){
  const {error}=await db.from(table).delete().lt(column,new Date(Date.now()-days*86400000).toISOString()).abortSignal(AbortSignal.timeout(4000));if(error)errors++;
 }
 return {copied,errors,collectionEnabled:telemetryConfig().enabled};
}
