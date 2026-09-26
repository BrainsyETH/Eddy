import { NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { hasValidMachineBearer } from '@/lib/security/machine-auth';
import { jobOutcome } from './jobs-model';
/** Two bounded writes per authenticated cron. Records never contain response text or request parameters. */
export function withJobRun(job:string,handler:(request:NextRequest)=>Promise<Response>){
 return async(request:NextRequest):Promise<Response>=>{
  const secret=process.env.CRON_SECRET;
  if(!secret||!hasValidMachineBearer(request.headers.get('authorization'),secret))return handler(request);
  const source=request.nextUrl.searchParams.get('source');
  const name=job+(source&&/^[a-z_]{1,30}$/.test(source)?`:${source}`:'');
  const id=crypto.randomUUID(),started=Date.now();
  async function write(row:Record<string,unknown>,insert=false){
   try{const db=createAdminClient(); const q=insert?db.from('admin_job_runs').insert(row):db.from('admin_job_runs').update(row).eq('id',id); const {error}=await q.abortSignal(AbortSignal.timeout(1000));if(error)console.warn('[job-monitor] Run record unavailable');}catch{console.warn('[job-monitor] Run record unavailable');}
  }
  await write({id,job:name,status:'started'},true);
  try{
   const response=await handler(request);
   let body:unknown=null; try{body=await response.clone().json();}catch{/* non-JSON response */}
   await write({...jobOutcome(body,response.status),finished_at:new Date().toISOString(),duration_ms:Math.min(2147483647,Date.now()-started)});
   return response;
  }catch(error){await write({status:'error',finished_at:new Date().toISOString(),duration_ms:Math.min(2147483647,Date.now()-started)});throw error;}
 };
}
