import { chromium } from 'playwright';
import * as cheerio from 'cheerio';
import type { Element } from 'domhandler';
import type { Offer, SourceResult } from './types';
import type { SourceDefinition, SourceStrategy } from './sources';
import { dedupeOffers } from './match';
import { normalizeText, parsePrice } from './sources';

const MAX_OFFERS = 30;
const UA = 'ComparisPlaywright/1.0';
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

function extractJsonLd(rawText: string, source: SourceDefinition, strategy: SourceStrategy, pageUrl: string, observedAt: string): Offer[] {
  const out: Offer[] = [];
  try {
    const parsed = JSON.parse(rawText);
    const nodes = Array.isArray(parsed) ? parsed : [parsed];
    for (const node of nodes) {
      if (!node || typeof node !== 'object') continue;
      const record = node as Record<string, unknown>;
      const graph = Array.isArray(record['@graph']) ? record['@graph'] : [node];
      for (const item of graph) {
        if (!item || typeof item !== 'object') continue;
        const product = item as Record<string, unknown>;
        if (!isProductType(product['@type']) || typeof product.name !== 'string') continue;
        const offers = Array.isArray(product.offers) ? product.offers : [product.offers];
        for (const rawOffer of offers) {
          if (!rawOffer || typeof rawOffer !== 'object') continue;
          const offer = rawOffer as Record<string, unknown>;
          const price = parsePrice(String(offer.price ?? offer.lowPrice ?? offer.highPrice ?? ''));
          if (price == null) continue;
          out.push({
            sourceId: source.id,
            source: source.name,
            url: absoluteUrl(pageUrl, typeof offer.url === 'string' ? offer.url : undefined) ?? pageUrl,
            title: normalizeText(product.name),
            price,
            currency: /ریال|rial|irr/i.test(String(offer.priceCurrency ?? '')) ? 'IRR' : 'IRT',
            availability: availability(offer.availability),
            observedAt,
            status: 'fresh',
            method: 'http',
            confidence: 0.98,
          });
        }
      }
    }
  } catch {}
  return out;
}

function extractDomOffers(html: string, source: SourceDefinition, pageUrl: string, observedAt: string): Offer[] {
  const $ = cheerio.load(html);
  const out: Offer[] = [];
  const seen = new Set<string>();
  const roots = new Set<Element>();
  $('[itemtype*="Product"], [itemscope][itemtype*="Product"], article, li, .product, .product-item, .product-card, .product-box, .item, .card').each((_, el) => {
    const element = el as Element;
    const signature = `${$(element).attr('class') ?? ''} ${$(element).attr('itemtype') ?? ''}`;
    if (PRODUCT_HINT.test(signature) || $(element).attr('itemtype')) roots.add(element);
  });

  const titleOf = (root: Element) => [
    $(root).find('[itemprop="name"]').first().text(),
    $(root).find('h1,h2,h3,h4,.product-title,.product-name,.title').first().text(),
    $(root).attr('aria-label'),
    $(root).find('img[alt]').first().attr('alt'),
  ].filter(Boolean).map((v) => normalizeText(String(v))).find((v) => v.length >= 5);

  const priceOf = (root: Element) => {
    const candidates = [
      $(root).attr('data-price'),
      $(root).attr('data-product-price'),
      $(root).find('[itemprop="price"]').first().attr('content'),
      $(root).find('[itemprop="price"]').first().text(),
      $(root).find('[data-price]').first().attr('data-price'),
      $(root).find('.price,.product-price,.price-final,.amount,.woocommerce-Price-amount,.sale-price,.regular-price').first().text(),
      $(root).text(),
    ].filter(Boolean) as string[];
    for (const value of candidates) {
      const price = parsePrice(value);
      if (price != null && price >= 10_000) return price;
    }
    return undefined;
  };

  for (const root of roots) {
    if (out.length >= MAX_OFFERS) break;
    const title = titleOf(root);
    const price = priceOf(root);
    if (!title || price == null) continue;
    const href = absoluteUrl(pageUrl, $(root).find('a[href]').first().attr('href') ?? $(root).closest('a[href]').attr('href'));
    if (!href) continue;
    const key = `${title}|${price}|${href}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      sourceId: source.id,
      source: source.name,
      url: href,
      title,
      price,
      currency: 'IRT',
      availability: availability($(root).text()),
      observedAt,
      status: 'fresh',
      method: 'http',
      confidence: 0.90,
    });
  }
  return dedupeOffers(out).slice(0, MAX_OFFERS);
}

export async function crawlWithPlaywright(source: SourceDefinition, query: string, timeoutMs = 9000): Promise<SourceResult> {
  const started = Date.now();
  const target = source.strategies[0]?.buildUrl(query);
  if (!target) return { id: source.id, name: source.name, status: 'failed', method: 'http', offers: [], latencyMs: 0, error: 'no source URL' };

  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      locale: 'fa-IR',
      viewport: { width: 1440, height: 900 },
      userAgent: UA,
      colorScheme: 'light',
    });
    const page = await context.newPage();
    const requests: string[] = [];
    const responses: Array<{ url: string; status: number; type: string }> = [];
    page.on('request', (request) => {
      if (['xhr', 'fetch'].includes(request.resourceType())) requests.push(`${request.method()} ${request.url()}`);
    });
    page.on('response', (response) => {
      if (['xhr', 'fetch'].includes(response.request().resourceType())) responses.push({ url: response.url(), status: response.status(), type: response.request().resourceType() });
    });

    await page.goto(target, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
    await page.waitForLoadState('networkidle', { timeout: Math.min(timeoutMs, 5000) }).catch(() => undefined);
    await page.waitForTimeout(250);

    const html = await page.content();
    const observedAt = new Date().toISOString();
    const offers: Offer[] = [];
    const jsonScripts = await page.locator('script[type="application/ld+json"]').allTextContents();
    for (const script of jsonScripts) offers.push(...extractJsonLd(script, source, source.strategies[0], page.url(), observedAt));
    if (!offers.length) offers.push(...extractDomOffers(html, source, page.url(), observedAt));

    if (!offers.length) {
      const visibleText = await page.locator('body').innerText({ timeout: 3000 }).catch(() => '');
      const selector = page.locator('[data-price], [itemprop="price"], .price, .product-price, .amount');
      const count = await selector.count();
      if (visibleText.length > 100 && count > 0) {
        return { id: source.id, name: source.name, status: 'partial', method: 'http', offers: [], latencyMs: Date.now() - started, error: `browser rendered ${count} price nodes but parser found no valid offers`, diagnostics: { finalUrl: page.url(), requests: requests.slice(-50), responses: responses.slice(-50) } };
      }
    }

    return {
      id: source.id,
      name: source.name,
      status: offers.length ? 'fresh' : 'failed',
      method: 'http',
      offers: dedupeOffers(offers).slice(0, MAX_OFFERS),
      latencyMs: Date.now() - started,
      error: offers.length ? undefined : 'no offers extracted via Playwright',
      diagnostics: { finalUrl: page.url(), title: await page.title(), requests: requests.slice(-50), responses: responses.slice(-50) },
    };
  } catch (error) {
    return {
      id: source.id,
      name: source.name,
      status: 'failed',
      method: 'http',
      offers: [],
      latencyMs: Date.now() - started,
      error: error instanceof Error ? `Playwright unavailable/failed: ${error.message}` : 'Playwright failed',
    };
  } finally {
    await browser?.close().catch(() => undefined);
  }
}
