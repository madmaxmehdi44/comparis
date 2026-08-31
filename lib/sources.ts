export type SourceId = 'torob' | 'digikala' | 'emalls';
export type RetrievalMethod = 'http' | 'search';

export interface SourceStrategy {
  name: string;
  method: RetrievalMethod;
  timeoutMs: number;
  buildUrl: (query: string) => string;
  kind: 'site' | 'search-engine';
}

export interface SourceDefinition {
  id: SourceId;
  name: string;
  strategies: readonly SourceStrategy[];
}

const q = (query: string) => encodeURIComponent(query.trim());
const normalized = (query: string) => q(query.replace(/[\-_/]+/g, ' '));

function siteStrategies(siteSearch: (query: string) => string, site: string): readonly SourceStrategy[] {
  return [
    { name: 'direct-search', method: 'http', timeoutMs: 6500, kind: 'site', buildUrl: siteSearch },
    { name: 'normalized-search', method: 'http', timeoutMs: 6500, kind: 'site', buildUrl: (x) => siteSearch(decodeURIComponent(normalized(x))) },
    { name: 'google-index', method: 'search', timeoutMs: 7500, kind: 'search-engine', buildUrl: (x) => `https://www.google.com/search?q=${q(`site:${site} ${x}`)}` },
    { name: 'bing-index', method: 'search', timeoutMs: 7500, kind: 'search-engine', buildUrl: (x) => `https://www.bing.com/search?q=${q(`site:${site} ${x}`)}` },
  ] as const;
}

export const SOURCES: readonly SourceDefinition[] = [
  {
    id: 'torob', name: 'ترب',
    strategies: siteStrategies((x) => `https://torob.com/search/?query=${q(x)}`, 'torob.com'),
  },
  {
    id: 'digikala', name: 'دیجی‌کالا',
    strategies: siteStrategies((x) => `https://www.digikala.com/search/?q=${q(x)}`, 'digikala.com'),
  },
  {
    id: 'emalls', name: 'ایمالز',
    strategies: siteStrategies((x) => `https://emalls.ir/Search.aspx?Search=${q(x)}`, 'emalls.ir'),
  },
] as const;

export function normalizeDigits(input: string): string {
  return input
    .replace(/[۰-۹]/g, (c) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(c)))
    .replace(/[٠-٩]/g, (c) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(c)));
}

export function parsePrice(text: string): number | undefined {
  const normalized = normalizeDigits(text).replace(/[٬،]/g, ',');
  const match = normalized.match(/\d[\d\s.,]*/);
  if (!match) return undefined;
  const compact = match[0].replace(/[\s,]/g, '');
  const value = Number(compact);
  if (!Number.isFinite(value) || value <= 0) return undefined;

  const lowered = normalized.toLowerCase();
  const explicitlyToman = /تومان|تومن|toman/.test(lowered);
  const explicitlyRial = /ریال|rial|irr/.test(lowered);
  if (explicitlyRial && !explicitlyToman) return Math.round(value / 10);
  if (explicitlyToman) return Math.round(value);
  return value > 100_000 ? Math.round(value / 10) : Math.round(value);
}
