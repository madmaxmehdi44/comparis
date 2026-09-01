import type { Offer } from './types';

const STOP = new Set([
  'and', 'with', 'for', 'the', 'of', 'در', 'با', 'برای', 'و', 'از', 'قیمت', 'فروش',
  'خرید', 'کالا', 'اصل', 'اورجینال', 'جدید', 'گارانتی',
]);

export function normalizeProductTitle(input: string): string {
  return input
    .toLowerCase()
    .replace(/[يى]/g, 'ی')
    .replace(/[ك]/g, 'ک')
    .replace(/[\u200c\u200f\u200e\ufeff]/g, ' ')
    .replace(/[×x*]/g, ' x ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function productFingerprint(title: string): string {
  return normalizeProductTitle(title)
    .split(' ')
    .filter(Boolean)
    .filter((x) => !STOP.has(x))
    .sort()
    .join(' ');
}

/**
 * Deduplicate only observations that come from the same source/URL.
 * Two independent merchants offering the same product at the same price
 * must remain separate offers.
 */
export function dedupeOffers(offers: Offer[]): Offer[] {
  const best = new Map<string, Offer>();
  for (const offer of offers) {
    const key = `${offer.sourceId}|${offer.url}|${productFingerprint(offer.title)}|${offer.price ?? 'na'}`;
    const previous = best.get(key);
    if (!previous || offer.confidence > previous.confidence) best.set(key, offer);
  }
  return [...best.values()].sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity));
}

export function matchScore(a: string, b: string): number {
  const left = new Set(productFingerprint(a).split(' ').filter(Boolean));
  const right = new Set(productFingerprint(b).split(' ').filter(Boolean));
  if (!left.size || !right.size) return 0;
  let intersection = 0;
  for (const token of left) if (right.has(token)) intersection++;
  return intersection / new Set([...left, ...right]).size;
}
