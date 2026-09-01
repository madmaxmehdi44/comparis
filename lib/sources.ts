export type SourceId = 'torob' | 'digikala' | 'emalls' | 'fafait' | 'markazi' | 'radincomputer' | 'darjaonline' | 'pasargadtech' | 'irsystech' | 'spotibyte';
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
  { id: 'torob', name: 'ترب', strategies: siteStrategies((x) => `https://torob.com/search/?query=${q(x)}`, 'torob.com') },
  { id: 'digikala', name: 'دیجی‌کالا', strategies: siteStrategies((x) => `https://www.digikala.com/search/?q=${q(x)}`, 'digikala.com') },
  { id: 'emalls', name: 'ایمالز', strategies: siteStrategies((x) => `https://emalls.ir/Search.aspx?Search=${q(x)}`, 'emalls.ir') },
  { id: 'fafait', name: 'فافا', strategies: siteStrategies((x) => `https://fafait.net/search?query=${q(x)}`, 'fafait.net') },
  { id: 'markazi', name: 'مارکزی', strategies: siteStrategies((x) => `https://www.markazi.co/?s=${q(x)}`, 'markazi.co') },
  { id: 'radincomputer', name: 'رادین کامپیوتر', strategies: siteStrategies((x) => `https://radincomputer.com/?s=${q(x)}`, 'radincomputer.com') },
  { id: 'darjaonline', name: 'درجا آنلاین', strategies: siteStrategies((x) => `https://www.darjaonline.ir/?s=${q(x)}`, 'darjaonline.ir') },
  { id: 'pasargadtech', name: 'پاسارگاد تک', strategies: siteStrategies((x) => `https://www.pasargadtech.ir/search?q=${q(x)}`, 'pasargadtech.ir') },
  { id: 'irsystech', name: 'ایران سیستم', strategies: siteStrategies((x) => `https://irsystech.ir/?s=${q(x)}`, 'irsystech.ir') },
  { id: 'spotibyte', name: 'اسپاتی‌بایت', strategies: siteStrategies((x) => `https://spotibyte.com/?s=${q(x)}`, 'spotibyte.com') },
] as const;

export function normalizeDigits(input: string): string {
  return input
    .replace(/[۰-۹]/g, (c) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(c)))
    .replace(/[٠-٩]/g, (c) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(c)));
}

export function normalizeText(input: string): string {
  return normalizeDigits(input)
    .replace(/[\u200c\u200d\u200f\ufeff]/g, ' ')
    .replace(/[يى]/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/[ۀة]/g, 'ه')
    .replace(/[أإٱ]/g, 'ا')
    .replace(/\s+/g, ' ')
    .trim();
}

function numericToken(raw: string): number | undefined {
  let value = raw.replace(/\s/g, '');
  if (!value) return undefined;
  const commaGroups = value.split(',');
  const dotGroups = value.split('.');
  if (commaGroups.length > 1 && commaGroups.slice(1).every((x) => /^\d{3}$/.test(x))) value = commaGroups.join('');
  else if (dotGroups.length > 1 && dotGroups.slice(1).every((x) => /^\d{3}$/.test(x))) value = dotGroups.join('');
  else value = value.replace(/,/g, '');
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

export function parsePrice(text: string): number | undefined {
  const normalized = normalizeText(text);
  const compact = normalized.replace(/\u00a0/g, ' ');
  const lowered = compact.toLowerCase();
  const currencyPattern = /([\d][\d\s,\.]*)(?:\s*)(تومان|تومن|ریال|toman|rial|irr)\b/gi;
  const currencyMatches = [...compact.matchAll(currencyPattern)];
  if (currencyMatches.length) {
    const preferred = currencyMatches.find((m) => /تومان|تومن|toman/i.test(m[2])) ?? currencyMatches[0];
    const parsed = numericToken(preferred[1]);
    if (parsed === undefined) return undefined;
    return /ریال|rial|irr/i.test(preferred[2]) && !/تومان|تومن|toman/i.test(preferred[2]) ? Math.round(parsed / 10) : Math.round(parsed);
  }
  const labeled = compact.match(/(?:قیمت|قیمت نهایی|مبلغ|فروش)\s*[:\-]?\s*([\d][\d\s,\.]{2,})/i);
  if (labeled) {
    const parsed = numericToken(labeled[1]);
    if (parsed !== undefined && parsed >= 10_000) return Math.round(parsed);
  }
  const bare = compact.match(/(?<![\w])\d[\d\s,\.]{3,}(?![\w])/g) ?? [];
  const candidates = bare.map(numericToken).filter((n): n is number => n !== undefined && n >= 10_000 && n <= 999_999_999_999);
  if (!candidates.length) return undefined;
  const hasPriceContext = /قیمت|مبلغ|فروش|خرید|تومان|تومن|ریال|price|irr|irt|rial|toman/i.test(lowered);
  if (hasPriceContext) return Math.round(Math.min(...candidates));
  return Math.round(Math.min(...candidates.filter((n) => n >= 100_000)) || 0) || undefined;
}
