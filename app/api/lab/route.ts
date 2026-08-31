import { NextRequest, NextResponse } from 'next/server';
import * as cheerio from 'cheerio';
import { SOURCES, parsePrice } from '@/lib/sources';
import { dedupeOffers } from '@/lib/match';
import type { Offer, SourceResult, RetrievalMethod } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const UA = 'ComparisLab/0.2 (+https://github.com/madmaxmehdi44/comparis)';
const BLOCKED = new Set([401, 403, 406, 409, 429, 451]);

function absolute(base: string, href?: string) {
  try { return href ? new URL(href, base).toString() : undefined; } catch { return undefined; }
}

function isUnsafeTarget(rawUrl: string) {
  try {
    const u = new URL(rawUrl);
    if (!['http:', 'https:'].includes(u.protocol)) return true;
    const h = u.hostname.toLowerCase();
    if (h === 'localhost' || h.endsWith('.localhost') || h === '0.0.0.0') return true;
    const m = h.match(/^\d+(?:\.\d+){3}$/);
    if (!m) return false;
    const p = h.split('.').map(Number);
    return p[0] === 10 || p[0] === 127 || (p[0] === 169 && p[1] === 254) || (p[0] === 192 && p[1] === 168) || (p[0] === 172 && p[1] >= 16 && p[1] <= 31);
  } catch { return true; }
}

function extract(html: string, source: string, sourceId: string, baseUrl: string, method: RetrievalMethod, observedAt: string, maxOffers: number, selectors: { title?: string; price?: string; link?: string }): Offer[] {
  const $ = cheerio.load(html);
  const offers: Offer[] = [];
  const seen = new Set<string>();

  const add = (title: string, rawPrice: string, href?: string, confidence = 0.55) => {
    if (offers.length >= maxOffers) return;
    const price = parsePrice(rawPrice);
    const url = absolute(baseUrl, href);
    if (title.length < 3 || !price || !url) return;
    const key = `${title}|${price}|${url}`;
    if (seen.has(key)) return;
    seen.add(key);
    offers.push({ sourceId, source, url, title, price, currency: 'IRT', availability: 'unknown', observedAt, status: 'fresh', method, confidence });
  };

  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const parsed = JSON.parse($(el).text());
      const roots = Array.isArray(parsed) ? parsed : [parsed];
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
            add(p.name, String(o.price ?? o.lowPrice ?? ''), typeof o.url === 'string' ? o.url : undefined, method === 'search' ? 0.78 : 0.98);
          }
        }
      }
    } catch {}
  });

  const links = selectors.link ? $(selectors.link) : $('a[href]');
  links.each((_, a) => {
    if (offers.length >= maxOffers) return;
    const titleNode = selectors.title ? $(a).find(selectors.title).first() : $(a);
    const priceNode = selectors.price ? $(a).find(selectors.price).first() : $(a);
    add(titleNode.text().replace(/\s+/g, ' ').trim(), priceNode.text().replace(/\s+/g, ' ').trim(), $(a).attr('href'));
  });
  return dedupeOffers(offers).slice(0, maxOffers);
}

async function fetchOne(name: string, sourceId: string, url: string, method: RetrievalMethod, timeoutMs: number, maxOffers: number, selectors: { title?: string; price?: string; link?: string }, userAgent: string, language: string): Promise<SourceResult> {
  const started = Date.now();
  if (isUnsafeTarget(url)) return { id: sourceId, name, status: 'failed', method, offers: [], latencyMs: 0, error: 'unsafe URL rejected' };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal, cache: 'no-store', redirect: 'follow', headers: { 'user-agent': userAgent, accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8', 'accept-language': language } });
    if (!response.ok) return { id: sourceId, name, status: BLOCKED.has(response.status) ? 'blocked' : 'failed', method, offers: [], latencyMs: Date.now() - started, error: `HTTP ${response.status}` };
    const html = await response.text();
    const offers = extract(html, name, sourceId, response.url || url, method, new Date().toISOString(), maxOffers, selectors);
    return { id: sourceId, name, status: offers.length ? 'fresh' : 'failed', method, offers, latencyMs: Date.now() - started, error: offers.length ? undefined : 'no offers extracted' };
  } catch (error) {
    const timeout = error instanceof Error && error.name === 'AbortError';
    return { id: sourceId, name, status: timeout ? 'stale' : 'failed', method, offers: [], latencyMs: Date.now() - started, error: timeout ? 'timeout' : error instanceof Error ? error.message : 'fetch failed' };
  } finally { clearTimeout(timer); }
}

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const query = p.get('q')?.trim();
  if (!query) return NextResponse.json({ error: 'q is required' }, { status: 400 });
  const timeout = Math.min(30000, Math.max(1000, Number(p.get('timeout') ?? 7500)));
  const maxOffers = Math.min(100, Math.max(1, Number(p.get('maxOffers') ?? 30)));
  const sourceParam = p.get('source') ?? 'all';
  const strategyParam = p.get('strategy') ?? 'all';
  const mode = p.get('mode') === 'chain' ? 'chain' : 'all';
  const custom = p.get('url')?.trim() || '';
  const userAgent = p.get('userAgent')?.trim() || UA;
  const language = p.get('language')?.trim() || 'fa-IR,fa;q=0.9,en;q=0.6';
  const selectors = { title: p.get('titleSelector')?.trim() || undefined, price: p.get('priceSelector')?.trim() || undefined, link: p.get('linkSelector')?.trim() || undefined };

  const selected = sourceParam === 'all' ? SOURCES : SOURCES.filter((s) => s.id === sourceParam);
  if (!selected.length && !custom) return NextResponse.json({ error: 'unknown source' }, { status: 400 });

  const results: SourceResult[] = [];
  if (custom) {
    const normalized = custom.replace('{q}', encodeURIComponent(query));
    results.push(await fetchOne('سایت دستی', 'custom', normalized, 'http', timeout, maxOffers, selectors, userAgent, language));
  } else {
    for (const source of selected) {
      const strategies = source.strategies.filter((s) => strategyParam === 'all' || s.name === strategyParam);
      for (const strategy of strategies) {
        const result = await fetchOne(source.name, `${source.id}:${strategy.name}`, strategy.buildUrl(query), strategy.method, Math.min(timeout, strategy.timeoutMs), maxOffers, selectors, userAgent, language);
        results.push(result);
        if (mode === 'chain' && result.offers.length) break;
      }
    }
  }

  return NextResponse.json({ query, results, testedAt: new Date().toISOString(), config: { timeout, maxOffers, source: sourceParam, strategy: strategyParam, mode, customUrl: custom || null, userAgent, language, ...selectors } }, { headers: { 'Cache-Control': 'no-store' } });
}
