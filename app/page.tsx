'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import type { ComparisonGroup, Offer, SearchResponse, SourceResult } from '@/lib/types';

const money = (value?: number) => value == null ? '—' : new Intl.NumberFormat('fa-IR').format(Math.round(value)) + ' تومان';
const number = (value?: number) => value == null ? '—' : new Intl.NumberFormat('fa-IR').format(Math.round(value));
const statusText: Record<string, string> = { fresh: 'زنده', blocked: 'مسدود', failed: 'خطا', stale: 'قدیمی' };
const statusClass: Record<string, string> = { fresh: 'ok', blocked: 'warn', failed: 'bad', stale: 'muted' };
const DISCOVERED_KEY = 'comparis:active-sources';

export default function Home() {
  const [q, setQ] = useState('');
  const [data, setData] = useState<SearchResponse | null>(null);
  const [sources, setSources] = useState<SourceResult[]>([]);
  const [selected, setSelected] = useState<Offer[]>([]);
  const [compareOpen, setCompareOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeSources, setActiveSources] = useState<Array<{ id: string; name: string; domain: string; url: string; priority?: number }>>([]);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(DISCOVERED_KEY);
      if (raw) setActiveSources(JSON.parse(raw));
    } catch {}
  }, []);

  function reset() {
    setData(null);
    setSources([]);
    setSelected([]);
    setCompareOpen(false);
  }

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
      const sourceParam = activeSources.length ? `&sources=${encodeURIComponent(JSON.stringify(activeSources))}` : '';
      const response = await fetch(`/api/search/stream?q=${encodeURIComponent(query)}${sourceParam}`, { signal: controller.signal });
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
  const allOffers = useMemo(() => groups.flatMap((g) => g.offers), [groups]);
  const comparison = useMemo(() => selected.filter((x) => x.price != null).sort((a, b) => a.price! - b.price!), [selected]);
  const compareMin = comparison[0]?.price;
  const compareMax = comparison.at(-1)?.price;

  const tableFor = (group: ComparisonGroup) => {
    const offers = [...group.offers].sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity));
    const min = offers.find((x) => x.price != null)?.price;
    return <article className="resultTable result-enter" key={group.key}>
      <div className="tableHeader"><div><div className="eyebrow">PRODUCT MATCH · {Math.round(group.confidence * 100)}٪</div><h2>{group.title}</h2><p>{group.sellerCount} فروشنده · کمترین {money(group.stats.min)} · میانگین {money(group.stats.average)}</p></div>{group.stats.savings != null && group.stats.savings > 0 && <div className="savingBadge">تا {money(group.stats.savings)} اختلاف</div>}</div>
      <div className="compareTableWrap"><table className="compareTable"><thead><tr><th>مقایسه</th><th>فروشنده</th><th>وضعیت</th><th>اطمینان</th><th>قیمت</th><th>اختلاف</th><th>لینک</th></tr></thead><tbody>
        {offers.map((offer, index) => { const checked = selected.some((x) => x.sourceId === offer.sourceId && x.url === offer.url); const delta = min != null && offer.price != null ? offer.price - min : undefined; return <tr className={`${checked ? 'picked' : ''} ${index === 0 ? 'winnerRow' : ''}`} key={`${offer.sourceId}|${offer.url}`}><td><input type="checkbox" checked={checked} onChange={() => toggleOffer(offer)} /></td><td><b>{offer.source}</b><small>{offer.title}</small></td><td><span className={`statusBadge ${statusClass[offer.status]}`}>{statusText[offer.status]}</span></td><td>{Math.round(offer.confidence * 100)}٪</td><td className="tablePrice">{money(offer.price)}</td><td>{delta == null ? '—' : delta === 0 ? <span className="bestTag">ارزان‌ترین</span> : `+${number(delta)}`}</td><td><a href={offer.url} target="_blank" rel="noreferrer">مشاهده</a></td></tr>; })}
      </tbody></table></div>
    </article>;
  };

  return <main className="shell">
    <header className="hero"><div className="eyebrow">PRICE INTELLIGENCE</div><h1>Comparis</h1><p>جست‌وجوی زنده، استخراج قیمت، تطبیق محصول و مقایسه فروشنده‌ها.</p><a className="labnav" href="/lab">Crawler Lab · آزمایشگاه واکشی و اسکرپ</a></header>
    <form className="search" onSubmit={search}><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="مثلاً RTX 5070 Ti 16GB" aria-label="محصول" /><button disabled={loading}>{loading ? 'در حال جمع‌آوری…' : 'جست‌وجوی زنده'}</button></form>
    {activeSources.length > 0 && <div className="activeSourceNote">{number(activeSources.length)} منبع کشف‌شده نیز در این جست‌وجو فعال است.</div>}
    {sources.length > 0 && <section className="sourcebar" aria-live="polite">{sources.map((source) => <div className="sourcepill" key={source.id}><span className={`dot ${statusClass[source.status]}`} /><b>{source.name}</b><span>{statusText[source.status]}</span><small>{source.latencyMs}ms</small></div>)}</section>}
    {loading && <div className="status"><span className="live"><i />در حال بررسی منابع</span><span>نتایج به‌صورت زنده اضافه می‌شوند.</span></div>}
    {data && <><div className="status"><span>{number(groups.length)} محصول · {number(data.results.length)} پیشنهاد · {number(allOffers.length)} پیشنهاد قابل مقایسه</span><span>{new Date(data.completedAt).toLocaleTimeString('fa-IR')}</span></div><section className="tables">{groups.length ? groups.map(tableFor) : <div className="empty">نتیجه قابل تطبیقی پیدا نشد.</div>}</section></>}
    {selected.length > 0 && <div className="compareDock"><div><b>{number(selected.length)} مورد انتخاب شده</b><span>حداکثر ۵ مورد</span></div><button onClick={() => setCompareOpen(true)}>مقایسه</button><button className="secondary" onClick={() => setSelected([])}>پاک‌کردن</button></div>}
    {compareOpen && <div className="compareOverlay" onClick={(e) => e.currentTarget === e.target && setCompareOpen(false)}><section className="comparePanel"><div className="compareTop"><div><div className="eyebrow">COMPARISON</div><h2>مقایسه نهایی</h2><p>{number(comparison.length)} پیشنهاد</p></div><button className="close" onClick={() => setCompareOpen(false)}>×</button></div><div className="chart">{comparison.map((offer, index) => { const pct = compareMax && compareMax > 0 ? Math.max(7, Math.round((offer.price! / compareMax) * 100)) : 7; return <div className="barrow" key={`${offer.sourceId}|${offer.url}`}><div className="barlabel"><b>{index === 0 ? 'ارزان‌ترین · ' : ''}{offer.source}</b><span>{money(offer.price)}</span></div><div className="track"><i className={index === 0 ? 'best' : ''} style={{ width: `${pct}%` }} /></div></div>; })}</div><div className="compareSummary"><div><span>کمترین</span><b>{money(compareMin)}</b></div><div><span>بیشترین</span><b>{money(compareMax)}</b></div><div><span>صرفه‌جویی</span><b>{compareMin != null && compareMax != null ? money(compareMax - compareMin) : '—'}</b></div></div><div className="compareList">{comparison.map((offer, index) => <article className={`compareItem ${index === 0 ? 'winner' : ''}`} key={`${offer.sourceId}|${offer.url}`}><span className="rank">{index + 1}</span><div><b>{offer.source}</b><small>{offer.title}</small></div><strong>{money(offer.price)}</strong><a href={offer.url} target="_blank" rel="noreferrer">مشاهده</a></article>)}</div></section></div>}
  </main>;
}
