'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import type { SourceResult } from '@/lib/types';
import { SOURCES } from '@/lib/sources';

type DiscoveredSite = { id: string; name: string; domain: string; url: string; logo: string; description: string; relevance: number; enabled: boolean; priority: number };
const SOURCE_KEY = 'comparis:active-sources';

export default function LabPage() {
  const [query, setQuery] = useState('RTX 5070 Ti 16GB');
  const [site, setSite] = useState('all');
  const [customUrl, setCustomUrl] = useState('');
  const [strategy, setStrategy] = useState('all');
  const [mode, setMode] = useState<'all' | 'chain'>('all');
  const [timeout, setTimeoutValue] = useState(7500);
  const [maxOffers, setMaxOffers] = useState(30);
  const [userAgent, setUserAgent] = useState('ComparisLab/0.2');
  const [language, setLanguage] = useState('fa-IR,fa;q=0.9,en;q=0.6');
  const [titleSelector, setTitleSelector] = useState('');
  const [priceSelector, setPriceSelector] = useState('');
  const [linkSelector, setLinkSelector] = useState('');
  const [results, setResults] = useState<SourceResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [discoveryTopic, setDiscoveryTopic] = useState('کارت گرافیک');
  const [discovered, setDiscovered] = useState<DiscoveredSite[]>([]);
  const [discoverBusy, setDiscoverBusy] = useState(false);
  const [discoverError, setDiscoverError] = useState('');
  const [selectedDomains, setSelectedDomains] = useState<Set<string>>(new Set());

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SOURCE_KEY);
      if (raw) setSelectedDomains(new Set((JSON.parse(raw) as DiscoveredSite[]).map((x) => x.domain)));
    } catch {}
  }, []);

  useEffect(() => {
    const active = discovered.filter((x) => selectedDomains.has(x.domain)).map((x) => ({ id: x.id, name: x.name, domain: x.domain, url: x.url, priority: x.priority }));
    try { localStorage.setItem(SOURCE_KEY, JSON.stringify(active)); } catch {}
  }, [discovered, selectedDomains]);

  const strategyOptions = useMemo(() => SOURCES.find((x) => x.id === site)?.strategies ?? [
    { name: 'direct-search', method: 'http' }, { name: 'normalized-search', method: 'http' }, { name: 'google-index', method: 'search' }, { name: 'bing-index', method: 'search' },
  ], [site]);

  async function run(e: FormEvent) {
    e.preventDefault(); setBusy(true); setError(''); setResults([]);
    try {
      const params = new URLSearchParams({ q: query, timeout: String(timeout), maxOffers: String(maxOffers), mode, userAgent, language });
      if (site !== 'all') params.set('source', site); if (strategy !== 'all') params.set('strategy', strategy); if (customUrl.trim()) params.set('url', customUrl.trim());
      if (titleSelector.trim()) params.set('titleSelector', titleSelector.trim()); if (priceSelector.trim()) params.set('priceSelector', priceSelector.trim()); if (linkSelector.trim()) params.set('linkSelector', linkSelector.trim());
      const response = await fetch(`/api/lab?${params}`); const data = await response.json(); if (!response.ok) throw new Error(data.error ?? 'Lab request failed'); setResults(data.results ?? []);
    } catch (err) { setError(err instanceof Error ? err.message : 'خطای نامشخص'); } finally { setBusy(false); }
  }

  async function discoverSites(e: FormEvent) {
    e.preventDefault(); const topic = discoveryTopic.trim(); if (!topic || discoverBusy) return; setDiscoverBusy(true); setDiscoverError('');
    try { const response = await fetch(`/api/lab/discover?q=${encodeURIComponent(topic)}`); const data = await response.json(); if (!response.ok) throw new Error(data.error ?? 'Discovery failed'); setDiscovered(data.results ?? []); }
    catch (err) { setDiscoverError(err instanceof Error ? err.message : 'خطای کشف سایت‌ها'); setDiscovered([]); }
    finally { setDiscoverBusy(false); }
  }

  function toggle(domain: string) { setSelectedDomains((current) => { const next = new Set(current); next.has(domain) ? next.delete(domain) : next.add(domain); return next; }); }
  function selectAll() { setSelectedDomains(new Set(discovered.map((x) => x.domain))); }
  function clearAll() { setSelectedDomains(new Set()); }

  return <main className="shell">
    <header className="hero"><div className="eyebrow">CRAWLER LAB</div><h1>آزمایشگاه واکشی، کشف و اسکرپ</h1><p>منابع را کشف کن، فعال یا غیرفعال کن و استراتژی‌های واکشی را جداگانه آزمایش کن.</p></header>

    <section className="discover-panel">
      <div className="discover-head"><div><div className="eyebrow">SOURCE DISCOVERY</div><h2>کشف منابع مرتبط</h2><p>موضوع یا دسته محصول را وارد کن؛ منابع مرتبط از چند موتور جست‌وجو پیدا می‌شوند.</p></div><div className="discover-actions"><button type="button" className="secondary" onClick={selectAll} disabled={!discovered.length}>فعال‌سازی همه</button><button type="button" className="secondary" onClick={clearAll} disabled={!selectedDomains.size}>غیرفعال‌سازی همه</button></div></div>
      <form className="discover-search" onSubmit={discoverSites}><input value={discoveryTopic} onChange={(e) => setDiscoveryTopic(e.target.value)} placeholder="مثلاً لپ‌تاپ گیمینگ، موبایل، مانیتور" /><button disabled={discoverBusy || !discoveryTopic.trim()}>{discoverBusy ? 'در حال کشف…' : 'کشف سایت‌ها'}</button></form>
      {discoverError && <div className="laberror">{discoverError}</div>}
      <div className="discover-meta"><span>{discovered.length ? `${discovered.length} سایت پیدا شد` : 'هنوز جست‌وجویی انجام نشده'}</span><b>{selectedDomains.size} منبع فعال و ذخیره‌شده</b></div>
      <div className="discover-grid">{discovered.map((item) => { const active = selectedDomains.has(item.domain); return <article className={`discover-card ${active ? 'active' : ''}`} key={item.id}><div className="discover-top"><img src={item.logo} alt="" width={44} height={44} onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }} /><div className="discover-score">{Math.round(item.relevance * 100)}٪</div></div><h3>{item.name}</h3><div className="discover-domain">{item.domain}</div><p>{item.description}</p><div className="discover-footer"><button type="button" className={active ? 'activeBtn' : ''} onClick={() => toggle(item.domain)}>{active ? 'فعال' : 'غیرفعال'}</button><a href={item.url} target="_blank" rel="noreferrer">مشاهده سایت</a></div></article>; })}</div>
    </section>

    <form className="labform" onSubmit={run}>
      <label>عبارت جست‌وجو<input value={query} onChange={(e) => setQuery(e.target.value)} /></label><label>منبع<select value={site} onChange={(e) => { setSite(e.target.value); setStrategy('all'); }}><option value="all">همه منابع ثابت</option>{SOURCES.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label><label>استراتژی<select value={strategy} onChange={(e) => setStrategy(e.target.value)}><option value="all">همه استراتژی‌ها</option>{strategyOptions.map((s) => <option key={s.name} value={s.name}>{s.name} · {s.method}</option>)}</select></label><label>حالت اجرا<select value={mode} onChange={(e) => setMode(e.target.value as 'all' | 'chain')}><option value="all">اجرای همه استراتژی‌ها</option><option value="chain">Fallback تا اولین موفقیت</option></select></label><label>Timeout (ms)<input type="number" min="1000" max="30000" step="500" value={timeout} onChange={(e) => setTimeoutValue(Number(e.target.value))} /></label><label>حداکثر پیشنهاد<input type="number" min="1" max="100" value={maxOffers} onChange={(e) => setMaxOffers(Number(e.target.value))} /></label><label className="wide">URL دستی<input value={customUrl} onChange={(e) => setCustomUrl(e.target.value)} placeholder="https://example.com/search?q={q}" /></label><label>User-Agent<input value={userAgent} onChange={(e) => setUserAgent(e.target.value)} /></label><label>Accept-Language<input value={language} onChange={(e) => setLanguage(e.target.value)} /></label><label>CSS لینک<input value={linkSelector} onChange={(e) => setLinkSelector(e.target.value)} /></label><label>CSS عنوان<input value={titleSelector} onChange={(e) => setTitleSelector(e.target.value)} /></label><label>CSS قیمت<input value={priceSelector} onChange={(e) => setPriceSelector(e.target.value)} /></label><button disabled={busy || !query.trim()}>{busy ? 'در حال تست…' : 'اجرای تست'}</button>
    </form>
    {error && <div className="laberror">{error}</div>}
    <section className="labhint"><b>منابع کشف‌شده فعال:</b> {selectedDomains.size} سایت در مرورگر ذخیره شده‌اند و جست‌وجوی اصلی هنگام refresh آن‌ها را به crawler می‌فرستد.</section>
    <section className="labresults">{results.map((r) => <article className="labcard" key={r.id}><div className="grouphead"><div><div className="source">{r.name} · {r.method}</div><div className="grouptitle">{r.status}</div></div><div className="meta">{r.latencyMs}ms · {r.offers.length} offer</div></div>{r.error && <div className="laberror inline">{r.error}</div>}<div className="offers">{r.offers.map((o, i) => <a className="offer" key={`${o.url}-${i}`} href={o.url} target="_blank" rel="noreferrer"><span><b>{o.source}</b><small>{o.method} · {Math.round(o.confidence * 100)}٪</small></span><strong>{o.price ? new Intl.NumberFormat('fa-IR').format(o.price) + ' تومان' : '—'}</strong></a>)}</div></article>)}</section>
  </main>;
}
