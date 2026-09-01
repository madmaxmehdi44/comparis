import * as cheerio from 'cheerio';
import type { Element } from 'domhandler';
import type { Offer, SourceResult, RetrievalMethod } from './types';
import { SOURCES, parsePrice, type SourceDefinition, type SourceStrategy, normalizeText } from './sources';
import { dedupeOffers } from './match';

const UA = 'ComparisBot/0.7 (+https://github.com/madmaxmehdi44/comparis)';
const MAX_OFFERS = 30;
const BLOCKED_STATUSES = new Set([401, 403, 406, 409, 429, 451]);
const PRODUCT_HINT = /(product|item|card|tile|listing|result|price|product-item|woocommerce)/i;

function absoluteUrl(base: string, href?: string) {
  if (!href) return undefined;
  try { return new URL(href, base).toString(); } catch { return undefined; }
}

function availability(value: unknown): string {
  if (typeof value !== 'string') return 'unknown';
  const v = normalizeText(value).toLowerCase();
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
        const price = parsePrice(String(offer.price ?? offer.lowPrice ?? offer.highPrice ?? ''));
        if (price == null) continue;
        out.push({
          sourceId: source.id, source: source.name,
          url: absoluteUrl(url, typeof offer.url === 'string' ? offer.url : undefined) ?? url,
          title: normalizeText(product.name), price, currency: 'IRT', availability: availability(offer.availability),
          observedAt, status: 'fresh', method: strategy.method as RetrievalMethod,
          confidence: strategy.kind === 'search-engine' ? 0.88 : 0.99,
        });
      }
    }
  }
  return out;
}

function text($: cheerio.CheerioAPI, node: unknown): string {
  return normalizeText($(node as Element).text().replace(/\s+/g, ' ').trim());
}

function elementPrice($: cheerio.CheerioAPI, root: Element): number | undefined {
  const candidates = [
    $(root).attr('data-price'),
    $(root).attr('data-product-price'),
    $(root).find('[itemprop="price"]').first().attr('content'),
    $(root).find('[itemprop="price"]').first().text(),
    $(root).find('[data-price]').first().attr('data-price'),
    $(root).find('.price, .product-price, .price-final, .amount, .woocommerce-Price-amount, .sale-price, .regular-price').first().text(),
  ].filter(Boolean) as string[];
  for (const candidate of candidates) {
    const parsed = parsePrice(candidate);
    if (parsed != null) return parsed;
  }
  return undefined;
}

function elementTitle($: cheerio.CheerioAPI, root: Element): string | undefined {
  const candidates = [
    $(root).find('[itemprop="name"]').first().text(),
    $(root).find('h1,h2,h3,h4,.product-title,.product-name,.title').first().text(),
    $(root).attr('aria-label'),
    $(root).find('img[alt]').first().attr('alt'),
  ].filter(Boolean).map((value) => normalizeText(String(value)));
  return candidates.find((value) => value.length >= 5);
}

function extractPageOffers(html: string, source: SourceDefinition, strategy: SourceStrategy, url: string, observedAt: string): Offer[] {
  const $ = cheerio.load(html);
  const out: Offer[] = [];

  $('script[type="application/ld+json"]').each((_, el) => {
    try { out.push(...jsonLdOffers(JSON.parse($(el).text()), source, strategy, url, observedAt)); } catch { /* malformed JSON-LD */ }
  });

  const seen = new Set(out.map((x) => `${x.title}|${x.price}|${x.url}`));
  const roots = new Set<Element>();
  $('[itemtype*="Product"], [itemscope][itemtype*="Product"], article, li, .product, .product-item, .product-card, .product-box, .item, .card').each((_, el) => {
    const element = el as Element;
    const signature = `${$(element).attr('class') ?? ''} ${$(element).attr('itemtype') ?? ''}`;
    if (PRODUCT_HINT.test(signature) || $(element).attr('itemtype')) roots.add(element);
  });

  for (const root of roots) {
    if (out.length >= MAX_OFFERS) break;
    const title = elementTitle($, root);
    const price = elementPrice($, root);
    if (!title || price == null || price < 10_000) continue;
    const href = absoluteUrl(url, $(root).find('a[href]').first().attr('href') ?? $(root).closest('a[href]').attr('href'));
    if (!href) continue;
    const key = `${title}|${price}|${href}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ sourceId: source.id, source: source.name, url: href, title, price, currency: 'IRT', availability: availability(text($, root)), observedAt, status: 'fresh', method: strategy.method as RetrievalMethod, confidence: strategy.kind === 'search-engine' ? 0.68 : 0.86 });
  }

  // Last-resort link extraction: only inspect compact anchors that contain price-like context.
  $('a[href]').each((_, a: Element) => {
    if (out.length >= MAX_OFFERS) return;
    const anchorText = text($, a);
    if (anchorText.length < 8 || anchorText.length > 320) return;
    const price = parsePrice(anchorText);
    if (price == null || price < 10_000) return;
    const title = elementTitle($, $(a).closest('article,li,div').get(0) as Element) ?? anchorText.replace(/(?:قیمت|قیمت نهایی|تومان|تومن|ریال|خرید|فروش).*/i, '').trim();
    const href = absoluteUrl(url, $(a).attr('href'));
    if (!href || title.length < 5) return;
    const key = `${title}|${price}|${href}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ sourceId: source.id, source: source.name, url: href, title: normalizeText(title), price, currency: 'IRT', availability: 'unknown', observedAt, status: 'fresh', method: strategy.method as RetrievalMethod, confidence: strategy.kind === 'search-engine' ? 0.52 : 0.62 });
  });

  return dedupeOffers(out).slice(0, MAX_OFFERS);
}

function extractIndexedOffers(html: string, source: SourceDefinition, strategy: SourceStrategy, engineUrl: string, query: string, observedAt: string): Offer[] {
  const $ = cheerio.load(html);
  const out: Offer[] = [];
  const host = new URL(source.strategies[0].buildUrl(query)).hostname.replace(/^www\./, '');
  const seen = new Set<string>();
  $('a[href]').each((_, a: Element) => {
    if (out.length >= MAX_OFFERS) return;
    const href = absoluteUrl(engineUrl, $(a).attr('href'));
    if (!href) return;
    let target: URL;
    try { target = new URL(href); } catch { return; }
    if (!target.hostname.replace(/^www\./, '').endsWith(host)) return;
    const container = $(a).closest('div,li,article').first();
    const containerText = normalizeText(container.text().replace(/\s+/g, ' ').trim());
    if (containerText.length < 10 || containerText.length > 900) return;
    const price = parsePrice(containerText);
    if (price == null || price < 10_000) return;
    const title = normalizeText($(a).text().replace(/\s+/g, ' ').trim()) || containerText.slice(0, 180);
    if (title.length < 5) return;
    const key = `${title}|${price}|${href}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ sourceId: source.id, source: source.name, url: href, title, price, currency: 'IRT', availability: 'unknown', observedAt, status: 'fresh', method: 'search', confidence: 0.74 });
  });
  return dedupeOffers(out).slice(0, MAX_OFFERS);
}

function classifyFailure(status: number): SourceResult['status'] { return BLOCKED_STATUSES.has(status) ? 'blocked' : 'failed'; }

async function tryStrategy(source: SourceDefinition, strategy: SourceStrategy, query: string): Promise<SourceResult> {
  const started = Date.now();
  const url = strategy.buildUrl(query);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), strategy.timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal, cache: 'no-store', redirect: 'follow', headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8', 'accept-language': 'fa-IR,fa;q=0.9,en;q=0.6' } });
    const latencyMs = Date.now() - started;
    if (!response.ok) return { id: source.id, name: source.name, status: classifyFailure(response.status), method: strategy.method, offers: [], latencyMs, error: `HTTP ${response.status} via ${strategy.name}` };
    const html = await response.text();
    const observedAt = new Date().toISOString();
    const offers = strategy.kind === 'search-engine' ? extractIndexedOffers(html, source, strategy, response.url || url, query, observedAt) : extractPageOffers(html, source, strategy, response.url || url, observedAt);
    if (!offers.length) return { id: source.id, name: source.name, status: 'failed', method: strategy.method, offers: [], latencyMs, error: `no offers via ${strategy.name}` };
    return { id: source.id, name: source.name, status: 'fresh', method: strategy.method, offers, latencyMs };
  } catch (error) {
    const timedOut = error instanceof Error && error.name === 'AbortError';
    return { id: source.id, name: source.name, status: timedOut ? 'stale' : 'failed', method: strategy.method, offers: [], latencyMs: Date.now() - started, error: timedOut ? `timeout via ${strategy.name}` : `${error instanceof Error ? error.message : 'fetch failed'} via ${strategy.name}` };
  } finally { clearTimeout(timer); }
}

export async function crawlSource(source: SourceDefinition, query: string): Promise<SourceResult> {
  const started = Date.now();
  const attempts: string[] = [];
  let last: SourceResult | undefined;
  for (const strategy of source.strategies) {
    attempts.push(strategy.name);
    const result = await tryStrategy(source, strategy, query);
    if (result.offers.length) return { ...result, latencyMs: Date.now() - started, error: attempts.length > 1 ? `fallback chain: ${attempts.join(' → ')}` : undefined };
    last = result;
  }
  return { id: source.id, name: source.name, status: last?.status ?? 'failed', method: last?.method ?? 'http', offers: [], latencyMs: Date.now() - started, error: `all strategies exhausted: ${attempts.join(' → ')}` };
}

export async function crawlAll(query: string): Promise<SourceResult[]> { return Promise.all(SOURCES.map((source) => crawlSource(source, query))); }
