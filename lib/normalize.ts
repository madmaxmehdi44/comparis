const DIGITS = '۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩';

export function normalizeDigits(value: string): string {
  return value.replace(/[۰-۹٠-٩]/g, (d) => {
    const i = DIGITS.indexOf(d);
    return i >= 0 ? String(i % 10) : d;
  });
}

export function normalizeText(value: string): string {
  return normalizeDigits(value).replace(/[\u200c\u200f\u202a-\u202e]/g, ' ').replace(/\s+/g, ' ').trim();
}

export function parsePrice(text: string): { price?: number; currency?: 'IRR' | 'IRT' } {
  const normalized = normalizeText(text).replace(/,/g, '');
  const match = normalized.match(/(\d+(?:\.\d+)?)\s*(تومان|تومن|ریال|irr|irt)?/i);
  if (!match) return {};
  const value = Number(match[1]);
  if (!Number.isFinite(value)) return {};
  const unit = (match[2] ?? '').toLowerCase();
  if (unit === 'ریال' || unit === 'irr') return { price: Math.round(value), currency: 'IRR' };
  return { price: Math.round(value), currency: 'IRT' };
}

export function canonicalTitle(title: string): string {
  return normalizeText(title)
    .toLowerCase()
    .replace(/[|،,:؛()[\]{}]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
