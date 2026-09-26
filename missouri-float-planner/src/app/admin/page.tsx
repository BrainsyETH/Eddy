'use client';
import { useCallback, useEffect, useState } from 'react';
import AdminLayout from '@/components/admin/AdminLayout';
import DashboardLinks from '@/components/admin/DashboardLinks';
import { adminFetch } from '@/hooks/useAdminAuth';
import { inboxCount, needsAttention, type DashboardSummary, type Metric } from '@/lib/admin/dashboard/model';

function Value({metric}:{metric:Metric}) {
 if(metric.state!=='ok') return <span className="text-neutral-400">{metric.state==='not_connected'?'Not connected':'Unknown'}</span>;
 if(Array.isArray(metric.value)) return metric.value.length?<ol className="space-y-2 text-sm">{metric.value.map((row,i)=><li key={i} className="flex justify-between gap-3"><span className="break-words">{row.name}</span><span className="tabular-nums">{Number(row.count).toLocaleString()}</span></li>)}</ol>:<span className="text-neutral-400">No records in this period</span>;
 if(metric.value && typeof metric.value==='object') return <dl className="space-y-2 text-sm">{Object.entries(metric.value).map(([key,v])=><div key={key} className="flex justify-between gap-3"><dt>{key.replaceAll('_',' ')}</dt><dd>{typeof v==='boolean'?(v?'On':'Off'):String(v??'Unknown')}</dd></div>)}</dl>;
 if(typeof metric.value==='string' && /^\d{4}-\d{2}-\d{2}T/.test(metric.value)) return <span className="text-base">{new Date(metric.value).toLocaleString()}</span>;
 return <span>{typeof metric.value==='number'?metric.value.toLocaleString():String(metric.value??'Unknown')}</span>;
}
function Card({metric}:{metric:Metric}) { return <article className="rounded-xl border border-neutral-700 bg-neutral-800 p-4"><h3 className="mb-3 text-sm font-medium text-neutral-300">{metric.label}</h3><div className="text-2xl font-semibold text-white"><Value metric={metric}/></div>{metric.detail&&<p className="mt-3 text-xs leading-relaxed text-neutral-400">{metric.detail}</p>}{metric.href&&<a href={metric.href} className="mt-3 inline-block text-sm text-primary-400 hover:underline">Review →</a>}</article>; }
function Overview() {
 const [summary,setSummary]=useState<DashboardSummary|null>(null);
 const [error,setError]=useState(false); const [loading,setLoading]=useState(false);
 const refresh=useCallback(async(signal?:AbortSignal)=>{
  setLoading(true);
  try { const response=await adminFetch('/api/admin/summary',{signal}); if(!response.ok) throw new Error('Summary failed'); const data=await response.json(); if(!signal?.aborted){setSummary(data);setError(false);} }
  catch { if(!signal?.aborted)setError(true); } finally {if(!signal?.aborted)setLoading(false);}
 },[]);
 useEffect(()=>{const controller=new AbortController(); void refresh(controller.signal); const tick=()=>{if(!document.hidden)void refresh(controller.signal);}; const timer=setInterval(tick,180000); document.addEventListener('visibilitychange',tick); return()=>{controller.abort();clearInterval(timer);document.removeEventListener('visibilitychange',tick);};},[refresh]);
 const metrics=summary?.metrics??[]; const attention=metrics.filter(needsAttention); const inbox=inboxCount(metrics);
 const unknown=metrics.filter(m=>m.state!=='ok').length;
 const stale=summary && Date.now()-Date.parse(summary.generatedAt)>360000;
 return <div className="mx-auto max-w-7xl space-y-8 p-4 sm:p-6">
  <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-semibold text-white">Eddy at a glance</h1><p className="mt-1 text-sm text-neutral-400">{summary?`Updated ${new Date(summary.generatedAt).toLocaleString()} · refreshes every 3 minutes`:'Loading overview…'}</p></div><button disabled={loading} onClick={()=>void refresh()} className="rounded-lg border border-neutral-600 px-4 py-2 text-sm text-white disabled:opacity-50">{loading?'Refreshing…':'Refresh'}</button></div>
  {(error||stale)&&<p role="status" className="rounded-lg border border-yellow-600 bg-yellow-950 p-4 text-yellow-200">{summary?'Showing an older snapshot. Latest refresh is unavailable.':'Summary unavailable. Retry to load the dashboard.'}</p>}
  <section aria-labelledby="attention"><div className="mb-3 flex flex-wrap justify-between gap-2"><h2 id="attention" className="text-lg font-semibold text-white">Needs attention</h2><span className="text-sm text-neutral-300">Inbox: {inbox===null?'Unknown':inbox} · Sources unavailable: {unknown}</span></div>
   {!summary?<p className="text-neutral-400">Checking sources…</p>:attention.length?<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{attention.map(m=><Card key={m.key} metric={m}/>)}</div>:<p className="rounded-lg border border-neutral-700 p-4 text-neutral-300">No actionable issues in the available sources.{unknown>0?' Some sources are unknown; this is not an all-clear.':''}</p>}
  </section>
  <DashboardLinks/>
  {[...new Set(metrics.map(m=>m.section))].map(section=><details key={section} open={['Business','Data & jobs','Push & devices','Upstream & MCP'].includes(section)} className="group"><summary className="mb-4 cursor-pointer text-lg font-semibold text-white">{section}</summary><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{metrics.filter(m=>m.section===section).map(m=><Card key={m.key} metric={m}/>)}</div></details>)}
 </div>;
}
export default function AdminDashboard(){return <AdminLayout title="Dashboard" description="Health, usage, and work awaiting review"><Overview/></AdminLayout>;}
