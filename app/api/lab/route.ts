import { NextRequest, NextResponse } from 'next/server';
import * as cheerio from 'cheerio';
import { SOURCES, parsePrice } from '@/lib/sources';
import { dedupeOffers } from '@/lib/match';
import type { Offer, SourceResult, RetrievalMethod } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const UA = 'ComparisLab/0.1 (+https://github.com/madmaxmehdi44/comparis)';
const BLOCKED = new Set([401, 403, 406, 409, 429, 451]);

function absolute(base: string, href?: string) {
  try { return href ? new URL(href, base).toString() : undefined; } catch { return undefined; }
}

function extract(html: string, source: string, sourceId: string, baseUrl: string, method: RetrievalMethod, observedAt: string, maxOffers: number): Offer[] {
  const $ = cheerio.load(html);
  const offers: Offer[] = [];
  const seen = new Set<string>();

  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const roots = Array.isArray(JSON.parse($(el).text())) ? JSON.parse($(el).text()) : [JSON.parse($(el).text())];
      for (const root of roots) {
        const items = root && typeof root === 'object' && Array.isArray((root as Record<string, unknown>)['@graph']) ? (root as Record<string, unknown>)['@graph'] as unknown[] : [root];
        for (const item of items) {
          if (!item || typeof item !== 'object') continue;
          const p = item as Record<string, unknown>;
          if (!String(p['@type'] ?? '').includes('Product') || typeof p.name !== 'string') continue;
          const rawOffers = Array.isArray(p.offers) ? p.offers : [p.offers];
          for (const raw of rawOffers) {
            if (!raw || typeof raw !== 'object') continue;
            const o = raw as Record<string, unknown>;
            const price = parsePrice(String(o.price ?? o.lowPrice ?? ''));
            if (!price) continue;
            const url = absolute(baseUrl, typeof o.url === 'string' ? o.url : undefined) ?? baseUrl;
            const key = `${p.name}|${price}|${url}`;
            if (seen.has(key)) continue;
            seen.add(key);
            offers.push({ sourceId, source, url, title: p.name, price, currency: 'IRT', availability: typeof o.availability === 'string' ? o.availability : 'unknown', observedAt, status: 'fresh', method, confidence: method === 'search' ? 0.78 : 0.98 });
            if (offers.length >= maxOffers) return;
          }
        }
      }
    } catch {}
  });

  if (offers.length < maxOffers) {
    $('a[href]').each((_, a) => {
      if (offers.length >= maxOffers) return;
      const text = $(a).text().replace(/\s+/g, ' ').trim();
      const price = parsePrice(text);
      const url = absolute(baseUrl, $(a).attr('href'));
      if (text.length < 8 || !price || !url) return;
      const key = `${text}|${price}|${url}`;
      if (seen.has(key)) return;
      seen.add(key);
      offers.push({ sourceId, source, url, title: text, price, currency: 'IRT', availability: 'unknown', observedAt, status: 'fresh', method, confidence: method === 'search' ? 0.55 : 0.60 });
    });
  }
  return dedupeOffers(offers).slice(0, maxOffers);
}

function sourceFallbacks(sourceId: string, query: string) {
  const source = SOURCES.find((x) => x.id === sourceId);
  if (!source) return [];
  return source.strategies.map((s) => ({ name: s.name, method: s.method, url: s.buildUrl(query), timeoutMs: s.timeoutMs }));
}

async function fetchOne(name: string, sourceId: string, query: string, url: string, method: RetrievalMethod, timeoutMs: number, maxOffers: number): Promise<SourceResult> {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal, cache: 'no-store', redirect: 'follow', headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8', 'accept-language': 'fa-IR,fa;q=0.9,en;q=0.6' } });
    if (!response.ok) return { id: sourceId, name, status: BLOCKED.has(response.status) ? 'blocked' : 'failed', method, offers: [], latencyMs: Date.now() - started, error: `HTTP ${response.status}` };
    const html = await response.text();
    const offers = extract(html, name, sourceId, response.url || url, method, new Date().toISOString(), maxOffers);
    return { id: sourceId, name, status: offers.length ? 'fresh' : 'failed', method, offers, latencyMs: Date.now() - started, error: offers.length ? undefined : 'no offers extracted' };
  } catch (error) {
    const timeout = error instanceof Error && error.name === 'AbortError';
    return { id: sourceId, name, status: timeout ? 'stale' : 'failed', method, offers: [], latencyMs: Date.now() - started, error: timeout ? 'timeout' : error instanceof Error ? error.message : 'fetch failed' };
  } finally { clearTimeout(timer); }
}

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const query = params.get('q')?.trim();
  if (!query) return NextResponse.json({ error: 'q is required' }, { status: 400 });
  const timeout = Math.min(30000, Math.max(1000, Number(params.get('timeout') ?? 7500)));
  const maxOffers = Math.min(100, Math.max(1, Number(params.get('maxOffers') ?? 30)));
  const sourceParam = params.get('source') ?? 'all';
  const strategyParam = params.get('strategy') ?? 'all';
  const custom = params.get('url')?.trim();

  const selected = sourceParam === 'all' ? SOURCES : SOURCES.filter((s) => s.id === sourceParam);
  if (!selected.length && !custom) return NextResponse.json({ error: 'unknown source' }, { status: 400 });

  const results: SourceResult[] = [];
  if (custom) {
    const normalized = custom.replace('{q}', encodeURIComponent(query));
    results.push(await fetchOne('سایت دستی', 'custom', query, normalized, 'http', timeout, maxOffers));
  } else {
    for (const source of selected) {
      const strategies = sourceFallbacks(source.id, query).filter((s) => strategyParam === 'all' || s.name === strategyParam);
      for (const strategy of strategies) {
        const result = await fetchOne(source.name, source.id, query, strategy.url, strategy.method, Math.min(timeout, strategy.timeoutMs), maxOffers);
        results.push({ ...result, id: `${source.id}:${strategy.name}` });
        if (result.offers.length) break;
      }
    }
  }

  return NextResponse.json({ query, results, testedAt: new Date().toISOString(), config: { timeout, maxOffers, source: sourceParam, strategy: strategyParam, customUrl: custom || null } }, { headers: { 'Cache-Control': 'no-store' } });
}
