import type { Observation, Outcome, Provider } from './model';
export type Recorder=(event:Observation)=>void;
const quiet:Recorder=()=>{};
function safely(record:Recorder,event:Observation){try{record(event);}catch{/* instrumentation never changes application semantics */}}
export function statusOutcome(status:number):Outcome {return status===429?'429':status>=500?'5xx':status>=400?'4xx':status>=300?'3xx':'2xx';}
function failureOutcome(error:unknown):Outcome {const name=error&&typeof error==='object'&&'name' in error?String(error.name):'';return name==='TimeoutError'?'timeout':name==='AbortError'?'cancelled':'network';}
export function makeTrackedFetch(record:Recorder=quiet,transport:typeof fetch=(...args)=>fetch(...args)) {
 return async(provider:Provider,operation:string,input:RequestInfo|URL,init?:RequestInit):Promise<Response>=>{
  const started=performance.now(),at=Date.now();const kind=init?.cache==='no-store'||init?.next?.revalidate===0?'fetch_no_store' as const:'fetch_cache_possible' as const;
  try{const response=await transport(input,init);safely(record,{provider,operation,kind,outcome:statusOutcome(response.status),durationMs:performance.now()-started,at});return response;}
  catch(error){safely(record,{provider,operation,kind,outcome:failureOutcome(error),durationMs:performance.now()-started,at});throw error;}
 };
}
export async function measure<T>(provider:'anthropic'|'mcp',operation:string,model:string|undefined,run:()=>PromiseLike<T>,record:Recorder):Promise<T>{
 const started=performance.now(),at=Date.now();
 try{
  const value=await run(); const result=value as {isError?:boolean;usage?:{input_tokens?:number;output_tokens?:number;cache_read_input_tokens?:number;cache_creation_input_tokens?:number}};
  const usage=result?.usage;
  safely(record,{provider,operation,model,kind:provider==='mcp'?'tool':'sdk',outcome:result?.isError?'5xx':'2xx',durationMs:performance.now()-started,at,tokens:usage?{input:usage.input_tokens??0,output:usage.output_tokens??0,cacheRead:usage.cache_read_input_tokens??0,cacheWrite:usage.cache_creation_input_tokens??0}:undefined});
  return value;
 }catch(error){const status=error&&typeof error==='object'&&'status' in error?Number(error.status):0;safely(record,{provider,operation,model,kind:provider==='mcp'?'tool':'sdk',outcome:status?statusOutcome(status):failureOutcome(error),durationMs:performance.now()-started,at});throw error;}
}
