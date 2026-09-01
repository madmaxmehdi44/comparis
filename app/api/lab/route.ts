import { NextRequest, NextResponse } from 'next/server';
import * as cheerio from 'cheerio';
import { SOURCES } from '@/lib/sources';
import { crawlSource } from '@/lib/crawler';
import { parseDiscoveredSources } from '@/lib/discovered-sources';
import type { SourceResult, RetrievalMethod } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;
const BLOCKED = new Set([401, 403, 406, 409, 429, 451]);

function absolute(base: string, href?: string) { try { return href ? new URL(href, base).toString() : undefined; } catch { return undefined; } }
function unsafe(raw: string) {
  try {
    const u = new URL(raw); if (!['http:', 'https:'].includes(u.protocol)) return true;
    const h = u.hostname.toLowerCase(); if (h === 'localhost' || h.endsWith('.localhost') || h === '0.0.0.0') return true;
    const m = h.match(/^\d+(?:\.\d+){3}$/); if (!m) return false; const p = h.split('.').map(Number);
    return p[0] === 10 || p[0] === 127 || (p[0] === 169 && p[1] === 254) || (p[0] === 192 && p[1] === 168) || (p[0] === 172 && p[1] >= 16 && p[1] <= 31);
  } catch { return true; }
}
function extract(html: string, source: string, sourceId: string, baseUrl: string, method: RetrievalMethod, maxOffers: number, selectors: { title?: string; price?: string; link?: string }): ReturnType<typeof import('@/lib/crawler').crawlSource> extends Promise<SourceResult> ? SourceResult['offers'] : never {
  const $ = cheerio.load(html); const offers: SourceResult['offers'] = []; const seen = new Set<string>();
  const add = (title: string, rawPrice: string, href?: string, confidence = 0.55) => {
    if (offers.length >= maxOffers) return; const priceMatch = rawPrice.match(/[\d۰-۹٠-٩][\d۰-۹٠-٩\s,\.]{2,}/); if (!priceMatch) return;
    const { parsePrice, normalizeText } = require('@/lib/sources') as typeof import('@/lib/sources'); const price = parsePrice(rawPrice); const url = absolute(baseUrl, href);
    if (!price || !url || title.trim().length < 3 || unsafe(url)) return; const cleanTitle = normalizeText(title); const key = `${cleanTitle}|${price}|${url}`; if (seen.has(key)) return; seen.add(key);
    offers.push({ sourceId, source, url, title: cleanTitle, price, currency: 'IRT', availability: 'unknown', observedAt: new Date().toISOString(), status: 'fresh', method, confidence });
  };
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const parsed = JSON.parse($(el).text()); const roots = Array.isArray(parsed) ? parsed : [parsed];
      for (const root of roots) { const graph = root && typeof root === 'object' && Array.isArray((root as Record<string, unknown>)['@graph']) ? (root as Record<string, unknown>)['@graph'] as unknown[] : [root];
        for (const item of graph) { if (!item || typeof item !== 'object') continue; const p = item as Record<string, unknown>; if (!String(p['@type'] ?? '').includes('Product') || typeof p.name !== 'string') continue;
          const rawOffers = Array.isArray(p.offers) ? p.offers : [p.offers]; for (const raw of rawOffers) { if (!raw || typeof raw !== 'object') continue; const o = raw as Record<string, unknown>; add(p.name, String(o.price ?? o.lowPrice ?? ''), typeof o.url === 'string' ? o.url : undefined, method === 'search' ? .8 : .98); }
        }
      }
    } catch {}
  });
  const roots = selectors.link ? $(selectors.link) : $('article, li, .product, .product-item, .product-card, .item, .card');
  roots.each((_, node) => {
    if (offers.length >= maxOffers) return; const root = node as any;
    const titleNode = selectors.title ? $(root).find(selectors.title).first() : $(root).find('[itemprop="name"],h1,h2,h3,h4,.product-title,.product-name,.title').first();
    const priceNode = selectors.price ? $(root).find(selectors.price).first() : $(root).find('[itemprop="price"],[data-price],.price,.product-price,.amount,.sale-price,.regular-price').first();
    const title = titleNode.text().replace(/\s+/g, ' ').trim(); const priceText = priceNode.attr('content') || priceNode.attr('data-price') || priceNode.text();
    const href = $(root).find('a[href]').first().attr('href') || $(root).closest('a[href]').attr('href'); add(title, priceText, href, method === 'search' ? .62 : .82);
  });
  return offers;
}

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams; const query = p.get('q')?.trim(); if (!query) return NextResponse.json({ error: 'q is required' }, { status: 400 });
  const timeout = Math.min(30000, Math.max(1000, Number(p.get('timeout') ?? 7500))); const maxOffers = Math.min(100, Math.max(1, Number(p.get('maxOffers') ?? 30)));
  const sourceParam = p.get('source') ?? 'all'; const strategyParam = p.get('strategy') ?? 'all'; const mode = p.get('mode') === 'chain' ? 'chain' : 'all';
  const discovered = parseDiscoveredSources(p.get('sources')); const registry = [...SOURCES, ...discovered]; const selected = sourceParam === 'all' ? registry : registry.filter((s) => s.id === sourceParam);
  const userAgent = p.get('userAgent')?.trim() || 'ComparisLab/0.3'; const language = p.get('language')?.trim() || 'fa-IR,fa;q=0.9,en;q=0.6';
  const selectors = { title: p.get('titleSelector')?.trim() || undefined, price: p.get('priceSelector')?.trim() || undefined, link: p.get('linkSelector')?.trim() || undefined };
  const custom = p.get('url')?.trim() || '';
  if (!selected.length && !custom) return NextResponse.json({ error: 'unknown source' }, { status: 400 });

  const results: SourceResult[] = [];
  if (custom) {
    if (unsafe(custom.replace('{q}', query))) results.push({ id: 'custom', name: 'سایت دستی', status: 'failed', method: 'http', offers: [], latencyMs: 0, error: 'unsafe URL rejected' });
    else {
      const url = custom.includes('{q}') ? custom.replace('{q}', encodeURIComponent(query)) : custom;
      const started = Date.now(); const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeout);
      try { const response = await fetch(url, { signal: controller.signal, cache: 'no-store', redirect: 'follow', headers: { 'user-agent': userAgent, accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8', 'accept-language': language } });
        if (!response.ok) results.push({ id: 'custom', name: 'سایت دستی', status: BLOCKED.has(response.status) ? 'blocked' : 'failed', method: 'http', offers: [], latencyMs: Date.now() - started, error: `HTTP ${response.status}` });
        else { const html = await response.text(); const offers = extract(html, 'سایت دستی', 'custom', response.url || url, 'http', maxOffers, selectors); results.push({ id: 'custom', name: 'سایت دستی', status: offers.length ? 'fresh' : 'failed', method: 'http', offers, latencyMs: Date.now() - started, error: offers.length ? undefined : 'no offers extracted' }); }
      } catch (e) { results.push({ id: 'custom', name: 'سایت دستی', status: e instanceof Error && e.name === 'AbortError' ? 'stale' : 'failed', method: 'http', offers: [], latencyMs: Date.now() - started, error: e instanceof Error ? e.message : 'fetch failed' }); }
      finally { clearTimeout(timer); }
    }
  } else {
    for (const source of selected) {
      const filtered = source.strategies.filter((s) => strategyParam === 'all' || s.name === strategyParam);
      if (mode === 'chain' || strategyParam === 'all') results.push(await crawlSource({ ...source, strategies: filtered }, query));
      else for (const strategy of filtered) results.push(await crawlSource({ ...source, strategies: [strategy] }, query));
    }
  }
  return NextResponse.json({ query, results, testedAt: new Date().toISOString(), config: { timeout, maxOffers, source: sourceParam, strategy: strategyParam, mode, customUrl: custom || null, userAgent, language, ...selectors } }, { headers: { 'Cache-Control': 'no-store' } });
}
