import type { Offer } from './source-types';

export interface PriceObservation {
  productKey: string;
  sourceId: string;
  price: number;
  currency: 'IRR' | 'IRT';
  observedAt: string;
}

export function observationsFromOffers(productKey: string, offers: Offer[]): PriceObservation[] {
  return offers.flatMap((offer) =>
    offer.price && offer.currency
      ? [{ productKey, sourceId: offer.sourceId, price: offer.price, currency: offer.currency, observedAt: offer.observedAt }]
      : [],
  );
}

export function priceStats(observations: PriceObservation[]) {
  const prices = observations.map((x) => x.price).filter(Number.isFinite);
  if (!prices.length) return { min: undefined, max: undefined, average: undefined };
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const average = Math.round(prices.reduce((sum, value) => sum + value, 0) / prices.length);
  return { min, max, average };
}
