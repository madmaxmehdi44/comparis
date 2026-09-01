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
  };
  reasons: string[];
}

function clamp(value: number) { return Math.max(0, Math.min(1, value)); }
function hostOf(raw: string) {
  try { return new URL(raw).hostname.toLowerCase().replace(/^www\./, ''); } catch { return ''; }
}

function textSignals(html: string, topic: string) {
  const $ = cheerio.load(html);
  const title = $('title').first().text();
  const description = $('meta[name="description"]').attr('content') ?? $('meta[property="og:description"]').attr('content') ?? '';
  const text = `${title} ${description} ${$('body').text()}`.replace(/\s+/g, ' ').slice(0, 120000).toLowerCase();
  const topicTokens = topic.toLowerCase().split(/\s+/).filter((x) => x.length > 2);
  const hits = topicTokens.filter((token) => text.includes(token)).length;
  const topicScore = topicTokens.length ? clamp(hits / topicTokens.length) : 0;
  const commerceHits = ['خرید','فروش','قیمت','تومان','موجود','سبد خرید','فروشگاه','shop','cart','price','buy'].reduce((n, token) => n + (text.includes(token) ? 1 : 0), 0);
  const commerce = clamp(commerceHits / 5);
  const productSchema = $('script[type="application/ld+json"]').toArray().some((el) => /Product|Offer/.test($(el).text())) ? 1 : 0;
  const price = /\b\d[\d,.\s]{3,}\s*(?:تومان|تومن|ریال|irr|irt|rial|toman)?\b/i.test(text) ? 1 : 0;
  const persianChars = (text.match(/[\u0600-\u06ff]/g) ?? []).length;
  const persian = clamp(persianChars / 500);
  const canonical = $('link[rel="canonical"]').attr('href');
  return { $, title, description, topic: topicScore, commerce, productSchema, price, persian, canonical };
}

export async function qualifyCandidate(candidate: { id: string; name: string; domain: string; url: string }, topic: string): Promise<CandidateSource | undefined> {
  const domain = hostOf(candidate.url) || candidate.domain;
  if (!domain || domain.includes('google.') || domain.includes('bing.')) return undefined;
  const started = Date.now();
  try {
    const response = await fetch(candidate.url, {
      redirect: 'follow', cache: 'no-store', signal: AbortSignal.timeout(6500),
      headers: { 'user-agent': 'ComparisDiscovery/1.0', accept: 'text/html,application/xhtml+xml', 'accept-language': 'fa-IR,fa;q=0.9,en;q=0.7' },
    });
    if (!response.ok) return undefined;
    const html = await response.text();
    const s = textSignals(html, topic);
    const finalUrl = response.url || candidate.url;
    const score = clamp(
      0.30 * s.topic +
      0.20 * s.commerce +
      0.15 * s.productSchema +
      0.10 * s.price +
      0.10 * s.persian +
      0.10 * (response.ok ? 1 : 0) +
      0.05 * (Date.now() - started < 3500 ? 1 : 0),
    );
    if (score < 0.42) return undefined;
    const reasons: string[] = [];
    if (s.topic >= 0.5) reasons.push('ارتباط مستقیم با موضوع');
    if (s.commerce >= 0.6) reasons.push('نشانه‌های فروشگاهی');
    if (s.productSchema) reasons.push('Product/Offer schema');
    if (s.price) reasons.push('سیگنال قیمت');
    if (s.persian >= 0.5) reasons.push('محتوای فارسی');
    return {
      id: candidate.id,
      name: candidate.name,
      domain,
      url: finalUrl,
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
        reliability: Date.now() - started < 3500 ? 1 : 0.7,
      },
      reasons,
    };
  } catch { return undefined; }
}

export function rankSources(sources: CandidateSource[], limit = 12) {
  return [...sources]
    .sort((a, b) => b.relevance - a.relevance || b.priority - a.priority || a.domain.localeCompare(b.domain))
    .slice(0, limit);
}
