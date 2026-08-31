import { canonicalTitle } from './normalize';
import type { Offer } from './source-types';

export interface ProductGroup {
  key: string;
  title: string;
  offers: Offer[];
  confidence: number;
}

function tokens(value: string): Set<string> {
  return new Set(canonicalTitle(value).split(' ').filter((x) => x.length > 1));
}

function similarity(a: string, b: string): number {
  const left = tokens(a);
  const right = tokens(b);
  if (!left.size || !right.size) return 0;
  let common = 0;
  for (const token of left) if (right.has(token)) common++;
  return common / Math.max(left.size, right.size);
}

export function groupOffers(offers: Offer[]): ProductGroup[] {
  const groups: ProductGroup[] = [];
  for (const offer of offers) {
    let best: ProductGroup | undefined;
    let score = 0;
    for (const group of groups) {
      const candidate = similarity(offer.title, group.title);
      if (candidate > score) {
        score = candidate;
        best = group;
      }
    }
    if (best && score >= 0.72) {
      best.offers.push(offer);
      best.confidence = Math.min(best.confidence, score);
    } else {
      groups.push({
        key: canonicalTitle(offer.title),
        title: offer.title,
        offers: [offer],
        confidence: Math.max(offer.confidence, score),
      });
    }
  }
  return groups;
}
