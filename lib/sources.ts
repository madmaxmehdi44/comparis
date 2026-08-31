export type SourceId = 'torob' | 'digikala' | 'emalls';

export interface SourceDefinition {
  id: SourceId;
  name: string;
  method: 'http';
  timeoutMs: number;
  buildUrl: (query: string) => string;
}

export const SOURCES: readonly SourceDefinition[] = [
  { id: 'torob', name: 'ترب', method: 'http', timeoutMs: 6500, buildUrl: (q) => `https://torob.com/search/?query=${encodeURIComponent(q)}` },
  { id: 'digikala', name: 'دیجی‌کالا', method: 'http', timeoutMs: 6500, buildUrl: (q) => `https://www.digikala.com/search/?q=${encodeURIComponent(q)}` },
  { id: 'emalls', name: 'ایمالز', method: 'http', timeoutMs: 6500, buildUrl: (q) => `https://emalls.ir/Search.aspx?Search=${encodeURIComponent(q)}` },
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
