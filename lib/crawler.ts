import * as cheerio from 'cheerio';
import type { Offer, SourceResult } from './types';
import { SOURCES, parsePrice, type SourceDefinition } from './sources';
import { dedupeOffers } from './match';

const UA = 'ComparisBot/0.4 (+https://github.com/madmaxmehdi44/comparis)';
const MAX_OFFERS = 30;

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

function jsonLdOffers(raw: unknown, source: SourceDefinition, url: string, observedAt: string): Offer[] {
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
        const rawPrice = String(offer.price ?? offer.lowPrice ?? '');
        const price = parsePrice(rawPrice);
        if (price == null) continue;

        out.push({
          sourceId: source.id,
          source: source.name,
          url,
          title: product.name,
          price,
          currency: 'IRT',
          availability: availability(offer.availability),
          observedAt,
          status: 'fresh',
          method: source.method,
          confidence: 0.98,
        });
      }
    }
  }

  return out;
}

function extractOffers(html: string, source: SourceDefinition, url: string, observedAt: string): Offer[] {
  const $ = cheerio.load(html);
  const out: Offer[] = [];

  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      out.push(...jsonLdOffers(JSON.parse($(el).text()), source, url, observedAt));
    } catch {
      // Ignore malformed JSON-LD and continue with DOM extraction.
    }
  });

  const seen = new Set(out.map((x) => `${x.title}|${x.price}|${x.url}`));
  $('a[href]').each((_, a) => {
    if (out.length >= MAX_OFFERS) return;
    const title = $(a).text().replace(/\s+/g, ' ').trim();
    if (title.length < 8) return;

    const price = parsePrice(title);
    const href = absoluteUrl(url, $(a).attr('href'));
    if (price == null || price < 10_000 || !href) return;

    const key = `${title}|${price}|${href}`;
    if (seen.has(key)) return;
    seen.add(key);

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
      method: source.method,
      confidence: 0.60,
    });
  });

  return dedupeOffers(out).slice(0, MAX_OFFERS);
}

export async function crawlSource(source: SourceDefinition, query: string): Promise<SourceResult> {
  const started = Date.now();
  const url = source.buildUrl(query);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), source.timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      cache: 'no-store',
      redirect: 'follow',
      headers: {
        'user-agent': UA,
        accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
      },
    });

    clearTimeout(timer);
    const latencyMs = Date.now() - started;

    if (!response.ok) {
      return {
        id: source.id,
        name: source.name,
        status: response.status === 403 || response.status === 429 ? 'blocked' : 'failed',
        method: source.method,
        offers: [],
        latencyMs,
        error: `HTTP ${response.status}`,
      };
    }

    const html = await response.text();
    const offers = extractOffers(html, source, url, new Date().toISOString());

    return {
      id: source.id,
      name: source.name,
      status: 'fresh',
      method: source.method,
      offers,
      latencyMs,
    };
  } catch (error) {
    clearTimeout(timer);
    const timeout = error instanceof Error && error.name === 'AbortError';
    return {
      id: source.id,
      name: source.name,
      status: timeout ? 'stale' : 'failed',
      method: source.method,
      offers: [],
      latencyMs: Date.now() - started,
      error: timeout ? 'timeout' : error instanceof Error ? error.message : 'fetch failed',
    };
  }
}

export async function crawlAll(query: string): Promise<SourceResult[]> {
  return Promise.all(SOURCES.map((source) => crawlSource(source, query)));
}
