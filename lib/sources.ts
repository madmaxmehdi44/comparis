export type SourceId = 'torob' | 'digikala' | 'emalls';
export type RetrievalMethod = 'http' | 'search';

export interface SourceStrategy {
  name: string;
  method: RetrievalMethod;
  timeoutMs: number;
  buildUrl: (query: string) => string;
}

export interface SourceDefinition {
  id: SourceId;
  name: string;
  strategies: readonly SourceStrategy[];
}

const q = (query: string) => encodeURIComponent(query.trim());

export const SOURCES: readonly SourceDefinition[] = [
  {
    id: 'torob', name: 'ترب', strategies: [
      { name: 'search', method: 'http', timeoutMs: 6500, buildUrl: (x) => `https://torob.com/search/?query=${q(x)}` },
      { name: 'search-normalized', method: 'http', timeoutMs: 6500, buildUrl: (x) => `https://torob.com/search/?query=${q(x.replace(/[\-_/]+/g, ' '))}` },
      { name: 'indexed-search', method: 'search', timeoutMs: 7500, buildUrl: (x) => `https://www.google.com/search?q=${q(`site:torob.com ${x}`)}` },
    ],
  },
  {
    id: 'digikala', name: 'دیجی‌کالا', strategies: [
      { name: 'search', method: 'http', timeoutMs: 6500, buildUrl: (x) => `https://www.digikala.com/search/?q=${q(x)}` },
      { name: 'search-normalized', method: 'http', timeoutMs: 6500, buildUrl: (x) => `https://www.digikala.com/search/?q=${q(x.replace(/[\-_/]+/g, ' '))}` },
      { name: 'indexed-search', method: 'search', timeoutMs: 7500, buildUrl: (x) => `https://www.google.com/search?q=${q(`site:digikala.com ${x}`)}` },
    ],
  },
  {
    id: 'emalls', name: 'ایمالز', strategies: [
      { name: 'search', method: 'http', timeoutMs: 6500, buildUrl: (x) => `https://emalls.ir/Search.aspx?Search=${q(x)}` },
      { name: 'search-normalized', method: 'http', timeoutMs: 6500, buildUrl: (x) => `https://emalls.ir/Search.aspx?Search=${q(x.replace(/[\-_/]+/g, ' '))}` },
      { name: 'indexed-search', method: 'search', timeoutMs: 7500, buildUrl: (x) => `https://www.google.com/search?q=${q(`site:emalls.ir ${x}`)}` },
    ],
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
