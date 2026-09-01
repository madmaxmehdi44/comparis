import * as cheerio from 'cheerio';

export interface CandidateSource {
  id: string;
  name: string;
  domain: string;
  url: string;
  description: string;
  logo: string;
  relevance: number;
  priority: number;
  signals: {
    topic: number;
    commerce: number;
    productSchema: number;
    price: number;
    persian: number;
    reliability: number;
    searchPresence: number;
    catalog: number;
  };
  reasons: string[];
}

function clamp(value: number) { return Math.max(0, Math.min(1, value)); }
function hostOf(raw: string) {
  try { return new URL(raw).hostname.toLowerCase().replace(/^www\./, ''); } catch { return ''; }
}
function tokenize(value: string) {
  return value.toLowerCase().normalize('NFKC').replace(/[\u200c\u200f\u202a-\u202e]/g, ' ').split(/[^\p{L}\p{N}]+/u).filter((x) => x.length > 2);
}
function overlap(a: string[], b: string[]) {
  const right = new Set(b);
  return a.length ? clamp(a.filter((x) => right.has(x)).length / a.length) : 0;
}

function textSignals(html: string, topic: string) {
  const $ = cheerio.load(html);
  const title = $('title').first().text();
  const description = $('meta[name="description"]').attr('content') ?? $('meta[property="og:description"]').attr('content') ?? '';
  const headings = $('h1,h2,h3').map((_, el) => $(el).text()).get().join(' ');
  const text = `${title} ${description} ${headings} ${$('body').text()}`.replace(/\s+/g, ' ').slice(0, 150000);
  const topicTokens = tokenize(topic);
  const siteTokens = tokenize(`${title} ${description} ${headings}`);
  const bodyTokens = tokenize(text.slice(0, 50000));
  const topicScore = clamp(0.65 * overlap(topicTokens, siteTokens) + 0.35 * overlap(topicTokens, bodyTokens));
  const commerceTerms = ['خرید','فروش','قیمت','تومان','موجود','سبد خرید','فروشگاه','shop','cart','price','buy','product','محصول'];
  const commerceHits = commerceTerms.reduce((n, token) => n + (text.toLowerCase().includes(token) ? 1 : 0), 0);
  const commerce = clamp(commerceHits / 6);
  const productSchema = $('script[type="application/ld+json"]').toArray().some((el) => /Product|Offer|ItemList/.test($(el).text())) ? 1 : 0;
  const price = /\b\d[\d,.\s]{3,}\s*(?:تومان|تومن|ریال|irr|irt|rial|toman)?\b/i.test(text) ? 1 : 0;
  const productLinks = $('a[href]').filter((_, el) => /product|shop|store|کالا|محصول|خرید/i.test($(el).attr('href') ?? '') || /خرید|قیمت|مشخصات|محصول|کالا|product|price/i.test($(el).text())).length;
  const catalog = clamp(productLinks / 12);
  const persianChars = (text.match(/[\u0600-\u06ff]/g) ?? []).length;
  const persian = clamp(persianChars / 700);
  const canonical = $('link[rel="canonical"]').attr('href');
  return { $, title, description, topic: topicScore, commerce, productSchema, price, persian, canonical, catalog };
}

export async function qualifyCandidate(candidate: { id: string; name: string; domain: string; url: string }, topic: string, searchPresence = 0.5): Promise<CandidateSource | undefined> {
  const domain = hostOf(candidate.url) || candidate.domain;
  if (!domain || domain.includes('google.') || domain.includes('bing.')) return undefined;
  const started = Date.now();
  try {
    const response = await fetch(candidate.url, {
      redirect: 'follow', cache: 'no-store', signal: AbortSignal.timeout(6500),
      headers: { 'user-agent': 'ComparisDiscovery/1.1', accept: 'text/html,application/xhtml+xml', 'accept-language': 'fa-IR,fa;q=0.9,en;q=0.7' },
    });
    if (!response.ok) return undefined;
    const html = await response.text();
    const s = textSignals(html, topic);
    const latency = Date.now() - started;
    const reliability = latency < 2500 ? 1 : latency < 5000 ? 0.8 : 0.6;
    const score = clamp(
      0.24 * s.topic +
      0.18 * s.commerce +
      0.14 * s.productSchema +
      0.10 * s.price +
      0.08 * s.persian +
      0.08 * s.catalog +
      0.10 * reliability +
      0.08 * searchPresence,
    );
    if (score < 0.44) return undefined;
    const reasons: string[] = [];
    if (s.topic >= 0.5) reasons.push('مرتبط با موضوع');
    if (s.commerce >= 0.6) reasons.push('نشانه‌های فروشگاهی');
    if (s.productSchema) reasons.push('Product/Offer schema');
    if (s.price) reasons.push('نشانه قیمت');
    if (s.catalog >= 0.5) reasons.push('کاتالوگ محصول');
    if (s.persian >= 0.5) reasons.push('محتوای فارسی');
    return {
      id: candidate.id,
      name: candidate.name,
      domain,
      url: response.url || candidate.url,
      description: s.description || s.title || `منبع مرتبط با «${topic}»`,
      logo: `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`,
      relevance: score,
      priority: Math.round(score * 100),
      signals: {
        topic: s.topic,
        commerce: s.commerce,
        productSchema: s.productSchema,
        price: s.price,
        persian: s.persian,
        reliability,
        searchPresence,
        catalog: s.catalog,
      },
      reasons,
    };
  } catch { return undefined; }
}

export function rankSources(sources: CandidateSource[], limit = 12) {
  const remaining = [...sources];
  const selected: CandidateSource[] = [];
  while (remaining.length && selected.length < limit) {
    let bestIndex = 0;
    let bestAdjusted = -1;
    for (let i = 0; i < remaining.length; i++) {
      const candidate = remaining[i];
      const sameFamily = selected.filter((x) => x.domain.split('.').slice(-2).join('.') === candidate.domain.split('.').slice(-2).join('.')).length;
      const diversityPenalty = Math.min(0.12, sameFamily * 0.04);
      const adjusted = candidate.relevance - diversityPenalty;
      if (adjusted > bestAdjusted) { bestAdjusted = adjusted; bestIndex = i; }
    }
    selected.push(remaining.splice(bestIndex, 1)[0]);
  }
  return selected;
}
