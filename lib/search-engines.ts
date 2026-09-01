import * as cheerio from 'cheerio';

export type SearchEngineId = 'google' | 'bing' | 'brave' | 'duckduckgo' | 'yahoo';

export interface SearchHit {
  title: string;
  url: string;
  domain: string;
  snippet: string;
  engine: SearchEngineId;
}

export interface SearchEngineDefinition {
  id: SearchEngineId;
  name: string;
  buildUrl: (query: string, site?: string) => string;
  extract: (html: string, engine: SearchEngineId) => SearchHit[];
}

const q = (value: string) => encodeURIComponent(value.trim());

function hostOf(raw: string) {
  try { return new URL(raw).hostname.toLowerCase().replace(/^www\./, ''); } catch { return ''; }
}

function validTarget(raw: string) {
  try {
    const u = new URL(raw);
    const host = u.hostname.toLowerCase();
    if (!['http:', 'https:'].includes(u.protocol)) return false;
    if (!host || ['localhost', '127.0.0.1', '0.0.0.0'].includes(host) || host.endsWith('.local')) return false;
    if (/^\d+(?:\.\d+){3}$/.test(host)) return false;
    return true;
  } catch { return false; }
}

function normalizeHit(title: string, href: string, snippet: string, engine: SearchEngineId): SearchHit | undefined {
  if (!title || !validTarget(href)) return undefined;
  const domain = hostOf(href);
  if (!domain || ['google.com', 'bing.com', 'brave.com', 'search.brave.com', 'duckduckgo.com', 'yahoo.com'].some((x) => domain === x || domain.endsWith(`.${x}`))) return undefined;
  return { title: title.replace(/\s+/g, ' ').trim().slice(0, 160), url: href, domain, snippet: snippet.replace(/\s+/g, ' ').trim().slice(0, 300), engine };
}

function genericExtract(html: string, engine: SearchEngineId, selectors: string[]) {
  const $ = cheerio.load(html);
  const hits: SearchHit[] = [];
  const seen = new Set<string>();
  for (const selector of selectors) {
    $(selector).each((_, el) => {
      if (hits.length >= 40) return;
      const a = $(el);
      const href = a.attr('href');
      if (!href || !/^https?:\/\//i.test(href)) return;
      const title = a.text().replace(/\s+/g, ' ').trim();
      const container = a.closest('article,li,div').first();
      const snippet = container.text().replace(/\s+/g, ' ').trim().replace(title, '').trim();
      const hit = normalizeHit(title, href, snippet, engine);
      if (!hit || seen.has(hit.domain)) return;
      seen.add(hit.domain);
      hits.push(hit);
    });
    if (hits.length >= 40) break;
  }
  return hits;
}

function extractGoogle(html: string, engine: SearchEngineId) {
  const $ = cheerio.load(html);
  const hits: SearchHit[] = [];
  const seen = new Set<string>();
  $('div.MjjYud a[href], a[href]').each((_, el) => {
    if (hits.length >= 40) return;
    const a = $(el);
    const href = a.attr('href');
    if (!href || !/^https?:\/\//i.test(href)) return;
    const title = a.find('h3').first().text().trim() || a.text().replace(/\s+/g, ' ').trim();
    const snippet = a.closest('div.MjjYud').text().replace(/\s+/g, ' ').trim().replace(title, '').trim();
    const hit = normalizeHit(title, href, snippet, engine);
    if (!hit || seen.has(hit.domain)) return;
    seen.add(hit.domain); hits.push(hit);
  });
  return hits.length ? hits : genericExtract(html, engine, ['a[href]']);
}

export const SEARCH_ENGINES: readonly SearchEngineDefinition[] = [
  {
    id: 'google', name: 'Google',
    buildUrl: (query, site) => `https://www.google.com/search?q=${q(site ? `site:${site} ${query}` : query)}&num=20`,
    extract: extractGoogle,
  },
  {
    id: 'bing', name: 'Bing',
    buildUrl: (query, site) => `https://www.bing.com/search?q=${q(site ? `site:${site} ${query}` : query)}&count=20`,
    extract: (html, engine) => genericExtract(html, engine, ['li.b_algo h2 a', 'a[href]']),
  },
  {
    id: 'brave', name: 'Brave Search',
    buildUrl: (query, site) => `https://search.brave.com/search?q=${q(site ? `site:${site} ${query}` : query)}&source=web`,
    extract: (html, engine) => genericExtract(html, engine, ['a[href]', 'div.snippet a[href]']),
  },
  {
    id: 'duckduckgo', name: 'DuckDuckGo',
    buildUrl: (query, site) => `https://html.duckduckgo.com/html/?q=${q(site ? `site:${site} ${query}` : query)}&kl=ir-fa`,
    extract: (html, engine) => genericExtract(html, engine, ['a.result__a', 'a[href]']),
  },
  {
    id: 'yahoo', name: 'Yahoo',
    buildUrl: (query, site) => `https://search.yahoo.com/search?p=${q(site ? `site:${site} ${query}` : query)}&n=20`,
    extract: (html, engine) => genericExtract(html, engine, ['div#web h3 a', 'a[href]']),
  },
];

export async function searchWeb(query: string, engines: readonly SearchEngineId[] = SEARCH_ENGINES.map((x) => x.id), site?: string) {
  const selected = SEARCH_ENGINES.filter((x) => engines.includes(x.id));
  const responses = await Promise.allSettled(selected.map(async (engine) => {
    const started = Date.now();
    const response = await fetch(engine.buildUrl(query, site), {
      cache: 'no-store',
      signal: AbortSignal.timeout(9000),
      headers: {
        'user-agent': 'ComparisSearch/1.0',
        accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
        'accept-language': 'fa-IR,fa;q=0.9,en;q=0.7',
      },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const html = await response.text();
    return { engine: engine.id, hits: engine.extract(html, engine.id), latencyMs: Date.now() - started };
  }));
  return responses.map((result, index) => result.status === 'fulfilled'
    ? result.value
    : { engine: selected[index].id, hits: [], latencyMs: 0, error: result.reason instanceof Error ? result.reason.message : 'search failed' });
}
