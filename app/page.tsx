'use client';
import {FormEvent,useState} from 'react';
import {SearchResponse} from '@/lib/types';

const toman=(n?:number)=>n==null?'—':new Intl.NumberFormat('fa-IR').format(n)+' تومان';
const statusText=(s:string)=>({fresh:'زنده',blocked:'مسدود',failed:'خطا',stale:'قدیمی'} as Record<string,string>)[s]??s;

export default function Home(){
 const [q,setQ]=useState(''); const [data,setData]=useState<SearchResponse|null>(null); const [loading,setLoading]=useState(false);
 async function search(e:FormEvent){e.preventDefault(); if(!q.trim())return; setLoading(true); setData(null); try{const r=await fetch(`/api/search?q=${encodeURIComponent(q.trim())}`); if(!r.ok)throw new Error('search failed'); setData(await r.json());}finally{setLoading(false)}}
 return <main className="shell"><header className="hero"><h1>Comparis</h1><p>یک محصول را وارد کن؛ قیمت آن را از چند منبع ایرانی به‌صورت زنده جمع‌آوری می‌کنیم.</p></header>
 <form className="search" onSubmit={search}><input value={q} onChange={e=>setQ(e.target.value)} placeholder="مثلاً RTX 5070 Ti 16GB" aria-label="محصول"/><button disabled={loading}>{loading?'در حال جست‌وجو…':'جست‌وجوی زنده'}</button></form>
 {loading&&<div className="status"><span><i className="pulse"/>در حال بررسی منابع</span><span>هر منبع مستقل است</span></div>}
 {data&&<><div className="status"><span>{data.results.length} نتیجه از {data.sources.length} منبع</span><span>{new Date(data.completedAt).toLocaleTimeString('fa-IR')}</span></div>
 <section className="grid">{data.results.length?data.results.map((x,i)=><article className="card" key={`${x.sourceId}-${i}`}><div><div className="source">{x.source} · {statusText(x.status)}</div><div className="title">{x.title}</div><div className="meta">مشاهده: {new Date(x.observedAt).toLocaleTimeString('fa-IR')} · اطمینان استخراج: {Math.round(x.confidence*100)}٪</div></div><div className="price">{toman(x.price)}</div></article>):<div className="empty">هیچ پیشنهاد قابل استخراجی در این لحظه پیدا نشد.</div>}</section>
 <div className="footer">وضعیت منابع: {data.sources.map(s=><span key={s.id}> {s.name}: {statusText(s.status)} ({s.latencyMs}ms) · </span>)}</div></>}
 </main>;
}