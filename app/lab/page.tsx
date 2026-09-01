'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import type { SourceResult } from '@/lib/types';
import { SOURCES } from '@/lib/sources';

type DiscoveredSite = {
  id: string; name: string; domain: string; url: string; logo: string; description: string;
  relevance: number; enabled: boolean; priority: number; reasons?: string[];
  signals?: { topic: number; commerce: number; productSchema: number; price: number; persian: number; reliability: number };
};

const ACTIVE_KEY = 'comparis:active-sources';
const REGISTRY_KEY = 'comparis:source-registry';
const defaultStrategies = [
  { name: 'direct-search', method: 'http' },
  { name: 'normalized-search', method: 'http' },
  { name: 'google-index', method: 'search' },
  { name: 'bing-index', method: 'search' },
];

export default function LabPage() {
  const [query, setQuery] = useState('RTX 5070 Ti 16GB');
  const [site, setSite] = useState('all'); const [strategy, setStrategy] = useState('all'); const [mode, setMode] = useState<'all' | 'chain'>('all');
  const [customUrl, setCustomUrl] = useState(''); const [timeout, setTimeoutValue] = useState(7500); const [maxOffers, setMaxOffers] = useState(30);
  const [userAgent, setUserAgent] = useState('ComparisLab/0.3'); const [language, setLanguage] = useState('fa-IR,fa;q=0.9,en;q=0.6');
  const [titleSelector, setTitleSelector] = useState(''); const [priceSelector, setPriceSelector] = useState(''); const [linkSelector, setLinkSelector] = useState('');
  const [results, setResults] = useState<SourceResult[]>([]); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const [discoveryTopic, setDiscoveryTopic] = useState('کارت گرافیک'); const [discovered, setDiscovered] = useState<DiscoveredSite[]>([]);
  const [selectedDomains, setSelectedDomains] = useState<Set<string>>(new Set()); const [discoverBusy, setDiscoverBusy] = useState(false); const [discoverError, setDiscoverError] = useState(''); const [testingDomain, setTestingDomain] = useState<string | null>(null);

  useEffect(() => { try { const registry = localStorage.getItem(REGISTRY_KEY); const active = localStorage.getItem(ACTIVE_KEY); if (registry) setDiscovered(JSON.parse(registry)); if (active) setSelectedDomains(new Set((JSON.parse(active) as DiscoveredSite[]).map((x) => x.domain))); } catch {} }, []);
  useEffect(() => { try { localStorage.setItem(REGISTRY_KEY, JSON.stringify(discovered)); localStorage.setItem(ACTIVE_KEY, JSON.stringify(discovered.filter((x) => selectedDomains.has(x.domain)).map(({ id, name, domain, url, priority }) => ({ id, name, domain, url, priority })))); } catch {} }, [discovered, selectedDomains]);

  const strategyOptions = useMemo(() => SOURCES.find((x) => x.id === site)?.strategies ?? defaultStrategies, [site]);

  async function run(e: FormEvent) {
    e.preventDefault(); if (!query.trim() || busy) return; setBusy(true); setError(''); setResults([]);
    try { const params = new URLSearchParams({ q: query.trim(), timeout: String(timeout), maxOffers: String(maxOffers), mode, userAgent, language }); if (site !== 'all') params.set('source', site); if (strategy !== 'all') params.set('strategy', strategy); if (customUrl.trim()) params.set('url', customUrl.trim()); if (titleSelector.trim()) params.set('titleSelector', titleSelector.trim()); if (priceSelector.trim()) params.set('priceSelector', priceSelector.trim()); if (linkSelector.trim()) params.set('linkSelector', linkSelector.trim()); if (selectedDomains.size) params.set('sources', JSON.stringify(discovered.filter((x) => selectedDomains.has(x.domain)).map(({ id, name, domain, url, priority }) => ({ id, name, domain, url, priority })))); const response = await fetch(`/api/lab?${params}`); const data = await response.json(); if (!response.ok) throw new Error(data.error ?? 'Lab request failed'); setResults(data.results ?? []); } catch (err) { setError(err instanceof Error ? err.message : 'خطای نامشخص'); } finally { setBusy(false); }
  }

  async function discoverSites(e: FormEvent) {
    e.preventDefault(); const topic = discoveryTopic.trim(); if (!topic || discoverBusy) return; setDiscoverBusy(true); setDiscoverError('');
    try { const response = await fetch(`/api/lab/discover?q=${encodeURIComponent(topic)}`); const data = await response.json(); if (!response.ok) throw new Error(data.error ?? 'Discovery failed'); const incoming = (data.results ?? []) as DiscoveredSite[]; setDiscovered((current) => { const merged = new Map(current.map((x) => [x.domain, x])); for (const item of incoming) { const previous = merged.get(item.domain); merged.set(item.domain, { ...item, enabled: previous?.enabled ?? false, priority: previous?.priority ?? item.priority }); } return [...merged.values()].sort((a, b) => b.relevance - a.relevance); }); } catch (err) { setDiscoverError(err instanceof Error ? err.message : 'خطای کشف سایت‌ها'); setDiscovered([]); } finally { setDiscoverBusy(false); }
  }
  function toggle(domain: string) { setSelectedDomains((current) => { const next = new Set(current); next.has(domain) ? next.delete(domain) : next.add(domain); return next; }); }
  function selectAll() { setSelectedDomains(new Set(discovered.map((x) => x.domain))); }
  function clearAll() { setSelectedDomains(new Set()); }
  function changePriority(domain: string, delta: number) { setDiscovered((current) => current.map((x) => x.domain === domain ? { ...x, priority: Math.max(0, Math.min(100, x.priority + delta)) } : x)); }
  function forget(domain: string) { setDiscovered((current) => current.filter((x) => x.domain !== domain)); setSelectedDomains((current) => { const next = new Set(current); next.delete(domain); return next; }); }
  async function testSource(item: DiscoveredSite) { setTestingDomain(item.domain); setError(''); setResults([]); try { const sourcePayload = encodeURIComponent(JSON.stringify([{ id: item.id, name: item.name, domain: item.domain, url: item.url, priority: item.priority }])); const response = await fetch(`/api/lab?q=${encodeURIComponent(query.trim() || 'test')}&sources=${sourcePayload}&mode=chain`); const data = await response.json(); if (!response.ok) throw new Error(data.error ?? 'Source test failed'); setResults(data.results ?? []); } catch (err) { setError(err instanceof Error ? err.message : 'خطای تست منبع'); } finally { setTestingDomain(null); } }

  return <main className="shell">
    <header className="hero"><div className="eyebrow">CRAWLER LAB</div><h1>آزمایشگاه واکشی، کشف و اسکرپ</h1><p>منابع را کشف، ارزیابی، رتبه‌بندی و برای جست‌وجوی اصلی فعال کن.</p></header>
    <section className="discover-panel">
      <div className="discover-head"><div><div className="eyebrow">SOURCE DISCOVERY</div><h2>کشف و رتبه‌بندی منابع</h2><p>فقط candidateها نمایش داده نمی‌شوند؛ ابتدا homepage آن‌ها از نظر ارتباط موضوعی، نشانه فروشگاهی، Product schema، قیمت، محتوای فارسی و سرعت پاسخ ارزیابی می‌شود.</p></div><div className="discover-actions"><button type="button" className="secondary" onClick={selectAll} disabled={!discovered.length}>فعال‌سازی همه</button><button type="button" className="secondary" onClick={clearAll} disabled={!selectedDomains.size}>غیرفعال‌سازی همه</button></div></div>
      <form className="discover-search" onSubmit={discoverSites}><input value={discoveryTopic} onChange={(e) => setDiscoveryTopic(e.target.value)} placeholder="مثلاً لپ‌تاپ گیمینگ، موبایل، قطعات خودرو" /><button disabled={discoverBusy || !discoveryTopic.trim()}>{discoverBusy ? 'در حال ارزیابی…' : 'کشف و رتبه‌بندی'}</button></form>
      {discoverError && <div className="laberror">{discoverError}</div>}
      <div className="discover-meta"><span>{discovered.length ? `${discovered.length} منبع واجد شرایط` : 'هنوز جست‌وجویی انجام نشده'}</span><b>{selectedDomains.size} منبع فعال</b></div>
      <div className="discover-grid">{discovered.map((item) => { const active = selectedDomains.has(item.domain); return <article className={`discover-card ${active ? 'active' : ''}`} key={item.domain}>
        <div className="discover-top"><img src={item.logo} alt="" width={46} height={46} onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }} /><div className="discover-score">{Math.round(item.relevance * 100)}٪</div></div>
        <h3>{item.name}</h3><div className="discover-domain">{item.domain}</div><p>{item.description}</p>
        {item.reasons?.length ? <div className="reasonRow">{item.reasons.slice(0, 3).map((r) => <span key={r}>{r}</span>)}</div> : null}
        <div className="signalGrid">{item.signals ? <><span>موضوع <b>{Math.round(item.signals.topic * 100)}٪</b></span><span>فروش <b>{Math.round(item.signals.commerce * 100)}٪</b></span><span>محصول <b>{Math.round(item.signals.productSchema * 100)}٪</b></span><span>قیمت <b>{Math.round(item.signals.price * 100)}٪</b></span></> : null}</div>
        <div className="priority"><span>اولویت</span><b>{item.priority}</b><button type="button" onClick={() => changePriority(item.domain, 10)}>+</button><button type="button" onClick={() => changePriority(item.domain, -10)}>−</button></div>
        <div className="discover-footer"><button type="button" className={active ? 'activeBtn' : ''} onClick={() => toggle(item.domain)}>{active ? 'فعال' : 'غیرفعال'}</button><button type="button" className="testBtn" disabled={testingDomain === item.domain} onClick={() => testSource(item)}>{testingDomain === item.domain ? 'تست…' : 'تست'}</button><a href={item.url} target="_blank" rel="noreferrer">سایت</a><button type="button" className="forgetBtn" onClick={() => forget(item.domain)}>حذف</button></div>
      </article>; })}</div>
    </section>
    <form className="labform" onSubmit={run}><label>عبارت جست‌وجو<input value={query} onChange={(e) => setQuery(e.target.value)} /></label><label>منبع<select value={site} onChange={(e) => { setSite(e.target.value); setStrategy('all'); }}><option value="all">همه منابع ثابت + فعال</option>{SOURCES.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label><label>استراتژی<select value={strategy} onChange={(e) => setStrategy(e.target.value)}><option value="all">همه</option>{strategyOptions.map((s) => <option key={s.name} value={s.name}>{s.name} · {s.method}</option>)}</select></label><label>حالت اجرا<select value={mode} onChange={(e) => setMode(e.target.value as 'all' | 'chain')}><option value="all">همه مسیرها</option><option value="chain">Fallback تا موفقیت</option></select></label><label>Timeout<input type="number" min="1000" max="30000" step="500" value={timeout} onChange={(e) => setTimeoutValue(Number(e.target.value))} /></label><label>حداکثر پیشنهاد<input type="number" min="1" max="100" value={maxOffers} onChange={(e) => setMaxOffers(Number(e.target.value))} /></label><label className="wide">URL دستی<input value={customUrl} onChange={(e) => setCustomUrl(e.target.value)} placeholder="https://example.com/search?q={q}" /></label><label>User-Agent<input value={userAgent} onChange={(e) => setUserAgent(e.target.value)} /></label><label>Accept-Language<input value={language} onChange={(e) => setLanguage(e.target.value)} /></label><label>CSS لینک<input value={linkSelector} onChange={(e) => setLinkSelector(e.target.value)} /></label><label>CSS عنوان<input value={titleSelector} onChange={(e) => setTitleSelector(e.target.value)} /></label><label>CSS قیمت<input value={priceSelector} onChange={(e) => setPriceSelector(e.target.value)} /></label><button disabled={busy || !query.trim()}>{busy ? 'در حال تست…' : 'اجرای تست'}</button></form>
    {error && <div className="laberror">{error}</div>}
    <section className="labhint"><b>منابع فعال:</b> {selectedDomains.size} سایت از registry مرورگر وارد pipeline می‌شوند.</section>
    <section className="labresults">{results.map((r) => <article className="labcard" key={r.id}><div className="grouphead"><div><div className="source">{r.name} · {r.method}</div><div className="grouptitle">{r.status}</div></div><div className="meta">{r.latencyMs}ms · {r.offers.length} offer</div></div>{r.error && <div className="laberror inline">{r.error}</div>}<div className="offers">{r.offers.map((o, i) => <a className="offer" key={`${o.url}-${i}`} href={o.url} target="_blank" rel="noreferrer"><span><b>{o.source}</b><small>{o.method} · {Math.round(o.confidence * 100)}٪</small></span><strong>{o.price ? new Intl.NumberFormat('fa-IR').format(o.price) + ' تومان' : '—'}</strong></a>)}</div></article>)}</section>
  </main>;
}
