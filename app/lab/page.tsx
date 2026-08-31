'use client';

import { FormEvent, useMemo, useState } from 'react';
import type { SourceResult } from '@/lib/types';
import { SOURCES } from '@/lib/sources';

const defaultUrl: Record<string, string> = {
  torob: 'https://torob.com/search/?query={q}',
  digikala: 'https://www.digikala.com/search/?q={q}',
  emalls: 'https://emalls.ir/Search.aspx?Search={q}',
};

export default function LabPage() {
  const [query, setQuery] = useState('RTX 5070 Ti 16GB');
  const [site, setSite] = useState('all');
  const [customUrl, setCustomUrl] = useState('');
  const [strategy, setStrategy] = useState('all');
  const [timeout, setTimeoutValue] = useState(7500);
  const [maxOffers, setMaxOffers] = useState(30);
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
      const params = new URLSearchParams({ q: query, timeout: String(timeout), maxOffers: String(maxOffers) });
      if (site !== 'all') params.set('source', site);
      if (strategy !== 'all') params.set('strategy', strategy);
      if (customUrl.trim()) params.set('url', customUrl.trim());
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
        <p>هر استراتژی را مستقل اجرا کن، fallback را مقایسه کن و URL سفارشی بده.</p>
      </header>

      <form className="labform" onSubmit={run}>
        <label>عبارت جست‌وجو<input value={query} onChange={(e) => setQuery(e.target.value)} /></label>
        <label>منبع<select value={site} onChange={(e) => { setSite(e.target.value); setStrategy('all'); }}><option value="all">همه منابع</option>{SOURCES.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
        <label>استراتژی<select value={strategy} onChange={(e) => setStrategy(e.target.value)}><option value="all">زنجیره کامل</option>{strategyOptions.map((s) => <option key={s.name} value={s.name}>{s.name} · {s.method}</option>)}</select></label>
        <label>Timeout (ms)<input type="number" min="1000" max="30000" step="500" value={timeout} onChange={(e) => setTimeoutValue(Number(e.target.value))} /></label>
        <label>حداکثر پیشنهاد<input type="number" min="1" max="100" value={maxOffers} onChange={(e) => setMaxOffers(Number(e.target.value))} /></label>
        <label className="wide">URL دستی<input value={customUrl} onChange={(e) => setCustomUrl(e.target.value)} placeholder="https://example.com/search?q={q}" /></label>
        <button disabled={busy || !query.trim()}>{busy ? 'در حال تست…' : 'اجرای تست'}</button>
      </form>

      {error && <div className="laberror">{error}</div>}
      <section className="labhint">
        <b>قالب URL:</b> از <code>{'{q}'}</code> برای جایگزینی عبارت جست‌وجو استفاده کن. URL سفارشی فقط در محیط تست استفاده می‌شود.
      </section>

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
