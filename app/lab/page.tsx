'use client';

import { FormEvent, useMemo, useState } from 'react';
import type { SourceResult } from '@/lib/types';
import { SOURCES } from '@/lib/sources';

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

  const strategyOptions = useMemo(() => {
    const source = SOURCES.find((x) => x.id === site);
    return source?.strategies ?? [
      { name: 'search', method: 'http', timeoutMs: 6500 },
      { name: 'search-normalized', method: 'http', timeoutMs: 6500 },
      { name: 'indexed-search-google', method: 'search', timeoutMs: 7500 },
      { name: 'indexed-search-bing', method: 'search', timeoutMs: 7500 },
    ];
  }, [site]);

  async function run(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError(''); setResults([]);
    try {
      const params = new URLSearchParams({ q: query, timeout: String(timeout), maxOffers: String(maxOffers), mode, userAgent, language });
      if (site !== 'all') params.set('source', site);
      if (strategy !== 'all') params.set('strategy', strategy);
      if (customUrl.trim()) params.set('url', customUrl.trim());
      if (titleSelector.trim()) params.set('titleSelector', titleSelector.trim());
      if (priceSelector.trim()) params.set('priceSelector', priceSelector.trim());
      if (linkSelector.trim()) params.set('linkSelector', linkSelector.trim());
      const response = await fetch(`/api/lab?${params}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Lab request failed');
      setResults(data.results ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطای نامشخص');
    } finally { setBusy(false); }
  }

  return (
    <main className="shell">
      <header className="hero">
        <div className="eyebrow">CRAWLER LAB</div>
        <h1>آزمایشگاه واکشی و اسکرپ</h1>
        <p>هر الگوریتم را جداگانه یا به‌صورت زنجیره‌ای روی همه منابع و سایت دستی تست کن.</p>
      </header>

      <form className="labform" onSubmit={run}>
        <label>عبارت جست‌وجو<input value={query} onChange={(e) => setQuery(e.target.value)} /></label>
        <label>منبع<select value={site} onChange={(e) => { setSite(e.target.value); setStrategy('all'); }}><option value="all">همه منابع</option>{SOURCES.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
        <label>استراتژی<select value={strategy} onChange={(e) => setStrategy(e.target.value)}><option value="all">همه استراتژی‌ها</option>{strategyOptions.map((s) => <option key={s.name} value={s.name}>{s.name} · {s.method}</option>)}</select></label>
        <label>حالت اجرا<select value={mode} onChange={(e) => setMode(e.target.value as 'all' | 'chain')}><option value="all">اجرای همه استراتژی‌ها</option><option value="chain">Fallback تا اولین موفقیت</option></select></label>
        <label>Timeout (ms)<input type="number" min="1000" max="30000" step="500" value={timeout} onChange={(e) => setTimeoutValue(Number(e.target.value))} /></label>
        <label>حداکثر پیشنهاد<input type="number" min="1" max="100" value={maxOffers} onChange={(e) => setMaxOffers(Number(e.target.value))} /></label>
        <label className="wide">URL دستی<input value={customUrl} onChange={(e) => setCustomUrl(e.target.value)} placeholder="https://example.com/search?q={q}" /></label>
        <label>User-Agent<input value={userAgent} onChange={(e) => setUserAgent(e.target.value)} /></label>
        <label>Accept-Language<input value={language} onChange={(e) => setLanguage(e.target.value)} /></label>
        <label>CSS لینک<input value={linkSelector} onChange={(e) => setLinkSelector(e.target.value)} placeholder="a.product-link" /></label>
        <label>CSS عنوان<input value={titleSelector} onChange={(e) => setTitleSelector(e.target.value)} placeholder=".product-title" /></label>
        <label>CSS قیمت<input value={priceSelector} onChange={(e) => setPriceSelector(e.target.value)} placeholder=".price" /></label>
        <button disabled={busy || !query.trim()}>{busy ? 'در حال تست…' : 'اجرای تست'}</button>
      </form>

      {error && <div className="laberror">{error}</div>}
      <section className="labhint"><b>URL دستی:</b> با <code>{'{q}'}</code> عبارت جست‌وجو جایگزین می‌شود. برای سایت‌های ناشناخته می‌توان selectorهای CSS عنوان، قیمت و لینک را تنظیم کرد.</section>

      <section className="labresults">
        {results.map((r) => (
          <article className="labcard" key={r.id}>
            <div className="grouphead">
              <div><div className="source">{r.name} · {r.method}</div><div className="grouptitle">{r.status}</div></div>
              <div className="meta">{r.latencyMs}ms · {r.offers.length} offer</div>
            </div>
            {r.error && <div className="laberror inline">{r.error}</div>}
            <div className="offers">{r.offers.map((o, i) => <a className="offer" key={`${o.url}-${i}`} href={o.url} target="_blank" rel="noreferrer"><span><b>{o.source}</b><small>{o.method} · {Math.round(o.confidence * 100)}٪</small></span><strong>{o.price ? new Intl.NumberFormat('fa-IR').format(o.price) + ' تومان' : '—'}</strong></a>)}</div>
          </article>
        ))}
      </section>
    </main>
  );
}
