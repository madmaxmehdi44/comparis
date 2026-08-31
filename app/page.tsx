'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import type { Offer, SearchResponse, SourceResult } from '@/lib/types';

const toman = (n?: number) => n == null ? '—' : new Intl.NumberFormat('fa-IR').format(n) + ' تومان';
const statusText: Record<string, string> = { fresh: 'زنده', blocked: 'مسدود', failed: 'خطا', stale: 'قدیمی' };
const statusClass: Record<string, string> = { fresh: 'ok', blocked: 'warn', failed: 'bad', stale: 'muted' };

export default function Home() {
  const [q, setQ] = useState('');
  const [data, setData] = useState<SearchResponse | null>(null);
  const [sources, setSources] = useState<SourceResult[]>([]);
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  function reset() {
    setData(null);
    setSources([]);
  }

  async function search(e?: FormEvent) {
    e?.preventDefault();
    const query = q.trim();
    if (!query || loading) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    reset();
    setLoading(true);

    const sourceMap = new Map<string, SourceResult>();
    try {
      const response = await fetch(`/api/search/stream?q=${encodeURIComponent(query)}`, { signal: controller.signal });
      if (!response.ok || !response.body) throw new Error('stream failed');
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split('\n\n');
        buffer = chunks.pop() ?? '';
        for (const chunk of chunks) {
          const match = chunk.match(/event: ([^\n]+)\ndata: ([\s\S]+)/);
          if (!match) continue;
          const payload = JSON.parse(match[2]);
          if (match[1] === 'source') {
            sourceMap.set(payload.id, payload as SourceResult);
            const next = [...sourceMap.values()];
            setSources(next);
            setData({ query, results: next.flatMap((s) => s.offers).sort((a: Offer, b: Offer) => (a.price ?? Infinity) - (b.price ?? Infinity)), sources: next, completedAt: new Date().toISOString() });
          } else if (match[1] === 'done') {
            setData(payload as SearchResponse);
            setSources(payload.sources);
          }
        }
      }
    } catch (error) {
      if ((error as Error).name !== 'AbortError') setData({ query, results: [], sources: [...sourceMap.values()], completedAt: new Date().toISOString() });
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="shell">
      <header className="hero">
        <div className="eyebrow">PRICE INTELLIGENCE</div>
        <h1>Comparis</h1>
        <p>قیمت یک محصول را هم‌زمان از منابع ایرانی جمع‌آوری و استاندارد می‌کنیم.</p>
      </header>

      <form className="search" onSubmit={search}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="مثلاً RTX 5070 Ti 16GB" aria-label="محصول" />
        <button disabled={loading}>{loading ? 'در حال جمع‌آوری…' : 'جست‌وجوی زنده'}</button>
      </form>

      {sources.length > 0 && (
        <section className="sourcebar" aria-live="polite">
          {sources.map((source) => <div className="sourcepill" key={source.id}>
            <span className={`dot ${statusClass[source.status]}`} />
            <b>{source.name}</b>
            <span>{statusText[source.status]}</span>
            <small>{source.latencyMs}ms</small>
          </div>)}
        </section>
      )}

      {loading && <div className="status"><span className="live"><i />در حال بررسی منابع</span><span>هر منبع مستقل است؛ شکست یک منبع بقیه را متوقف نمی‌کند.</span></div>}

      {data && (
        <>
          <div className="status">
            <span>{new Intl.NumberFormat('fa-IR').format(data.results.length)} پیشنهاد استخراج‌شده</span>
            <span>{new Date(data.completedAt).toLocaleTimeString('fa-IR')}</span>
          </div>
          <section className="grid">
            {data.results.length ? data.results.map((x, i) => (
              <article className="card" key={`${x.sourceId}-${x.url}-${i}`}>
                <div>
                  <div className="source">{x.source} · <span className={statusClass[x.status]}>{statusText[x.status]}</span></div>
                  <a className="title" href={x.url} target="_blank" rel="noreferrer">{x.title}</a>
                  <div className="meta">مشاهده {new Date(x.observedAt).toLocaleTimeString('fa-IR')} · اطمینان {Math.round(x.confidence * 100)}٪ · روش {x.method}</div>
                </div>
                <div className="price">{toman(x.price)}</div>
              </article>
            )) : <div className="empty">در این چرخه هیچ پیشنهاد قابل استخراجی برنگشت.</div>}
          </section>
        </>
      )}
    </main>
  );
}
