import { createAdminClient } from '@/lib/supabase/admin';
import type { Metric } from '@/lib/admin/dashboard/model';
import { decodeHash,dayOf,mergeHistograms,percentile, type UsageRow } from './model';
import { readHash,telemetryConfig } from './redis';
import { estimatedCost,PRICE_VERSION } from './pricing';
const providers=['usgs','nws','openweather','mapbox','anthropic','mcp'];
function metric(key:string,label:string,value:Metric['value'],detail:string,state:Metric['state']='ok',attention=false):Metric{return{key,section:'Upstream & MCP',label,value,detail,state,attention,href:''};}
export async function usageMetrics():Promise<Metric[]>{
 const config=telemetryConfig();
 const result:Metric[]=[metric('mcp_limit','MCP request limiting',process.env.UPSTASH_REDIS_REST_URL&&process.env.UPSTASH_REDIS_REST_TOKEN?'Global store configured':'Per-instance fallback','120 requests per IP per minute. Configuration is not a live dependency-health check.')];
 if(!config.enabled)return [...result,metric('upstream','Upstream telemetry',null,'Opt-in collection is not configured. No provider totals are inferred.','not_connected')];
 const today=dayOf(Date.now());let hash:Record<string,string|number>|null=null,liveOk=false,historyOk=false;let history:UsageRow[]=[];
 await Promise.all([
  (async()=>{try{hash=await readHash(today);liveOk=true;}catch{/* unknown */}})(),
  (async()=>{try{const {data,error}=await createAdminClient().from('upstream_usage_daily').select('*').eq('environment',config.environment).gte('day',dayOf(Date.now()-6*86400000)).lt('day',today).limit(2001).abortSignal(AbortSignal.timeout(3000));if(!error&&(data?.length??0)<=2000){history=(data??[]) as UsageRow[];historyOk=true;}}catch{/* unknown */}})(),
 ]);
 const current=hash?decodeHash(hash,today,config.environment):[];
 result.push(metric('telemetry_budget','Telemetry recording budget',hash?Number(hash['_commands']??0):null,`${config.environment}: ${config.dailyBudget} budgeted Redis operations/day. EVAL, rejected probes, reads and other usage are additional; this is not a billing cap.`,hash?'ok':'unknown'));
 result.push(metric('telemetry_capped','Telemetry collection capped',hash?Number(hash['_budget_exhausted']??0):null,'A capped day is incomplete. Do not treat its totals as exact.',hash?'ok':'unknown',true));
 result.push(metric('telemetry_dropped','Telemetry buffer overflow',hash?Number(hash['_buffer_dropped']??0):null,'Recorded overflow count; availability and command budget can also cause missing observations.',hash?'ok':'unknown',true));
 for(const provider of providers){
  const nowRows=current.filter(r=>r.provider===provider),oldRows=history.filter(r=>r.provider===provider),rows=[...oldRows,...nowRows];
  const todayCalls=nowRows.reduce((n,r)=>n+r.estimated_calls,0),calls=rows.reduce((n,r)=>n+r.estimated_calls,0),errors=nowRows.reduce((n,r)=>n+r.estimated_errors,0);
  const observed=nowRows.reduce((n,r)=>n+r.observed_calls,0);const limited=nowRows.reduce((n,r)=>n+r.observed_429s,0);
  const sample=rows.some(r=>r.sample_rate<1);const days=new Set(rows.map(r=>r.day)).size;
  const detail=`${sample?'Sample-weighted estimates':'Recorded operations'}; ${days}/7 UTC days represented. Missing days and dropped events are not zero traffic. ${provider==='mcp'?'Tool invocations, not HTTP requests.':provider==='anthropic'?'Logical SDK calls; internal retry attempts are not counted separately.':'Fetch invocations may include cache hits; latency is to response headers, not full body consumption.'}`;
  const m=metric(`upstream_${provider}`,provider.toUpperCase(),rows.length?{today:liveOk&&nowRows.length?Math.round(todayCalls):null,recorded_7_days:historyOk?Math.round(calls):null,observations_today:liveOk&&nowRows.length?observed:null,error_percent_today:todayCalls?Number((100*errors/todayCalls).toFixed(1)):null,p95_7_days:historyOk?percentile(mergeHistograms(rows),0.95):null}:null,detail,rows.length?'ok':'unknown');
  if(provider==='mapbox'){m.href='https://account.mapbox.com/statistics/';m.detail+=' Server directions/geocoding only; map tiles and mobile map loads excluded.';}
  if(provider==='openweather')m.detail+=' These counts cannot establish billed quota usage; no quota alarm is derived from cache-inclusive calls.';
  result.push(m,metric(`429_${provider}`,`${provider.toUpperCase()} · recorded 429s today`,liveOk&&nowRows.length?limited:null,'Errors are collected without sampling, subject to collection availability and budget.',liveOk&&nowRows.length?'ok':'unknown',true));
  if(observed>=20&&todayCalls&&errors/todayCalls>=0.05)result.push(metric(`errors_${provider}`,`${provider.toUpperCase()} · elevated error rate`,Number((100*errors/todayCalls).toFixed(1)),'At least 20 observations and ≥5% weighted errors today. Includes 4xx responses.', 'ok',true));
 }
 const ai=[...history,...current].filter(r=>r.provider==='anthropic');
 for(const feature of [...new Set(ai.map(r=>r.operation))]){
  const rows=ai.filter(r=>r.operation===feature);const costs=rows.map(estimatedCost);const priced=costs.every(n=>n!==null);
  result.push(metric(`ai_${feature}`,`AI · ${feature} · 7 UTC days`,{input_tokens:rows.reduce((n,r)=>n+r.input_tokens,0),output_tokens:rows.reduce((n,r)=>n+r.output_tokens,0),cache_read_tokens:rows.reduce((n,r)=>n+r.cache_read_tokens,0),cache_write_tokens:rows.reduce((n,r)=>n+r.cache_write_tokens,0),estimated_USD:priced?'$'+costs.reduce<number>((n,c)=>n+(c??0),0).toFixed(4):'Unknown model pricing'},`Recorded usage only; not an invoice. Price basis ${PRICE_VERSION}; default 5-minute cache writes. Historical coverage ${historyOk?'available':'unknown'}.`));
 }
 const tools=current.filter(r=>r.provider==='mcp');
 if(tools.length)result.push(metric('mcp_tools','MCP tools · today', [...new Set(tools.map(r=>r.operation))].map(name=>({name,count:Math.round(tools.filter(r=>r.operation===name).reduce((n,r)=>n+r.estimated_calls,0))})).sort((a,b)=>b.count-a.count),'Sample-weighted tool invocations. No tool arguments, IPs, or user identifiers stored.'));
 return result;
}
