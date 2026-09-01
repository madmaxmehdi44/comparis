'use client';

import { FormEvent, useState } from 'react';
import styles from './page.module.css';
import { PLAYWRIGHT_LAB_MODES, type PlaywrightLabMode } from '@/lib/playwright-modes';

type Result = { mode: PlaywrightLabMode; url: string; finalUrl: string; title: string; durationMs: number; status: string; details: Record<string, unknown>; errors: string[] };

const examples: Record<PlaywrightLabMode, { url: string; selector: string; waitFor: string }> = {
  'smart-extract': { url: 'https://www.digikala.com/', selector: 'script[type="application/ld+json"]', waitFor: '' },
  locators: { url: 'https://www.digikala.com/', selector: 'a[href]', waitFor: '' },
  'wait-and-load': { url: 'https://www.digikala.com/', selector: 'body', waitFor: 'body' },
  'evaluate-dom': { url: 'https://www.digikala.com/', selector: '[data-product], article', waitFor: 'body' },
  network: { url: 'https://www.digikala.com/', selector: '', waitFor: '' },
  screenshot: { url: 'https://www.digikala.com/', selector: '', waitFor: 'body' },
  responsive: { url: 'https://www.digikala.com/', selector: 'body', waitFor: 'body' },
  locale: { url: 'https://www.digikala.com/', selector: '', waitFor: '' },
  storage: { url: 'https://www.digikala.com/', selector: '', waitFor: '' },
  frames: { url: 'https://www.digikala.com/', selector: '', waitFor: '' },
  'click-and-pagination': { url: 'https://www.digikala.com/search/?q=iphone', selector: 'a[rel="next"]', waitFor: '' },
  'full-diagnostics': { url: 'https://www.digikala.com/', selector: '', waitFor: '' },
};

export default function PlaywrightLabPage() {
  const [mode, setMode] = useState<PlaywrightLabMode>('full-diagnostics');
  const [url, setUrl] = useState(examples['full-diagnostics'].url); const [selector, setSelector] = useState(''); const [waitFor, setWaitFor] = useState(''); const [timeout, setTimeoutValue] = useState(12000); const [mobile, setMobile] = useState(false);
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [result, setResult] = useState<Result | null>(null);

  function choose(next: PlaywrightLabMode) { setMode(next); setUrl(examples[next].url); setSelector(examples[next].selector); setWaitFor(examples[next].waitFor); setResult(null); setError(''); }
  async function run(e: FormEvent) { e.preventDefault(); if (!url.trim() || busy) return; setBusy(true); setError(''); setResult(null); try { const p = new URLSearchParams({ url: url.trim(), mode, selector, waitFor, timeout: String(timeout), mobile: String(mobile), locale: 'fa-IR', maxItems: '20' }); const response = await fetch(`/api/lab/playwright?${p}`); const data = await response.json(); if (!response.ok) throw new Error(data.error ?? 'Playwright request failed'); setResult(data.result as Result); } catch (e) { setError(e instanceof Error ? e.message : 'Playwright failed'); } finally { setBusy(false); } }

  const screenshot = result?.mode === 'screenshot' && typeof result.details.screenshotDataUrl === 'string' ? result.details.screenshotDataUrl : undefined;

  return <main className={styles.page}>
    <header className={styles.header}><a href="/lab" className={styles.back}>← بازگشت به Lab</a><div className={styles.kicker}>PLAYWRIGHT WORKBENCH</div><h1>Playwright برای discovery و scraping</h1><p>سناریوهای رسمی و کاربردی Playwright را به‌صورت مستقل روی سایت واقعی اجرا کن.</p></header>
    <section className={styles.modes}>{PLAYWRIGHT_LAB_MODES.map((item) => <button type="button" key={item.id} className={`${styles.mode} ${mode === item.id ? styles.active : ''}`} onClick={() => choose(item.id)}><b>{item.label}</b><span>{item.description}</span><small>{item.api}</small></button>)}</section>
    <section className={styles.controls}><form onSubmit={run} className={styles.form}><label className={styles.full}>URL<input value={url} onChange={(e) => setUrl(e.target.value)} /></label><label>Selector<input value={selector} onChange={(e) => setSelector(e.target.value)} placeholder=".product-card" /></label><label>Wait for<input value={waitFor} onChange={(e) => setWaitFor(e.target.value)} placeholder=".product-card" /></label><label>Timeout<input type="number" min="2000" max="30000" value={timeout} onChange={(e) => setTimeoutValue(Number(e.target.value))} /></label><label className={styles.checkbox}><input type="checkbox" checked={mobile} onChange={(e) => setMobile(e.target.checked)} /> viewport موبایل</label><button disabled={busy || !url.trim()}>{busy ? 'در حال اجرا…' : 'اجرای سناریو'}</button></form></section>
    {error && <div className={styles.error}>{error}</div>}
    {result && <section className={styles.result}><div className={styles.resultHead}><div><div className={styles.status}>{result.status}</div><h2>{result.title || 'بدون عنوان'}</h2><a href={result.finalUrl} target="_blank" rel="noreferrer">{result.finalUrl}</a></div><strong>{result.durationMs} ms</strong></div>{screenshot && <img className={styles.screenshot} src={screenshot} alt="Playwright screenshot" />}{!screenshot && <div className={styles.grid}>{Object.entries(result.details).map(([key,value]) => <article key={key}><b>{key}</b><pre>{JSON.stringify(value, null, 2)}</pre></article>)}</div>}{result.errors.length > 0 && <div className={styles.errors}>{result.errors.slice(0,15).map((item,i) => <div key={i}>{item}</div>)}</div>}</section>}
  </main>;
}
