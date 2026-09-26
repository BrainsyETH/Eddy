export function jobOutcome(body: unknown, status: number): {status:'ok'|'partial'|'error'|'skipped';counters:Record<string,number>} {
 const counters:Record<string,number>={}; let partial=false, skipped=false;
 function inspect(value:unknown,prefix='',depth=0){
  if(!value||typeof value!=='object'||depth>2)return;
  for(const [key,v] of Object.entries(value)){
   if(!/^[a-zA-Z_]{1,40}$/.test(key))continue;
   if(key==='skipped'&&v===true)skipped=true;
   if((key==='ok'&&v===false)||(key==='error'&&!!v)||(/error|failed|givenUp/i.test(key)&&((typeof v==='number'&&v>0)||(Array.isArray(v)&&v.length>0))))partial=true;
   if(typeof v==='number'&&Number.isFinite(v)&&Object.keys(counters).length<30)counters[prefix+key]=v;
   else if(v&&typeof v==='object'&&!Array.isArray(v))inspect(v,prefix+key+'.',depth+1);
  }
 }
 inspect(body);
 return {status:status>=400?'error':partial?'partial':skipped?'skipped':'ok',counters};
}
