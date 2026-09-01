'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import type { ComparisonGroup, Offer, SearchResponse, SourceResult } from '@/lib/types';

const toman = (n?: number) => n == null ? '—' : new Intl.NumberFormat('fa-IR').format(n) + ' تومان';
const statusText: Record<string, string> = { fresh: 'زنده', blocked: 'مسدود', failed: 'خطا', stale: 'قدیمی' };
const statusClass: Record<string, string> = { fresh: 'ok', blocked: 'warn', failed: 'bad', stale: 'muted' };

export default function Home() {
  const [q, setQ] = useState('');
  const [data, setData] = useState<SearchResponse | null>(null);
  const [sources, setSources] = useState<SourceResult[]>([]);
  const [selected, setSelected] = useState<Offer[]>([]);
  const [compareOpen, setCompareOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  function reset() { setData(null); setSources([]); setSelected([]); setCompareOpen(false); }

  async function search(e?: FormEvent) {
    e?.preventDefault();
    const query = q.trim();
    if (!query || loading) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    reset(); setLoading(true);
    const sourceMap = new Map<string, SourceResult>();
    try {
      const response = await fetch(`/api/search/stream?q=${encodeURIComponent(query)}`, { signal: controller.signal });
      if (!response.ok || !response.body) throw new Error('stream failed');
      const reader = response.body.getReader();
      const decoder = new TextDecoder(); let buffer = '';
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split('\n\n'); buffer = chunks.pop() ?? '';
        for (const chunk of chunks) {
          const match = chunk.match(/event: ([^\n]+)\ndata: ([\s\S]+)/);
          if (!match) continue;
          const payload = JSON.parse(match[2]);
          if (match[1] === 'source') {
            sourceMap.set(payload.id, payload as SourceResult);
            const next = [...sourceMap.values()]; setSources(next);
            setData({ query, results: next.flatMap((s) => s.offers).sort((a: Offer, b: Offer) => (a.price ?? Infinity) - (b.price ?? Infinity)), sources: next, completedAt: new Date().toISOString() });
          } else if (match[1] === 'done') { setData(payload as SearchResponse); setSources(payload.sources); }
        }
      }
    } catch (error) {
      if ((error as Error).name !== 'AbortError') setData({ query, results: [], sources: [...sourceMap.values()], completedAt: new Date().toISOString() });
    } finally { setLoading(false); }
  }

  function toggleOffer(offer: Offer) {
    const key = `${offer.sourceId}|${offer.url}`;
    setSelected((current) => current.some((x) => `${x.sourceId}|${x.url}` === key)
      ? current.filter((x) => `${x.sourceId}|${x.url}` !== key)
      : current.length >= 5 ? current : [...current, offer]);
  }

  const groups = data?.groups ?? [];
  const comparison = useMemo(() => selected.filter((x) => x.price != null).sort((a, b) => (a.price! - b.price!)), [selected]);
  const compareMin = comparison[0]?.price;
  const compareMax = comparison.at(-1)?.price;

  const renderGroup = (group: ComparisonGroup) => {
    const best = [...group.offers].filter((offer) => offer.price !== undefined).sort((a, b) => (a.price! - b.price!))[0];
    return <article className="groupcard result-enter" key={group.key}>
      <div className="grouphead"><div><div className="source">محصول تطبیق‌یافته · اطمینان {Math.round(group.confidence * 100)}٪</div><div className="grouptitle">{group.title}</div><div className="meta">{group.sellerCount} منبع · کمترین قیمت {toman(group.stats.min)} · میانگین {toman(group.stats.average)}</div></div><div className="bestprice pulse-price">{toman(best?.price)}</div></div>
      {group.stats.savings !== undefined && group.stats.savings > 0 && <div className="saving">اختلاف کمترین و بیشترین قیمت: {toman(group.stats.savings)}</div>}
      <div className="offers">{group.offers.map((offer, index) => { const checked = selected.some((x) => x.sourceId === offer.sourceId && x.url === offer.url); return <div className={`offer ${checked ? 'selected' : ''}`} key={`${offer.sourceId}-${offer.url}-${index}`}>
        <label className="offercheck"><input type="checkbox" checked={checked} onChange={() => toggleOffer(offer)} aria-label={`مقایسه ${offer.source}`} /><span /></label>
        <a href={offer.url} target="_blank" rel="noreferrer"><span><b>{offer.source}</b><small>{statusText[offer.status]} · {Math.round(offer.confidence * 100)}٪</small></span><strong>{toman(offer.price)}</strong></a>
      </div>; })}</div>
    </article>;
  };

  return <main className="shell">
    <header className="hero"><div className="eyebrow">PRICE INTELLIGENCE</div><h1>Comparis</h1><p>قیمت یک محصول را هم‌زمان از منابع ایرانی جمع‌آوری، تطبیق و مقایسه می‌کنیم.</p><a className="labnav" href="/lab">Crawler Lab · آزمایشگاه واکشی و اسکرپ</a></header>
    <form className="search" onSubmit={search}><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="مثلاً RTX 5070 Ti 16GB" aria-label="محصول" /><button disabled={loading}>{loading ? 'در حال جمع‌آوری…' : 'جست‌وجوی زنده'}</button></form>
    {sources.length > 0 && <section className="sourcebar" aria-live="polite">{sources.map((source) => <div className="sourcepill" key={source.id}><span className={`dot ${statusClass[source.status]}`} /><b>{source.name}</b><span>{statusText[source.status]}</span><small>{source.latencyMs}ms</small></div>)}</section>}
    {loading && <div className="status"><span className="live"><i />در حال بررسی منابع</span><span>نتایج به‌صورت زنده وارد می‌شوند.</span></div>}
    {data && <><div className="status"><span>{new Intl.NumberFormat('fa-IR').format(groups.length)} محصول تطبیق‌یافته · {new Intl.NumberFormat('fa-IR').format(data.results.length)} پیشنهاد</span><span>{new Date(data.completedAt).toLocaleTimeString('fa-IR')}</span></div><section className="grid">{groups.length ? groups.map(renderGroup) : <div className="empty">در این چرخه هیچ محصول قابل تطبیقی پیدا نشد.</div>}</section></>}
    {selected.length > 0 && <div className="compareDock"><div><b>{selected.length} مورد انتخاب شده</b><span>حداکثر ۵ مورد</span></div><button onClick={() => setCompareOpen(true)}>مقایسه</button><button className="secondary" onClick={() => setSelected([])}>پاک‌کردن</button></div>}
    {compareOpen && <div className="compareOverlay" onClick={(e) => e.currentTarget === e.target && setCompareOpen(false)}><section className="comparePanel">
      <div className="compareTop"><div><div className="eyebrow">COMPARISON</div><h2>مقایسه پیشنهادها</h2><p>{comparison.length} پیشنهاد</p></div><button className="close" onClick={() => setCompareOpen(false)}>×</button></div>
      {comparison.length > 0 && <div className="chart">{comparison.map((offer, index) => { const pct = compareMax && compareMax > 0 ? Math.max(8, Math.round((offer.price! / compareMax) * 100)) : 8; return <div className="barrow" key={`${offer.sourceId}|${offer.url}`}><div className="barlabel"><b>{index === 0 ? 'ارزان‌ترین · ' : ''}{offer.source}</b><span>{toman(offer.price)}</span></div><div className="track"><i className={index === 0 ? 'best' : ''} style={{ width: `${pct}%` }} /></div></div>; })}</div>}
      <div className="compareSummary"><div><span>کمترین</span><b>{toman(compareMin)}</b></div><div><span>بیشترین</span><b>{toman(compareMax)}</b></div><div><span>صرفه‌جویی</span><b>{compareMin != null && compareMax != null ? toman(compareMax - compareMin) : '—'}</b></div></div>
      <div className="compareList">{comparison.map((offer, index) => <article className={`compareItem ${index === 0 ? 'winner' : ''}`} key={`${offer.sourceId}|${offer.url}`}><span className="rank">{index + 1}</span><div><b>{offer.source}</b><small>{offer.title}</small></div><strong>{toman(offer.price)}</strong><a href={offer.url} target="_blank" rel="noreferrer">مشاهده</a></article>)}</div>
    </section></div>}
  </main>;
}
