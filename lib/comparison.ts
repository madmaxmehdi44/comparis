import { groupOffers, type ProductGroup } from './matcher';
import { priceStats, observationsFromOffers } from './price-history';
import type { Offer } from './types';

export interface ComparisonGroup extends ProductGroup {
  stats: {
    min?: number;
    max?: number;
    average?: number;
    savings?: number;
  };
  sellerCount: number;
}

export function buildComparisons(offers: Offer[]): ComparisonGroup[] {
  return groupOffers(offers).map((group) => {
    const observations = observationsFromOffers(group.key, group.offers);
    const price = priceStats(observations);
    const prices = group.offers.map((offer) => offer.price).filter((value): value is number => Number.isFinite(value));
    const min = prices.length ? Math.min(...prices) : undefined;
    const max = prices.length ? Math.max(...prices) : undefined;

    return {
      ...group,
      sellerCount: new Set(group.offers.map((offer) => offer.sourceId)).size,
      stats: {
        ...price,
        savings: min !== undefined && max !== undefined ? max - min : undefined,
      },
    };
  });
}
