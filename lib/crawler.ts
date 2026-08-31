import * as cheerio from 'cheerio';
import type { Element } from 'domhandler';
import type { Offer, SourceResult, RetrievalMethod } from './types';
import { SOURCES, parsePrice, type SourceDefinition, type SourceStrategy } from './sources';
import { dedupeOffers } from './match';

const UA = 'ComparisBot/0.6 (+https://github.com/madmaxmehdi44/comparis)';
const MAX_OFFERS = 30;
const BLOCKED_STATUSES = new Set([401, 403, 406, 409, 429, 451]);

function absoluteUrl(base: string, href?: string) {
  if (!href) return undefined;
  try { return new URL(href, base).toString(); } catch { return undefined; }
}

function availability(value: unknown): string {
  if (typeof value !== 'string') return 'unknown';
  const v = value.toLowerCase();
  if (v.includes('instock') || v.includes('in stock') || v.includes('موجود')) return 'in_stock';
  if (v.includes('outofstock') || v.includes('out of stock') || v.includes('ناموجود')) return 'out_of_stock';
  return 'unknown';
}

function isProductType(value: unknown): boolean {
  return value === 'Product' || (Array.isArray(value) && value.includes('Product'));
}

function jsonLdOffers(raw: unknown, source: SourceDefinition, strategy: SourceStrategy, url: string, observedAt: string): Offer[] {
  const nodes = Array.isArray(raw) ? raw : [raw];
  const out: Offer[] = [];

  for (const node of nodes) {
    if (!node || typeof node !== 'object') continue;
    const record = node as Record<string, unknown>;
    const graph = Array.isArray(record['@graph']) ? record['@graph'] : [node];
    for (const item of graph) {
      if (!item || typeof item !== 'object') continue;
      const product = item as Record<string, unknown>;
      if (!isProductType(product['@type']) || typeof product.name !== 'string') continue;
      const rawOffers = Array.isArray(product.offers) ? product.offers : [product.offers];
      for (const rawOffer of rawOffers) {
        if (!rawOffer || typeof rawOffer !== 'object') continue;
        const offer = rawOffer as Record<string, unknown>;
        const price = parsePrice(String(offer.price ?? offer.lowPrice ?? ''));
        if (price == null) continue;
        out.push({
          sourceId: source.id,
          source: source.name,
          url: absoluteUrl(url, typeof offer.url === 'string' ? offer.url : undefined) ?? url,
          title: product.name,
          price,
          currency: 'IRT',
          availability: availability(offer.availability),
          observedAt,
          status: 'fresh',
          method: strategy.method as RetrievalMethod,
          confidence: strategy.kind === 'search-engine' ? 0.78 : 0.98,
        });
      }
    }
  }
  return out;
}

function extractPageOffers(html: string, source: SourceDefinition, strategy: SourceStrategy, url: string, observedAt: string): Offer[] {
  const $ = cheerio.load(html);
  const out: Offer[] = [];

  $('script[type="application/ld+json"]').each((_, el) => {
    try { out.push(...jsonLdOffers(JSON.parse($(el).text()), source, strategy, url, observedAt)); } catch { /* fallback */ }
  });

  const seen = new Set(out.map((x) => `${x.title}|${x.price}|${x.url}`));
  $('a[href]').each((_, a) => {
    if (out.length >= MAX_OFFERS) return;
    const text = $(a).text().replace(/\s+/g, ' ').trim();
    if (text.length < 8) return;
    const price = parsePrice(text);
    const href = absoluteUrl(url, $(a).attr('href'));
    if (price == null || price < 10_000 || !href) return;
    const key = `${text}|${price}|${href}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({
      sourceId: source.id,
      source: source.name,
      url: href,
      title: text,
      price,
      currency: 'IRT',
      availability: 'unknown',
      observedAt,
      status: 'fresh',
      method: strategy.method as RetrievalMethod,
      confidence: strategy.kind === 'search-engine' ? 0.55 : 0.60,
    });
  });
  return dedupeOffers(out).slice(0, MAX_OFFERS);
}

function extractIndexedOffers(html: string, source: SourceDefinition, strategy: SourceStrategy, engineUrl: string, query: string, observedAt: string): Offer[] {
  const $ = cheerio.load(html);
  const out: Offer[] = [];
  const host = new URL(source.strategies[0].buildUrl(query)).hostname.replace(/^www\./, '');

  $('a[href]').each((_, a: Element) => {
    if (out.length >= MAX_OFFERS) return;
    const hrefRaw = $(a).attr('href');
    const href = absoluteUrl(engineUrl, hrefRaw);
    if (!href) return;
    let target: URL;
    try { target = new URL(href); } catch { return; }
    if (!target.hostname.replace(/^www\./, '').endsWith(host)) return;

    const containerText = $(a).closest('div,li,article').text().replace(/\s+/g, ' ').trim();
    const text = containerText || $(a).text().replace(/\s+/g, ' ').trim();
    if (text.length < 10) return;
    const price = parsePrice(text);
    if (price == null || price < 10_000) return;

    const title = $(a).text().replace(/\s+/g, ' ').trim() || text.slice(0, 180);
    out.push({
      sourceId: source.id,
      source: source.name,
      url: href,
      title,
      price,
      currency: 'IRT',
      availability: 'unknown',
      observedAt,
      status: 'fresh',
      method: 'search',
      confidence: 0.70,
    });
  });

  return dedupeOffers(out).slice(0, MAX_OFFERS);
}

function classifyFailure(status: number): SourceResult['status'] {
  return BLOCKED_STATUSES.has(status) ? 'blocked' : 'failed';
}

async function tryStrategy(source: SourceDefinition, strategy: SourceStrategy, query: string): Promise<SourceResult> {
  const started = Date.now();
  const url = strategy.buildUrl(query);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), strategy.timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      cache: 'no-store',
      redirect: 'follow',
      headers: {
        'user-agent': UA,
        accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
        'accept-language': 'fa-IR,fa;q=0.9,en;q=0.6',
      },
    });
    const latencyMs = Date.now() - started;
    if (!response.ok) {
      return { id: source.id, name: source.name, status: classifyFailure(response.status), method: strategy.method, offers: [], latencyMs, error: `HTTP ${response.status} via ${strategy.name}` };
    }

    const html = await response.text();
    const observedAt = new Date().toISOString();
    const offers = strategy.kind === 'search-engine'
      ? extractIndexedOffers(html, source, strategy, response.url || url, query, observedAt)
      : extractPageOffers(html, source, strategy, response.url || url, observedAt);

    if (!offers.length) {
      return { id: source.id, name: source.name, status: 'failed', method: strategy.method, offers: [], latencyMs, error: `no offers via ${strategy.name}` };
    }
    return { id: source.id, name: source.name, status: 'fresh', method: strategy.method, offers, latencyMs };
  } catch (error) {
    return {
      id: source.id,
      name: source.name,
      status: error instanceof Error && error.name === 'AbortError' ? 'stale' : 'failed',
      method: strategy.method,
      offers: [],
      latencyMs: Date.now() - started,
      error: error instanceof Error ? `${error.message} via ${strategy.name}` : `fetch failed via ${strategy.name}`,
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function crawlSource(source: SourceDefinition, query: string): Promise<SourceResult> {
  const started = Date.now();
  const attempts: string[] = [];
  let last: SourceResult | undefined;
  for (const strategy of source.strategies) {
    attempts.push(strategy.name);
    const result = await tryStrategy(source, strategy, query);
    if (result.offers.length > 0) {
      return { ...result, latencyMs: Date.now() - started, error: attempts.length > 1 ? `fallback chain: ${attempts.join(' → ')}` : undefined };
    }
    last = result;
  }
  return {
    id: source.id,
    name: source.name,
    status: last?.status ?? 'failed',
    method: last?.method ?? 'http',
    offers: [],
    latencyMs: Date.now() - started,
    error: `all strategies exhausted: ${attempts.join(' → ')}`,
  };
}

export async function crawlAll(query: string): Promise<SourceResult[]> {
  return Promise.all(SOURCES.map((source) => crawlSource(source, query)));
}
